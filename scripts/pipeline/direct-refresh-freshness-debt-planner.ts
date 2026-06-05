import { createHash } from "node:crypto";

import {
	DIRECT_REFRESH_ALLOWED_BATCH_COUNTS,
	assertDirectRefreshAllowedBatchCount,
	type DirectRefreshAllowedBatchCount,
} from "./direct-refresh-batch-size";
import {
	AUDIT_ONLY_DIRECT_REFRESH_SOURCES,
	WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
	type DirectRefreshHealthSourceSlug,
	type DirectRefreshSourceHealthCapacityReport,
	type DirectRefreshSourceHealthReport,
	type DirectRefreshSourceHealthSourceReport,
} from "./direct-refresh-source-health";
import { uniqueSorted } from "./audit-utils";

export type DirectRefreshFreshnessDebtPlannerStatus = "PASS" | "WARN" | "FAIL";
export type DirectRefreshFreshnessDebtPlannerPosture =
	| "normal"
	| "reduced-manual-review"
	| "blocked"
	| "no-debt";
export type DirectRefreshFreshnessDebtPlannerRunEligibility =
	| "planning-normal"
	| "planning-reduced"
	| "manual-review"
	| "blocked"
	| "audit-only-no-writer";
export type DirectRefreshFreshnessDebtPlannerSafetyStatus = "PASS" | "BLOCKED";
export type DirectRefreshFreshnessDebtPlannerFreshnessStatus =
	| "PASS"
	| "DEBT"
	| "EMPTY_DENOMINATOR";
export type DirectRefreshFreshnessDebtPlannerCapacityStatus =
	| "PASS"
	| "WARN"
	| "FAIL"
	| "UNKNOWN";

export type DirectRefreshFreshnessDebtPlannerIssue = {
	url: string;
	number: number;
	title: string;
	typeLabel: string;
	approvalLabel: string;
};

export type DirectRefreshFreshnessDebtPlannerInputArtifact = {
	kind: "source-health" | "capacity-report";
	path: string | null;
	present: boolean;
	audit: string | null;
	status: string | null;
	generatedAt: string | null;
	hash: string | null;
	ttlPolicy: string;
};

export type DirectRefreshFreshnessDebtPlannerSourceInput = {
	slug: DirectRefreshHealthSourceSlug;
	directRefreshSupport: "writer-supported" | "audit-only-no-writer";
	freshness: {
		publicRankableRows: number;
		freshRows: number;
		staleRows: number;
		unknownRows: number;
		freshnessPercent: number;
	};
	capacity?: {
		status?: "PASS" | "WARN" | "FAIL";
		classification?: string | null;
		viableRows?: number | null;
		blockedRows?: number | null;
		recommendedBatchSize?: number | null;
		recommendedCandidateScanSize?: number | null;
		blockers?: Array<{ reason: string; count: number }>;
	} | null;
	safetyReasons?: string[];
};

export type DirectRefreshFreshnessDebtPlannerOptions = {
	now?: Date;
	issue: DirectRefreshFreshnessDebtPlannerIssue;
	attemptId: string;
	outputDir: string;
	sources?: string[];
	batchCounts?: number[];
	maxRunsPer24h?: number | null;
	maxRunsPer12h?: number | null;
	sourceHealthReport?: DirectRefreshSourceHealthReport | null;
	sourceHealthPath?: string | null;
	sourceHealthRaw?: string | null;
	capacityReport?: DirectRefreshSourceHealthCapacityReport | null;
	capacityReportPath?: string | null;
	capacityReportRaw?: string | null;
	directSources?: DirectRefreshFreshnessDebtPlannerSourceInput[];
};

