import { validateRuntimeContract, type RuntimeEnvironment } from "./runtime-contract";

export type Readiness = {
	status: "ready" | "not_ready";
	components: { configuration: "ok" | "error"; database: "ok" | "error"; redis: "optional" };
};

type DatabaseCheck = () => Promise<unknown>;
type Cache = { expiresAt: number; database: "ok" | "error" } | undefined;

export function createReadinessChecker(
	databaseCheck: DatabaseCheck,
	options: { now?: () => number; successTtlMs?: number; failureTtlMs?: number } = {},
) {
	const now = options.now ?? Date.now;
	const successTtlMs = options.successTtlMs ?? 5_000;
	const failureTtlMs = options.failureTtlMs ?? 1_000;
	let cache: Cache;
	let pending: Promise<"ok" | "error"> | undefined;

	async function checkDatabase() {
		if (cache && cache.expiresAt > now()) return cache.database;
		if (pending) return pending;
		pending = databaseCheck().then(() => "ok" as const, () => "error" as const).then((database) => {
			cache = { database, expiresAt: now() + (database === "ok" ? successTtlMs : failureTtlMs) };
			pending = undefined;
			return database;
		});
		return pending;
	}

	return async (env: RuntimeEnvironment): Promise<Readiness> => {
		const contract = validateRuntimeContract("web", {
			...env,
			REDIS_URL: undefined,
			UPSTASH_REDIS_REST_URL: undefined,
			UPSTASH_REDIS_REST_TOKEN: undefined,
		});
		const configuration = contract.missing.length || contract.invalid.length ? "error" : "ok";
		const database = configuration === "ok" ? await checkDatabase() : "error";
		return {
			status: configuration === "ok" && database === "ok" ? "ready" : "not_ready",
			components: { configuration, database, redis: "optional" },
		};
	};
}
