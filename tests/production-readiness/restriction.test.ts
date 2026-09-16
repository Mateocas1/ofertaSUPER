import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "prisma/migrations/20260909_reader_adoption/migration.sql";

test("data and evidence restrictions are normalized and fail closed for unknown fact or surface boundaries", async () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE public\.catalog_restriction_facts/);
  assert.match(sql, /CREATE TABLE public\.catalog_restriction_surfaces/);
  assert.match(sql, /FOREIGN KEY \(fact\) REFERENCES public\.catalog_restriction_facts/);
  const { isKnownRestrictionBoundary } = await import("../../src/lib/production-readiness/restrictions");
  assert.equal(isKnownRestrictionBoundary("commercial-data", "catalog"), true);
  assert.equal(isKnownRestrictionBoundary("authority-evidence", "catalog"), true);
  assert.equal(isKnownRestrictionBoundary("unknown", "catalog"), false);
  assert.equal(isKnownRestrictionBoundary("commercial-data", "unknown"), false);
  assert.match(sql, /unknown restriction boundary/);
});
