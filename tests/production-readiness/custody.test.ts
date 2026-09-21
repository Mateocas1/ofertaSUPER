import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
	assessCustody,
	createCustodySchemaSql,
} from "../../src/lib/production-readiness/artifacts";

describe("evidence custody", () => {
	it("retains revoked and referenced bytes through latest expiry plus 180 days", () => {
		const result = assessCustody({
			bytes: "retained", now: new Date("2026-01-01T00:00:00Z"),
			references: [{ expiresAt: new Date("2026-02-01T00:00:00Z"), revokedAt: new Date("2026-01-02T00:00:00Z") }],
		});
		assert.equal(result.deleteable, false);
		assert.equal(result.retainUntil.toISOString(), "2026-07-31T00:00:00.000Z");
	});

	it("holds win and corruption restricts its complete dependency closure", () => {
		const result = assessCustody({
			bytes: "lost", expectedSha256: createHash("sha256").update("other").digest("hex"),
			now: new Date("2027-01-01T00:00:00Z"), holdUntil: new Date("2027-02-01T00:00:00Z"),
			dependencies: ["delta", "authority"],
		});
		assert.deepEqual(result.restrictions, ["authority", "delta"]);
		assert.equal(result.deleteable, false);
	});

	it("requires named integrity and capacity proof before enablement", () => {
		assert.equal(assessCustody({ bytes: "ok", now: new Date(), measurements: [] }).enablementBlocked, true);
		assert.equal(assessCustody({ bytes: "ok", now: new Date(), measurements: [{ name: "integrity", owner: "custodian" }, { name: "capacity", owner: "operator" }] }).enablementBlocked, false);
		assert.match(createCustodySchemaSql(), /evidence_gc/);
	});
});
