import { createHash } from "node:crypto";

import { assertDirectRefreshAllowedBatchCount } from "./direct-refresh-batch-size";
import {
	AUDIT_ONLY_DIRECT_REFRESH_SOURCES,
	WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
} from "./direct-refresh-source-health";
import {
	activeDirectRefreshRunStatuses,
	findActiveDirectRefreshRunConflict,
	type DirectRefreshRunLedgerStatus,
} from "./direct-refresh-run-ledger";
import {
	type DirectRefreshFreshnessDebtPlannerReport,
	type DirectRefreshFreshnessDebtPlannerSourceReport,
} from "./direct-refresh-freshness-debt-planner";
import { uniqueSorted } from "./audit-utils";

export type DirectRefreshCadenceControllerStatus = "PASS" | "WARN" | "FAIL";
export type DirectRefreshCadenceControllerPosture =
	| "ready-for-human-confirmation"
	| "manual-review"
	| "blocked"
	| "no-debt";

export type DirectRefreshCadenceControllerIssue = {
	url: string;
	number: number;
	title: string;
	typeLabel: string;
	approvalLabel: string;
};

export type DirectRefreshCadenceControllerEvidencePaths = {
	freshnessDebtPlan?: string | null;
	ledger?: string | null;
	sourceHealth?: string | null;
	capacityReport?: string | null;
	operationsReport?: string | null;
	killSwitch?: string | null;
};

export type DirectRefreshCadenceControllerLedgerEntry = {
	source: string;
	status: DirectRefreshRunLedgerStatus;
	runKey: string;
	attemptId: string;
};

export type DirectRefreshCadenceControllerOptions = {
	now?: Date;
	cadenceEnabled: boolean;
	source: string;
	count: number;
	attemptId: string;
	outputDir: string;
	issue: DirectRefreshCadenceControllerIssue;
	freshnessDebtPlan?: DirectRefreshFreshnessDebtPlannerReport | null;
	freshnessDebtPlanRaw?: string | null;
	ledgerEntries?: DirectRefreshCadenceControllerLedgerEntry[];
	paths?: DirectRefreshCadenceControllerEvidencePaths;
};

