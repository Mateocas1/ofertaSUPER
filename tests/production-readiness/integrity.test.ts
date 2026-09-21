import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessCustody, createCustodySchemaSql } from "../../src/lib/production-readiness/artifacts";

describe("custody integrity gate", () => {
	it("fails closed when restoration lacks integrity or privilege proof", () => {
		assert.equal(assessCustody({ bytes: "ok", now: new Date(), restore: { integrity: false, privileges: true } }).enablementBlocked, true);
		assert.equal(assessCustody({ bytes: "ok", now: new Date(), restore: { integrity: true, privileges: true }, measurements: [{ name: "integrity", owner: "custodian" }, { name: "capacity", owner: "operator" }] }).enablementBlocked, false);
	});

	it("retires only dependency edges whose endpoints are independently eligible", () => {
		const sql = createCustodySchemaSql();
		assert.match(sql, /retired AS \(DELETE FROM public\.evidence_dependencies/);
		assert.match(sql, /USING eligible parent,eligible child/);
		assert.match(sql, /NOT EXISTS \(SELECT 1 FROM retired/);
	});
});
