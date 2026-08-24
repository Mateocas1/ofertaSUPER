import { createHash } from "node:crypto";

import { evaluateProductionGate, type GateDecision, type GateInput } from "./policy";

export const FIXED_CATALOG_ARGS = ["--stage", "shadow", "--source", "fixture", "--dry-run"] as const;
const ENVIRONMENT_NAMES = ["CI", "GITHUB_ACTIONS"] as const;
const UNTRUSTED_STATE_NAMES = ["PRODUCTION_CATALOG_AUTHORITY", "PRODUCTION_CATALOG_SOURCE", "PRODUCTION_CATALOG_STAGE", "PRODUCTION_CATALOG_WRITE"] as const;
const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export type CatalogRun = { allowed: boolean; stage: "idle" | "shadow"; writes: false; schedule: false; receipt: { source: "disco"; stage: "shadow"; dryRun: true; environment: string[]; disposition: "blocked" | "shadow-ready"; hash: string } };

export function runProductionCatalog(input: { argv?: readonly string[]; environment?: Readonly<Record<string, string | undefined>>; authority?: GateInput } = {}): CatalogRun {
	const argv = input.argv ?? process.argv.slice(2);
	if (argv.length !== FIXED_CATALOG_ARGS.length || argv.some((value, index) => value !== FIXED_CATALOG_ARGS[index])) throw new Error("only fixed production catalog fixture argv is allowed");
	const environment = input.environment ?? process.env;
	const names = ENVIRONMENT_NAMES.filter((name) => environment[name] !== undefined);
	const untrustedState = UNTRUSTED_STATE_NAMES.some((name) => environment[name] !== undefined);
	const authority = input.authority && typeof input.authority === "object"
		? { ...input.authority, event: { ...input.authority.event, action: "shadow" as const, source: "disco", sources: ["disco"], result: "success" as const } }
		: ({ event: {} } as GateInput);
	const decision = untrustedState ? ({ allowed: false, stage: "idle", reasons: ["environment authority is denied"] } as GateDecision) : evaluateProductionGate(authority);
	const allowed = decision.allowed && decision.stage === "shadow";
	const receipt = { source: "disco" as const, stage: "shadow" as const, dryRun: true as const, environment: [...names], disposition: allowed ? "shadow-ready" as const : "blocked" as const };
	return { allowed, stage: allowed ? "shadow" : "idle", writes: false, schedule: false, receipt: { ...receipt, hash: hash(receipt) } };
}

export async function runBoundedCatalogAction(input: { now: string; execute: () => Promise<void>; rollback: () => Promise<void> }) {
	try {
		await input.execute();
		const receipt = { disposition: "completed" as const, at: input.now };
		return { status: "completed" as const, receipt: { ...receipt, hash: hash(receipt) } };
	} catch {
		let disposition: "rolled-back" | "rollback-failed" = "rolled-back";
		try { await input.rollback(); } catch { disposition = "rollback-failed"; }
		const receipt = { disposition, at: input.now };
		return { status: "rolled-back" as const, receipt: { ...receipt, hash: hash(receipt) } };
	}
}
