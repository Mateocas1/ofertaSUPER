import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

// Exercises scripts/db-state.sh against a stub `gh` so asset selection, upload
// naming and pruning are covered without touching GitHub. The Postgres
// subcommands are covered by the workflow contract test and the local e2e run.

const root = new URL("../", import.meta.url);
const script = new URL("scripts/db-state.sh", root).pathname;

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
  "release upload")
    spec="$4"
    printf '%s\\n' "\${spec#*#}" >> "$state/uploaded"
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
let downloadDir: string;

function runDbState(command: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync("bash", [script, command, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
      GH_STUB_DIR: stubDir,
      DB_STATE_RELEASE: "db-state",
      ...env,
    },
  });
}

function writeAssets(names: string[]) {
  writeFileSync(join(stubDir, "assets"), names.map((name) => `${name}\n`).join(""));
}

before(() => {
  workdir = mkdtempSync(join(tmpdir(), "os547c-db-state-"));
  stubDir = join(workdir, "bin");
  downloadDir = join(workdir, "download");
  mkdirSync(stubDir, { recursive: true });
  const ghPath = join(stubDir, "gh");
  writeFileSync(ghPath, GH_STUB);
  chmodSync(ghPath, 0o755);
});

after(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("db-state download", () => {
  it("fails closed with NO_STATE_RELEASE when the release is missing", () => {
    rmSync(join(stubDir, "assets"), { force: true });
    const result = runDbState("download", [downloadDir]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /db-state: NO_STATE_RELEASE:/);
  });

  it("fails closed with NO_STATE_ASSET when no date-stamped dump exists", () => {
    writeAssets(["notes.txt", "ofertasuper-latest.dump"]);
    const result = runDbState("download", [downloadDir]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /db-state: NO_STATE_ASSET:/);
  });

  it("downloads the newest date-stamped asset only", () => {
    writeAssets(["ofertasuper-2026-09-28.dump", "ofertasuper-2026-10-01.dump", "ofertasuper-2026-09-30.dump"]);
    for (const name of ["ofertasuper-2026-09-28.dump", "ofertasuper-2026-10-01.dump", "ofertasuper-2026-09-30.dump"]) {
      writeFileSync(join(stubDir, name), "dump");
    }

    const result = runDbState("download", [downloadDir]);

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), join(downloadDir, "ofertasuper-2026-10-01.dump"));
    assert.equal(existsSync(join(downloadDir, "ofertasuper-2026-09-28.dump")), false);
  });
});

describe("db-state upload", () => {
  it("uploads under the given asset name", () => {
    const dump = join(workdir, "state.dump");
    writeFileSync(dump, "dump");
    const result = runDbState("upload", [dump], { DB_STATE_ASSET_NAME: "ofertasuper-2026-10-05.dump" });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "ofertasuper-2026-10-05.dump");
    assert.equal(readFileSync(join(stubDir, "uploaded"), "utf8").trim(), "ofertasuper-2026-10-05.dump");
  });

  it("refuses an empty dump", () => {
    const empty = join(workdir, "empty.dump");
    writeFileSync(empty, "");
    const result = runDbState("upload", [empty]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_DUMP/);
  });
});

describe("db-state prune", () => {
  it("keeps only the newest DB_STATE_KEEP assets", () => {
    const names = Array.from({ length: 6 }, (_, index) => `ofertasuper-2026-10-0${index + 1}.dump`);
    writeAssets(names);

    const result = runDbState("prune", [], { DB_STATE_KEEP: "3" });

    assert.equal(result.status, 0);
    const deleted = readFileSync(join(stubDir, "deleted"), "utf8").trim().split("\n");
    assert.deepEqual(deleted, ["ofertasuper-2026-10-01.dump", "ofertasuper-2026-10-02.dump", "ofertasuper-2026-10-03.dump"]);
    assert.deepEqual(readFileSync(join(stubDir, "assets"), "utf8").trim().split("\n"), ["ofertasuper-2026-10-04.dump", "ofertasuper-2026-10-05.dump", "ofertasuper-2026-10-06.dump"]);
  });
});
