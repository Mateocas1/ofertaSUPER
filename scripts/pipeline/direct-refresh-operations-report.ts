import { uniqueSorted } from "./audit-utils";

export type DirectRefreshOperationsStatus = "PASS" | "WARN" | "FAIL";
export type DirectRefreshOperationsPosture =
	| "ready-for-controlled-manual-review"
	| "blocked"
	| "incomplete";
export type DirectRefreshOperationsArtifactKind =
	| "sourceHealth"
	| "alerts"
	| "killSwitch"
	| "freshnessBaseline"
	| "manifest"
	| "prewrite"
	| "activeWrite"
	| "postwrite"
	| "noPartial"
	| "errorArtifact"
	| "schedulerPlanner";

export type DirectRefreshOperationsArtifacts = Partial<
	Record<DirectRefreshOperationsArtifactKind, unknown>
>;
export type DirectRefreshOperationsArtifactPaths = Record<
	DirectRefreshOperationsArtifactKind,
	string | null
>;

type DirectRefreshOperationsBlockedSource = {
	source: string | null;
	reason: string;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
	artifactKind: DirectRefreshOperationsArtifactKind;
	artifactPath: string | null;
};

export type DirectRefreshOperationsReport = {
	schemaVersion: 1;
	audit: "direct-refresh-operations-report";
	status: DirectRefreshOperationsStatus;
	generatedAt: string;
	basis: "supplied-artifacts";
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	filters: {
		source: string | null;
		artifactPaths: DirectRefreshOperationsArtifactPaths;
		requireOperationArtifacts: boolean;
		requirePostwrite: boolean;
		requireNoPartialForIncident: boolean;
	};
	summary: {
		posture: DirectRefreshOperationsPosture;
		sourceHealthStatus: string | null;
		alertStatus: string | null;
		killSwitchStatus: string | null;
		freshnessBaselineStatus: string | null;
		schedulerPlannerStatus: string | null;
		operationStatus: DirectRefreshOperationsStatus | "NOT_PROVIDED";
		incidentStatus: DirectRefreshOperationsStatus | "NOT_PROVIDED";
		blockedSourceCount: number;
		blockerCount: number;
		schedulerGate: "blocked";
		diaPosture: "audit-only-no-writer";
	};
	sourceHealth: {
		status: string | null;
		writerSupportedStatus: string | null;
		sources: Array<{
			slug: string | null;
			directRefreshSupport: string | null;
			status: string | null;
			reasons: unknown;
			freshnessPercent: number | null;
			blockedRows: number | null;
			recommendation: string | null;
		}>;
	} | null;
	alerts: {
		status: string | null;
		highestSeverity: string | null;
		counts: {
			critical: number;
			high: number;
			medium: number;
			low: number;
		};
		alerts: Array<{
			condition: string | null;
			severity: string | null;
			source: string | null;
			message: string | null;
			nextAction: string | null;
		}>;
	} | null;
	killSwitch: {
		status: string | null;
		activeStops: unknown[];
		invalidControls: unknown[];
		expiredStopCount: number;
	} | null;
	freshnessBaseline: {
		status: string | null;
		overallFreshnessPercent: number | null;
		staleRows: number | null;
		unknownRows: number | null;
		denominatorDeltaStatus: string | null;
		denominatorBlockers: unknown;
	} | null;
	schedulerPlanner: {
		status: string | null;
		plannerMode: string | null;
		schedulerExecution: string | null;
		productionWrites: string | null;
		allSource: string | null;
		repeatedBatch: string | null;
		diaWriter: string | null;
		workUnit: {
			source: string | null;
			count: number | null;
			writerSupported: boolean | null;
		} | null;
		issue: {
			url: string | null;
			number: number | null;
			title: string | null;
			typeLabel: string | null;
			approvalLabel: string | null;
		} | null;
		failClosedReasons: string[];
		nextManualAction: string | null;
	} | null;
	operation: {
		manifest: ArtifactSummary | null;
		prewrite: ArtifactSummary | null;
		activeWrite: ArtifactSummary | null;
		postwrite: ArtifactSummary | null;
		noPartial: ArtifactSummary | null;
		selectedRows: number | null;
		skippedBlockedRows: number | null;
		failClosedReasons: string[];
		noCreateDeltas: {
			productDelta: number | null;
			supermarketProductDelta: number | null;
		} | null;
	};
	blockedSources: DirectRefreshOperationsBlockedSource[];
	readiness: {
		scheduler: "blocked";
		allSource: "blocked";
		repeatedBatch: "blocked";
		productionWrites: "not-performed";
		notifications: "not-sent";
		diaWriter: "not-supported";
		nextAction: string;
	};
	inputs: Array<{
		kind: DirectRefreshOperationsArtifactKind;
		path: string | null;
		present: boolean;
		audit: string | null;
		status: string | null;
		generatedAt: string | null;
	}>;
};

