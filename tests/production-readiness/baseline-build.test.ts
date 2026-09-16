import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
	createBaselineBuildProcedureSql,
	createBaselineBuildSchemaSql,
} from "../../src/lib/production-readiness/projection";

describe("baseline preparation", () => {
	it("binds producer and verifier seals to one exported snapshot and root", () => {
		const sql = createBaselineBuildProcedureSql();

		assert.match(sql, /governed_catalog_seal_baseline/);
		assert.match(sql, /p_snapshot_id/);
		assert.match(sql, /p_root_digest/);
		assert.match(sql, /producer and verifier snapshots must match/);
		assert.match(sql, /baseline root does not match the frozen build/);
		assert.match(sql, /p_verifier_snapshot_id/);
		assert.match(sql, /p_verifier_root_digest/);
	});

	it("fences stale or expired builders and rejects incomplete uploads", () => {
		const sql = createBaselineBuildProcedureSql();

		assert.match(sql, /p_expected_epoch/);
		assert.match(sql, /baseline build epoch is no longer active/);
		assert.match(sql, /baseline build has expired/);
		assert.match(sql, /baseline upload is incomplete/);
		assert.match(sql, /baseline snapshot is unavailable/);
		assert.match(sql, /FROZEN baseline attempts cannot be reused/);
	});

	it("recovers an exact prior operation before claiming the empty catalog", () => {
		const sql = readFileSync("prisma/migrations/20260826_baseline_build_seal/migration.sql", "utf8");
		assert.match(sql, /FROM public\.catalog_operations operation[\s\S]*FROM public\.baseline_build_attempts attempt/);
		assert.match(sql, /IF operation_id IS NOT NULL THEN[\s\S]*RETURN operation_id;[\s\S]*UPDATE public\.governed_catalogs/);
	});

	it("records bounded build attempts separately from the live projection", () => {
		const sql = createBaselineBuildSchemaSql();

		assert.match(sql, /CREATE TABLE public\.baseline_build_attempts/);
		assert.match(sql, /CHECK \("status" IN \('BUILDING', 'FROZEN', 'ABANDONED'\)\)/);
		assert.match(sql, /"expected_row_count" BIGINT NOT NULL/);
		assert.match(sql, /"uploaded_row_count" BIGINT NOT NULL DEFAULT 0/);
		assert.match(sql, /"snapshot_id" TEXT/);
	});
});