export type DirectRefreshCadenceControllerReport = {
	schemaVersion: 1;
	audit: "direct-refresh-cadence-controller";
	status: DirectRefreshCadenceControllerStatus;
	generatedAt: string;
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	blockedModes: string[];
	issue: DirectRefreshCadenceControllerIssue;
	lineage: {
		attemptId: string;
		outputDir: string;
		evidence: Array<{
			kind:
				| "freshness-debt-plan"
				| "run-ledger"
				| "source-health"
				| "capacity-report"
				| "operations-report"
				| "kill-switch";
			path: string | null;
			present: boolean;
			audit: string | null;
			status: string | null;
			hash: string | null;
		}>;
	};
	workUnit: {
		source: string;
		count: number;
		writerSupported: boolean;
		ledgerConflict: DirectRefreshCadenceControllerLedgerEntry | null;
	};
	planner: {
		present: boolean;
		status: string | null;
		posture: string | null;
		runEligibility: string | null;
		freshnessStatus: string | null;
		capacityStatus: string | null;
		recoveryRowsNeeded: number | null;
		finalRowsNeeded: number | null;
		minBatchesForCount: {
			recovery: number | null;
			final: number | null;
		};
	};
	summary: {
		controllerMode: "read-only-disabled-cadence-planning";
		posture: DirectRefreshCadenceControllerPosture;
		failClosedReasons: string[];
		warnings: string[];
		ledgerActiveStatuses: DirectRefreshRunLedgerStatus[];
		freshnessDebtIsAuthorization: false;
		nextHumanConfirmationBoundary: string;
	};
	nextManualAction: string;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh cadence controller; consumes supplied evidence only; no scheduler/cron/workflow execution, no manifest/prewrite generation, no active writer invocation, no production writes, no all-source or repeated-batch execution, no VTEX scans, no DIA writer support, no notifications, no remote-config/secrets/deploy/cache changes" as const;

const BLOCKED_MODES = [
	"scheduler-execution",
	"cron-workflow-automation",
	"manifest-generation",
	"prewrite-generation",
	"active-writer-invocation",
	"production-writes",
	"all-source-operation",
	"repeated-batches",
	"automatic-writes",
	"automatic-retry",
	"vtex-scans",
	"dia-writer-support",
	"notification-delivery",
	"remote-config-secrets-deploy-cache",
] as const;

const NEXT_CONFIRMATION_BOUNDARY =
	"If posture is ready, stop and request a separate human-approved operation with fresh gates, exact source/count confirmation, and no automatic write from this controller.";

export function buildDirectRefreshCadenceControllerReport(
	options: DirectRefreshCadenceControllerOptions,
): DirectRefreshCadenceControllerReport {
	const generatedAt = (options.now ?? new Date()).toISOString();
	const source = normalizeSource(options.source);
	const issue = normalizeIssue(options.issue);
	const count = options.count;
	const paths = options.paths ?? {};
	const plan = options.freshnessDebtPlan ?? null;
	const plannerSource = source ? findPlannerSource(plan, source) : null;
	const ledgerConflict = source
		? findActiveDirectRefreshRunConflict(options.ledgerEntries ?? [], source)
		: null;
	const failClosedReasons = validateOptions({
		...options,
		source,
		issue,
		freshnessDebtPlan: plan,
		ledgerEntries: options.ledgerEntries ?? [],
	});
	const warnings = buildWarnings(plan, plannerSource);
	const posture = determinePosture(failClosedReasons, warnings, plannerSource);
	const status = statusForPosture(posture);

	return {
		schemaVersion: 1,
		audit: "direct-refresh-cadence-controller",
		status,
		generatedAt,
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		blockedModes: [...BLOCKED_MODES],
		issue,
		lineage: {
			attemptId: options.attemptId.trim(),
			outputDir: options.outputDir.trim(),
			evidence: buildEvidence({
				paths,
				plan,
				planRaw: options.freshnessDebtPlanRaw ?? null,
				ledgerEntries: options.ledgerEntries ?? [],
			}),
		},
		workUnit: {
			source,
			count,
			writerSupported: isWriterSupportedDirectRefreshCadenceSource(source),
			ledgerConflict,
		},
		planner: summarizePlanner(plan, plannerSource, count),
		summary: {
			controllerMode: "read-only-disabled-cadence-planning",
			posture,
			failClosedReasons,
			warnings,
			ledgerActiveStatuses: activeDirectRefreshRunStatuses(),
			freshnessDebtIsAuthorization: false,
			nextHumanConfirmationBoundary: NEXT_CONFIRMATION_BOUNDARY,
		},
		nextManualAction: nextManualAction(posture),
	};
}

export function isWriterSupportedDirectRefreshCadenceSource(source: string) {
	return WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.includes(
		normalizeSource(
			source,
		) as (typeof WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES)[number],
	);
}

function validateOptions(
	options: DirectRefreshCadenceControllerOptions & {
		ledgerEntries: DirectRefreshCadenceControllerLedgerEntry[];
	},
) {
	const reasons: string[] = [];
	const source = normalizeSource(options.source);
	const plan = options.freshnessDebtPlan ?? null;
	const plannerSource = findPlannerSource(plan, source);

	if (!options.cadenceEnabled) {
		reasons.push(
			"cadence planning is disabled; requires --cadence-enabled=true",
		);
	}
	if (!source) {
		reasons.push("source is required");
	} else if (source.includes(",")) {
		reasons.push("exactly one source is allowed");
	} else if (
		AUDIT_ONLY_DIRECT_REFRESH_SOURCES.includes(
			source as (typeof AUDIT_ONLY_DIRECT_REFRESH_SOURCES)[number],
		)
	) {
		reasons.push(
			`${source} is audit-only/no-writer and cannot be cadence writer scope`,
		);
	} else if (!isWriterSupportedDirectRefreshCadenceSource(source)) {
		reasons.push(
			`source must be one of ${WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.join(", ")}`,
		);
	}
	try {
		assertDirectRefreshAllowedBatchCount(countOrZero(options.count));
	} catch (error) {
		reasons.push(error instanceof Error ? error.message : String(error));
	}
	if (!options.attemptId.trim()) reasons.push("attempt ID is required");
	if (!options.outputDir.trim()) reasons.push("output dir is required");
	reasons.push(...validateIssue(options.issue));
	if (!plan) {
		reasons.push("freshness debt plan evidence is required");
	} else {
		reasons.push(...validatePlan(plan, source, options.count, plannerSource));
	}
	const ledgerConflict = findActiveDirectRefreshRunConflict(
		options.ledgerEntries,
		source,
	);
	if (ledgerConflict) {
		reasons.push(
			`active direct-refresh run exists for ${source}: ${ledgerConflict.status} ${ledgerConflict.runKey}`,
		);
	}
	return uniqueSorted(reasons);
}

function validatePlan(
	plan: DirectRefreshFreshnessDebtPlannerReport,
	source: string,
	count: number,
	plannerSource: DirectRefreshFreshnessDebtPlannerSourceReport | null,
) {
	const reasons: string[] = [];
	if (plan.schemaVersion !== 1)
		reasons.push("freshness debt plan schemaVersion must be 1");
	if (plan.audit !== "direct-refresh-freshness-debt-planner") {
		reasons.push(
			"freshness debt plan audit must be direct-refresh-freshness-debt-planner",
		);
	}
	if (plan.dryRun !== true)
		reasons.push("freshness debt plan must be dryRun=true");
	if (plan.status === "FAIL") reasons.push("freshness debt plan is FAIL");
	if (!plan.filters.sources.includes(source)) {
		reasons.push("freshness debt plan source must match cadence source");
	}
	if (!plan.filters.batchCounts.includes(count as never)) {
		reasons.push("freshness debt plan batch count must include cadence count");
	}
	if (!plannerSource) {
		reasons.push("freshness debt plan must include the cadence source report");
		return reasons;
	}
	if (plannerSource.directRefreshSupport !== "writer-supported") {
		reasons.push("freshness debt plan source must be writer-supported");
	}
	if (plannerSource.safetyStatus !== "PASS") {
		reasons.push("freshness debt plan source safety must be PASS");
	}
	if (plannerSource.runEligibility === "blocked") {
		reasons.push("freshness debt plan source run eligibility is blocked");
	}
	if (plannerSource.capacity.status === "FAIL") {
		reasons.push("capacity FAIL blocks cadence planning");
	}
	return reasons;
}

function buildWarnings(
	plan: DirectRefreshFreshnessDebtPlannerReport | null,
	plannerSource: DirectRefreshFreshnessDebtPlannerSourceReport | null,
) {
	const warnings: string[] = [];
	if (!plan || !plannerSource) return warnings;
	if (["WARN", "UNKNOWN"].includes(plannerSource.capacity.status)) {
		warnings.push(
			`capacity ${plannerSource.capacity.status} requires manual review`,
		);
	}
	if (plannerSource.runEligibility !== "planning-normal") {
		warnings.push(`run eligibility is ${plannerSource.runEligibility}`);
	}
	return uniqueSorted(warnings);
}

function determinePosture(
	failClosedReasons: string[],
	warnings: string[],
	plannerSource: DirectRefreshFreshnessDebtPlannerSourceReport | null,
): DirectRefreshCadenceControllerPosture {
	if (failClosedReasons.length > 0) return "blocked";
	const recoveryRows = rowsNeeded(plannerSource, "recovery");
	const finalRows = rowsNeeded(plannerSource, "final");
	if (recoveryRows === 0 && finalRows === 0) return "no-debt";
	if (warnings.length > 0) return "manual-review";
	return "ready-for-human-confirmation";
}

function statusForPosture(posture: DirectRefreshCadenceControllerPosture) {
	if (posture === "blocked") return "FAIL";
	if (posture === "manual-review") return "WARN";
	return "PASS";
}

function summarizePlanner(
	plan: DirectRefreshFreshnessDebtPlannerReport | null,
	plannerSource: DirectRefreshFreshnessDebtPlannerSourceReport | null,
	count: number,
): DirectRefreshCadenceControllerReport["planner"] {
	return {
		present: plan !== null,
		status: plan?.status ?? null,
		posture: plan?.summary.planningPosture ?? null,
		runEligibility: plannerSource?.runEligibility ?? null,
		freshnessStatus: plannerSource?.freshnessStatus ?? null,
		capacityStatus: plannerSource?.capacity.status ?? null,
		recoveryRowsNeeded: rowsNeeded(plannerSource, "recovery"),
		finalRowsNeeded: rowsNeeded(plannerSource, "final"),
		minBatchesForCount: {
			recovery: minBatches(plannerSource, "recovery", count),
			final: minBatches(plannerSource, "final", count),
		},
	};
}

function buildEvidence({
	paths,
	plan,
	planRaw,
	ledgerEntries,
}: {
	paths: DirectRefreshCadenceControllerEvidencePaths;
	plan: DirectRefreshFreshnessDebtPlannerReport | null;
	planRaw: string | null;
	ledgerEntries: DirectRefreshCadenceControllerLedgerEntry[];
}): DirectRefreshCadenceControllerReport["lineage"]["evidence"] {
	const ledgerRaw = JSON.stringify(ledgerEntries);
	return [
		{
			kind: "freshness-debt-plan",
			path: paths.freshnessDebtPlan ?? null,
			present: plan !== null,
			audit: plan?.audit ?? null,
			status: plan?.status ?? null,
			hash: planRaw ? sha256(planRaw) : null,
		},
		{
			kind: "run-ledger",
			path: paths.ledger ?? null,
			present: ledgerEntries.length > 0 || Boolean(paths.ledger),
			audit: null,
			status: null,
			hash: ledgerEntries.length > 0 ? sha256(ledgerRaw) : null,
		},
		{
			kind: "source-health",
			path: paths.sourceHealth ?? null,
			present: Boolean(paths.sourceHealth),
			audit: "direct-refresh-source-health",
			status: null,
			hash: null,
		},
		{
			kind: "capacity-report",
			path: paths.capacityReport ?? null,
			present: Boolean(paths.capacityReport),
			audit: "direct-refresh-capacity",
			status: null,
			hash: null,
		},
		{
			kind: "operations-report",
			path: paths.operationsReport ?? null,
			present: Boolean(paths.operationsReport),
			audit: "direct-refresh-operations-report",
			status: null,
			hash: null,
		},
		{
			kind: "kill-switch",
			path: paths.killSwitch ?? null,
			present: Boolean(paths.killSwitch),
			audit: "direct-refresh-kill-switch",
			status: null,
			hash: null,
		},
	];
}

function findPlannerSource(
	plan: DirectRefreshFreshnessDebtPlannerReport | null,
	source: string,
) {
	if (!plan) return null;
	return (
		plan.sources.find((entry) => normalizeSource(entry.slug) === source) ?? null
	);
}

function rowsNeeded(
	plannerSource: DirectRefreshFreshnessDebtPlannerSourceReport | null,
	name: "recovery" | "final",
) {
	return (
		plannerSource?.debtTargets.find((target) => target.name === name)
			?.rowsNeeded ?? null
	);
}

function minBatches(
	plannerSource: DirectRefreshFreshnessDebtPlannerSourceReport | null,
	name: "recovery" | "final",
	count: number,
) {
	return (
		plannerSource?.debtTargets.find((target) => target.name === name)
			?.minBatchesByAllowedCount[String(count)] ?? null
	);
}

function nextManualAction(posture: DirectRefreshCadenceControllerPosture) {
	if (posture === "ready-for-human-confirmation") {
		return "Stop at the human confirmation boundary. This controller only recommends the next source/count; any operation requires a separate approved issue or operation, fresh gate evidence, and exact human confirmation.";
	}
	if (posture === "manual-review") {
		return "Stop for manual review. Capacity/freshness posture is reduced or uncertain; do not generate manifest/prewrite or request writer confirmation from this controller.";
	}
	if (posture === "no-debt") {
		return "No recovery operation is recommended. Keep monitoring with read-only evidence.";
	}
	return "Stop. Resolve fail-closed reasons and rerun this read-only controller; do not execute scheduler, manifest/prewrite, or writers.";
}

function validateIssue(issue: DirectRefreshCadenceControllerIssue) {
	const reasons: string[] = [];
	if (!Number.isInteger(issue.number) || issue.number <= 0) {
		reasons.push("issue number must be a positive integer");
	}
	if (
		!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(issue.url.trim())
	) {
		reasons.push("issue URL must be a GitHub issue URL");
	}
	if (!issue.title.trim()) reasons.push("issue title is required");
	if (!/^type:[^,\s]+$/.test(issue.typeLabel.trim())) {
		reasons.push("exactly one type:* issue label is required");
	}
	if (issue.approvalLabel.trim() !== "status:approved") {
		reasons.push("issue approval label must be status:approved");
	}
	return reasons;
}

function normalizeIssue(issue: DirectRefreshCadenceControllerIssue) {
	return {
		...issue,
		title: issue.title.trim(),
		typeLabel: issue.typeLabel.trim(),
		approvalLabel: issue.approvalLabel.trim(),
	};
}

function normalizeSource(source: string) {
	return source.trim().toLowerCase();
}

function countOrZero(count: number) {
	return Number.isFinite(count) ? count : 0;
}

function sha256(raw: string) {
	return createHash("sha256").update(raw).digest("hex");
}