type ArtifactSummary = {
	audit: string | null;
	status: string | null;
	source: string | null;
	generatedAt: string | null;
	path: string | null;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh operations report; no production writes, no scheduler/cron/workflow/all-source/repeated-batch side effects, no remote services, no notifications, no secrets/deploy, no DIA writer support" as const;

const DEFAULT_PATHS: DirectRefreshOperationsArtifactPaths = {
	sourceHealth: null,
	alerts: null,
	killSwitch: null,
	freshnessBaseline: null,
	manifest: null,
	prewrite: null,
	activeWrite: null,
	postwrite: null,
	noPartial: null,
	errorArtifact: null,
	schedulerPlanner: null,
};

export function buildDirectRefreshOperationsReport({
	source = null,
	now = new Date(),
	paths = DEFAULT_PATHS,
	artifacts = {},
	requireOperationArtifacts = false,
	requirePostwrite = false,
	requireNoPartialForIncident = Boolean(artifacts.errorArtifact),
}: {
	source?: string | null;
	now?: Date;
	paths?: Partial<DirectRefreshOperationsArtifactPaths>;
	artifacts?: DirectRefreshOperationsArtifacts;
	requireOperationArtifacts?: boolean;
	requirePostwrite?: boolean;
	requireNoPartialForIncident?: boolean;
}): DirectRefreshOperationsReport {
	const artifactPaths = { ...DEFAULT_PATHS, ...paths };
	const sourceHealth = summarizeSourceHealth(artifacts.sourceHealth);
	const alerts = summarizeAlerts(artifacts.alerts);
	const killSwitch = summarizeKillSwitch(artifacts.killSwitch);
	const freshnessBaseline = summarizeFreshnessBaseline(
		artifacts.freshnessBaseline,
	);
	const schedulerPlanner = summarizeSchedulerPlanner(
		artifacts.schedulerPlanner,
	);
	const operation = summarizeOperation(artifacts, artifactPaths);
	const blockedSources: DirectRefreshOperationsBlockedSource[] = [
		...sourceHealthBlockers(sourceHealth, artifactPaths.sourceHealth),
		...alertBlockers(alerts, artifactPaths.alerts),
		...killSwitchBlockers(killSwitch, artifactPaths.killSwitch),
		...baselineBlockers(freshnessBaseline, artifactPaths.freshnessBaseline),
		...schedulerPlannerBlockers(
			schedulerPlanner,
			artifactPaths.schedulerPlanner,
		),
		...operationBlockers(operation, artifactPaths),
		...missingArtifactBlockers({
			artifacts,
			paths: artifactPaths,
			requireOperationArtifacts,
			requirePostwrite,
			requireNoPartialForIncident,
		}),
	];
	const status = aggregateStatus(blockedSources);
	const operationStatus = summarizeOperationStatus(
		operation,
		artifacts,
		requireOperationArtifacts,
		requirePostwrite,
	);
	const incidentStatus = summarizeIncidentStatus(
		artifacts,
		requireNoPartialForIncident,
	);
	const posture =
		status === "FAIL"
			? "blocked"
			: status === "WARN"
				? "incomplete"
				: "ready-for-controlled-manual-review";
	const inputs = buildInputs(artifacts, artifactPaths);

	return {
		schemaVersion: 1,
		audit: "direct-refresh-operations-report",
		status,
		generatedAt: now.toISOString(),
		basis: "supplied-artifacts",
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			source,
			artifactPaths,
			requireOperationArtifacts,
			requirePostwrite,
			requireNoPartialForIncident,
		},
		summary: {
			posture,
			sourceHealthStatus: sourceHealth?.status ?? null,
			alertStatus: alerts?.status ?? null,
			killSwitchStatus: killSwitch?.status ?? null,
			freshnessBaselineStatus: freshnessBaseline?.status ?? null,
			schedulerPlannerStatus: schedulerPlanner?.status ?? null,
			operationStatus,
			incidentStatus,
			blockedSourceCount: uniqueSorted(
				blockedSources
					.map((entry) => entry.source)
					.filter((value): value is string => Boolean(value)),
			).length,
			blockerCount: blockedSources.length,
			schedulerGate: "blocked",
			diaPosture: "audit-only-no-writer",
		},
		sourceHealth,
		alerts,
		killSwitch,
		freshnessBaseline,
		schedulerPlanner,
		operation,
		blockedSources,
		readiness: {
			scheduler: "blocked",
			allSource: "blocked",
			repeatedBatch: "blocked",
			productionWrites: "not-performed",
			notifications: "not-sent",
			diaWriter: "not-supported",
			nextAction:
				status === "FAIL"
					? "Resolve blockers before any controlled manual operation."
					: "Continue only through controlled manual source-specific gates; scheduler remains blocked.",
		},
		inputs,
	};
}

