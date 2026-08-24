import assert from "node:assert/strict";
import test from "node:test";

import { evaluateProductionGate, signGateReceipt, type GateInput, type GateReceipt } from "../src/lib/production-readiness/policy";

const now = "2026-08-25T12:00:00.000Z";
const commitSha = "a".repeat(40);
const candidateHash = `sha256:${"b".repeat(64)}`;
const deploymentId = "deployment-001";

function receipt(kind: GateReceipt["kind"], extra: Partial<GateReceipt> = {}): GateReceipt {
	const base = { kind, stage: "shadow" as const, source: "disco", commitSha, deploymentId, hash: candidateHash, signedBy: "operator", issuedAt: "2026-08-25T11:00:00.000Z", expiresAt: "2026-08-25T13:00:00.000Z", result: "success" as const };
	return { ...base, ...extra, signature: "" } as GateReceipt;
}

function input(extra: Partial<GateInput> = {}): GateInput {
	const receipts = ["security", "alert", "restore", "candidate"].map((kind) => receipt(kind as GateReceipt["kind"]));
	const value: GateInput = {
		event: { action: "shadow", source: "disco", sources: ["disco"], result: "success" },
		promotion: { stage: "idle", commitSha, candidateHash, deploymentId },
		receipts,
		expiryPolicy: { approvedBy: "operator", durationsMs: { security: 7_200_000, alert: 7_200_000, restore: 7_200_000, candidate: 7_200_000, shadow: 7_200_000, rollback: 7_200_000, reconcile: 7_200_000, go: 7_200_000, "final-go": 7_200_000, cycle: 7_200_000 } },
		killSwitch: false,
		now,
		commitSha,
		supportWindow: { user: "operator", startsAt: "2026-08-25T10:00:00.000Z", endsAt: "2026-08-25T14:00:00.000Z", available: true },
	};
	return { ...value, ...extra, receipts: (extra.receipts ?? value.receipts).map((item) => ({ ...item, signature: signGateReceipt(item) })) };
}

test("fails closed for unset authority, malformed/future/mismatched evidence, and inactive safety controls", () => {
	assert.deepEqual(evaluateProductionGate(input()).allowed, true);
	assert.equal(evaluateProductionGate({ event: {} } as GateInput).allowed, false);
	for (const extra of [
		{ expiryPolicy: { approvedBy: "", durationsMs: {} } },
		{ killSwitch: true },
		{ supportWindow: { user: "operator", startsAt: "2026-08-25T10:00:00.000Z", endsAt: "2026-08-25T11:00:00.000Z", available: true } },
		{ supportWindow: { user: "operator", startsAt: "2026-08-25T10:00:00.000Z", endsAt: "2026-08-25T14:00:00.000Z", available: false } },
		{ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, issuedAt: "2026-08-25T12:30:00.000Z" } : item) },
		{ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, hash: `sha256:${"c".repeat(64)}` } : item) },
	]) assert.equal(evaluateProductionGate(input(extra as Partial<GateInput>)).allowed, false);
	const forged = input();
	forged.receipts[0].signature = "sha256:forged";
	assert.equal(evaluateProductionGate(forged).allowed, false);
});

test("orders shadows, bounded writes, scheduled reconciliation, and final seven-cycle acceptance", () => {
	const shadows = [receipt("shadow", { cycle: 1, real: true }), receipt("shadow", { cycle: 2, real: true })];
	const limited = input({ event: { action: "limited-writes", source: "disco", sources: ["disco"], result: "success" }, promotion: { stage: "shadow", commitSha, candidateHash, deploymentId }, receipts: [...input().receipts, ...shadows, receipt("rollback", { stage: "limited-writes" }), receipt("go", { stage: "limited-writes" })] });
	assert.equal(evaluateProductionGate(limited).stage, "limited-writes");
	const scheduled = input({ event: { action: "scheduled", source: "disco", sources: ["disco"], result: "success" }, promotion: { stage: "limited-writes", commitSha, candidateHash, deploymentId }, receipts: [...limited.receipts, receipt("reconcile", { stage: "scheduled" }), receipt("rollback", { stage: "scheduled" }), receipt("go", { stage: "scheduled" })] });
	assert.equal(evaluateProductionGate(scheduled).stage, "scheduled");
	const cycles = Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: index + 1, cycleHours: 24, real: true }));
	const accepted = input({ event: { action: "accepted", source: "disco", sources: ["disco"], result: "success" }, promotion: { stage: "scheduled", commitSha, candidateHash, deploymentId }, receipts: [...scheduled.receipts, ...cycles, receipt("final-go", { stage: "scheduled" })] });
	assert.equal(evaluateProductionGate(accepted).allowed, true);
});

