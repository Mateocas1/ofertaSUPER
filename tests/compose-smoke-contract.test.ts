import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readCommandResult } from "../scripts/compose-command-result.mjs";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../scripts/compose-smoke.mjs", import.meta.url), "utf8");

test("Compose orders healthy dependencies, owner migration, grants, fixture, then web", () => {
  assert.match(compose, /postgres:[\s\S]*pg_isready/);
  assert.match(compose, /redis:[\s\S]*redis-cli.*ping/);
  assert.match(compose, /migrate:[\s\S]*DIRECT_URL: postgresql:\/\/ofertasuper_owner/);
  assert.match(compose, /fixture:[\s\S]*service_completed_successfully[\s\S]*web:/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_app/);
  assert.doesNotMatch(compose, /env_file|platform:|5432:5432|6379:6379/);
});

test("smoke verifies runtime evidence and always removes state", () => {
  for (const claim of ["dataSource", "degraded", "latestCheckedAt", "x-ratelimit-limit", "search:v3:", "ofertas-super:api:search:"]) {
    assert.ok(smoke.includes(claim), `missing assertion for ${claim}`);
  }
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