function summarizeSourceHealth(
	report: unknown,
): DirectRefreshOperationsReport["sourceHealth"] {
	const object = asRecord(report);
	if (!object) return null;
	const sources = Array.isArray(object.sources) ? object.sources : [];
	return {
		status: stringOrNull(object.status),
		writerSupportedStatus: stringOrNull(
			asRecord(object.summary)?.writerSupportedStatus,
		),
		sources: sources.map((entry) => {
			const source = asRecord(entry) ?? {};
			return {
				slug: stringOrNull(source.slug),
				directRefreshSupport: stringOrNull(source.directRefreshSupport),
				status: stringOrNull(source.status),
				reasons: source.reasons,
				freshnessPercent: numberOrNull(
					asRecord(source.freshness)?.freshnessPercent,
				),
				blockedRows: numberOrNull(asRecord(source.capacity)?.blockedRows),
				recommendation: stringOrNull(source.recommendation),
			};
		}),
	};
}

function summarizeAlerts(
	report: unknown,
): DirectRefreshOperationsReport["alerts"] {
	const object = asRecord(report);
	if (!object) return null;
	const summary = asRecord(object.summary);
	const alerts = Array.isArray(object.alerts) ? object.alerts : [];
	return {
		status: stringOrNull(object.status),
		highestSeverity: stringOrNull(summary?.highestSeverity),
		counts: {
			critical: numberOrZero(summary?.criticalCount),
			high: numberOrZero(summary?.highCount),
			medium: numberOrZero(summary?.mediumCount),
			low: numberOrZero(summary?.lowCount),
		},
		alerts: alerts.map((entry) => {
			const alert = asRecord(entry) ?? {};
			return {
				condition: stringOrNull(alert.condition),
				severity: stringOrNull(alert.severity),
				source: stringOrNull(alert.source),
				message: stringOrNull(alert.message),
				nextAction: stringOrNull(alert.nextAction),
			};
		}),
	};
}

function summarizeKillSwitch(
	report: unknown,
): DirectRefreshOperationsReport["killSwitch"] {
	const object = asRecord(report);
	if (!object) return null;
	const summary = asRecord(object.summary);
	return {
		status: stringOrNull(object.status),
		activeStops: Array.isArray(object.activeControls)
			? object.activeControls
			: [],
		invalidControls: Array.isArray(object.invalidControls)
			? object.invalidControls
			: [],
		expiredStopCount: numberOrZero(summary?.expiredStopCount),
	};
}

