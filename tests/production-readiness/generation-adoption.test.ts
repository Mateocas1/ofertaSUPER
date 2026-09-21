import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "prisma/migrations/20260909_reader_adoption/migration.sql";

test("reader adoption is distinct from publisher adoption and binds every current authority fact", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE public\.reader_generation_adoptions/);
  assert.match(sql, /reader_id TEXT NOT NULL/);
  assert.match(sql, /existing_live_adoption_id UUID NOT NULL/);
  for (const field of ["policy_digest", "generation", "lineage", "health_version", "build_digest"]) assert.match(sql, new RegExp(`expected${field.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}|${field}`));
  assert.match(sql, /reader adoption idempotency conflict/);
  assert.match(sql, /authority_revoke_outcomes/);
  assert.match(sql, /authority_lifecycle_reservations v WHERE id=authority\.reservation_id FOR UPDATE/);
  assert.doesNotMatch(sql, /UPDATE public\.authority_revoke/);
});

test("reader eligibility is guarded, exact-idempotent, and rejects revocation or drift without repairing admitted data", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE FUNCTION public\.adopt_generation\(r JSONB\)/);
  assert.match(sql, /reader adoption authority is revoked/);
  assert.match(sql, /reader adoption drift conflict/);
  assert.match(sql, /RETURN prior\.request_key/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.reader_generation_adoptions/);
  assert.doesNotMatch(sql, /UPDATE public\.existing_live_adoptions|INSERT INTO public\.existing_live_adoptions/);
});
