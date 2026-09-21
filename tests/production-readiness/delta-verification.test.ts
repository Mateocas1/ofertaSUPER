import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyCommittedSourceDelta } from "../../src/lib/production-readiness/verification";

const base = {
	verifier: { credential: "verifier/read-only", snapshot: "committed:42" },
	capture: {
		operationKey: "source-capture/v1:sha256:captured",
		source: "vea" as const,
		observedAt: "2026-06-01T00:00:00.000Z",
		items: [{ entity: "offer" as const, key: "offer-1", before: { price: 100 }, after: { price: 110, lastCheckedAt: "2026-06-01T00:00:00.000Z" } }],
	},
	actual: [{ entity: "offer" as const, key: "offer-1", facts: { price: 110, lastCheckedAt: "2026-06-01T00:00:00.000Z" } }],
	policy: { digest: "sha256:policy", permittedFields: ["price"], maximumSourceAgeMs: 60_000 },
	predecessor: { generation: 7, digest: "sha256:predecessor", facts: { price: 100, seller: "kept" } },
	evidence: { bytes: "postwrite evidence", sha256: "sha256:78b22b09ae7484de1e2eb40962f7b3ac4560f407536ca16040b0a94aeeb21db7" },
	lineage: { predecessor: "sha256:predecessor", result: "sha256:result" },
	verifiedAt: "2026-06-01T00:00:30.000Z",
};

describe("independent postcommit source verification", () => {
	it("rejects producer PASS, absent/corrupt proof, invalid ages, unknown lineage, and verifier failure", () => {
		for (const input of [
			{ ...base, producerPass: true },
			{ ...base, evidence: { ...base.evidence, bytes: "altered" } },
			{ ...base, evidence: null },
			{ ...base, verifiedAt: "2026-06-01T00:02:00.000Z" },
			{ ...base, lineage: { predecessor: "unknown", result: "sha256:result" } },
			{ ...base, verifierFailure: "cannot read source" },
		]) assert.throws(() => verifyCommittedSourceDelta(input), /verification/i);
	});

	it("requires a separate read-only credential and committed snapshot, conflicts on drift, and copies only changed fields", () => {
		assert.throws(() => verifyCommittedSourceDelta({ ...base, verifier: { credential: "producer/write", snapshot: "committed:42" } }), /separate read-only/);
		assert.throws(() => verifyCommittedSourceDelta({ ...base, verifier: { credential: "verifier/read-only", snapshot: "pending" } }), /committed snapshot/);
		assert.throws(() => verifyCommittedSourceDelta({ ...base, actual: [{ ...base.actual[0], facts: { price: 111 } }] }), /drift/);
		const verified = verifyCommittedSourceDelta(base);
		assert.deepEqual(verified.result.facts, { price: 110, seller: "kept" });
		assert.equal(verified.status, "SEALED_SOURCE_ONLY");
	});

	it("keeps observation and source-history times unchanged while recording verification separately", () => {
		const verified = verifyCommittedSourceDelta(base);
		assert.equal(verified.result.facts.lastCheckedAt, undefined);
		assert.equal(verified.observedAt, base.capture.observedAt);
		assert.equal(verified.verifiedAt, base.verifiedAt);
	});
});
