import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "prisma/migrations/20260904_verifier_envelope_commitment/migration.sql";

function migration() {
  return readFileSync(migrationPath, "utf8");
}

test("commits exact canonical envelope bytes for the authenticated session user only", () => {
  const sql = migration();
  assert.match(sql, /CREATE TABLE public\.verifier_envelope_commitments/);
  assert.match(sql, /commit_promotion_ready_envelope\(p_envelope_bytes BYTEA, p_envelope_digest TEXT\)/);
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, pg_temp/);
  assert.match(sql, /session_user[\s\S]*ofertasuper_verifier/);
  assert.doesNotMatch(sql, /current_user\s*(?:=|<>|!=)/);
  assert.match(sql, /convert_from\(p_envelope_bytes, 'UTF8'\)/);
  assert.match(sql, /encode\(pg_catalog\.sha256\(p_envelope_bytes\), 'hex'\)/);
  assert.match(sql, /canonical_json_text\(payload\)/);
  assert.match(sql, /INSERT INTO public\.verifier_envelope_commitments/);
  assert.match(sql, /promotion-ready-envelope\/v1/);
});

test("rejects canonical envelopes that forge U12a1 time, source, or item semantics", () => {
  const sql = migration();
  assert.match(sql, /root\/capture timestamp mismatch/);
  assert.match(sql, /capture source semantics invalid/);
  assert.match(sql, /governed item semantics invalid/);
  assert.match(sql, /capture item ordering invalid/);
  assert.match(sql, /governed item ordering invalid/);
});

test("checks each governed image against its matching capture item", () => {
  const sql = migration();
  assert.match(sql, /capture_item := payload->'capture'->'items'->item_index/);
  assert.match(sql, /governed_item->'tombstone' IS DISTINCT FROM pg_catalog\.to_jsonb\(governed_item->'after' = 'null'::jsonb\)/);
  assert.match(sql, /capture_item->'entity' <> governed_item->'entity'/);
  assert.match(sql, /capture_item->'key' <> governed_item->'key'/);
  assert.match(sql, /public\.canonical_json_text\(key_value\) <> item->>'key'/);
});
