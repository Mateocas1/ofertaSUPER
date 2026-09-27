import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readCommandResult } from "../scripts/compose-command-result.mjs";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../scripts/compose-smoke.mjs", import.meta.url), "utf8");

test("Compose orders postgres healthcheck, owner migrate with DIRECT_URL, and app DATABASE_URL without env_file or published ports", () => {
  assert.match(compose, /postgres:[\s\S]*pg_isready/);
  assert.match(compose, /migrate:[\s\S]*DIRECT_URL: postgresql:\/\/ofertasuper_owner/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_app/);
  assert.doesNotMatch(compose, /env_file|platform:|5432:5432|6379:6379/);
});

test("smoke runs the bootstrap seed chain and verifies tables, app grants, and seed stores before cleanup", () => {
  for (const claim of ["--exit-code-from", "information_schema.tables", "has_table_privilege('ofertasuper_app'", "FROM supermarkets"]) {
    assert.ok(smoke.includes(claim), `missing assertion for ${claim}`);
  }
  assert.match(smoke, /assert\.equal\(tables, String\(BOUNDARY_TABLES\.length\), "migrations/);
  assert.match(smoke, /assert\.equal\(grants, String\(BOUNDARY_TABLES\.length \* 4\), "ofertasuper_app/);
  assert.match(smoke, /assert\.equal\(stores, "3:carrefour=Carrefour,disco=Disco,jumbo=Jumbo"\)/);
  assert.match(smoke, /finally \{[\s\S]*down.*--volumes.*--remove-orphans/);
});

test("streamed commands accept null output while captured commands return trimmed text", () => {
  assert.equal(readCommandResult({ status: 0, stdout: null, stderr: null }, "docker compose up"), "");
  assert.equal(readCommandResult({ status: 0, stdout: " key\n", stderr: "" }, "docker compose exec"), "key");
  assert.throws(
    () => readCommandResult({ status: 1, stdout: "", stderr: "compose failed" }, "docker compose down"),
    /compose failed/,
  );
});
