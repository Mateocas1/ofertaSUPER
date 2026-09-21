import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "prisma/migrations/20260908_existing_live_adoption/migration.sql";
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const request = { key: "adopt-1", publicationId: "publication", expectedGeneration: "0", expectedLineage: digest("a"), expectedHealthVersion: "0", expectedBuildDigest: digest("b"), expectedPolicyDigest: digest("c") };

test("generation zero independently binds the requested lineage to immutable activation and baseline proof", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /r->>'expectedLineage'\s+IS DISTINCT FROM\s+baseline\.root_digest/);
  assert.match(sql, /authority\.proof->'adoption'/);
  assert.match(sql, /authority\.proof IS NULL/);
  assert.match(sql, /catalog\.authority_adoption->>'incarnation'/);
});

test("generation greater than zero selects only the immutable generation record and promotion operation", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /governed_generation_records WHERE generation=catalog\.governed_generation/);
  assert.match(sql, /generation_promotion_operations WHERE generation_record_id=record\.id/);
  assert.match(sql, /record\.result_lineage IS DISTINCT FROM r->>'expectedLineage'/);
  assert.match(sql, /operation\.outcome->>'lineage' IS DISTINCT FROM record\.result_lineage/);
  assert.doesNotMatch(sql, /r->'proof'|r->>'publisher'/);
});

test("SQL rejects stale or unverified policy, generation, lineage, health and build bindings before a final DB-clock check", () => {
  const sql = readFileSync(migrationPath, "utf8");
  for (const evidence of ["stale existing LIVE generation binding", "existing LIVE policy binding required", "existing LIVE adoption drift conflict", "unverified existing LIVE baseline proof", "unverified existing LIVE generation proof", "late-ineligible existing LIVE adoption requires forward recovery"]) assert.match(sql, new RegExp(evidence));
  assert.match(sql, /checked := clock_timestamp\(\);\s+IF checked >= expiry/);
});

test("adoption is exact-idempotent, rejects changed requests, and cannot revive a prior admission", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /existing LIVE adoption idempotency conflict/);
  assert.match(sql, /RETURN prior\.request_key/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.existing_live_adoptions/);
  assert.doesNotMatch(sql, /UPDATE public\.governed_catalogs|INSERT INTO public\.governed_generation_records|promote_delta/);
});

test("adoption has a typed single-effect repository boundary and never retries unknown outcomes", async () => {
  const { createExistingLiveAdoptionRepository } = await import("../../src/lib/production-readiness/repository");
  let query = ""; let values: unknown[] = [];
  const result = await createExistingLiveAdoptionRepository({ execute: async (sql, input) => { query = sql; values = input; return { rows: [{ operation_id: "adopt-1" }] }; } }).adopt(request);
  assert.deepEqual(result, { operationId: "adopt-1" });
  assert.equal(query, "SELECT public.adopt_existing_live($1::jsonb) AS operation_id");
  assert.deepEqual(values, [JSON.stringify(request)]);
  await assert.rejects(createExistingLiveAdoptionRepository({ execute: async () => ({ rows: [] }) }).adopt(request), /unknown; do not replay or compensate/);
  for (const invalid of [{ ...request, expectedGeneration: "01" }, { ...request, expectedHealthVersion: "-1" }, { ...request, expectedBuildDigest: "publisher-json" }]) {
    await assert.rejects(createExistingLiveAdoptionRepository({ execute: async () => { throw new Error("must not execute"); } }).adopt(invalid), /generation|digest/);
  }
});
