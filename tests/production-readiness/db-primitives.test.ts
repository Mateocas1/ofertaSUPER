import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	GOVERNED_CATALOG_ID,
	createProjectionProcedureSql,
	createProjectionSchemaSql,
} from "../../src/lib/production-readiness/projection";
import { canonicalOperationRequest, createOperationRequest } from "../../src/lib/production-readiness/operations";

describe("governed catalog database primitives", () => {
	it("defines one singleton control record with monotonic generation and build epoch constraints", () => {
		const sql = createProjectionSchemaSql();

		assert.equal(GOVERNED_CATALOG_ID, "catalog");
		assert.match(sql, /CHECK \("id" = 'catalog'\)/);
		assert.match(sql, /CHECK \("governed_generation" IS NULL OR "governed_generation" >= 0\)/);
		assert.match(sql, /CHECK \("build_epoch" >= 0\)/);
	});

	it("uses a procedure context guard and exact request binding for idempotency", () => {
		const request = createOperationRequest({
			action: "begin_baseline",
			clientKey: "request-1",
			payload: { expectedEpoch: 0 },
		});
		const schemaSql = createProjectionSchemaSql();
		const procedureSql = createProjectionProcedureSql();

		assert.equal(canonicalOperationRequest(request), '{"action":"begin_baseline","clientKey":"request-1","payload":{"expectedEpoch":0}}');
		assert.match(schemaSql, /CREATE FUNCTION public\.guard_governed_catalog_mutation/);
		assert.match(schemaSql, /CREATE TRIGGER governed_catalog_procedure_guard/);
		assert.match(schemaSql, /current_setting\('governed_catalog\.procedure', true\) IS DISTINCT FROM 'begin_baseline'/);
		assert.match(procedureSql, /CREATE FUNCTION public\.governed_catalog_begin_baseline/);
		assert.match(procedureSql, /set_config\('governed_catalog\.procedure', 'begin_baseline', true\)/);
		assert.match(procedureSql, /FOR UPDATE/);
		assert.match(procedureSql, /existing_request_bytes <> p_request_bytes/);
		assert.match(procedureSql, /existing_request_digest <> p_request_digest/);
		assert.match(procedureSql, /operation request conflicts with an existing client key/);
	});

	it("protects each current projection table with primary keys and operation lineage", () => {
		const sql = createProjectionSchemaSql();

		for (const table of [
			"serving_products",
			"serving_supermarkets",
			"serving_offers",
			"serving_history",
			"serving_promotions",
			"serving_memberships",
		]) {
			assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}`));
		}
		assert.match(sql, /"last_operation_id" TEXT NOT NULL/);
	});
});