export type DirectRefreshFreshnessDebtPlannerReport = {
	schemaVersion: 1;
	audit: "direct-refresh-freshness-debt-planner";
	status: DirectRefreshFreshnessDebtPlannerStatus;
	basis: "production-and-supplied-artifacts";
	generatedAt: string;
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	blockedModes: string[];
	lineage: {
		issue: DirectRefreshFreshnessDebtPlannerIssue;
		attemptId: string;
		outputDir: string;
		parentArtifacts: DirectRefreshFreshnessDebtPlannerInputArtifact[];
	};
	filters: {
		sources: string[];
		batchCounts: DirectRefreshAllowedBatchCount[];
		maxRunsPer24h: number | null;
		maxRunsPer12h: number | null;
	};
	targets: Array<{
		name: "recovery" | "final";
		freshnessTargetPercent: 90 | 95;
		windowHours: 24 | 12;
	}>;
	summary: {
		writerSupportedSourceCount: number;
		auditOnlyNoWriterSourceCount: number;
		totalPublicRankableRows: number;
		totalFreshRows: number;
		totalRowsNeededByTarget: Record<"recovery" | "final", number>;
		minBatchesByTargetAndCount: Record<
			"recovery" | "final",
			Record<string, number>
		>;
		windowCapacity: {
			sourceScoped: true;
			maxRunsPerSourcePer24h: number | null;
			maxRunsPerSourcePer12h: number | null;
			maxSourceScopedBatches: {
				recoveryWindow24h: number | null;
				finalWindow12h: number | null;
			};
			canCoverTargetWithinWindowByCount: Record<
				"recovery" | "final",
				Record<string, boolean | null>
			>;
		};
		planningPosture: DirectRefreshFreshnessDebtPlannerPosture;
		failClosedReasons: string[];
	};
	sources: DirectRefreshFreshnessDebtPlannerSourceReport[];
	issueSummary: string;
	nextManualAction: string;
};