test("rejects malformed receipt fields and hostile cycle proofs", () => {
	const malformed = [
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, stage: "scheduled" } : item) }),
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, stage: "accepted" as GateReceipt["stage"] } : item) }),
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, real: true } : item) }),
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, real: "true" as unknown as boolean } : item) }),
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, cycle: "1" as unknown as number } : item) }),
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, cycleHours: "24" as unknown as number } : item) }),
		input({ receipts: [...input().receipts, receipt("shadow", { result: "unknown" as GateReceipt["result"] })] }),
	];
	for (const value of malformed) assert.equal(evaluateProductionGate(value).allowed, false);

	const limited = (shadows: GateReceipt[]) => input({ event: { action: "limited-writes", source: "disco", sources: ["disco"], result: "success" }, promotion: { stage: "shadow", commitSha, candidateHash, deploymentId }, receipts: [...input().receipts, ...shadows, receipt("rollback", { stage: "limited-writes" }), receipt("go", { stage: "limited-writes" })] });
	for (const shadows of [
		[receipt("shadow", { cycle: 1, real: "true" as unknown as boolean }), receipt("shadow", { cycle: 2, real: "true" as unknown as boolean })],
		[receipt("shadow", { cycle: -1, real: true }), receipt("shadow", { cycle: 2, real: true })],
		[receipt("shadow", { cycle: 1.5, real: true }), receipt("shadow", { cycle: 2, real: true })],
		[receipt("shadow", { cycle: "1" as unknown as number, real: true }), receipt("shadow", { cycle: "2" as unknown as number, real: true })],
		[receipt("shadow", { stage: "limited-writes", cycle: 1, real: true }), receipt("shadow", { stage: "limited-writes", cycle: 2, real: true })],
		[receipt("shadow", { cycle: 1, real: true }), receipt("shadow", { cycle: 2, real: true }), receipt("shadow", { cycle: 2, real: true })],
		[receipt("shadow", { cycle: 1, real: true }), receipt("shadow", { cycle: 2, real: true, result: "failure" })],
	]) assert.equal(evaluateProductionGate(limited(shadows)).allowed, false);

	const accepted = (cycles: GateReceipt[]) => input({ event: { action: "accepted", source: "disco", sources: ["disco"], result: "success" }, promotion: { stage: "scheduled", commitSha, candidateHash, deploymentId }, receipts: [...input().receipts, ...cycles, receipt("final-go", { stage: "scheduled" })] });
	for (const cycles of [
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: index + 1, cycleHours: 24 })),
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: `${index + 1}` as unknown as number, cycleHours: 24, real: true })),
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: index + 1.1, cycleHours: 24, real: true })),
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: index + 1, cycleHours: 25, real: true })),
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "shadow", cycle: index + 1, cycleHours: 24, real: true })),
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: index + 1, cycleHours: 24, real: true, result: index === 6 ? "failure" : "success" })),
		Array.from({ length: 7 }, (_, index) => receipt("cycle", { stage: "scheduled", cycle: index === 6 ? 6 : index + 1, cycleHours: 24, real: true })),
	]) assert.equal(evaluateProductionGate(accepted(cycles)).allowed, false);
});

test("denies additional or unsupported sources, expiry, out-of-order transitions, and active-stage failures", () => {
	for (const value of [
		input({ event: { action: "shadow", source: "unknown", sources: ["unknown"], result: "success" } }),
		input({ event: { action: "shadow", source: "disco", sources: ["disco", "vea"], result: "success" } }),
		input({ receipts: input().receipts.map((item, index) => index === 0 ? { ...item, expiresAt: "2026-08-25T11:00:00.000Z" } : item) }),
		input({ event: { action: "scheduled", source: "disco", sources: ["disco"], result: "success" } }),
	]) assert.equal(evaluateProductionGate(value).allowed, false);
	const failed = evaluateProductionGate(input({ event: { action: "scheduled", source: "disco", sources: ["disco"], result: "failure" }, promotion: { stage: "scheduled", commitSha, candidateHash, deploymentId } }));
	assert.deepEqual({ allowed: failed.allowed, stage: failed.stage }, { allowed: false, stage: "limited-writes" });
});
