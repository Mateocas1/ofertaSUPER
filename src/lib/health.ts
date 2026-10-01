import { classifyPublicCatalogReadiness } from "./public-catalog-readiness";
import { validateRuntimeContract, type RuntimeEnvironment } from "./runtime-contract";

export type SnapshotHealth =
	| { status: "ok"; generatedAt: string; ageHours: number }
	| { status: "stale"; generatedAt: string; ageHours: number }
	| { status: "error" };

export type Readiness = {
	status: "ready" | "not_ready";
	components: {
		configuration: "ok" | "error";
		database: "ok" | "error" | "not_required";
		redis: "optional";
	};
	snapshot?: SnapshotHealth;
};

// Reads the bundled catalog snapshot; must throw when it is missing or invalid.
export type SnapshotProbe = () => { generatedAt: string };

// v1 serves the catalog from the bundled snapshot and has no production
// database. Vercel deployments are in that mode unless the admin surface
// (which does need PostgreSQL) is enabled; every other runtime keeps the DB check.
export function isSnapshotMode(env: RuntimeEnvironment) {
	return env.VERCEL === "1" && env.ADMIN_ENABLED !== "true";
}

export function inspectSnapshot(probe: SnapshotProbe, now: Date): SnapshotHealth {
	try {
		const { generatedAt } = probe();
		const readiness = classifyPublicCatalogReadiness({ verified_at: new Date(generatedAt) }, { now });
		if (readiness.status === "unavailable") return { status: "error" };
		const ageHours = Math.round(((now.getTime() - new Date(generatedAt).getTime()) / 3_600_000) * 10) / 10;
		return { status: readiness.status === "fresh" ? "ok" : "stale", generatedAt, ageHours };
	} catch {
		return { status: "error" };
	}
}

type DatabaseCheck = () => Promise<unknown>;
type Cache = { expiresAt: number; database: "ok" | "error" } | undefined;

export type CatalogHealth = {
	status: "current" | "degraded" | "unavailable";
	publication: "not_applicable";
	source?: "snapshot";
	generatedAt?: string;
};

// Snapshot mode has no DB publication receipts, so publication is "not_applicable"
// rather than claimed; the status only proves the bundled snapshot is valid and fresh.
export function createSnapshotCatalogHealthChecker(probe: SnapshotProbe, options: { now?: () => Date } = {}) {
	return (): CatalogHealth => {
		const snapshot = inspectSnapshot(probe, options.now?.() ?? new Date());
		const base = { publication: "not_applicable", source: "snapshot" } as const;
		if (snapshot.status === "error") return { status: "unavailable", ...base };
		return { status: snapshot.status === "ok" ? "current" : "degraded", ...base, generatedAt: snapshot.generatedAt };
	};
}

export function catalogHealthStatusCode(health: CatalogHealth) {
	return health.status === "current" ? 200 : 503;
}

export function createReadinessChecker(
	databaseCheck: DatabaseCheck,
	options: {
		now?: () => number;
		successTtlMs?: number;
		failureTtlMs?: number;
		snapshotProbe?: SnapshotProbe;
		clock?: () => Date;
	} = {},
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

	async function checkDatabaseMode(env: RuntimeEnvironment): Promise<Readiness> {
		const contract = validateRuntimeContract("web", withoutRedis(env));
		const configuration = contract.missing.length || contract.invalid.length ? "error" : "ok";
		const database = configuration === "ok" ? await checkDatabase() : "error";
		return {
			status: configuration === "ok" && database === "ok" ? "ready" : "not_ready",
			components: { configuration, database, redis: "optional" },
		};
	}

	function checkSnapshotMode(env: RuntimeEnvironment, probe: SnapshotProbe): Readiness {
		const contract = validateRuntimeContract("web", withoutRedis(env));
		const configuration = [...contract.missing, ...contract.invalid].some((name) => name !== "DATABASE_URL") ? "error" : "ok";
		const snapshot = inspectSnapshot(probe, options.clock?.() ?? new Date());
		return {
			status: configuration === "ok" && snapshot.status === "ok" ? "ready" : "not_ready",
			components: { configuration, database: "not_required", redis: "optional" },
			snapshot,
		};
	}

	return async (env: RuntimeEnvironment): Promise<Readiness> =>
		options.snapshotProbe && isSnapshotMode(env)
			? checkSnapshotMode(env, options.snapshotProbe)
			: checkDatabaseMode(env);
}

function withoutRedis(env: RuntimeEnvironment): RuntimeEnvironment {
	return { ...env, REDIS_URL: undefined, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined };
}