function summarizeFreshnessBaseline(
	report: unknown,
): DirectRefreshOperationsReport["freshnessBaseline"] {
	const object = asRecord(report);
	if (!object) return null;
	const summary = asRecord(object.summary);
	const denominatorDeltas = asRecord(object.denominatorDeltas);
	return {
		status: stringOrNull(object.status),
		overallFreshnessPercent: numberOrNull(summary?.overallFreshnessPercent),
		staleRows: numberOrNull(summary?.staleRows),
		unknownRows: numberOrNull(summary?.unknownRows),
		denominatorDeltaStatus: stringOrNull(denominatorDeltas?.status),
		denominatorBlockers: denominatorDeltas?.blockers,
	};
}

function summarizeSchedulerPlanner(
	report: unknown,
): DirectRefreshOperationsReport["schedulerPlanner"] {
	const object = asRecord(report);
	if (!object) return null;
	const summary = asRecord(object.summary);
	const workUnit = asRecord(object.workUnit);
	const issue = asRecord(object.issue);
	const status = stringOrNull(object.status);
	const plannerMode = stringOrNull(summary?.plannerMode);
	const schedulerExecution = stringOrNull(summary?.schedulerExecution);
	const productionWrites = stringOrNull(summary?.productionWrites);
	const allSource = stringOrNull(summary?.allSource);
	const repeatedBatch = stringOrNull(summary?.repeatedBatch);
	const diaWriter = stringOrNull(summary?.diaWriter);
	const nextManualAction = stringOrNull(object.nextManualAction);
	const summarizedWorkUnit = workUnit
		? {
				source: stringOrNull(workUnit.source),
				count: numberOrNull(workUnit.count),
				writerSupported: booleanOrNull(workUnit.writerSupported),
			}
		: null;
	const summarizedIssue = issue
		? {
				url: stringOrNull(issue.url),
				number: numberOrNull(issue.number),
				title: stringOrNull(issue.title),
				typeLabel: stringOrNull(issue.typeLabel),
				approvalLabel: stringOrNull(issue.approvalLabel),
			}
		: null;
	const validationReasons = validateSchedulerPlannerArtifact({
		object,
		status,
		plannerMode,
		schedulerExecution,
		productionWrites,
		allSource,
		repeatedBatch,
		diaWriter,
		workUnit: summarizedWorkUnit,
		issue: summarizedIssue,
		nextManualAction,
	});
	return {
		status,
		plannerMode,
		schedulerExecution,
		productionWrites,
		allSource,
		repeatedBatch,
		diaWriter,
		workUnit: summarizedWorkUnit,
		issue: summarizedIssue,
		failClosedReasons: uniqueSorted([
			...stringList(summary?.failClosedReasons),
			...validationReasons,
		]),
		nextManualAction,
	};
}

function validateSchedulerPlannerArtifact({
	object,
	status,
	plannerMode,
	schedulerExecution,
	productionWrites,
	allSource,
	repeatedBatch,
	diaWriter,
	workUnit,
	issue,
	nextManualAction,
}: {
	object: Record<string, unknown>;
	status: string | null;
	plannerMode: string | null;
	schedulerExecution: string | null;
	productionWrites: string | null;
	allSource: string | null;
	repeatedBatch: string | null;
	diaWriter: string | null;
	workUnit: DirectRefreshOperationsReport["schedulerPlanner"] extends infer T
		? T extends { workUnit: infer W }
			? W
			: never
		: never;
	issue: DirectRefreshOperationsReport["schedulerPlanner"] extends infer T
		? T extends { issue: infer I }
			? I
			: never
		: never;
	nextManualAction: string | null;
}) {
	const reasons: string[] = [];
	if (object.audit !== "direct-refresh-scheduler-planner") {
		reasons.push("scheduler planner artifact audit must be direct-refresh-scheduler-planner");
	}
	if (object.dryRun !== true) {
		reasons.push("scheduler planner artifact must be dryRun true");
	}
	if (!status || !["PASS", "WARN", "FAIL"].includes(status)) {
		reasons.push("scheduler planner artifact status must be PASS, WARN, or FAIL");
	}
	if (plannerMode !== "read-only-disabled-scheduler-planning") {
		reasons.push("scheduler planner artifact mode must be read-only-disabled-scheduler-planning");
	}
	for (const [field, value] of [
		["schedulerExecution", schedulerExecution],
		["productionWrites", productionWrites],
		["allSource", allSource],
		["repeatedBatch", repeatedBatch],
		["diaWriter", diaWriter],
	] as const) {
		if (value !== "blocked") {
			reasons.push(`scheduler planner artifact ${field} must be blocked`);
		}
	}
	if (!workUnit?.source) reasons.push("scheduler planner artifact workUnit.source is required");
	if (workUnit?.count === null || workUnit?.count === undefined) {
		reasons.push("scheduler planner artifact workUnit.count is required");
	}
	if (workUnit?.writerSupported !== true) {
		reasons.push("scheduler planner artifact workUnit.writerSupported must be true");
	}
	if (!issue?.url) reasons.push("scheduler planner artifact issue.url is required");
	if (issue?.number === null || issue?.number === undefined) {
		reasons.push("scheduler planner artifact issue.number is required");
	}
	if (!issue?.title) reasons.push("scheduler planner artifact issue.title is required");
	if (!issue?.typeLabel) reasons.push("scheduler planner artifact issue.typeLabel is required");
	if (issue?.approvalLabel !== "status:approved") {
		reasons.push("scheduler planner artifact issue.approvalLabel must be status:approved");
	}
	if (!nextManualAction) {
		reasons.push("scheduler planner artifact nextManualAction is required");
	}
	return reasons;
}

