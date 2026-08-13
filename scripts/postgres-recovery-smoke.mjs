import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { readCommandResult } from "./compose-command-result.mjs";
import { retainCleanupFailure } from "./cleanup-failure.mjs";

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const sourceProject = `ofertasuper-recovery-source-${runId}`;
const restoreProject = `ofertasuper-recovery-restore-${runId}`;
const workspace = mkdtempSync(join(tmpdir(), "ofertasuper-recovery-"));
const archive = join(workspace, "catalog.dump");
let cleaning = false;

function compose(project, args, capture = false) {
  const command = ["compose", "--project-name", project, "--file", "compose.yml", ...args];
  const result = spawnSync("docker", command, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  return readCommandResult(result, `docker ${command.join(" ")}`);
}

function sql(project, role, query) {
  const password = role === "ofertasuper_owner" ? "owner-local-only" : "app-local-only";
  return compose(project, [
    "exec", "-T", "-e", `PGPASSWORD=${password}`, "postgres", "psql", "-X", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", role, "-d", "ofertasuper", "-c", query,
  ], true);
}

function cleanup() {
  if (cleaning) return;
  cleaning = true;
  const failures = [];
  for (const project of [restoreProject, sourceProject]) {
    try { compose(project, ["down", "--volumes", "--remove-orphans"]); } catch (error) {
      console.error(`Cleanup failed for ${project}:`, error.message);
      failures.push(error);
    }
  }
  try { rmSync(workspace, { recursive: true, force: true }); } catch (error) {
    console.error("Cleanup failed for temporary archive:", error.message);
    failures.push(error);
  }
  if (failures.length > 0) throw new AggregateError(failures, "PostgreSQL recovery cleanup failed");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    try { cleanup(); } catch (error) { console.error(error); }
    process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  });
}

let primaryFailure;
try {
  assert.notEqual(sourceProject, restoreProject);
  compose(sourceProject, ["up", "--detach", "--wait", "postgres"]);
  compose(sourceProject, ["run", "--build", "--rm", "--no-deps", "migrate"]);
  compose(sourceProject, ["run", "--rm", "--no-deps", "fixture"]);
  assert.equal(sql(sourceProject, "ofertasuper_app", "SELECT name FROM products WHERE ean='7799999000001'"), "Compose Smoke Saffron");

  compose(sourceProject, ["exec", "-T", "postgres", "pg_dump", "-U", "ofertasuper_owner", "-d", "ofertasuper", "--format=custom", "--no-owner", "--no-acl", "--file=/tmp/catalog.dump"]);
  compose(sourceProject, ["cp", "postgres:/tmp/catalog.dump", archive]);
  sql(sourceProject, "ofertasuper_app", "INSERT INTO products (ean,name,images) VALUES ('7799999000002','Source-only control','{}')");

  compose(restoreProject, ["up", "--wait", "postgres"]);
  compose(restoreProject, ["cp", archive, "postgres:/tmp/catalog.dump"]);
  compose(restoreProject, ["exec", "-T", "postgres", "pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "-U", "ofertasuper_owner", "-d", "ofertasuper", "/tmp/catalog.dump"]);
  compose(restoreProject, ["run", "--rm", "--no-deps", "fixture", "sh", "-ec", "PGPASSWORD=owner-local-only psql -h postgres -U ofertasuper_owner -d ofertasuper -v ON_ERROR_STOP=1 -f /harness/app-grants.sql"]);

  assert.ok(Number(sql(restoreProject, "ofertasuper_app", "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")) > 0);
  assert.equal(sql(restoreProject, "ofertasuper_app", "SELECT name FROM products WHERE ean='7799999000001'"), "Compose Smoke Saffron");
  assert.equal(sql(sourceProject, "ofertasuper_app", "SELECT name FROM products WHERE ean='7799999000002'"), "Source-only control");
  assert.equal(sql(restoreProject, "ofertasuper_app", "SELECT count(*) FROM products WHERE ean='7799999000002'"), "0");
  console.log("PostgreSQL recovery smoke passed: logical archive restored into distinct disposable state with app-role access.");
} catch (error) {
  primaryFailure = error;
}

try { cleanup(); } catch (error) {
  primaryFailure = retainCleanupFailure(primaryFailure, error);
}
if (primaryFailure) throw primaryFailure;
