import { assertDirectRefreshAllowedBatchCount } from "./direct-refresh-batch-size";
import {
	AUDIT_ONLY_DIRECT_REFRESH_SOURCES,
	WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
} from "./direct-refresh-source-health";
import { isWriterSupportedDirectRefreshSource } from "./direct-refresh-scheduler-planner";

export type DirectRefreshDryRunOrchestratorStatus = "PASS" | "FAIL";
export type DirectRefreshDryRunOrchestratorArtifactKind =
	| "schedulerPlanner"
	| "sourceHealth"
	| "alerts"
	| "killSwitch"
	| "operationsReport";

export type DirectRefreshDryRunOrchestratorIssue = {
	url: string;
	number: number;
	title: string;
	typeLabel: string;
	approvalLabel: string;
};

export type DirectRefreshDryRunOrchestratorArtifactPaths = Partial<
	Record<DirectRefreshDryRunOrchestratorArtifactKind, string | null>
>;

export type DirectRefreshDryRunOrchestratorArtifacts = Partial<
	Record<DirectRefreshDryRunOrchestratorArtifactKind, unknown>
>;

export type DirectRefreshDryRunOrchestratorOptions = {
	now?: Date;
	dryRun: boolean;
	source: string;
	count: number;
	issue: DirectRefreshDryRunOrchestratorIssue;
	paths?: DirectRefreshDryRunOrchestratorArtifactPaths;
	artifacts?: DirectRefreshDryRunOrchestratorArtifacts;
};

export type DirectRefreshDryRunOrchestratorReport = {
	schemaVersion: 1;
	audit: "direct-refresh-dry-run-orchestrator";
	status: DirectRefreshDryRunOrchestratorStatus;
	generatedAt: string;
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	filters: {
		dryRunRequested: boolean;
		source: string;
		count: number;
		artifactPaths: Required<DirectRefreshDryRunOrchestratorArtifactPaths>;
	};
	issue: DirectRefreshDryRunOrchestratorIssue;
	workUnit: {
		source: string;
		count: number;
		writerSupported: boolean;
	};
	phases: Array<{
		kind: DirectRefreshDryRunOrchestratorArtifactKind;
		label: string;
		path: string | null;
		present: boolean;
		status: string | null;
		audit: string | null;
		stopCondition: string | null;
	}>;
	blockers: Array<{
		kind: DirectRefreshDryRunOrchestratorArtifactKind | "orchestrator";
		reason: string;
		severity: "HIGH";
		path: string | null;
	}>;
	blockedModes: string[];
	summary: {
		orchestratorMode: "read-only-dry-run";
		schedulerExecution: "blocked";
		productionWrites: "blocked";
		manifestGeneration: "blocked";
		prewriteGeneration: "blocked";
		activeWriter: "blocked";
		allSource: "blocked";
		repeatedBatch: "blocked";
		diaWriter: "blocked";
		blockerCount: number;
	};
	nextManualAction: string;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh dry-run orchestrator; reads supplied artifacts only; no scheduler/cron/workflow execution, no manifest/prewrite generation, no active writer invocation, no production writes, no all-source or repeated-batch execution, no DIA writer support, no notifications, no remote-config/secrets/deploy/cache changes" as const;

const BLOCKED_MODES = [
	"scheduler-execution",
	"cron-workflow-automation",
	"manifest-generation",
	"prewrite-generation",
	"active-writer-invocation",
	"production-writes",
	"all-source-operation",
	"repeated-batches",
	"automatic-retry",
	"dia-writer-support",
	"notification-delivery",
	"remote-config-secrets-deploy-cache",
] as const;

const DEFAULT_PATHS: Required<DirectRefreshDryRunOrchestratorArtifactPaths> = {
	schedulerPlanner: null,
	sourceHealth: null,
	alerts: null,
	killSwitch: null,
	operationsReport: null,
};

const PHASES: Array<{
	kind: DirectRefreshDryRunOrchestratorArtifactKind;
	label: string;
	expectedAudit: string;
}> = [
	{
		kind: "schedulerPlanner",
		label: "Validate disabled scheduler planner evidence",
		expectedAudit: "direct-refresh-scheduler-planner",
	},
	{
		kind: "sourceHealth",
		label: "Review source health evidence",
		expectedAudit: "direct-refresh-source-health",
	},
	{
		kind: "alerts",
		label: "Review alert evidence",
		expectedAudit: "direct-refresh-alerts",
	},
	{
		kind: "killSwitch",
		label: "Review kill switch evidence",
		expectedAudit: "direct-refresh-kill-switch",
	},
	{
		kind: "operationsReport",
		label: "Review consolidated operations report evidence",
		expectedAudit: "direct-refresh-operations-report",
	},
];

export function buildDirectRefreshDryRunOrchestratorReport(
	options: DirectRefreshDryRunOrchestratorOptions,
): DirectRefreshDryRunOrchestratorReport {
	const generatedAt = (options.now ?? new Date()).toISOString();
	const source = options.source.trim();
	const paths = { ...DEFAULT_PATHS, ...options.paths };
	const issue = {
		...options.issue,
		title: options.issue.title.trim(),
		typeLabel: options.issue.typeLabel.trim(),
		approvalLabel: options.issue.approvalLabel.trim(),
	};
	const artifacts = options.artifacts ?? {};
	const configBlockers = validateOptions({ ...options, source, issue });
	const phases = PHASES.map((phase) =>
		summarizePhase(phase, paths, artifacts, source, options.count),
	);
	const blockers = [
		...configBlockers.map((reason) => ({
			kind: "orchestrator" as const,
			reason,
			severity: "HIGH" as const,
			path: null,
		})),
		...phases.flatMap((phase) => phaseBlockers(phase)),
	];
	const status: DirectRefreshDryRunOrchestratorStatus =
		blockers.length === 0 ? "PASS" : "FAIL";

	return {
		schemaVersion: 1,
		audit: "direct-refresh-dry-run-orchestrator",
		status,
		generatedAt,
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			dryRunRequested: options.dryRun,
			source,
			count: options.count,
			artifactPaths: paths,
		},
		issue,
		workUnit: {
			source,
			count: options.count,
			writerSupported: isWriterSupportedDirectRefreshSource(source),
		},
		phases,
		blockers,
		blockedModes: [...BLOCKED_MODES],
		summary: {
			orchestratorMode: "read-only-dry-run",
			schedulerExecution: "blocked",
			productionWrites: "blocked",
			manifestGeneration: "blocked",
			prewriteGeneration: "blocked",
			activeWriter: "blocked",
			allSource: "blocked",
			repeatedBatch: "blocked",
			diaWriter: "blocked",
			blockerCount: blockers.length,
		},
		nextManualAction:
			status === "PASS"
				? "Use this read-only dry-run summary as operator guidance only; any manual write still requires fresh gates and exact human confirmation outside this orchestrator."
				: "Stop. Resolve dry-run blockers and rerun this read-only orchestrator; do not generate manifest/prewrite or request writer confirmation from this failed summary.",
	};
}