function summarizeOperation(
	artifacts: DirectRefreshOperationsArtifacts,
	paths: DirectRefreshOperationsArtifactPaths,
): DirectRefreshOperationsReport["operation"] {
	const manifest = artifactSummary(artifacts.manifest, paths.manifest);
	const prewrite = artifactSummary(artifacts.prewrite, paths.prewrite);
	const activeWrite = artifactSummary(artifacts.activeWrite, paths.activeWrite);
	const postwrite = artifactSummary(artifacts.postwrite, paths.postwrite);
	const noPartial = artifactSummary(artifacts.noPartial, paths.noPartial);
	const manifestObject = asRecord(artifacts.manifest);
	const prewriteObject = asRecord(artifacts.prewrite);
	const postwriteObject = asRecord(artifacts.postwrite);
	const failClosedReasons = uniqueSorted([
		...stringList(asRecord(manifestObject?.summary)?.failClosedReasons),
		...stringList(asRecord(prewriteObject?.summary)?.failClosedReasons),
		...stringList(asRecord(postwriteObject?.summary)?.failClosedReasons),
		...Object.keys(
			asRecord(asRecord(manifestObject?.summary)?.skippedBlockedReasons) ?? {},
		),
		...Object.keys(
			asRecord(asRecord(prewriteObject?.summary)?.skippedBlockedReasons) ?? {},
		),
	]);
	const noCreate =
		asRecord(postwriteObject?.noCreate) ??
		asRecord(asRecord(artifacts.activeWrite)?.noCreate);
	return {
		manifest,
		prewrite,
		activeWrite,
		postwrite,
		noPartial,
		selectedRows: numberOrNull(
			asRecord(manifestObject?.selection)?.selectedRows,
		),
		skippedBlockedRows: numberOrNull(
			asRecord(manifestObject?.selection)?.skippedBlockedRows,
		),
		failClosedReasons,
		noCreateDeltas: noCreate
			? {
					productDelta: numberOrNull(noCreate.productDelta),
					supermarketProductDelta: numberOrNull(
						noCreate.supermarketProductDelta,
					),
				}
			: null,
	};
}

function artifactSummary(
	report: unknown,
	path: string | null,
): ArtifactSummary | null {
	const object = asRecord(report);
	if (!object) return null;
	return {
		audit: stringOrNull(object.audit ?? object.report ?? object.artifact),
		status: stringOrNull(object.status ?? object.conclusion),
		source: sourceFromReport(object),
		generatedAt: stringOrNull(
			object.generatedAt ?? object.startedAt ?? object.attemptedAt,
		),
		path,
	};
}

function normalizeSeverity(
	value: string | null,
): DirectRefreshOperationsBlockedSource["severity"] {
	return value === "CRITICAL" ||
		value === "HIGH" ||
		value === "MEDIUM" ||
		value === "LOW"
		? value
		: "INFO";
}

