export const RUNTIME_ROLES = ["web", "job", "migration"] as const;

export type RuntimeRole = (typeof RUNTIME_ROLES)[number];
export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type RuntimeContractResult = {
	role: RuntimeRole;
	missing: string[];
	invalid: string[];
};

const REQUIRED_BY_ROLE: Record<RuntimeRole, readonly string[]> = {
	web: ["DATABASE_URL"],
	job: ["DATABASE_URL", "VTEX_SHA256_HASH"],
	migration: ["DIRECT_URL"],
};

const OPTIONAL_PAIRS = [
	["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
] as const;

function isPresent(value: string | undefined) {
	return Boolean(value?.trim());
}

function isPostgresUrl(value: string) {
	try {
		const protocol = new URL(value).protocol;
		return protocol === "postgresql:" || protocol === "postgres:";
	} catch {
		return false;
	}
}

export function validateRuntimeContract(
	role: RuntimeRole,
	env: RuntimeEnvironment,
): RuntimeContractResult {
	const required = [...REQUIRED_BY_ROLE[role]];

	if (role === "web" && env.ADMIN_ENABLED === "true") {
		required.push("CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
	}

	for (const [first, second] of OPTIONAL_PAIRS) {
		if (isPresent(env[first]) !== isPresent(env[second])) {
			required.push(isPresent(env[first]) ? second : first);
		}
	}

	if (isPresent(env.REDIS_URL)) {
		for (const [first, second] of OPTIONAL_PAIRS) {
			if (isPresent(env[first]) || isPresent(env[second])) required.push("configure_only_one_redis_provider");
		}
	}

	const missing = required.filter((name) => !isPresent(env[name])).sort();
	const invalid = (role === "migration" ? ["DIRECT_URL"] : ["DATABASE_URL"])
		.filter((name) => isPresent(env[name]) && !isPostgresUrl(env[name] as string))
		.sort();

	return { role, missing, invalid };
}

export function formatRuntimeContractErrors(result: RuntimeContractResult) {
	const details = [
		result.missing.length ? `missing: ${result.missing.join(", ")}` : null,
		result.invalid.length ? `invalid PostgreSQL URL: ${result.invalid.join(", ")}` : null,
	].filter(Boolean);

	return `Runtime contract failed for role ${result.role} (${details.join("; ")})`;
}
