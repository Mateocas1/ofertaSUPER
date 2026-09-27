import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { test } from "node:test";
import { resolveTsxLoaderPath } from "../scripts/run-tests.mjs";

const LAUNCHER = "scripts/run-tests.mjs";

// tsx@4.21.0 (the pinned version) defines exports["."] as the plain string
// "./dist/loader.mjs", so the resolver must handle every real-world shape.
test("launcher resolves tsx loader from real-world package.json shapes", () => {
  const shapes = [
    {
      name: "plain-string exports[\".\"] (tsx@4.21.0 pinned shape)",
      pkg: { exports: { ".": "./dist/loader.mjs" } },
      files: ["dist/loader.mjs"],
    },
    {
      name: "exports[\".\"] object with string import",
      pkg: { exports: { ".": { import: "./dist/esm/index.mjs" } } },
      files: ["dist/esm/index.mjs"],
    },
    {
      name: "exports[\".\"] object with import.default",
      pkg: { exports: { ".": { import: { default: "./dist/loader.mjs" } } } },
      files: ["dist/loader.mjs"],
    },
    {
      name: "exports[\".\"] object with only default",
      pkg: { exports: { ".": { default: "./dist/loader.mjs" } } },
      files: ["dist/loader.mjs"],
    },
    {
      name: "bare main fallback",
      pkg: { main: "./dist/loader.mjs" },
      files: ["dist/loader.mjs"],
    },
  ];

  for (const shape of shapes) {
    const dir = mkdtempSync(join(tmpdir(), "tsx-fixture-"));
    try {
      for (const file of shape.files) {
        mkdirSync(join(dir, dirname(file)), { recursive: true });
        writeFileSync(join(dir, file), "export {};");
      }
      writeFileSync(join(dir, "package.json"), JSON.stringify(shape.pkg));

      const resolved = resolveTsxLoaderPath(dir, shape.pkg);
      assert.equal(resolved, join(dir, ...shape.files[0].split("/")), shape.name);
      assert.ok(existsSync(resolved), `${shape.name}: resolved path must exist`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
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

test("absent tsx shapes fail with a clear error, not a TypeError", () => {
  const cases = [
    { name: "no exports and no main", pkg: {} },
    {
      name: "specifier points at a missing file",
      pkg: { exports: { ".": "./dist/missing.mjs" } },
    },
  ];

  for (const testCase of cases) {
    const dir = mkdtempSync(join(tmpdir(), "tsx-fixture-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify(testCase.pkg));

      assert.throws(
        () => resolveTsxLoaderPath(dir, testCase.pkg),
        (err) => {
          const message = String(err?.message ?? err);
          assert.match(message, /tsx loader/i, testCase.name);
          assert.doesNotMatch(message, /paths\[1\]/, `${testCase.name}: raw TypeError leaked`);
          assert.ok(message.includes(dir), `${testCase.name}: error must name the resolved directory`);
          return true;
        },
        testCase.name,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

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
