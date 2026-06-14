import { getOptionalSingleFlag, parsePositiveIntegerFlag, uniqueSorted } from "./audit-utils";

export type DirectRefreshDiscoveryDenominatorStatus = "PASS" | "FAIL";

export type DirectRefreshDiscoveryDenominatorCandidate = {
	ean: string;
	source: string;
	skuId?: string | null;
	excluded?: boolean;
	exclusionReason?: string;
	lineage?: {
		source: string;
		fetchedAt: string;
		artifactSha256: string;
	};
};

export type DirectRefreshDiscoveryDenominatorNumerator = {
	ean: string;
	source?: string;
	idempotencyKey?: string;
};

export type DirectRefreshDiscoveryDenominatorCliOptions = {
	sources: string[];
	candidates: string;
	numerator: string | null;
	requestBudget: number;
	sourceBudget: number;
	issue: number;
	output: string | null;
};

export type DirectRefreshDiscoveryDenominatorReport = {
	schemaVersion: 1;
	audit: "direct-refresh-discovery-denominator-audit";
	status: DirectRefreshDiscoveryDenominatorStatus;
	generatedAt: string;
	issue: number;
	sources: string[];
	denominatorFormula: string;
	counts: {
		candidateRows: number;
		denominatorCandidates: number;
		numeratorCandidates: number;
		excludedCandidates: number;
	};
	exclusions: Array<{ ean: string; source: string; reason: string }>;
	failClosedReasons: string[];
	budgets: {
		request: { limit: number; used: number; status: DirectRefreshDiscoveryDenominatorStatus };
		source: {
			limit: number;
			usedBySource: Record<string, number>;
			status: DirectRefreshDiscoveryDenominatorStatus;
		};
	};
	posture: {
		readOnly: true;
		noWrites: true;
		writeBoundary: typeof WRITE_BOUNDARY;
		rejectedOperations: string[];
	};
};

const WRITE_BOUNDARY =
	"read-only denominator audit; no DB writes, no discovery apply, no scheduler/all-source execution, no deploy, no migrations, no cache purge" as const;
const READ_ONLY_AUDIT_SUPPORTED_SOURCES = new Set([
	"carrefour",
	"vea",
	"disco",
	"jumbo",
	"mas",
	"dia",
]);
const FORBIDDEN_FLAGS = [
	"--apply",
	"--write",
	"--confirm",
	"--execute",
	"--delete",
	"--scheduler",
	"--all-source",
	"--all-sources",
	"--deploy",
	"--migrations",
	"--purge-cache",
];
const ALLOWED_FLAGS = new Set([
	"--source",
	"--sources",
	"--candidates",
	"--numerator",
	"--request-budget",
	"--source-budget",
	"--issue-number",
	"--output",
]);

