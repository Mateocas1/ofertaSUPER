export type IngestionMode = "off" | "shadow" | "active";

export type IngestionOptions = {
	mode: IngestionMode;
	dryRun: boolean;
	queryLimit: number;
	reconcileBatchSize: number;
	sourceFilter: string[] | null;
	queryTerms: string[] | null;
	expectedEans: string[] | null;
	count: number;
	activeWriteConfirmed: boolean;
	activeAllSourcesApproved: boolean;
};

export type IngestionSafetyResult =
	| { ok: true }
	| { ok: false; reason: string };

type Env = Record<string, string | undefined>;

type SourceSummaryLike = {
	slug: string;
	status: string;
};

const DEFAULT_QUERY_LIMIT = 24;
const DEFAULT_RECONCILE_BATCH_SIZE = 500;
const DEFAULT_FETCH_COUNT = 50;

function hasFlag(argv: string[], flagName: string) {
	return argv.includes(flagName);
}

function readFlagValue(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function readPositiveNumberFlag(
	argv: string[],
	flagName: string,
	fallback: number,
) {
	const raw = readFlagValue(argv, flagName);

	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readListFlag(argv: string[], flagName: string) {
	const raw = readFlagValue(argv, flagName);

	if (raw === undefined) {
		return null;
	}

	return raw
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function readBooleanEnv(env: Env, name: string) {
	return env[name]?.trim().toLowerCase() === "true";
}

function getDuplicateValues(values: string[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		} else {
			seen.add(value);
		}
	}

	return Array.from(duplicates).sort();
}

export function compareExpectedEans(expected: string[], actual: string[]) {
	const expectedSet = new Set(expected);
	const actualSet = new Set(actual);

	const missing = Array.from(expectedSet)
		.filter((ean) => !actualSet.has(ean))
		.sort();
	const extra = Array.from(actualSet)
		.filter((ean) => !expectedSet.has(ean))
		.sort();
	const duplicateExpected = getDuplicateValues(expected);
	const duplicateActual = getDuplicateValues(actual);

	return {
		ok:
			missing.length === 0 &&
			extra.length === 0 &&
			duplicateExpected.length === 0 &&
			duplicateActual.length === 0,
		missing,
		extra,
		duplicateExpected,
		duplicateActual,
	};
}

export function resolveMode(env: Env = process.env): IngestionMode {
	const rawMode = (env.INGESTION_V2 ?? "shadow").toLowerCase();

	if (rawMode === "off" || rawMode === "shadow" || rawMode === "active") {
		return rawMode;
	}

	return "shadow";
}

export function parseIngestionOptions(
	argv: string[] = process.argv,
	env: Env = process.env,
): IngestionOptions {
	return {
		mode: resolveMode(env),
		dryRun: hasFlag(argv, "--dry-run"),
		queryLimit: readPositiveNumberFlag(argv, "--limit", DEFAULT_QUERY_LIMIT),
		reconcileBatchSize: readPositiveNumberFlag(
			argv,
			"--batch-size",
			DEFAULT_RECONCILE_BATCH_SIZE,
		),
		sourceFilter: readListFlag(argv, "--source"),
		queryTerms: readListFlag(argv, "--terms"),
		expectedEans: readListFlag(argv, "--expected-eans"),
		count: readPositiveNumberFlag(argv, "--count", DEFAULT_FETCH_COUNT),
		activeWriteConfirmed:
			hasFlag(argv, "--confirm-write") ||
			readBooleanEnv(env, "INGESTION_ACTIVE_WRITE_APPROVED"),
		activeAllSourcesApproved:
			hasFlag(argv, "--all-sources") ||
			readBooleanEnv(env, "INGESTION_ACTIVE_ALL_SOURCES_APPROVED"),
	};
}

export function validateIngestionSafety(
	options: IngestionOptions,
): IngestionSafetyResult {
	if (options.mode !== "active" || options.dryRun) {
		return { ok: true };
	}

	if (!options.activeWriteConfirmed) {
		return {
			ok: false,
			reason:
				"active ingestion writes require --confirm-write or INGESTION_ACTIVE_WRITE_APPROVED=true",
		};
	}

	if (options.activeAllSourcesApproved) {
		return {
			ok: false,
			reason: "active all-source writes are disabled for this rollout",
		};
	}

	if (options.sourceFilter?.length !== 1) {
		return {
			ok: false,
			reason: "active ingestion writes require exactly one --source=<slug>",
		};
	}

	if (options.queryTerms?.length !== 1) {
		return {
			ok: false,
			reason: "active ingestion writes require exactly one --terms=<query>",
		};
	}

	if (options.queryTerms[0] !== "leche") {
		return {
			ok: false,
			reason: "active Phase 4 writes require --terms=leche",
		};
	}

	if (options.count !== 5) {
		return {
			ok: false,
			reason: "active ingestion writes require --count=5 for Phase 4",
		};
	}

	if (options.expectedEans?.length !== 5) {
		return {
			ok: false,
			reason: "active ingestion writes require exactly five --expected-eans",
		};
	}

	if (
		compareExpectedEans(options.expectedEans, options.expectedEans)
			.duplicateExpected.length > 0
	) {
		return {
			ok: false,
			reason: "active ingestion writes require five distinct --expected-eans",
		};
	}

	return { ok: true };
}

export function assertSafeIngestionOptions(options: IngestionOptions) {
	const safety = validateIngestionSafety(options);

	if (!safety.ok) {
		throw new Error(safety.reason);
	}
}

export function shouldFailForRequestedSourceHealth(
	sourceFilter: string[] | null,
	summaries: SourceSummaryLike[],
) {
	if (!sourceFilter?.length) {
		return false;
	}

	const requestedSources = new Set(sourceFilter);
	return summaries.some(
		(summary) =>
			requestedSources.has(summary.slug) && summary.status === "FAILED",
	);
}
