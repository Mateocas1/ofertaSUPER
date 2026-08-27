import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { retainCleanupFailure } from "../scripts/cleanup-failure.mjs";

const harness = readFileSync(new URL("../scripts/postgres-recovery-smoke.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package command wires the focused PostgreSQL recovery harness", () => {
  assert.equal(packageJson.scripts["smoke:postgres-recovery"], "node scripts/postgres-recovery-smoke.mjs");
});

test("recovery uses unique isolated source and restore projects", () => {
  assert.match(harness, /randomUUID\(\)/);
  assert.match(harness, /sourceProject = `ofertasuper-recovery-source-\$\{runId\}`/);
  assert.match(harness, /restoreProject = `ofertasuper-recovery-restore-\$\{runId\}`/);
  assert.match(harness, /assert\.notEqual\(sourceProject, restoreProject\)/);
});

test("source waits only for PostgreSQL and runs one-shot setup services explicitly", () => {
  const postgres = '["up", "--detach", "--wait", "postgres"]';
  const migration = '["run", "--build", "--rm", "--no-deps", "migrate"]';
  const fixture = '["run", "--rm", "--no-deps", "fixture"]';

  assert.ok(harness.indexOf(postgres) < harness.indexOf(migration));
  assert.ok(harness.indexOf(migration) < harness.indexOf(fixture));
  assert.doesNotMatch(harness, /\["up",\s*"--build",\s*"--wait",\s*"fixture"\]/);
});

test("archive and restore preserve owner semantics then prove app access", () => {
  for (const claim of ["pg_dump", "--format=custom", "--no-owner", "--no-acl", "pg_restore", "--exit-on-error", "app-grants.sql", "ofertasuper_owner", "ofertasuper_app", "_prisma_migrations", "7799999000001", "Compose Smoke Saffron"]) {
    assert.ok(harness.includes(claim), `missing recovery contract: ${claim}`);
  }
});

test("source-only control prevents a false restore result", () => {
  assert.match(harness, /Source-only control/);
  assert.match(harness, /sql\(sourceProject[\s\S]*Source-only control/);
  assert.match(harness, /sql\(restoreProject[\s\S]*7799999000002[\s\S]*"0"/);
});

test("harness owns its temporary archive and always tears down all state", () => {
  assert.match(harness, /mkdtempSync\(join\(tmpdir\(\), "ofertasuper-recovery-"\)\)/);
  assert.match(harness, /try \{ cleanup\(\); \} catch \(error\)/);
  assert.match(harness, /\[restoreProject, sourceProject\][\s\S]*down[\s\S]*--volumes[\s\S]*--remove-orphans[\s\S]*--rmi[\s\S]*local/);
  assert.match(harness, /rmSync\(workspace, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(harness, /process\.env|\.env|DATABASE_URL|DIRECT_URL|https?:\/\//);
});

test("cleanup failure cannot turn successful recovery into success or mask a primary failure", () => {
  const cleanupFailure = new Error("cleanup failed");
  assert.equal(retainCleanupFailure(undefined, cleanupFailure), cleanupFailure);

  const primaryFailure = new Error("recovery failed");
  const reported: unknown[][] = [];
  assert.equal(retainCleanupFailure(primaryFailure, cleanupFailure, (...args: unknown[]) => reported.push(args)), primaryFailure);
  assert.deepEqual(reported, [["Cleanup also failed:", cleanupFailure]]);
  assert.match(harness, /failures\.push\(error\)[\s\S]*AggregateError/);
});