function sourceHealthBlockers(
	sourceHealth: DirectRefreshOperationsReport["sourceHealth"],
	path: string | null,
) {
	if (!sourceHealth) return [];
	const blockers = sourceHealth.sources.flatMap((source) => {
		if (source.status === "PASS") return [];
		const severity: DirectRefreshOperationsBlockedSource["severity"] =
			source.status === "FAIL" ? "HIGH" : "MEDIUM";
		const reasons = stringList(source.reasons);
		return (
			reasons.length > 0
				? reasons
				: [`source health ${source.status ?? "unknown"}`]
		).map((reason) => ({
			source: source.slug,
			reason,
			severity,
			artifactKind: "sourceHealth" as const,
			artifactPath: path,
		}));
	});
	if (
		blockers.length === 0 &&
		sourceHealth.status &&
		sourceHealth.status !== "PASS"
	) {
		blockers.push({
			source: null,
			reason: `source health report status is ${sourceHealth.status}`,
			severity: sourceHealth.status === "FAIL" ? "HIGH" : "MEDIUM",
			artifactKind: "sourceHealth",
			artifactPath: path,
		});
	}
	return blockers;
}

function alertBlockers(
	alerts: DirectRefreshOperationsReport["alerts"],
	path: string | null,
) {
	if (!alerts) return [];
	const blockers = alerts.alerts.map(
		(alert): DirectRefreshOperationsBlockedSource => ({
			source: alert.source,
			reason: alert.message ?? alert.condition ?? "direct-refresh alert",
			severity: normalizeSeverity(alert.severity),
			artifactKind: "alerts",
			artifactPath: path,
		}),
	);
	if (blockers.length === 0 && alerts.status && alerts.status !== "PASS") {
		blockers.push({
			source: null,
			reason: `direct-refresh alerts report status is ${alerts.status}`,
			severity: alerts.status === "FAIL" ? "HIGH" : "MEDIUM",
			artifactKind: "alerts",
			artifactPath: path,
		});
	}
	return blockers;
}

function killSwitchBlockers(
	killSwitch: DirectRefreshOperationsReport["killSwitch"],
	path: string | null,
) {
	if (!killSwitch) return [];
	const blockers: DirectRefreshOperationsBlockedSource[] = [
		...killSwitch.activeStops.map((entry) => {
			const control = asRecord(entry) ?? {};
			return {
				source: stringOrNull(control.source),
				reason: stringOrNull(control.reason) ?? "active kill switch stop",
				severity: "HIGH" as const,
				artifactKind: "killSwitch" as const,
				artifactPath: path,
			};
		}),
		...killSwitch.invalidControls.map((entry) => {
			const control = asRecord(entry) ?? {};
			return {
				source: null,
				reason: stringOrNull(control.message) ?? "invalid kill switch control",
				severity: "HIGH" as const,
				artifactKind: "killSwitch" as const,
				artifactPath: path,
			};
		}),
		...(killSwitch.expiredStopCount > 0
			? [
					{
						source: null,
						reason: `${killSwitch.expiredStopCount} expired kill switch controls need cleanup`,
						severity: "LOW" as const,
						artifactKind: "killSwitch" as const,
						artifactPath: path,
					},
				]
			: []),
	];
	if (
		blockers.length === 0 &&
		killSwitch.status &&
		killSwitch.status !== "PASS"
	) {
		blockers.push({
			source: null,
			reason: `kill switch report status is ${killSwitch.status}`,
			severity: "HIGH",
			artifactKind: "killSwitch",
			artifactPath: path,
		});
	}
	return blockers;
}

function baselineBlockers(
	baseline: DirectRefreshOperationsReport["freshnessBaseline"],
	path: string | null,
) {
	if (!baseline || baseline.status === "PASS") return [];
	const severity: DirectRefreshOperationsBlockedSource["severity"] =
		baseline.status === "FAIL" ? "HIGH" : "MEDIUM";
	const blockers = stringList(baseline.denominatorBlockers);
	return (
		blockers.length > 0
			? blockers
			: [`freshness baseline ${baseline.status ?? "unknown"}`]
	).map((reason) => ({
		source: null,
		reason,
		severity,
		artifactKind: "freshnessBaseline" as const,
		artifactPath: path,
	}));
}

