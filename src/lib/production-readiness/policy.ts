import { createHash } from "node:crypto";

export type GateStage = "idle" | "shadow" | "limited-writes" | "scheduled" | "accepted";
type ReceiptKind = "security" | "alert" | "restore" | "candidate" | "shadow" | "rollback" | "reconcile" | "go" | "final-go" | "cycle";

export type GateReceipt = {
	kind: ReceiptKind;
	stage: Exclude<GateStage, "idle" | "accepted">;
	source: string;
	commitSha: string;
	deploymentId?: string;
	hash: string;
	signedBy: string;
	signature: string;
	issuedAt: string;
	expiresAt: string;
	result: "success" | "failure";
	cycle?: number;
	cycleHours?: number;
	real?: boolean;
};

export type GateInput = {
	event: { action: Exclude<GateStage, "idle">; source: string; sources: string[]; result: "success" | "failure" };
	promotion: { stage: Exclude<GateStage, "accepted">; commitSha: string; candidateHash: string; deploymentId: string };
	receipts: GateReceipt[];
	expiryPolicy: { approvedBy: string; durationsMs: Record<ReceiptKind, number> };
	killSwitch: boolean;
	now: string;
	commitSha: string;
	supportWindow: { user: string; startsAt: string; endsAt: string; available: boolean };
};

export type GateDecision = { allowed: boolean; stage: GateStage; reasons: string[]; authority?: { user: string; role: "operator-alert-go-no-go" } };

const KINDS: ReceiptKind[] = ["security", "alert", "restore", "candidate", "shadow", "rollback", "reconcile", "go", "final-go", "cycle"];
const COMMON: ReceiptKind[] = ["security", "alert", "restore", "candidate"];
const RECEIPT_STAGES: Record<ReceiptKind, GateReceipt["stage"][]> = {
	security: ["shadow"], alert: ["shadow"], restore: ["shadow"], candidate: ["shadow"], shadow: ["shadow"],
	rollback: ["limited-writes", "scheduled"], reconcile: ["scheduled"], go: ["limited-writes", "scheduled"], "final-go": ["scheduled"], cycle: ["scheduled"],
};
const NEXT: Record<Exclude<GateStage, "idle">, Exclude<GateStage, "accepted">> = { shadow: "idle", "limited-writes": "shadow", scheduled: "limited-writes", accepted: "scheduled" };

/** Deterministic fixture signature, not a credential or external authorization. */
export function signGateReceipt(receipt: Omit<GateReceipt, "signature"> | GateReceipt) {
	const signed: Record<string, unknown> = { ...receipt };
	delete signed.signature;
	return `sha256:${createHash("sha256").update(JSON.stringify(signed)).digest("hex")}`;
}

export function evaluateProductionGate(input: GateInput): GateDecision {
	if (!input || typeof input !== "object") return deny("idle", "malformed input");
	const { event, promotion, receipts, expiryPolicy, supportWindow } = input;
	if (!event || !promotion || !Array.isArray(receipts) || !expiryPolicy || !supportWindow) return deny("idle", "malformed input");
	const now = date(input.now);
	if (!now || !validPromotion(promotion, input.commitSha) || !validEvent(event)) return deny(stage(promotion), "malformed promotion or event");
	if (input.killSwitch !== false) return deny(promotion.stage, "kill switch active");
	if (event.source !== "disco" || event.sources.length !== 1 || event.sources[0] !== event.source) return deny(promotion.stage, "exactly one supported source is required");
	if (!validWindow(supportWindow, now)) return deny(promotion.stage, "declared operator is unavailable outside the support window");
	if (!validPolicy(expiryPolicy, supportWindow.user)) return deny(promotion.stage, "expiry policy is unapproved or malformed");
	if (receipts.some((receipt) => !validReceipt(receipt, promotion, expiryPolicy, now))) return deny(promotion.stage, "receipt is malformed, future, expired, or signature-bound incorrectly");
	for (const kind of COMMON) if (!has(receipts, kind, promotion, "shadow", supportWindow.user)) return deny(promotion.stage, `missing ${kind} evidence`);
	const authority = { user: supportWindow.user, role: "operator-alert-go-no-go" as const };
	if (event.result === "failure") return deny(NEXT[promotion.stage === "idle" ? "shadow" : promotion.stage], "active stage failed; writes and schedules must roll back", authority);
	if (event.action === "shadow") return promotion.stage === "idle" ? allow("shadow", authority) : deny(promotion.stage, "out-of-order transition", authority);
	if (event.action === "limited-writes") {
		if (promotion.stage !== "shadow") return deny(promotion.stage, "out-of-order transition", authority);
		const shadows = receipts.filter((receipt) => receipt.kind === "shadow");
		if (!hasExactCycles(shadows, [1, 2], "shadow")) return deny(promotion.stage, "two consecutive verified real shadows are required", authority);
		if (!has(receipts, "rollback", promotion, "limited-writes") || !has(receipts, "go", promotion, "limited-writes", supportWindow.user)) return deny(promotion.stage, "rollback readiness and explicit user go are required", authority);
		return allow("limited-writes", authority);
	}
	if (event.action === "scheduled") {
		if (promotion.stage !== "limited-writes") return deny(promotion.stage, "out-of-order transition", authority);
		if (!has(receipts, "reconcile", promotion, "scheduled") || !has(receipts, "rollback", promotion, "scheduled") || !has(receipts, "go", promotion, "scheduled", supportWindow.user)) return deny(promotion.stage, "bounded reconciliation, rollback proof, and explicit user go are required", authority);
		return allow("scheduled", authority);
	}
	if (event.action === "accepted") {
		if (promotion.stage !== "scheduled") return deny(promotion.stage, "out-of-order transition", authority);
		const cycles = receipts.filter((receipt) => receipt.kind === "cycle");
		if (!hasExactCycles(cycles, [1, 2, 3, 4, 5, 6, 7], "scheduled", 24)) return deny(promotion.stage, "seven verified 24-hour cycles are required", authority);
		return has(receipts, "final-go", promotion, "scheduled", supportWindow.user) ? allow("accepted", authority) : deny(promotion.stage, "signed deployment-bound go/no-go is required", authority);
	}
	return deny(promotion.stage, "out-of-order transition", authority);
}

