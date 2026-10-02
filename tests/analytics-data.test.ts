import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

// Exercises scripts/analytics-data.sh against a stub `gh`, so upload naming,
// partition download and pruning are covered without touching GitHub.

const root = new URL("../", import.meta.url);
const script = new URL("scripts/analytics-data.sh", root).pathname;

const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
state="$GH_STUB_DIR"
case "$1 $2" in
  "release view")
    [ -f "$state/assets" ] || exit 1
    case "$*" in
      *--json*) cat "$state/assets" ;;
      *) echo "release ok" ;;
    esac
    ;;
  "release create")
    : > "$state/assets"
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
  "release upload")
    spec="$4"
    file="\${spec%%#*}"
    basename "$file" >> "$state/uploaded"
    ;;
  "release delete-asset")
    printf '%s\\n' "$4" >> "$state/deleted"
    grep -v -x "$4" "$state/assets" > "$state/assets.next" || true
    mv "$state/assets.next" "$state/assets"
    ;;
  *)
    exit 1
    ;;
esac
`;

let workdir: string;
let stubDir: string;

function runAnalyticsData(command: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync("bash", [script, command, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
      GH_STUB_DIR: stubDir,
      ANALYTICS_DATA_RELEASE: "analytics-data",
      ...env,
    },
  });
}

function writeAssets(names: string[]) {
  writeFileSync(join(stubDir, "assets"), names.map((name) => `${name}\n`).join(""));
}

before(() => {
  workdir = mkdtempSync(join(tmpdir(), "os548-analytics-data-"));
  stubDir = join(workdir, "bin");
  mkdirSync(stubDir, { recursive: true });
  const ghPath = join(stubDir, "gh");
  writeFileSync(ghPath, GH_STUB);
  chmodSync(ghPath, 0o755);
});

after(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("analytics-data download", () => {
  it("fails closed with NO_DATA_RELEASE when the release is missing", () => {
    rmSync(join(stubDir, "assets"), { force: true });
    const result = runAnalyticsData("download", [join(workdir, "download")]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /analytics-data: NO_DATA_RELEASE:/);
  });

  it("fails closed with NO_DATA_ASSET when no series asset exists", () => {
    writeAssets(["notes.txt"]);
    const result = runAnalyticsData("download", [join(workdir, "download")]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /NO_DATA_ASSET/);
  });

  it("reconstructs date=<date>/part.parquet for every series asset", () => {
    const dir = join(workdir, "download");
    writeAssets(["price-series-2026-10-01.parquet", "price-series-2026-10-02.parquet", "notes.txt"]);
    writeFileSync(join(stubDir, "price-series-2026-10-01.parquet"), "one");
    writeFileSync(join(stubDir, "price-series-2026-10-02.parquet"), "two");

    const result = runAnalyticsData("download", [dir]);

    assert.equal(result.status, 0);
    assert.equal(readFileSync(join(dir, "date=2026-10-01", "part.parquet"), "utf8"), "one");
    assert.equal(readFileSync(join(dir, "date=2026-10-02", "part.parquet"), "utf8"), "two");
    assert.equal(existsSync(join(dir, "date=2026-10-01", "price-series-2026-10-01.parquet")), false);
  });
});

describe("analytics-data upload-dir", () => {
  it("uploads each partition under its dated asset name", () => {
    const dir = join(workdir, "out");
    for (const date of ["2026-10-01", "2026-10-02"]) {
      mkdirSync(join(dir, `date=${date}`), { recursive: true });
      writeFileSync(join(dir, `date=${date}`, "part.parquet"), "parquet");
    }
    writeAssets([]);

    const result = runAnalyticsData("upload-dir", [dir]);

    assert.equal(result.status, 0);
    assert.deepEqual(readFileSync(join(stubDir, "uploaded"), "utf8").trim().split("\n"), [
      "price-series-2026-10-01.parquet",
      "price-series-2026-10-02.parquet",
    ]);
  });

  it("fails closed when the directory has no partitions", () => {
    mkdirSync(join(workdir, "empty"), { recursive: true });
    const result = runAnalyticsData("upload-dir", [join(workdir, "empty")]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /NO_PARTITIONS/);
  });
});

describe("analytics-data prune", () => {
  it("keeps only the newest ANALYTICS_DATA_KEEP assets", () => {
    writeAssets(Array.from({ length: 6 }, (_, index) => `price-series-2026-10-0${index + 1}.parquet`));

    const result = runAnalyticsData("prune", [], { ANALYTICS_DATA_KEEP: "3" });

    assert.equal(result.status, 0);
    assert.deepEqual(readFileSync(join(stubDir, "deleted"), "utf8").trim().split("\n"), [
      "price-series-2026-10-01.parquet",
      "price-series-2026-10-02.parquet",
      "price-series-2026-10-03.parquet",
    ]);
  });
});