function schedulerPlannerBlockers(
	schedulerPlanner: DirectRefreshOperationsReport["schedulerPlanner"],
	path: string | null,
) {
	if (!schedulerPlanner) return [];
	const blockers: DirectRefreshOperationsReport["blockedSources"] = [];
	if (schedulerPlanner.status && schedulerPlanner.status !== "PASS") {
		blockers.push({
			source: schedulerPlanner.workUnit?.source ?? null,
			reason: `scheduler planner artifact status is ${schedulerPlanner.status}`,
			severity: schedulerPlanner.status === "FAIL" ? "HIGH" : "MEDIUM",
			artifactKind: "schedulerPlanner",
			artifactPath: path,
		});
	}
	for (const reason of schedulerPlanner.failClosedReasons) {
		blockers.push({
			source: schedulerPlanner.workUnit?.source ?? null,
			reason,
			severity: "HIGH",
			artifactKind: "schedulerPlanner",
			artifactPath: path,
		});
	}
	return blockers;
}

function operationBlockers(
	operation: DirectRefreshOperationsReport["operation"],
	paths: DirectRefreshOperationsArtifactPaths,
) {
	const blockers: DirectRefreshOperationsReport["blockedSources"] = [];
	for (const [kind, summary] of [
		["manifest", operation.manifest],
		["prewrite", operation.prewrite],
		["postwrite", operation.postwrite],
		["noPartial", operation.noPartial],
		["activeWrite", operation.activeWrite],
	] as Array<[DirectRefreshOperationsArtifactKind, ArtifactSummary | null]>) {
		if (summary?.status === "FAIL") {
			blockers.push({
				source: summary.source,
				reason: `${kind} artifact status is FAIL`,
				severity:
					kind === "postwrite" || kind === "noPartial" ? "CRITICAL" : "HIGH",
				artifactKind: kind,
				artifactPath: paths[kind],
			});
		}
	}
	for (const reason of operation.failClosedReasons) {
		blockers.push({
			source: null,
			reason,
			severity: "HIGH",
			artifactKind: "manifest",
			artifactPath: paths.manifest,
		});
	}
	if (
		operation.noCreateDeltas &&
		((operation.noCreateDeltas.productDelta ?? 0) !== 0 ||
			(operation.noCreateDeltas.supermarketProductDelta ?? 0) !== 0)
	) {
		blockers.push({
			source:
				operation.postwrite?.source ?? operation.activeWrite?.source ?? null,
			reason: "no-create delta is non-zero",
			severity: "CRITICAL",
			artifactKind: operation.postwrite ? "postwrite" : "activeWrite",
			artifactPath: operation.postwrite ? paths.postwrite : paths.activeWrite,
		});
	}
	return blockers;
}

function missingArtifactBlockers({
	artifacts,
	paths,
	requireOperationArtifacts,
	requirePostwrite,
	requireNoPartialForIncident,
}: {
	artifacts: DirectRefreshOperationsArtifacts;
	paths: DirectRefreshOperationsArtifactPaths;
	requireOperationArtifacts: boolean;
	requirePostwrite: boolean;
	requireNoPartialForIncident: boolean;
}) {
	const blockers: DirectRefreshOperationsReport["blockedSources"] = [];
	if (requireOperationArtifacts) {
		for (const kind of [
			"manifest",
			"prewrite",
			"activeWrite",
			"postwrite",
		] as const) {
			if (!artifacts[kind])
				blockers.push({
					source: null,
					reason: `${kind} artifact is required but missing`,
					severity: "HIGH",
					artifactKind: kind,
					artifactPath: paths[kind],
				});
		}
	}
	if (requirePostwrite && !artifacts.postwrite && !requireOperationArtifacts) {
		blockers.push({
			source: null,
			reason: "postwrite artifact is required but missing",
			severity: "HIGH",
			artifactKind: "postwrite",
			artifactPath: paths.postwrite,
		});
	}
	if (
		artifacts.errorArtifact &&
		requireNoPartialForIncident &&
		!artifacts.noPartial
	) {
		blockers.push({
			source: sourceFromReport(asRecord(artifacts.errorArtifact) ?? {}),
			reason: "incident/error artifact requires no-partial verification",
			severity: "HIGH",
			artifactKind: "noPartial",
			artifactPath: paths.noPartial,
		});
	} else if (artifacts.errorArtifact && !artifacts.noPartial) {
		blockers.push({
			source: sourceFromReport(asRecord(artifacts.errorArtifact) ?? {}),
			reason: "incident/error artifact has no no-partial verification supplied",
			severity: "MEDIUM",
			artifactKind: "noPartial",
			artifactPath: paths.noPartial,
		});
	}
	return blockers;
}