export type DirectRefreshFreshnessDebtPlannerSourceReport = {
	slug: string;
	directRefreshSupport: "writer-supported" | "audit-only-no-writer";
	safetyStatus: DirectRefreshFreshnessDebtPlannerSafetyStatus;
	freshnessStatus: DirectRefreshFreshnessDebtPlannerFreshnessStatus;
	capacityStatus: DirectRefreshFreshnessDebtPlannerCapacityStatus;
	runEligibility: DirectRefreshFreshnessDebtPlannerRunEligibility;
	freshness: {
		publicRankableRows: number;
		freshRows: number;
		staleRows: number;
		unknownRows: number;
		freshnessPercent: number;
	};
	debtTargets: Array<{
		name: "recovery" | "final";
		freshnessTargetPercent: 90 | 95;
		windowHours: 24 | 12;
		rowsNeeded: number;
		minBatchesByAllowedCount: Record<string, number>;
	}>;
	capacity: {
		status: DirectRefreshFreshnessDebtPlannerCapacityStatus;
		classification: string | null;
		viableRows: number | null;
		blockedRows: number | null;
		recommendedBatchSize: number | null;
		recommendedCandidateScanSize: number | null;
		blockers: Array<{ reason: string; count: number }>;
	};
	reasons: string[];
	recommendation: string;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh freshness debt planner; no VTEX scans, no manifest/prewrite generation, no active writer invocation, no production writes, no scheduler/cron/workflow execution, no all-source or repeated-batch execution, no DIA writer support, no notification delivery, no deploy/secrets/cache/remote-config changes" as const;

const BLOCKED_MODES = [
	"vtex-scans",
	"manifest-generation",
	"prewrite-generation",
	"active-writer-invocation",
	"production-writes",
	"scheduler-execution",
	"cron-workflow-automation",
	"all-source-operation",
	"repeated-batches",
	"automatic-retry",
	"dia-writer-support",
	"notification-delivery",
	"remote-config-secrets-deploy-cache",
] as const;

const TARGETS = [
	{ name: "recovery", freshnessTargetPercent: 90, windowHours: 24 },
	{ name: "final", freshnessTargetPercent: 95, windowHours: 12 },
] as const;

const DEFAULT_ARTIFACT_TTLS = {
	"source-health":
		"planning evidence only; rerun before manifest/prewrite when used as a safety gate",
	"capacity-report":
		"planning evidence only; must be reviewed for generation time and confidence",
} as const;

export function buildDirectRefreshFreshnessDebtPlannerReport(
	options: DirectRefreshFreshnessDebtPlannerOptions,
): DirectRefreshFreshnessDebtPlannerReport {
	const generatedAt = (options.now ?? new Date()).toISOString();
	const normalizedIssue = normalizeIssue(options.issue);
	const batchCounts = normalizeBatchCounts(options.batchCounts);
	const requestedSources = normalizeRequestedSources(options.sources);
	const failClosedReasons = validateTopLevelOptions({
		...options,
		issue: normalizedIssue,
		sources: requestedSources,
		batchCounts,
	});
	const sourceInputs = selectSourceInputs({
		requestedSources,
		directSources: options.directSources,
		sourceHealthReport: options.sourceHealthReport,
		capacityReport: options.capacityReport,
	});
	const sourceReports = sourceInputs.map((source) =>
		buildSourceReport({ source, batchCounts }),
	);
	const writerReports = sourceReports.filter(
		(source) => source.directRefreshSupport === "writer-supported",
	);
	const auditOnlyReports = sourceReports.filter(
		(source) => source.directRefreshSupport === "audit-only-no-writer",
	);
	const sourceFailReasons = writerReports
		.filter((source) => source.safetyStatus === "BLOCKED")
		.flatMap((source) =>
			source.reasons.map((reason) => `${source.slug}: ${reason}`),
		);
	const allFailReasons = uniqueSorted([
		...failClosedReasons,
		...sourceFailReasons,
	]);
	const status = reportStatus({
		sourceReports: writerReports,
		failClosedReasons: allFailReasons,
	});
	const planningPosture = planningPostureFor({
		sourceReports: writerReports,
		failClosedReasons: allFailReasons,
	});
	const parentArtifacts = buildParentArtifacts(options);
	const totalRowsNeededByTarget = totalRowsNeeded(writerReports);
	const minBatchesByTargetAndCount = totalBatchesByTarget(
		writerReports,
		batchCounts,
	);
	const windowCapacity = buildWindowCapacity({
		writerReports,
		batchCounts,
		maxRunsPer24h: options.maxRunsPer24h ?? null,
		maxRunsPer12h: options.maxRunsPer12h ?? null,
	});

	return {
		schemaVersion: 1,
		audit: "direct-refresh-freshness-debt-planner",
		status,
		basis: "production-and-supplied-artifacts",
		generatedAt,
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		blockedModes: [...BLOCKED_MODES],
		lineage: {
			issue: normalizedIssue,
			attemptId: options.attemptId.trim(),
			outputDir: options.outputDir.trim(),
			parentArtifacts,
		},
		filters: {
			sources: requestedSources,
			batchCounts,
			maxRunsPer24h: options.maxRunsPer24h ?? null,
			maxRunsPer12h: options.maxRunsPer12h ?? null,
		},
		targets: TARGETS.map((target) => ({ ...target })),
		summary: {
			writerSupportedSourceCount: writerReports.length,
			auditOnlyNoWriterSourceCount: auditOnlyReports.length,
			totalPublicRankableRows: sum(
				writerReports,
				(source) => source.freshness.publicRankableRows,
			),
			totalFreshRows: sum(
				writerReports,
				(source) => source.freshness.freshRows,
			),
			totalRowsNeededByTarget,
			minBatchesByTargetAndCount,
			windowCapacity,
			planningPosture,
			failClosedReasons: allFailReasons,
		},
		sources: sourceReports,
		issueSummary: issueSummary({
			status,
			planningPosture,
			writerReports,
			totalRowsNeededByTarget,
			minBatchesByTargetAndCount,
		}),
		nextManualAction: nextManualAction(status, planningPosture),
	};
}

function normalizeIssue(issue: DirectRefreshFreshnessDebtPlannerIssue) {
	return {
		url: issue.url.trim(),
		number: issue.number,
		title: issue.title.trim(),
		typeLabel: issue.typeLabel.trim(),
		approvalLabel: issue.approvalLabel.trim(),
	};
}

function normalizeBatchCounts(
	counts: number[] | undefined,
): DirectRefreshAllowedBatchCount[] {
	const input = counts?.length
		? counts
		: [...DIRECT_REFRESH_ALLOWED_BATCH_COUNTS];
	return uniqueSorted(input.map(String))
		.map((value) => Number(value))
		.map((count) =>
			assertDirectRefreshAllowedBatchCount(
				count,
				"freshness debt planner batch count",
			),
		);
}

function normalizeRequestedSources(sources: string[] | undefined) {
	const requested = sources?.length
		? sources
		: [...WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES];
	return uniqueSorted(requested.map((source) => source.trim()).filter(Boolean));
}

function validateTopLevelOptions(
	options: DirectRefreshFreshnessDebtPlannerOptions & {
		sources: string[];
		batchCounts: DirectRefreshAllowedBatchCount[];
	},
) {
	const reasons: string[] = [];
	if (!options.attemptId.trim()) reasons.push("attempt ID is required");
	if (!options.outputDir.trim()) reasons.push("output directory is required");
	if (!Number.isInteger(options.issue.number) || options.issue.number <= 0) {
		reasons.push("issue number must be a positive integer");
	}
	if (
		!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(
			options.issue.url,
		)
	) {
		reasons.push("issue URL must be a GitHub issue URL");
	}
	if (!options.issue.title.trim()) reasons.push("issue title is required");
	if (!/^type:[^,\s]+$/.test(options.issue.typeLabel.trim())) {
		reasons.push("exactly one type:* issue label is required");
	}
	if (options.issue.approvalLabel.trim() !== "status:approved") {
		reasons.push("issue approval label must be status:approved");
	}
	if (options.sources.length === 0)
		reasons.push("at least one source is required");
	const invalidSources = options.sources.filter(
		(source) =>
			!WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.includes(source as never) &&
			!AUDIT_ONLY_DIRECT_REFRESH_SOURCES.includes(source as never),
	);
	for (const source of invalidSources)
		reasons.push(`source must be writer-supported; rejected ${source}`);
	const auditOnlySources = options.sources.filter((source) =>
		AUDIT_ONLY_DIRECT_REFRESH_SOURCES.includes(source as never),
	);
	for (const source of auditOnlySources) {
		reasons.push(
			`${source} is audit-only/no-writer and is excluded from freshness debt planning`,
		);
	}
	if (
		(options.maxRunsPer24h ?? 1) <= 0 ||
		!Number.isInteger(options.maxRunsPer24h ?? 1)
	) {
		reasons.push("maxRunsPer24h must be a positive integer when supplied");
	}
	if (
		(options.maxRunsPer12h ?? 1) <= 0 ||
		!Number.isInteger(options.maxRunsPer12h ?? 1)
	) {
		reasons.push("maxRunsPer12h must be a positive integer when supplied");
	}
	return reasons;
}

function selectSourceInputs({
	requestedSources,
	directSources,
	sourceHealthReport,
	capacityReport,
}: {
	requestedSources: string[];
	directSources?: DirectRefreshFreshnessDebtPlannerSourceInput[];
	sourceHealthReport?: DirectRefreshSourceHealthReport | null;
	capacityReport?: DirectRefreshSourceHealthCapacityReport | null;
}) {
	const directBySlug = new Map(
		(directSources ?? []).map((source) => [source.slug, source]),
	);
	const healthBySlug = new Map(
		(sourceHealthReport?.sources ?? []).map((source) => [source.slug, source]),
	);
	const capacityBySlug = new Map(
		(capacityReport?.sources ?? []).map((source) => [source.slug, source]),
	);
	return requestedSources.map((slug) => {
		const direct = directBySlug.get(slug as DirectRefreshHealthSourceSlug);
		if (direct) return direct;
		const health = healthBySlug.get(slug as DirectRefreshHealthSourceSlug);
		const capacity = capacityBySlug.get(slug) ?? null;
		if (health) return sourceInputFromHealth(health, capacity);
		return missingSourceInput(slug as DirectRefreshHealthSourceSlug, capacity);
	});
}

function sourceInputFromHealth(
	health: DirectRefreshSourceHealthSourceReport,
	capacityOverride:
		| DirectRefreshSourceHealthCapacityReport["sources"][number]
		| null,
): DirectRefreshFreshnessDebtPlannerSourceInput {
	return {
		slug: health.slug,
		directRefreshSupport: health.directRefreshSupport,
		freshness: {
			publicRankableRows: health.freshness.publicRankableRows,
			freshRows: health.freshness.freshRows,
			staleRows: health.freshness.staleRows,
			unknownRows: health.freshness.unknownRows,
			freshnessPercent: health.freshness.freshnessPercent,
		},
		capacity: capacityOverride
			? capacityInputFromCapacityReport(capacityOverride)
			: health.capacity.source === "not-provided"
				? null
				: {
						status: health.capacity.status,
						classification: health.capacity.classification,
						viableRows: health.capacity.viableRows,
						blockedRows: health.capacity.blockedRows,
						recommendedBatchSize: health.capacity.recommendedBatchSize,
						recommendedCandidateScanSize:
							health.capacity.recommendedCandidateScanSize,
						blockers: health.capacity.blockers,
					},
		safetyReasons: safetyReasonsFromHealth(health),
	};
}

function capacityInputFromCapacityReport(
	capacity: DirectRefreshSourceHealthCapacityReport["sources"][number],
): NonNullable<DirectRefreshFreshnessDebtPlannerSourceInput["capacity"]> {
	return {
		status: capacity.status,
		classification: capacity.classification ?? null,
		viableRows: capacity.candidateScan?.viableRows ?? null,
		blockedRows: capacity.candidateScan?.blockedRows ?? null,
		recommendedBatchSize: capacity.capacity?.recommendedBatchSize ?? null,
		recommendedCandidateScanSize:
			capacity.capacity?.recommendedCandidateScanSize ?? null,
		blockers: capacity.blockers ?? [],
	};
}

function safetyReasonsFromHealth(
	health: DirectRefreshSourceHealthSourceReport,
) {
	const reasons: string[] = [];
	if (!health.sourceRecord.exists) reasons.push("source record is missing");
	if (health.sourceRecord.exists && health.sourceRecord.isActive !== true)
		reasons.push("source is inactive");
	if (health.sourceRecord.exists && health.sourceRecord.isVtex !== true)
		reasons.push("source is not VTEX");
	if (!health.sourceRecord.baseUrlValid)
		reasons.push("source base URL is invalid");
	if (
		health.sourceRecord.baseUrlValid &&
		!health.sourceRecord.expectedHostMatch
	) {
		reasons.push("source base URL host does not match expected host");
	}
	return reasons;
}

function missingSourceInput(
	slug: DirectRefreshHealthSourceSlug,
	capacity: DirectRefreshSourceHealthCapacityReport["sources"][number] | null,
): DirectRefreshFreshnessDebtPlannerSourceInput {
	return {
		slug,
		directRefreshSupport: AUDIT_ONLY_DIRECT_REFRESH_SOURCES.includes(
			slug as never,
		)
			? "audit-only-no-writer"
			: "writer-supported",
		freshness: {
			publicRankableRows: 0,
			freshRows: 0,
			staleRows: 0,
			unknownRows: 0,
			freshnessPercent: 0,
		},
		capacity: capacity ? capacityInputFromCapacityReport(capacity) : null,
		safetyReasons: ["source evidence is missing"],
	};
}

function buildSourceReport({
	source,
	batchCounts,
}: {
	source: DirectRefreshFreshnessDebtPlannerSourceInput;
	batchCounts: DirectRefreshAllowedBatchCount[];
}): DirectRefreshFreshnessDebtPlannerSourceReport {
	const capacityStatus = source.capacity?.status ?? "UNKNOWN";
	const freshnessStatus = freshnessStatusFor(source);
	const safetyReasons = [...(source.safetyReasons ?? [])];
	if (source.directRefreshSupport === "audit-only-no-writer")
		safetyReasons.push("source is audit-only/no-writer");
	if (capacityStatus === "FAIL") safetyReasons.push("capacity status is FAIL");
	if (freshnessStatus === "EMPTY_DENOMINATOR")
		safetyReasons.push("source has no public-rankable rows");
	const safetyStatus: DirectRefreshFreshnessDebtPlannerSafetyStatus =
		safetyReasons.length > 0 ? "BLOCKED" : "PASS";
	const debtTargets = TARGETS.map((target) => {
		const rowsNeeded = rowsNeededForTarget(
			source,
			target.freshnessTargetPercent,
		);
		return {
			...target,
			rowsNeeded,
			minBatchesByAllowedCount: Object.fromEntries(
				batchCounts.map((count) => [
					String(count),
					Math.ceil(rowsNeeded / count),
				]),
			),
		};
	});
	const runEligibility = runEligibilityFor({
		source,
		safetyStatus,
		freshnessStatus,
		capacityStatus,
	});
	const reasons = reasonsFor({
		source,
		safetyReasons,
		freshnessStatus,
		capacityStatus,
		runEligibility,
	});
	return {
		slug: source.slug,
		directRefreshSupport: source.directRefreshSupport,
		safetyStatus,
		freshnessStatus,
		capacityStatus,
		runEligibility,
		freshness: { ...source.freshness },
		debtTargets,
		capacity: {
			status: capacityStatus,
			classification: source.capacity?.classification ?? null,
			viableRows: source.capacity?.viableRows ?? null,
			blockedRows: source.capacity?.blockedRows ?? null,
			recommendedBatchSize: source.capacity?.recommendedBatchSize ?? null,
			recommendedCandidateScanSize:
				source.capacity?.recommendedCandidateScanSize ?? null,
			blockers: source.capacity?.blockers ?? [],
		},
		reasons,
		recommendation: recommendationFor({
			source,
			runEligibility,
			freshnessStatus,
			capacityStatus,
		}),
	};
}

function freshnessStatusFor(
	source: DirectRefreshFreshnessDebtPlannerSourceInput,
): DirectRefreshFreshnessDebtPlannerFreshnessStatus {
	if (source.freshness.publicRankableRows <= 0) return "EMPTY_DENOMINATOR";
	return rowsNeededForTarget(source, 90) > 0 ? "DEBT" : "PASS";
}

function rowsNeededForTarget(
	source: DirectRefreshFreshnessDebtPlannerSourceInput,
	targetPercent: 90 | 95,
) {
	const required = Math.ceil(
		(source.freshness.publicRankableRows * targetPercent) / 100,
	);
	return Math.max(0, required - source.freshness.freshRows);
}

function runEligibilityFor({
	source,
	safetyStatus,
	freshnessStatus,
	capacityStatus,
}: {
	source: DirectRefreshFreshnessDebtPlannerSourceInput;
	safetyStatus: DirectRefreshFreshnessDebtPlannerSafetyStatus;
	freshnessStatus: DirectRefreshFreshnessDebtPlannerFreshnessStatus;
	capacityStatus: DirectRefreshFreshnessDebtPlannerCapacityStatus;
}): DirectRefreshFreshnessDebtPlannerRunEligibility {
	if (source.directRefreshSupport === "audit-only-no-writer")
		return "audit-only-no-writer";
	if (safetyStatus === "BLOCKED") return "blocked";
	if (capacityStatus === "WARN") return "planning-reduced";
	if (capacityStatus === "UNKNOWN") return "manual-review";
	if (freshnessStatus === "DEBT" || freshnessStatus === "PASS")
		return "planning-normal";
	return "blocked";
}

function reasonsFor({
	source,
	safetyReasons,
	freshnessStatus,
	capacityStatus,
	runEligibility,
}: {
	source: DirectRefreshFreshnessDebtPlannerSourceInput;
	safetyReasons: string[];
	freshnessStatus: DirectRefreshFreshnessDebtPlannerFreshnessStatus;
	capacityStatus: DirectRefreshFreshnessDebtPlannerCapacityStatus;
	runEligibility: DirectRefreshFreshnessDebtPlannerRunEligibility;
}) {
	const reasons = [...safetyReasons];
	if (freshnessStatus === "DEBT")
		reasons.push("freshness debt below recovery target");
	if (freshnessStatus === "PASS")
		reasons.push("freshness already meets recovery target");
	if (capacityStatus === "WARN")
		reasons.push("capacity status is WARN; use reduced/manual-review planning");
	if (capacityStatus === "UNKNOWN")
		reasons.push("capacity status is UNKNOWN; manual review required");
	if ((source.capacity?.blockedRows ?? 0) > 0)
		reasons.push(`capacity has ${source.capacity?.blockedRows} blocked rows`);
	if (
		source.slug === "mas" &&
		(source.capacity?.recommendedCandidateScanSize ?? 0) >= 100
	) {
		reasons.push("MAS rapid-confirmation protocol risk for large scans");
	}
	if (runEligibility === "audit-only-no-writer")
		reasons.push("DIA is audit-only/no-writer");
	return uniqueSorted(reasons);
}

function recommendationFor({
	source,
	runEligibility,
	freshnessStatus,
	capacityStatus,
}: {
	source: DirectRefreshFreshnessDebtPlannerSourceInput;
	runEligibility: DirectRefreshFreshnessDebtPlannerRunEligibility;
	freshnessStatus: DirectRefreshFreshnessDebtPlannerFreshnessStatus;
	capacityStatus: DirectRefreshFreshnessDebtPlannerCapacityStatus;
}) {
	if (runEligibility === "audit-only-no-writer")
		return "Keep audit-only; do not include as writer-supported freshness recovery.";
	if (runEligibility === "blocked")
		return "Stop at diagnosis; fix hard blockers before recovery planning.";
	if (capacityStatus === "WARN")
		return "Plan reduced/manual-review recovery only; do not authorize writes from this planner.";
	if (capacityStatus === "UNKNOWN")
		return "Collect or review capacity evidence before manifest/prewrite.";
	if (freshnessStatus === "PASS")
		return "No recovery debt for the 90%/24h target; continue monitoring.";
	if (source.slug === "mas")
		return "Plan recovery with MAS rapid-confirmation protocol risk surfaced before any future write gate.";
	return "Eligible for evidence-only recovery planning; run normal write gates separately before any operation.";
}

function reportStatus({
	sourceReports,
	failClosedReasons,
}: {
	sourceReports: DirectRefreshFreshnessDebtPlannerSourceReport[];
	failClosedReasons: string[];
}): DirectRefreshFreshnessDebtPlannerStatus {
	if (failClosedReasons.length > 0) return "FAIL";
	if (
		sourceReports.some(
			(source) =>
				source.runEligibility !== "planning-normal" ||
				source.freshnessStatus === "DEBT",
		)
	)
		return "WARN";
	return "PASS";
}

function planningPostureFor({
	sourceReports,
	failClosedReasons,
}: {
	sourceReports: DirectRefreshFreshnessDebtPlannerSourceReport[];
	failClosedReasons: string[];
}): DirectRefreshFreshnessDebtPlannerPosture {
	if (
		failClosedReasons.length > 0 ||
		sourceReports.some((source) => source.runEligibility === "blocked")
	)
		return "blocked";
	if (sourceReports.every((source) => source.freshnessStatus === "PASS"))
		return "no-debt";
	if (
		sourceReports.some(
			(source) =>
				source.runEligibility === "planning-reduced" ||
				source.runEligibility === "manual-review",
		)
	) {
		return "reduced-manual-review";
	}
	return "normal";
}

function totalRowsNeeded(
	sources: DirectRefreshFreshnessDebtPlannerSourceReport[],
) {
	return {
		recovery: sum(
			sources,
			(source) =>
				source.debtTargets.find((target) => target.name === "recovery")
					?.rowsNeeded ?? 0,
		),
		final: sum(
			sources,
			(source) =>
				source.debtTargets.find((target) => target.name === "final")
					?.rowsNeeded ?? 0,
		),
	};
}

function totalBatchesByTarget(
	sources: DirectRefreshFreshnessDebtPlannerSourceReport[],
	batchCounts: DirectRefreshAllowedBatchCount[],
) {
	return Object.fromEntries(
		TARGETS.map((target) => [
			target.name,
			Object.fromEntries(
				batchCounts.map((count) => [
					String(count),
					sum(
						sources,
						(source) =>
							source.debtTargets.find((debt) => debt.name === target.name)
								?.minBatchesByAllowedCount[String(count)] ?? 0,
					),
				]),
			),
		]),
	) as Record<"recovery" | "final", Record<string, number>>;
}

function buildWindowCapacity({
	writerReports,
	batchCounts,
	maxRunsPer24h,
	maxRunsPer12h,
}: {
	writerReports: DirectRefreshFreshnessDebtPlannerSourceReport[];
	batchCounts: DirectRefreshAllowedBatchCount[];
	maxRunsPer24h: number | null;
	maxRunsPer12h: number | null;
}): DirectRefreshFreshnessDebtPlannerReport["summary"]["windowCapacity"] {
	const recoveryCapacity =
		maxRunsPer24h === null ? null : maxRunsPer24h * writerReports.length;
	const finalCapacity =
		maxRunsPer12h === null ? null : maxRunsPer12h * writerReports.length;
	return {
		sourceScoped: true,
		maxRunsPerSourcePer24h: maxRunsPer24h,
		maxRunsPerSourcePer12h: maxRunsPer12h,
		maxSourceScopedBatches: {
			recoveryWindow24h: recoveryCapacity,
			finalWindow12h: finalCapacity,
		},
		canCoverTargetWithinWindowByCount: {
			recovery: Object.fromEntries(
				batchCounts.map((count) => [
					String(count),
					maxRunsPer24h === null
						? null
						: everySourceFitsWindow({
								writerReports,
								targetName: "recovery",
								count,
								maxRunsPerSource: maxRunsPer24h,
							}),
				]),
			),
			final: Object.fromEntries(
				batchCounts.map((count) => [
					String(count),
					maxRunsPer12h === null
						? null
						: everySourceFitsWindow({
								writerReports,
								targetName: "final",
								count,
								maxRunsPerSource: maxRunsPer12h,
							}),
				]),
			),
		},
	};
}

function everySourceFitsWindow({
	writerReports,
	targetName,
	count,
	maxRunsPerSource,
}: {
	writerReports: DirectRefreshFreshnessDebtPlannerSourceReport[];
	targetName: "recovery" | "final";
	count: DirectRefreshAllowedBatchCount;
	maxRunsPerSource: number;
}) {
	return writerReports.every((source) => {
		const target = source.debtTargets.find((debt) => debt.name === targetName);
		return (
			(target?.minBatchesByAllowedCount[String(count)] ?? 0) <= maxRunsPerSource
		);
	});
}

function buildParentArtifacts(
	options: DirectRefreshFreshnessDebtPlannerOptions,
): DirectRefreshFreshnessDebtPlannerInputArtifact[] {
	return [
		artifactSummary({
			kind: "source-health",
			path: options.sourceHealthPath ?? null,
			report: options.sourceHealthReport ?? null,
			raw: options.sourceHealthRaw ?? null,
		}),
		artifactSummary({
			kind: "capacity-report",
			path: options.capacityReportPath ?? null,
			report: options.capacityReport ?? null,
			raw: options.capacityReportRaw ?? null,
		}),
	];
}

function artifactSummary({
	kind,
	path,
	report,
	raw,
}: {
	kind: "source-health" | "capacity-report";
	path: string | null;
	report: unknown;
	raw: string | null;
}): DirectRefreshFreshnessDebtPlannerInputArtifact {
	const record = isRecord(report) ? report : null;
	return {
		kind,
		path,
		present: Boolean(record),
		audit: typeof record?.audit === "string" ? record.audit : null,
		status: typeof record?.status === "string" ? record.status : null,
		generatedAt:
			typeof record?.generatedAt === "string" ? record.generatedAt : null,
		hash: raw ? createHash("sha256").update(raw).digest("hex") : null,
		ttlPolicy: DEFAULT_ARTIFACT_TTLS[kind],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function issueSummary({
	status,
	planningPosture,
	writerReports,
	totalRowsNeededByTarget,
	minBatchesByTargetAndCount,
}: {
	status: DirectRefreshFreshnessDebtPlannerStatus;
	planningPosture: DirectRefreshFreshnessDebtPlannerPosture;
	writerReports: DirectRefreshFreshnessDebtPlannerSourceReport[];
	totalRowsNeededByTarget: Record<"recovery" | "final", number>;
	minBatchesByTargetAndCount: Record<
		"recovery" | "final",
		Record<string, number>
	>;
}) {
	return [
		`Freshness debt planner status: ${status}`,
		`Planning posture: ${planningPosture}`,
		`Writer-supported sources: ${writerReports.length}`,
		`Recovery debt: ${totalRowsNeededByTarget.recovery} rows; count50 lower bound: ${minBatchesByTargetAndCount.recovery["50"] ?? 0} source-scoped batches`,
		`Final target debt: ${totalRowsNeededByTarget.final} rows; count50 lower bound: ${minBatchesByTargetAndCount.final["50"] ?? 0} source-scoped batches`,
		"This planner is read-only guidance only and does not authorize manifest/prewrite, writes, scheduler execution, all-source or repeated-batch operation.",
	].join("\n");
}

function nextManualAction(
	status: DirectRefreshFreshnessDebtPlannerStatus,
	planningPosture: DirectRefreshFreshnessDebtPlannerPosture,
) {
	if (status === "FAIL")
		return "Stop. Fix fail-closed reasons before using this planner output for recovery planning.";
	if (planningPosture === "no-debt")
		return "No recovery planning is required for the 90%/24h target; continue monitoring.";
	return "Use this report as evidence-only recovery planning input; any future operation must start from separate approved write gates.";
}

function sum<T>(items: T[], value: (item: T) => number) {
	return items.reduce((total, item) => total + value(item), 0);
}
