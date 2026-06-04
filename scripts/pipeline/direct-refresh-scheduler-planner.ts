import {
	assertDirectRefreshAllowedBatchCount,
	type DirectRefreshAllowedBatchCount,
} from "./direct-refresh-batch-size";
import {
	AUDIT_ONLY_DIRECT_REFRESH_SOURCES,
	WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
} from "./direct-refresh-source-health";

export type DirectRefreshSchedulerPlannerStatus = "PASS" | "FAIL";
export type DirectRefreshSchedulerPlannerSource =
	(typeof WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES)[number];

export type DirectRefreshSchedulerPlannerIssue = {
	url: string;
	number: number;
	title: string;
	typeLabel: string;
	approvalLabel: string;
};

export type DirectRefreshSchedulerPlannerArtifactPaths = {
	sourceHealth?: string | null;
	alerts?: string | null;
	killSwitch?: string | null;
	manifest?: string | null;
	prewrite?: string | null;
	freshnessBaseline?: string | null;
	operationsReport?: string | null;
};

export type DirectRefreshSchedulerPlannerOptions = {
	now?: Date;
	planningEnabled: boolean;
	source: string;
	count: number;
	issue: DirectRefreshSchedulerPlannerIssue;
	artifacts?: DirectRefreshSchedulerPlannerArtifactPaths;
};

export type DirectRefreshSchedulerPlannerReport = {
	schemaVersion: 1;
	audit: "direct-refresh-scheduler-planner";
	status: DirectRefreshSchedulerPlannerStatus;
	generatedAt: string;
	dryRun: true;
	writeBoundary: string;
	filters: {
		planningEnabled: boolean;
	};
	workUnit: {
		source: string;
		count: number;
		writerSupported: boolean;
	};
	issue: DirectRefreshSchedulerPlannerIssue;
	requiredArtifacts: Array<{
		name: string;
		path: string | null;
		requiredBefore: "planning" | "manual-write" | "postwrite";
	}>;
	blockedModes: string[];
	guardrails: string[];
	summary: {
		plannerMode: "read-only-disabled-scheduler-planning";
		schedulerExecution: "blocked";
		productionWrites: "blocked";
		allSource: "blocked";
		repeatedBatch: "blocked";
		diaWriter: "blocked";
		failClosedReasons: string[];
	};
	nextManualAction: string;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh scheduler planner; no production writes, no active writer invocation, no scheduler/cron/workflow execution, no all-source or repeated-batch execution, no DIA writer support, no deploy/secrets/cache/remote-config changes, no notification delivery" as const;

const BLOCKED_MODES = [
	"production-writes",
	"active-writer-invocation",
	"scheduler-execution",
	"cron-workflow-automation",
	"all-source-operation",
	"repeated-batches",
	"automatic-retry",
	"dia-writer-support",
	"notification-delivery",
	"remote-config-secrets-deploy-cache",
] as const;

const GUARDRAILS = [
	"planner is disabled unless --planning-enabled=true is supplied",
	"exactly one writer-supported source is allowed",
	"exactly one allowlisted count is allowed",
	"approved issue metadata with exactly one type:* label is required",
	"DIA is audit-only/no-writer and cannot be scheduled as writer-supported",
	"planner emits artifacts and next manual action only",
	"no automatic retry is permitted after stopped or failed attempts",
	"future scheduler implementation remains a separate approval scope",
] as const;

const REQUIRED_ARTIFACTS: Array<{
	key: keyof DirectRefreshSchedulerPlannerArtifactPaths;
	name: string;
	requiredBefore: "planning" | "manual-write" | "postwrite";
}> = [
	{
		key: "sourceHealth",
		name: "source health report",
		requiredBefore: "manual-write",
	},
	{ key: "alerts", name: "alerts report", requiredBefore: "manual-write" },
	{
		key: "killSwitch",
		name: "kill switch report",
		requiredBefore: "manual-write",
	},
	{ key: "manifest", name: "manifest report", requiredBefore: "manual-write" },
	{
		key: "prewrite",
		name: "prewrite gate report",
		requiredBefore: "manual-write",
	},
	{
		key: "freshnessBaseline",
		name: "freshness baseline",
		requiredBefore: "postwrite",
	},
	{
		key: "operationsReport",
		name: "operations report",
		requiredBefore: "postwrite",
	},
];

export function isWriterSupportedDirectRefreshSource(
	source: string,
): source is DirectRefreshSchedulerPlannerSource {
	return WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.includes(
		source as DirectRefreshSchedulerPlannerSource,
	);
}

export function buildDirectRefreshSchedulerPlannerReport(
	options: DirectRefreshSchedulerPlannerOptions,
): DirectRefreshSchedulerPlannerReport {
	const generatedAt = (options.now ?? new Date()).toISOString();
	const normalizedSource = options.source.trim();
	const normalizedIssue = {
		...options.issue,
		title: options.issue.title.trim(),
		typeLabel: options.issue.typeLabel.trim(),
		approvalLabel: options.issue.approvalLabel.trim(),
	};
	const failClosedReasons = validateOptions({
		...options,
		source: normalizedSource,
		issue: normalizedIssue,
	});
	const writerSupported = isWriterSupportedDirectRefreshSource(normalizedSource);
	const status: DirectRefreshSchedulerPlannerStatus =
		failClosedReasons.length === 0 ? "PASS" : "FAIL";

	return {
		schemaVersion: 1,
		audit: "direct-refresh-scheduler-planner",
		status,
		generatedAt,
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			planningEnabled: options.planningEnabled,
		},
		workUnit: {
			source: normalizedSource,
			count: options.count,
			writerSupported,
		},
		issue: normalizedIssue,
		requiredArtifacts: REQUIRED_ARTIFACTS.map((artifact) => ({
			name: artifact.name,
			path: options.artifacts?.[artifact.key] ?? null,
			requiredBefore: artifact.requiredBefore,
		})),
		blockedModes: [...BLOCKED_MODES],
		guardrails: [...GUARDRAILS],
		summary: {
			plannerMode: "read-only-disabled-scheduler-planning",
			schedulerExecution: "blocked",
			productionWrites: "blocked",
			allSource: "blocked",
			repeatedBatch: "blocked",
			diaWriter: "blocked",
			failClosedReasons,
		},
		nextManualAction:
			status === "PASS"
				? "Use this read-only plan as operator guidance only; generate fresh gate evidence and request exact human confirmation before any separate manual writer attempt."
				: "Stop. Fix fail-closed reasons and rerun the read-only planner; do not generate prewrite for active operation or request writer confirmation from this failed plan.",
	};
}

