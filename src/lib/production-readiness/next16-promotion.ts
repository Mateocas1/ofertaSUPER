import { createHash } from "node:crypto";

export const requiredPromotionGates = [
	"dependency-audit-graph",
	"build",
	"standalone-liveness",
	"standalone-catalog-provenance",
	"protected-denial",
	"authorized-access",
	"pwa-install-cache-offline",
	"representative-image",
	"rollback-readiness",
] as const;

type GateId = (typeof requiredPromotionGates)[number];
type PromotionStatus = "blocked" | "rolled_back" | "promoted";
export type PromotionGateReceipt = {
	gate: string;
	status: "passed" | "failed";
	snapshotId: string;
	releaseId: string;
	observedAt: string;
	evidenceHash: string;
};
export type PromotionState = {
	state: PromotionStatus;
	snapshotId: string;
	releaseId: string;
	failedGateIds: string[];
	missingGateIds: string[];
	receiptSetHash: string;
	recordHash: string;
};

const receiptKeys = ["evidenceHash", "gate", "observedAt", "releaseId", "snapshotId", "status"];
const maxEvidenceAgeMs = 5 * 60 * 1000;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const stable = (value: unknown) => JSON.stringify(value);
const hasSecret = (value: string) => /(?:sk|pk)_(?:test|live)_[\w-]+|bearer\s+|password=|private key/i.test(value);
const isGateId = (value: string): value is GateId => requiredPromotionGates.includes(value as GateId);

function isExactReceipt(value: unknown): value is PromotionGateReceipt {
	if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
	const record = value as Record<string, unknown>;
	return Object.keys(record).sort().every((key, index) => key === receiptKeys[index])
		&& Object.keys(record).length === receiptKeys.length
		&& typeof record.gate === "string" && typeof record.status === "string"
		&& typeof record.snapshotId === "string" && typeof record.releaseId === "string"
		&& typeof record.observedAt === "string" && typeof record.evidenceHash === "string";
}

function order(ids: Iterable<string>) {
	return [...new Set(ids)].sort((left, right) => {
		const leftIndex = requiredPromotionGates.indexOf(left as GateId);
		const rightIndex = requiredPromotionGates.indexOf(right as GateId);
		return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
			|| left.localeCompare(right);
	});
}

function receiptFailure(receipt: PromotionGateReceipt, snapshotId: string, releaseId: string, now: Date) {
	const observedAt = Date.parse(receipt.observedAt);
	return receipt.status !== "passed" || receipt.snapshotId !== snapshotId || receipt.releaseId !== releaseId
		|| !Number.isFinite(observedAt) || observedAt > now.getTime() + 60_000 || now.getTime() - observedAt > maxEvidenceAgeMs
		|| !/^sha256:[a-f0-9]{64}$/.test(receipt.evidenceHash) || Object.values(receipt).some((value) => hasSecret(value));
}

export function evaluatePromotion(
	input: { snapshotId: string; releaseId: string; receipts: unknown; intent: "promotion" | "rollback" },
	persist: (state: PromotionState) => void,
	now = new Date(),
): PromotionState {
	const failed = new Set<string>();
	const seen = new Set<string>();
	let malformed = hasSecret(input.snapshotId) || hasSecret(input.releaseId) || !input.snapshotId || !input.releaseId;
	const receipts = Array.isArray(input.receipts) ? input.receipts : [];
	if (!Array.isArray(input.receipts)) malformed = true;

	for (const value of receipts) {
		if (!isExactReceipt(value)) {
			malformed = true;
			failed.add("malformed");
			continue;
		}
		if (!isGateId(value.gate)) {
			malformed = true;
			failed.add(`unknown:${value.gate}`);
			continue;
		}
		if (seen.has(value.gate)) {
			failed.add(value.gate);
			continue;
		}
		seen.add(value.gate);
		if (Object.values(value).some((field) => hasSecret(field))) malformed = true;
		if (receiptFailure(value, input.snapshotId, input.releaseId, now)) failed.add(value.gate);
	}

	const missing = requiredPromotionGates.filter((gate) => !seen.has(gate));
	const failedGateIds = order(failed);
	const receiptSetHash = hash(stable(receipts.map((value) => isExactReceipt(value) ? value : "malformed").sort((left, right) => stable(left).localeCompare(stable(right)))));
	const state: PromotionStatus = input.intent === "rollback" ? "rolled_back" : failed.size || missing.length ? "blocked" : "promoted";
	const record = {
		state, snapshotId: input.snapshotId, releaseId: input.releaseId, failedGateIds, missingGateIds: missing,
		receiptSetHash, recordHash: "",
	};
	const result = { ...record, recordHash: hash(stable(record)) };
	persist(result);
	if (malformed) throw new Error("promotion gates rejected");
	return result;
}

export function createPromotionHandoff(state: PromotionState) {
	return {
		productionReadiness: { task: "1.3", state: "pending" as const },
		promotion: {
			state: state.state,
			failedGateIds: state.failedGateIds,
			missingGateIds: state.missingGateIds,
			recordHash: state.recordHash,
		},
	};
}