function validateOptions(options: DirectRefreshDryRunOrchestratorOptions) {
	const reasons: string[] = [];
	const source = options.source.trim();
	if (!options.dryRun)
		reasons.push("dry-run orchestrator requires --dry-run=true");
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
			"DIA is audit-only/no-writer and cannot be dry-run orchestrated as a writer-supported source",
		);
	} else if (!isWriterSupportedDirectRefreshSource(source)) {
		reasons.push(
			`source must be one of ${WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.join(", ")}`,
		);
	}
	try {
		assertDirectRefreshAllowedBatchCount(
			options.count,
			"dry-run orchestrator count",
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
	if (!options.issue.title.trim()) reasons.push("issue title is required");
	if (!/^type:[^,\s]+$/.test(options.issue.typeLabel.trim())) {
		reasons.push("exactly one type:* issue label is required");
	}
	if (options.issue.approvalLabel.trim() !== "status:approved") {
		reasons.push("issue approval label must be status:approved");
	}
	return reasons;
}

function summarizePhase(
	phase: (typeof PHASES)[number],
	paths: Required<DirectRefreshDryRunOrchestratorArtifactPaths>,
	artifacts: DirectRefreshDryRunOrchestratorArtifacts,
	source: string,
	count: number,
): DirectRefreshDryRunOrchestratorReport["phases"][number] {
	const artifact = artifacts[phase.kind];
	const object = asRecord(artifact);
	const audit = stringOrNull(
		object?.audit ?? object?.report ?? object?.artifact,
	);
	const status = stringOrNull(object?.status ?? object?.conclusion);
	const validationReasons =
		artifact === undefined
			? []
			: validateArtifact(phase, object, audit, status, source, count);
	return {
		kind: phase.kind,
		label: phase.label,
		path: paths[phase.kind],
		present: artifact !== undefined,
		status,
		audit,
		stopCondition:
			validationReasons[0] ??
			(status && status !== "PASS"
				? `${phase.kind} artifact status is ${status}`
				: null),
	};
}

function validateArtifact(
	phase: (typeof PHASES)[number],
	object: Record<string, unknown> | null,
	audit: string | null,
	status: string | null,
	source: string,
	count: number,
) {
	const reasons: string[] = [];
	if (!object) {
		reasons.push(`${phase.kind} artifact must be a JSON object`);
		return reasons;
	}
	if (audit !== phase.expectedAudit) {
		reasons.push(`${phase.kind} artifact audit must be ${phase.expectedAudit}`);
	}
	if (!status || !["PASS", "WARN", "FAIL"].includes(status)) {
		reasons.push(`${phase.kind} artifact status must be PASS, WARN, or FAIL`);
	}
	if (object.dryRun !== true) {
		reasons.push(`${phase.kind} artifact must declare dryRun true`);
	}
	if (phase.kind === "schedulerPlanner") {
		reasons.push(...validateSchedulerPlannerArtifact(object, source, count));
	}
	if (phase.kind === "operationsReport") {
		reasons.push(...validateOperationsReportArtifact(object));
	}
	return reasons;
}

function validateSchedulerPlannerArtifact(
	object: Record<string, unknown>,
	source: string,
	count: number,
) {
	const reasons: string[] = [];
	const summary = asRecord(object.summary);
	const workUnit = asRecord(object.workUnit);
	const issue = asRecord(object.issue);
	if (stringOrNull(summary?.plannerMode) !== "read-only-disabled-scheduler-planning") {
		reasons.push("schedulerPlanner artifact mode must be read-only-disabled-scheduler-planning");
	}
	for (const [field, value] of [
		["schedulerExecution", summary?.schedulerExecution],
		["productionWrites", summary?.productionWrites],
		["allSource", summary?.allSource],
		["repeatedBatch", summary?.repeatedBatch],
		["diaWriter", summary?.diaWriter],
	] as const) {
		if (value !== "blocked") {
			reasons.push(`schedulerPlanner artifact ${field} must be blocked`);
		}
	}
	if (stringOrNull(workUnit?.source) !== source) {
		reasons.push("schedulerPlanner artifact workUnit.source must match request");
	}
	if (numberOrNull(workUnit?.count) !== count) {
		reasons.push("schedulerPlanner artifact workUnit.count must match request");
	}
	if (workUnit?.writerSupported !== true) {
		reasons.push("schedulerPlanner artifact workUnit.writerSupported must be true");
	}
	if (!stringOrNull(issue?.url) || numberOrNull(issue?.number) === null) {
		reasons.push("schedulerPlanner artifact issue metadata is required");
	}
	if (stringOrNull(issue?.approvalLabel) !== "status:approved") {
		reasons.push("schedulerPlanner artifact issue.approvalLabel must be status:approved");
	}
	if (!stringOrNull(object.nextManualAction)) {
		reasons.push("schedulerPlanner artifact nextManualAction is required");
	}
	return reasons;
}

function validateOperationsReportArtifact(object: Record<string, unknown>) {
	const reasons: string[] = [];
	const summary = asRecord(object.summary);
	const readiness = asRecord(object.readiness);
	if (summary?.schedulerGate !== "blocked") {
		reasons.push("operationsReport artifact summary.schedulerGate must be blocked");
	}
	for (const [field, value] of [
		["scheduler", readiness?.scheduler],
		["allSource", readiness?.allSource],
		["repeatedBatch", readiness?.repeatedBatch],
	] as const) {
		if (value !== "blocked") {
			reasons.push(`operationsReport artifact readiness.${field} must be blocked`);
		}
	}
	if (readiness?.productionWrites !== "not-performed") {
		reasons.push("operationsReport artifact readiness.productionWrites must be not-performed");
	}
	return reasons;
}

function phaseBlockers(
	phase: DirectRefreshDryRunOrchestratorReport["phases"][number],
): DirectRefreshDryRunOrchestratorReport["blockers"] {
	if (!phase.present) return [];
	const blockers: DirectRefreshDryRunOrchestratorReport["blockers"] = [];
	if (phase.stopCondition) {
		blockers.push({
			kind: phase.kind,
			reason: phase.stopCondition,
			severity: "HIGH",
			path: phase.path,
		});
	}
	if (
		phase.status &&
		phase.status !== "PASS" &&
		phase.stopCondition !== `${phase.kind} artifact status is ${phase.status}`
	) {
		blockers.push({
			kind: phase.kind,
			reason: `${phase.kind} artifact status is ${phase.status}`,
			severity: "HIGH",
			path: phase.path,
		});
	}
	return blockers;
}

function stringOrNull(value: unknown) {
	return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
