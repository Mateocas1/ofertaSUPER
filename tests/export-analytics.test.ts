import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const workflow = read(".github/workflows/daily-refresh.yml");
const analyticsWorkflow = read(".github/workflows/analytics.yml");
const script = read("scripts/export-analytics.sh");

describe("cloud analytics hook contract", () => {
  it("adds exactly one best-effort step that never blocks the refresh", () => {
    const calls = workflow.match(/scripts\/export-analytics\.sh/g) ?? [];
    assert.equal(calls.length, 1);
    const stepStart = workflow.indexOf("- name: Export the daily price series and refresh the basket index");
    assert.ok(stepStart >= 0, "the analytics step must exist");
    const step = workflow.slice(stepStart, workflow.indexOf("- name: Commit the snapshot to master"));
    assert.match(step, /continue-on-error: true/);
    assert.match(step, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    assert.match(step, /inputs\.dry_run != true/);
  });

  it("runs after the state upload and before the snapshot commit", () => {
    const upload = workflow.indexOf("scripts/db-state.sh upload");
    const analytics = workflow.indexOf("scripts/export-analytics.sh");
    const snapshot = workflow.indexOf("git add data/catalog-snapshot.json");
    assert.ok(upload < analytics && analytics < snapshot, "the analytics step must sit between the dump and the snapshot commit");
  });

  it("exports, uploads and publishes in ordered stages", () => {
    assert.match(script, /export-price-series\.ts --mode daily --out "\$DATA_DIR"/);
    assert.match(script, /scripts\/analytics-data\.sh upload-dir "\$DATA_DIR"/);
    assert.match(script, /publish_basket_index\.py[\s\S]*--glob 'data\/\*\/part\.parquet' --source release/);
    assert.match(script, /git add "\$INDEX_PATH"/);
    assert.match(script, /git push origin HEAD:master/);
    assert.match(script, /uv run --locked --no-dev/);
  });

  it("treats a failed export as the only fatal stage", () => {
    assert.match(script, /if ! run_stage export[\s\S]*return 1/);
    assert.match(script, /run_stage upload[\s\S]*\|\| true/);
    assert.match(script, /run_stage analytics[\s\S]*\|\| true/);
    assert.match(script, /run_stage commit[\s\S]*\|\| true/);
  });

  // A fresh runner only holds today's partition; without the release history
  // the index collapses to a one-day series (production on 2026-11-18).
  it("downloads the release history after the upload and before the dbt build", () => {
    const main = script.slice(script.indexOf("main() {"));
    const upload = main.indexOf("run_stage upload");
    const download = main.indexOf('run_stage download download_history "$DATA_DIR"');
    const analytics = main.indexOf("run_stage analytics");
    assert.ok(download >= 0, "the download stage must exist");
    assert.ok(upload < download && download < analytics, "download must sit between upload and analytics");
    assert.match(script, /scripts\/analytics-data\.sh download "\$staging"/);
  });

  it("keeps the published index when the history download fails instead of publishing a thinner series", () => {
    assert.match(
      script,
      /if ! run_stage download download_history "\$DATA_DIR"; then[\s\S]*?return 0\s*fi\s*run_stage analytics/,
    );
  });
});

// Exercises download_history against a stub `gh`, without touching GitHub.
const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
state="$GH_STUB_DIR"
case "$1 $2" in
  "release view")
    [ -f "$state/assets" ] || exit 1
    cat "$state/assets"
    ;;
  "release download")
    pattern=""
    dir=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --pattern) pattern="$2"; shift 2 ;;
        --dir) dir="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    cp "$state/$pattern" "$dir/$pattern"
    ;;
  *)
    exit 1
    ;;
esac
`;

describe("export-analytics download_history", () => {
  let workdir: string;
  let stubDir: string;
  const scriptPath = new URL("scripts/export-analytics.sh", root).pathname;

  before(() => {
    workdir = mkdtempSync(join(tmpdir(), "os-export-analytics-"));
    stubDir = join(workdir, "bin");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(join(stubDir, "gh"), GH_STUB);
    chmodSync(join(stubDir, "gh"), 0o755);
  });

  after(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  function downloadHistory(dataDir: string) {
    // $0 must differ from the sourced path so the script's main guard stays off.
    const command = 'source "$1" && download_history "$2"';
    return spawnSync("bash", ["-c", command, "export-analytics-test", scriptPath, dataDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ""}`, GH_STUB_DIR: stubDir },
    });
  }

  function writePartition(dir: string, date: string, body: string) {
    mkdirSync(join(dir, `date=${date}`), { recursive: true });
    writeFileSync(join(dir, `date=${date}`, "part.parquet"), body);
  }

  it("adds every historical partition without clobbering today's fresh export", () => {
    const dataDir = join(workdir, "data");
    writePartition(dataDir, "2026-11-16", "fresh export");
    const assets = ["2026-10-03", "2026-11-15", "2026-11-16"].map((date) => `price-series-${date}.parquet`);
    writeFileSync(join(stubDir, "assets"), assets.join("\n") + "\n");
    for (const asset of assets) writeFileSync(join(stubDir, asset), `release ${asset}`);

    const result = downloadHistory(dataDir);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(dataDir).sort(), ["date=2026-10-03", "date=2026-11-15", "date=2026-11-16"]);
    assert.equal(readFileSync(join(dataDir, "date=2026-11-16", "part.parquet"), "utf8"), "fresh export");
    assert.equal(
      readFileSync(join(dataDir, "date=2026-10-03", "part.parquet"), "utf8"),
      "release price-series-2026-10-03.parquet",
    );
  });

  it("fails without touching the local partitions when the release is unreadable", () => {
    const dataDir = join(workdir, "data-missing-release");
    writePartition(dataDir, "2026-11-16", "fresh export");
    rmSync(join(stubDir, "assets"), { force: true });

    const result = downloadHistory(dataDir);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NO_DATA_RELEASE/);
    assert.deepEqual(readdirSync(dataDir), ["date=2026-11-16"]);
    assert.equal(existsSync(join(dataDir, "date=2026-11-16", "part.parquet")), true);
  });
});

describe("analytics CI workflow contract", () => {
  it("builds the models from the sample and verifies the committed payload", () => {
    assert.match(analyticsWorkflow, /working-directory: analytics/);
    assert.match(analyticsWorkflow, /uv run dbt build --profiles-dir \./);
    assert.match(analyticsWorkflow, /publish_basket_index\.py --skip-build --out tests\/fixtures\/basket-index\.sample\.json --check/);
    assert.match(analyticsWorkflow, /publish_basket_index\.py --verify-production/);
    assert.match(analyticsWorkflow, /chart_price_evolution\.py/);
  });

  it("pins every action to a full commit SHA and reads only the repository", () => {
    const usesLines = analyticsWorkflow.split("\n").filter((line) => /^\s*uses:/.test(line));
    assert.ok(usesLines.length >= 2, "expected at least two action steps");
    for (const line of usesLines) {
      assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}(?: # v[\d.]+)?$/, `unpinned action: ${line.trim()}`);
    }
    assert.match(analyticsWorkflow, /permissions:\s*\n\s*contents: read/);
  });
});