export function parseDirectRefreshDiscoveryDenominatorCliOptions(
	argv = process.argv,
): DirectRefreshDiscoveryDenominatorCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh discovery denominator audit rejects ${foundForbidden}`,
		);
	}
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag) {
		throw new Error(
			`unknown direct-refresh discovery denominator audit flag ${unknownFlag}`,
		);
	}
	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) {
		throw new Error(
			`direct-refresh discovery denominator audit requires ${bareAllowedFlag}=...`,
		);
	}

	const sourceValues = [
		...parseList(getOptionalSingleFlag(argv, "--source")),
		...parseList(getOptionalSingleFlag(argv, "--sources")),
	];
	const sources = uniqueSorted(sourceValues.map((source) => source.trim()).filter(Boolean));
	if (sources.length === 0) {
		throw new Error("direct-refresh discovery denominator audit requires --source=... or --sources=...");
	}
	const candidates = getOptionalSingleFlag(argv, "--candidates");
	if (!candidates) {
		throw new Error("direct-refresh discovery denominator audit requires --candidates=...");
	}

	return {
		sources,
		candidates,
		numerator: getOptionalSingleFlag(argv, "--numerator"),
		requestBudget: parsePositiveIntegerFlag(argv, "--request-budget", 20),
		sourceBudget: parsePositiveIntegerFlag(argv, "--source-budget", 10),
		issue: parsePositiveIntegerFlag(argv, "--issue-number", 221),
		output: getOptionalSingleFlag(argv, "--output"),
	};
}

export function buildDirectRefreshDiscoveryDenominatorReport({
	sources,
	candidates,
	numerator = [],
	requestBudget,
	sourceBudget,
	issue = 221,
	now = new Date(),
}: {
	sources: string[];
	candidates: DirectRefreshDiscoveryDenominatorCandidate[];
	numerator?: DirectRefreshDiscoveryDenominatorNumerator[];
	requestBudget: number;
	sourceBudget: number;
	issue?: number;
	now?: Date;
}): DirectRefreshDiscoveryDenominatorReport {
	const normalizedSources = uniqueSorted(sources.map((source) => source.trim()).filter(Boolean));
	const failClosedReasons: string[] = [];
	const requestedSourceSet = new Set(normalizedSources);
	const unsupportedSources = normalizedSources.filter(
		(source) => !READ_ONLY_AUDIT_SUPPORTED_SOURCES.has(source),
	);
	for (const source of unsupportedSources) {
		failClosedReasons.push(`unsupported source: ${source}`);
	}
	if (normalizedSources.length === 0) {
		failClosedReasons.push("at least one source is required");
	}

	const usedBySource = Object.fromEntries(normalizedSources.map((source) => [source, 0]));
	const denominatorKeys = new Set<string>();
	const exclusions: DirectRefreshDiscoveryDenominatorReport["exclusions"] = [];

	for (const candidate of candidates) {
		const source = candidate.source.trim();
		const key = `${source}:${candidate.ean}`;
		if (!requestedSourceSet.has(source)) {
			failClosedReasons.push(`candidate source was not requested: ${source}`);
		}
		usedBySource[source] = (usedBySource[source] ?? 0) + 1;
		const lineageReasons = validateLineage(candidate);
		failClosedReasons.push(...lineageReasons);
		if (candidate.excluded) {
			exclusions.push({
				ean: candidate.ean,
				source,
				reason: candidate.exclusionReason?.trim() || "explicit exclusion without reason",
			});
			if (!candidate.exclusionReason?.trim()) {
				failClosedReasons.push(`excluded candidate ${key} is missing an exclusion reason`);
			}
			continue;
		}
		denominatorKeys.add(key);
	}

	const defaultNumeratorSource = normalizedSources[0] ?? "";
	const numeratorKeys = new Set(
		numerator.map((entry) => `${entry.source?.trim() || defaultNumeratorSource}:${entry.ean}`),
	);
	for (const key of numeratorKeys) {
		if (!denominatorKeys.has(key)) {
			failClosedReasons.push(`numerator candidate is outside denominator: ${key}`);
		}
	}

	const requestUsed = candidates.length;
	if (requestUsed > requestBudget) {
		failClosedReasons.push(`request budget exceeded: used ${requestUsed} > limit ${requestBudget}`);
	}
	for (const [source, used] of Object.entries(usedBySource)) {
		if (used > sourceBudget) {
			failClosedReasons.push(`source budget exceeded for ${source}: used ${used} > limit ${sourceBudget}`);
		}
	}

	const requestStatus = requestUsed <= requestBudget ? "PASS" : "FAIL";
	const sourceStatus = Object.values(usedBySource).every((used) => used <= sourceBudget)
		? "PASS"
		: "FAIL";

	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-denominator-audit",
		status: failClosedReasons.length === 0 ? "PASS" : "FAIL",
		generatedAt: now.toISOString(),
		issue,
		sources: normalizedSources,
		denominatorFormula:
			"distinct source+EAN candidate rows from requested read-only audit-supported sources minus explicit exclusions with lineage; numerator must be a subset of that denominator",
		counts: {
			candidateRows: candidates.length,
			denominatorCandidates: denominatorKeys.size,
			numeratorCandidates: numeratorKeys.size,
			excludedCandidates: exclusions.length,
		},
		exclusions: exclusions.sort((left, right) => `${left.source}:${left.ean}`.localeCompare(`${right.source}:${right.ean}`)),
		failClosedReasons: uniqueSorted(failClosedReasons),
		budgets: {
			request: { limit: requestBudget, used: requestUsed, status: requestStatus },
			source: { limit: sourceBudget, usedBySource, status: sourceStatus },
		},
		posture: {
			readOnly: true,
			noWrites: true,
			writeBoundary: WRITE_BOUNDARY,
			rejectedOperations: [...FORBIDDEN_FLAGS],
		},
	};
}

export function parseDirectRefreshDiscoveryDenominatorCandidatesJson(
	raw: string,
): DirectRefreshDiscoveryDenominatorCandidate[] {
	const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
	return Array.isArray(parsed)
		? parsed as DirectRefreshDiscoveryDenominatorCandidate[]
		: (parsed as { candidates?: DirectRefreshDiscoveryDenominatorCandidate[] }).candidates ?? [];
}

export function parseDirectRefreshDiscoveryDenominatorNumeratorJson(
	raw: string,
): DirectRefreshDiscoveryDenominatorNumerator[] {
	const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
	return Array.isArray(parsed)
		? parsed as DirectRefreshDiscoveryDenominatorNumerator[]
		: (parsed as { numerator?: DirectRefreshDiscoveryDenominatorNumerator[] }).numerator ?? [];
}

function parseList(value: string | null) {
	return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function validateLineage(candidate: DirectRefreshDiscoveryDenominatorCandidate) {
	const key = `${candidate.source}:${candidate.ean}`;
	const reasons: string[] = [];
	if (!candidate.ean?.trim()) reasons.push("candidate is missing ean");
	if (!candidate.source?.trim()) reasons.push(`candidate ${candidate.ean} is missing source`);
	if (!candidate.lineage) {
		reasons.push(`candidate ${key} is missing lineage`);
		return reasons;
	}
	if (candidate.lineage.source !== candidate.source) {
		reasons.push(`candidate ${key} lineage source mismatch`);
	}
	if (!candidate.lineage.fetchedAt) {
		reasons.push(`candidate ${key} lineage is missing fetchedAt`);
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(candidate.lineage.artifactSha256 ?? "")) {
		reasons.push(`candidate ${key} lineage is missing artifactSha256`);
	}
	return reasons;
}