function validPromotion(promotion: GateInput["promotion"], commitSha: string) {
	return Boolean(promotion && ["idle", "shadow", "limited-writes", "scheduled"].includes(promotion.stage) && typeof commitSha === "string" && /^[a-f0-9]{40}$/.test(commitSha) && promotion.commitSha === commitSha && /^sha256:[a-f0-9]{64}$/.test(promotion.candidateHash) && typeof promotion.deploymentId === "string" && promotion.deploymentId.length > 0);
}
function validEvent(event: GateInput["event"]) {
	return Boolean(event && ["shadow", "limited-writes", "scheduled", "accepted"].includes(event.action) && ["success", "failure"].includes(event.result) && typeof event.source === "string" && Array.isArray(event.sources) && event.sources.every((source) => typeof source === "string"));
}
function validPolicy(policy: GateInput["expiryPolicy"], user: string) {
	return Boolean(policy && typeof policy.approvedBy === "string" && policy.approvedBy === user && policy.durationsMs && KINDS.every((kind) => Number.isFinite(policy.durationsMs[kind]) && policy.durationsMs[kind] > 0));
}
function validWindow(window: GateInput["supportWindow"], now: number) {
	const start = date(window?.startsAt), end = date(window?.endsAt);
	return Boolean(window && typeof window.user === "string" && window.user && window.available === true && start !== undefined && end !== undefined && start <= now && now < end);
}
function validReceipt(receipt: GateReceipt, promotion: GateInput["promotion"], policy: GateInput["expiryPolicy"], now: number) {
	if (!receipt || typeof receipt !== "object" || !KINDS.includes(receipt.kind) || !RECEIPT_STAGES[receipt.kind].includes(receipt.stage) || !["success", "failure"].includes(receipt.result) || typeof receipt.source !== "string" || typeof receipt.commitSha !== "string" || typeof receipt.deploymentId !== "string" || typeof receipt.hash !== "string" || typeof receipt.signedBy !== "string" || typeof receipt.signature !== "string") return false;
	const isProof = receipt.kind === "shadow" || receipt.kind === "cycle";
	if (("real" in receipt) !== isProof || ("cycle" in receipt) !== isProof || ("cycleHours" in receipt) !== (receipt.kind === "cycle")) return false;
	if (isProof && (typeof receipt.real !== "boolean" || !Number.isFinite(receipt.cycle) || !Number.isInteger(receipt.cycle))) return false;
	if (receipt.kind === "shadow" && (receipt.cycle! < 1 || receipt.cycle! > 2)) return false;
	if (receipt.kind === "cycle" && (!Number.isFinite(receipt.cycleHours) || !Number.isInteger(receipt.cycleHours) || receipt.cycle! < 1 || receipt.cycle! > 7 || receipt.cycleHours !== 24)) return false;
	const issued = date(receipt.issuedAt), expires = date(receipt.expiresAt);
	return receipt.source === "disco" && receipt.commitSha === promotion.commitSha && receipt.deploymentId === promotion.deploymentId && receipt.hash === promotion.candidateHash && receipt.signedBy.length > 0 && receipt.signature === signGateReceipt(receipt) && issued !== undefined && expires !== undefined && issued <= now && now < Math.min(expires, issued + policy.durationsMs[receipt.kind]);
}
function hasExactCycles(receipts: GateReceipt[], expected: number[], stage: GateReceipt["stage"], hours?: number) {
	return receipts.length === expected.length && receipts.every((receipt) => receipt.stage === stage && receipt.result === "success" && receipt.real === true && receipt.cycle !== undefined && expected.includes(receipt.cycle) && (hours === undefined || receipt.cycleHours === hours)) && new Set(receipts.map((receipt) => receipt.cycle)).size === expected.length;
}
function has(receipts: GateReceipt[], kind: ReceiptKind, promotion: GateInput["promotion"], stage: GateReceipt["stage"], signer?: string) {
	return receipts.some((receipt) => receipt.kind === kind && receipt.result === "success" && receipt.stage === stage && receipt.deploymentId === promotion.deploymentId && (!signer || receipt.signedBy === signer));
}
function date(value: unknown) { const time = typeof value === "string" ? Date.parse(value) : Number.NaN; return Number.isFinite(time) ? time : undefined; }
function stage(promotion: GateInput["promotion"] | undefined): GateStage { return promotion && ["idle", "shadow", "limited-writes", "scheduled"].includes(promotion.stage) ? promotion.stage : "idle"; }
function allow(stage: GateStage, authority: GateDecision["authority"]): GateDecision { return { allowed: true, stage, reasons: [], authority }; }
function deny(stage: GateStage, reason: string, authority?: GateDecision["authority"]): GateDecision { return { allowed: false, stage, reasons: [reason], ...(authority ? { authority } : {}) }; }