function summarizeOperationStatus(
	operation: DirectRefreshOperationsReport["operation"],
	artifacts: DirectRefreshOperationsArtifacts,
	requireOperationArtifacts: boolean,
	requirePostwrite: boolean,
): DirectRefreshOperationsStatus | "NOT_PROVIDED" {
	if (
		!artifacts.manifest &&
		!artifacts.prewrite &&
		!artifacts.activeWrite &&
		!artifacts.postwrite &&
		!artifacts.noPartial
	) {
		return requireOperationArtifacts || requirePostwrite
			? "FAIL"
			: "NOT_PROVIDED";
	}
	if (
		[
			operation.manifest,
			operation.prewrite,
			operation.activeWrite,
			operation.postwrite,
			operation.noPartial,
		].some((entry) => entry?.status === "FAIL")
	)
		return "FAIL";
	if (
		operation.failClosedReasons.length > 0 ||
		(operation.noCreateDeltas &&
			((operation.noCreateDeltas.productDelta ?? 0) !== 0 ||
				(operation.noCreateDeltas.supermarketProductDelta ?? 0) !== 0))
	)
		return "FAIL";
	return "PASS";
}

function summarizeIncidentStatus(
	artifacts: DirectRefreshOperationsArtifacts,
	requireNoPartialForIncident: boolean,
): DirectRefreshOperationsStatus | "NOT_PROVIDED" {
	if (!artifacts.errorArtifact && !artifacts.noPartial) return "NOT_PROVIDED";
	const noPartial = asRecord(artifacts.noPartial);
	if ((noPartial?.status ?? noPartial?.conclusion) === "FAIL") return "FAIL";
	if (artifacts.errorArtifact && !artifacts.noPartial)
		return requireNoPartialForIncident ? "FAIL" : "WARN";
	return "PASS";
}

function aggregateStatus(
	blockers: DirectRefreshOperationsReport["blockedSources"],
): DirectRefreshOperationsStatus {
	if (
		blockers.some(
			(entry) => entry.severity === "CRITICAL" || entry.severity === "HIGH",
		)
	)
		return "FAIL";
	if (blockers.length > 0) return "WARN";
	return "PASS";
}

function buildInputs(
	artifacts: DirectRefreshOperationsArtifacts,
	paths: DirectRefreshOperationsArtifactPaths,
): DirectRefreshOperationsReport["inputs"] {
	return (Object.keys(paths) as DirectRefreshOperationsArtifactKind[]).map(
		(kind) => {
			const object = asRecord(artifacts[kind]);
			return {
				kind,
				path: paths[kind],
				present: Boolean(artifacts[kind]),
				audit: stringOrNull(
					object?.audit ?? object?.report ?? object?.artifact,
				),
				status: stringOrNull(object?.status ?? object?.conclusion),
				generatedAt: stringOrNull(
					object?.generatedAt ?? object?.startedAt ?? object?.attemptedAt,
				),
			};
		},
	);
}

function sourceFromReport(object: Record<string, unknown>) {
	return stringOrNull(
		asRecord(object.source)?.slug ??
			object.source ??
			object.sourceSlug ??
			asRecord(object.writeReport)?.source ??
			asRecord(object.expected)?.source,
	);
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function numberOrZero(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown) {
	return typeof value === "boolean" ? value : null;
}

function stringOrNull(value: unknown) {
	return typeof value === "string" && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
