#!/usr/bin/env node
// Portable test launcher: enumerates every *.test.ts under tests/ from the
// repository root, sorts deterministically, and runs them through node's
// test runner with the tsx loader. Dependency-free so --list works before
// any dependency install.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(repoRoot, "tests");

// Resolve the tsx loader entry from the directory of tsx's package.json and
// its parsed contents. Exported (pure) so tests can exercise the real-world
// package shapes without spawning the runner.
// Candidate order (tsx@4.21.0 defines exports["."] as a plain string, so the
// string form must be tried first):
//   1. exports["."] as a string
//   2. exports["."].import.default
//   3. exports["."].import
//   4. exports["."].default
//   5. main
// The first candidate whose resolved file exists wins; otherwise a clear,
// actionable error naming the shapes tried and the resolved directory is
// thrown — never a raw path TypeError.
const LOADER_SHAPES = [
  'exports["."] (string)',
  'exports["."].import.default',
  'exports["."].import',
  'exports["."].default',
  'main',
];

export function resolveTsxLoaderPath(tsxDir, tsxPkg) {
  const dot = tsxPkg?.exports?.["."];
  const candidates = [
    typeof dot === "string" ? dot : undefined,
    dot?.import?.default,
    dot?.import,
    dot?.default,
    tsxPkg?.main,
  ];

  const tried = [];
  for (let i = 0; i < candidates.length; i++) {
    const specifier = candidates[i];
    if (typeof specifier !== "string" || specifier.length === 0) continue;
    const resolved = resolve(tsxDir, specifier);
    if (existsSync(resolved)) return resolved;
    tried.push(`${LOADER_SHAPES[i]} -> ${specifier} (file not found)`);
  }

  const shapeSummary =
    tried.length > 0
      ? tried.join("; ")
      : `${LOADER_SHAPES.join(", ")} (none defined)`;
  throw new Error(
    `run-tests: unable to resolve the tsx loader from ${tsxDir}. ` +
      `Shapes tried: ${shapeSummary}. Is the project installed?`,
  );
}

function enumerateTestFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...enumerateTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      found.push(relative(repoRoot, full).split(sep).join("/"));
    }
  }
  return found;
}

function runLauncher() {
  let files;
  try {
    files = enumerateTestFiles(testsDir);
  } catch (err) {
    console.error(`run-tests: cannot enumerate ${testsDir}: ${err?.message ?? err}`);
    process.exit(1);
  }
  files.sort();

  if (files.length === 0) {
    console.error("run-tests: no *.test.ts files found under tests/");
    process.exit(1);
  }

  if (process.argv.includes("--list")) {
    for (const file of files) console.log(file);
    process.exit(0);
  }

  // Resolve the tsx loader entry from this launcher's own location so it works
  // both on the host and inside the container image regardless of cwd.
  let tsxLoaderPath;
  try {
    const require = createRequire(import.meta.url);
    const tsxPkgPath = require.resolve("tsx/package.json");
    const tsxPkg = JSON.parse(readFileSync(tsxPkgPath, "utf8"));
    tsxLoaderPath = resolveTsxLoaderPath(dirname(tsxPkgPath), tsxPkg);
  } catch (err) {
    console.error(`${err?.message ?? err}`);
    process.exit(1);
  }

  const child = spawnSync(
    process.execPath,
    [
      "--import",
      tsxLoaderPath,
      "--conditions=react-server",
      "--test",
      "--test-concurrency=4",
      ...files,
    ],
    { stdio: "inherit", cwd: repoRoot },
  );

  if (child.error) {
    console.error(`run-tests: failed to spawn node test runner: ${child.error.message}`);
    process.exit(1);
  }
  process.exit(child.status ?? 1);
}

// Only execute the launcher body when run directly; a test imports this
// module for resolveTsxLoaderPath and must not spawn the runner.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runLauncher();
}
