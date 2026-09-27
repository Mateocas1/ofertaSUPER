#!/usr/bin/env node
// Portable test launcher: enumerates every *.test.ts under tests/ from the
// repository root, sorts deterministically, and runs them through node's
// test runner with the tsx loader. Dependency-free so --list works before
// any dependency install.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(repoRoot, "tests");

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
  } catch (error) {
    console.error(`run-tests: cannot enumerate ${testsDir}: ${error?.message ?? error}`);
    process.exit(1);
  }
  files.sort();

  if (files.length === 0) {
    console.error("run-tests: no *.test.ts files found under tests/");
    process.exit(1);
  }

  if (process.argv.includes("--list")) {
    for (const file of files) console.log(file);
    return;
  }

  // The loader is passed as a bare specifier so node resolves tsx from
  // node_modules, relative to cwd, without this script reading package
  // metadata or guessing file paths.
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--conditions=react-server",
      "--test",
      "--test-concurrency=4",
      ...files,
    ],
    { stdio: "inherit", cwd: repoRoot },
  );
  process.exit(child.status ?? 1);
}

runLauncher();
