import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

const LAUNCHER = "scripts/run-tests.mjs";

// Independent recursive enumeration of all *.test.ts files under tests/
// using node:fs, returning repository-relative POSIX-style paths.
function enumerateTestFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...enumerateTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      found.push(relative(process.cwd(), full).split(sep).join("/"));
    }
  }
  return found;
}

test("launcher discovers every *.test.ts under tests/", () => {
  const run = spawnSync(process.execPath, [LAUNCHER, "--list"], {
    encoding: "utf8",
  });
  assert.equal(
    run.status,
    0,
    `launcher --list failed: ${run.stderr ?? run.error}`,
  );
  const discovered = run.stdout.trim().split("\n").filter((line) => line.length > 0);
  assert.ok(discovered.length > 0, "launcher must discover at least one test file");

  const expected = enumerateTestFiles(join(process.cwd(), "tests")).sort();
  assert.deepEqual(
    discovered,
    expected,
    "discovered set must equal an independent recursive enumeration of tests/**/*.test.ts",
  );
});

test("discovered set spans shallow and nested test files", () => {
  const run = spawnSync(process.execPath, [LAUNCHER, "--list"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `launcher --list failed: ${run.stderr ?? run.error}`);
  const discovered = run.stdout.trim().split("\n").filter((line) => line.length > 0);

  assert.ok(
    discovered.some((file) => file.split("/").length === 2),
    "at least one test file directly under tests/",
  );
  assert.ok(
    discovered.some((file) => file.split("/").length > 2),
    "at least one test file nested one directory deeper than tests/",
  );
});

test("discovered set is sorted deterministically and has no duplicates", () => {
  const run = spawnSync(process.execPath, [LAUNCHER, "--list"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `launcher --list failed: ${run.stderr ?? run.error}`);
  const discovered = run.stdout.trim().split("\n").filter((line) => line.length > 0);

  assert.deepEqual(
    discovered,
    [...discovered].sort(),
    "discovered paths must be printed in deterministic sorted order",
  );
  assert.equal(
    new Set(discovered).size,
    discovered.length,
    "discovered paths must contain no duplicates",
  );
});
