import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");

test("Compose orders postgres healthcheck, owner migrate with DIRECT_URL, and app DATABASE_URL without env_file or published ports", () => {
  assert.match(compose, /postgres:[\s\S]*pg_isready/);
  assert.match(compose, /migrate:[\s\S]*DIRECT_URL: postgresql:\/\/ofertasuper_owner/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_app/);
  assert.doesNotMatch(compose, /env_file|platform:|5432:5432|6379:6379/);
});