function validateOptions(options: DirectRefreshSchedulerPlannerOptions) {
	const reasons: string[] = [];
	const source = options.source.trim();

	if (!options.planningEnabled) {
		reasons.push("planning is disabled; requires --planning-enabled=true");
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
			"DIA is audit-only/no-writer and is excluded from scheduler planning as an active writer source",
		);
	} else if (!isWriterSupportedDirectRefreshSource(source)) {
		reasons.push(
			`source must be one of ${WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.join(", ")}`,
		);
	}

	try {
		assertDirectRefreshAllowedBatchCount(
			options.count,
			"scheduler planner count",
		);
	} catch (error) {
		reasons.push(error instanceof Error ? error.message : String(error));
	}

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
	if (!options.issue.title.trim()) {
		reasons.push("issue title is required");
	}
	if (!/^type:[^,\s]+$/.test(options.issue.typeLabel.trim())) {
		reasons.push("exactly one type:* issue label is required");
	}
	if (options.issue.approvalLabel.trim() !== "status:approved") {
		reasons.push("issue approval label must be status:approved");
	}

	for (const [key, value] of Object.entries(options.artifacts ?? {})) {
		if (value !== null && value !== undefined && !String(value).trim()) {
			reasons.push(`${key} artifact path must not be blank when supplied`);
		}
	}

	return reasons;
}

export function normalizePlannerCount(
	count: number,
): DirectRefreshAllowedBatchCount {
	return assertDirectRefreshAllowedBatchCount(count, "scheduler planner count");
}
