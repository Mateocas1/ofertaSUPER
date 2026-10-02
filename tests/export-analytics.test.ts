import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
});

describe("analytics CI workflow contract", () => {
  it("builds the models from the sample and verifies the committed payload", () => {
    assert.match(analyticsWorkflow, /working-directory: analytics/);
    assert.match(analyticsWorkflow, /uv run dbt build --profiles-dir \./);
    assert.match(analyticsWorkflow, /publish_basket_index\.py --skip-build --out tests\/fixtures\/basket-index\.sample\.json --check/);
    assert.match(analyticsWorkflow, /publish_basket_index\.py --placeholder --source release --check/);
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
