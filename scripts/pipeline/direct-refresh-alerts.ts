import { uniqueSorted } from "./audit-utils";

export type DirectRefreshAlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type DirectRefreshAlertsStatus = "PASS" | "WARN" | "FAIL";

export type DirectRefreshAlertCondition =
	| "source_health_fail"
	| "source_health_warn"
	| "freshness_baseline_fail"
	| "freshness_baseline_warn"
	| "manifest_fail"
	| "prewrite_fail"
	| "prewrite_stale"
	| "confirmation_mismatch"
	| "active_writer_timeout"
	| "prisma_pool_exhaustion"
	| "prisma_transaction_not_found"
	| "postwrite_fail"
	| "no_create_invariant_violation"
	| "no_partial_verification_fail"
	| "missing_postwrite_artifact"
	| "missing_baseline_artifact";

export type DirectRefreshAlert = {
	id: string;
	severity: DirectRefreshAlertSeverity;
	condition: DirectRefreshAlertCondition;
	source: string | null;
	artifactPaths: string[];
	owner: string;
	channel: string;
	message: string;
	requiredResponse: string;
	stoppedBeforeWrite: boolean | null;
	noPartialVerificationPath: string | null;
	retryAllowed: boolean;
	nextAction: string;
	evidence: Record<string, unknown>;
};

export type DirectRefreshAlertsReport = {
	schemaVersion: 1;
	audit: "direct-refresh-alerts";
	status: DirectRefreshAlertsStatus;
	generatedAt: string;
	basis: "supplied-artifacts";
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	filters: {
		source: string | null;
		maxPrewriteAgeMinutes: number;
		artifactPaths: DirectRefreshAlertArtifactPaths;
		requirePostwrite: boolean;
		requireBaseline: boolean;
	};
	summary: {
		alertCount: number;
		criticalCount: number;
		highCount: number;
		mediumCount: number;
		lowCount: number;
		highestSeverity: DirectRefreshAlertSeverity | null;
		schedulerGate: "blocked";
	};
	alerts: DirectRefreshAlert[];
	inputs: Array<{
		kind: keyof DirectRefreshAlertArtifacts;
		path: string | null;
		present: boolean;
		audit: string | null;
		status: string | null;
		generatedAt: string | null;
	}>;
};

export type DirectRefreshAlertArtifacts = {
	sourceHealth?: unknown;
	freshnessBaseline?: unknown;
	manifest?: unknown;
	prewrite?: unknown;
	postwrite?: unknown;
	noPartial?: unknown;
	errorArtifact?: unknown;
	activeWrite?: unknown;
};

export type DirectRefreshAlertArtifactPaths = {
	sourceHealth: string | null;
	freshnessBaseline: string | null;
	manifest: string | null;
	prewrite: string | null;
	postwrite: string | null;
	noPartial: string | null;
	errorArtifact: string | null;
	activeWrite: string | null;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh alert evaluation; no notification delivery, no production writes, no scheduler/cron/workflow/all-source/retry side effects" as const;

const DEFAULT_PATHS: DirectRefreshAlertArtifactPaths = {
	sourceHealth: null,
	freshnessBaseline: null,
	manifest: null,
	prewrite: null,
	postwrite: null,
	noPartial: null,
	errorArtifact: null,
	activeWrite: null,
};

const POLICY: Record<
	DirectRefreshAlertCondition,
	{
		severity: DirectRefreshAlertSeverity;
		owner: string;
		channel: string;
		requiredResponse: string;
		retryAllowed: boolean;
		nextAction: string;
	}
> = {
	source_health_fail: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Do not run controlled operation for that source. Open/fix readiness issue.",
		retryAllowed: false,
		nextAction: "Fix source health before any controlled operation.",
	},
	source_health_warn: {
		severity: "MEDIUM",
		owner: "Direct-refresh operator",
		channel: "Issue comment + #direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Require explicit operator acknowledgement before manual operation. Scheduler remains blocked.",
		retryAllowed: false,
		nextAction: "Record acknowledgement or resolve warning before proceeding.",
	},
	freshness_baseline_fail: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Stop cadence discussion. Diagnose denominator/freshness regression.",
		retryAllowed: false,
		nextAction: "Diagnose baseline failure before any further operation.",
	},
	freshness_baseline_warn: {
		severity: "MEDIUM",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse:
			"Record baseline warning and continue only if operation-specific gates passed.",
		retryAllowed: false,
		nextAction: "Record warning in the operation evidence.",
	},
	manifest_fail: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse: "Do not write. Diagnose blockers or scan size separately.",
		retryAllowed: true,
		nextAction: "Regenerate read-only manifest after diagnosis.",
	},
	prewrite_fail: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse: "Do not write. Diagnose blockers or scan size separately.",
		retryAllowed: true,
		nextAction: "Regenerate prewrite PASS before requesting confirmation.",
	},
	prewrite_stale: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse:
			"Stop before transaction, verify no partial write/no write report, regenerate evidence.",
		retryAllowed: true,
		nextAction: "Verify no partial write, regenerate fresh prewrite, request new confirmation.",
	},
	confirmation_mismatch: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse:
			"Stop before transaction, preserve evidence, request fresh confirmation only after regeneration.",
		retryAllowed: true,
		nextAction: "Regenerate or re-issue exact confirmation text before writer execution.",
	},
	active_writer_timeout: {
		severity: "CRITICAL",
		owner: "Direct-refresh operator + maintainer",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Stop, verify rollback/no-partial state, file bugfix issue if root cause is code/tooling.",
		retryAllowed: false,
		nextAction: "Run no-partial verification and review root cause before retry.",
	},
	prisma_pool_exhaustion: {
		severity: "HIGH",
		owner: "Direct-refresh operator + maintainer",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Stop. If in read-only gate, fix concurrency/read model before retrying evidence.",
		retryAllowed: true,
		nextAction: "Fix or reduce read concurrency, then regenerate fresh read-only evidence.",
	},
	prisma_transaction_not_found: {
		severity: "CRITICAL",
		owner: "Direct-refresh operator + maintainer",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Stop, verify no partial write, require bugfix/review before retry.",
		retryAllowed: false,
		nextAction: "Open bugfix issue/PR, then regenerate evidence after merge.",
	},
	postwrite_fail: {
		severity: "CRITICAL",
		owner: "Direct-refresh operator + maintainer",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Stop, preserve artifacts, verify rollback plan, open bugfix issue.",
		retryAllowed: false,
		nextAction: "Preserve artifacts and open a bugfix/repair issue.",
	},
	no_create_invariant_violation: {
		severity: "CRITICAL",
		owner: "Maintainer",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Stop all direct-refresh writes until bugfix and fresh review.",
		retryAllowed: false,
		nextAction: "Stop related writes and fix no-create invariant before retry.",
	},
	no_partial_verification_fail: {
		severity: "CRITICAL",
		owner: "Maintainer",
		channel: "#direct-refresh-alerts (placeholder)",
		requiredResponse:
			"Do not regenerate prewrite or retry. Escalate to incident fix.",
		retryAllowed: false,
		nextAction: "Handle incident; do not retry.",
	},
	missing_postwrite_artifact: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse:
			"Operation is incomplete; do not close issue or start another write.",
		retryAllowed: false,
		nextAction: "Run or locate postwrite audit before closing operation.",
	},
	missing_baseline_artifact: {
		severity: "HIGH",
		owner: "Direct-refresh operator",
		channel: "Issue comment",
		requiredResponse:
			"Operation is incomplete; do not close issue or start another write.",
		retryAllowed: false,
		nextAction: "Run or locate freshness baseline before closing operation.",
	},
};

export function evaluateDirectRefreshAlerts({
	source = null,
	now = new Date(),
	maxPrewriteAgeMinutes = 15,
	paths = DEFAULT_PATHS,
	requirePostwrite = false,
	requireBaseline = false,
	artifacts = {},
}: {
	source?: string | null;
	now?: Date;
	maxPrewriteAgeMinutes?: number;
	paths?: Partial<DirectRefreshAlertArtifactPaths>;
	requirePostwrite?: boolean;
	requireBaseline?: boolean;
	artifacts?: DirectRefreshAlertArtifacts;
}): DirectRefreshAlertsReport {
	const normalizedPaths = { ...DEFAULT_PATHS, ...paths };
	const alerts = [
		...sourceHealthAlerts(artifacts.sourceHealth, normalizedPaths.sourceHealth),
		...baselineAlerts(
			artifacts.freshnessBaseline,
			normalizedPaths.freshnessBaseline,
		),
		...manifestAlerts(artifacts.manifest, normalizedPaths.manifest),
		...prewriteAlerts(
			artifacts.prewrite,
			normalizedPaths.prewrite,
			now,
			maxPrewriteAgeMinutes,
		),
		...postwriteAlerts(artifacts.postwrite, normalizedPaths.postwrite),
		...activeWriteAlerts(artifacts.activeWrite, normalizedPaths.activeWrite),
		...noPartialAlerts(artifacts.noPartial, normalizedPaths.noPartial),
		...errorArtifactAlerts(
			artifacts.errorArtifact,
			normalizedPaths.errorArtifact,
			normalizedPaths.noPartial,
		),
	];
	if (requirePostwrite && !artifacts.postwrite) {
		alerts.push(
			makeAlert({
				condition: "missing_postwrite_artifact",
				source,
				path: normalizedPaths.postwrite,
				message: "Postwrite audit artifact is required but missing.",
				evidence: { required: true },
			}),
		);
	}
	if (requireBaseline && !artifacts.freshnessBaseline) {
		alerts.push(
			makeAlert({
				condition: "missing_baseline_artifact",
				source,
				path: normalizedPaths.freshnessBaseline,
				message: "Freshness baseline artifact is required but missing.",
				evidence: { required: true },
			}),
		);
	}
	const sortedAlerts = alerts.map((alert, index) => ({ alert, index })).sort((a, b) => {
		const severityDelta = severityRank(a.alert.severity) - severityRank(b.alert.severity);
		if (severityDelta !== 0) return severityDelta;
		return a.index - b.index;
	}).map(({ alert }) => alert);
	const status = aggregateStatus(sortedAlerts);

	return {
		schemaVersion: 1,
		audit: "direct-refresh-alerts",
		status,
		generatedAt: now.toISOString(),
		basis: "supplied-artifacts",
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			source,
			maxPrewriteAgeMinutes,
			artifactPaths: normalizedPaths,
			requirePostwrite,
			requireBaseline,
		},
		summary: {
			alertCount: sortedAlerts.length,
			criticalCount: countSeverity(sortedAlerts, "CRITICAL"),
			highCount: countSeverity(sortedAlerts, "HIGH"),
			mediumCount: countSeverity(sortedAlerts, "MEDIUM"),
			lowCount: countSeverity(sortedAlerts, "LOW"),
			highestSeverity: sortedAlerts[0]?.severity ?? null,
			schedulerGate: "blocked",
		},
		alerts: sortedAlerts,
		inputs: buildInputs(artifacts, normalizedPaths),
	};
}

function sourceHealthAlerts(report: unknown, path: string | null) {
	const object = asRecord(report);
	if (!object) return [];
	const alerts: DirectRefreshAlert[] = [];
	const sources = Array.isArray(object.sources) ? object.sources : [];
	for (const source of sources) {
		const sourceObject = asRecord(source);
		if (!sourceObject) continue;
		const status = sourceObject.status;
		if (status !== "FAIL" && status !== "WARN") continue;
		const slug = stringOrNull(sourceObject.slug);
		alerts.push(
			makeAlert({
				condition: status === "FAIL" ? "source_health_fail" : "source_health_warn",
				source: slug,
				path,
				message: `Source health ${status}${slug ? ` for ${slug}` : ""}.`,
				evidence: {
					reasons: sourceObject.reasons,
					recommendation: sourceObject.recommendation,
					directRefreshSupport: sourceObject.directRefreshSupport,
				},
			}),
		);
	}
	if (alerts.length === 0 && (object.status === "FAIL" || object.status === "WARN")) {
		alerts.push(
			makeAlert({
				condition:
					object.status === "FAIL" ? "source_health_fail" : "source_health_warn",
				source: null,
				path,
				message: `Source health report status is ${object.status}.`,
				evidence: { summary: object.summary },
			}),
		);
	}
	return alerts;
}

function baselineAlerts(report: unknown, path: string | null) {
	const object = asRecord(report);
	if (!object) return [];
	if (object.status !== "FAIL" && object.status !== "WARN") return [];
	return [
		makeAlert({
			condition:
				object.status === "FAIL"
					? "freshness_baseline_fail"
					: "freshness_baseline_warn",
			source: null,
			path,
			message: `Freshness baseline status is ${object.status}.`,
			evidence: {
				summary: object.summary,
				denominatorDeltas: object.denominatorDeltas,
			},
		}),
	];
}

function manifestAlerts(report: unknown, path: string | null) {
	const object = asRecord(report);
	if (!object || object.status !== "FAIL") return [];
	return [
		makeAlert({
			condition: "manifest_fail",
			source: sourceFromReport(object),
			path,
			message: "Direct-refresh manifest failed closed.",
			evidence: { summary: object.summary },
		}),
	];
}

function prewriteAlerts(
	report: unknown,
	path: string | null,
	now: Date,
	maxPrewriteAgeMinutes: number,
) {
	const object = asRecord(report);
	if (!object) return [];
	const alerts: DirectRefreshAlert[] = [];
	if (object.status === "FAIL") {
		alerts.push(
			makeAlert({
				condition: "prewrite_fail",
				source: sourceFromReport(object),
				path,
				message: "Direct-refresh prewrite gate failed closed.",
				evidence: { summary: object.summary },
			}),
		);
	}
	const generatedAt = stringOrNull(object.generatedAt);
	if (generatedAt) {
		const ageMinutes = (now.getTime() - new Date(generatedAt).getTime()) / 60_000;
		if (Number.isFinite(ageMinutes) && ageMinutes > maxPrewriteAgeMinutes) {
			alerts.push(
				makeAlert({
					condition: "prewrite_stale",
					source: sourceFromReport(object),
					path,
					message: `Prewrite evidence is stale (${ageMinutes.toFixed(1)} minutes old).`,
					evidence: { generatedAt, ageMinutes: Number(ageMinutes.toFixed(2)), maxPrewriteAgeMinutes },
				}),
			);
		}
	}
	return alerts;
}

function postwriteAlerts(report: unknown, path: string | null) {
	const object = asRecord(report);
	if (!object) return [];
	const alerts: DirectRefreshAlert[] = [];
	if (object.status === "FAIL") {
		alerts.push(
			makeAlert({
				condition: "postwrite_fail",
				source: sourceFromReport(object),
				path,
				message: "Direct-refresh postwrite audit failed.",
				evidence: { summary: object.summary },
			}),
		);
	}
	const noCreate = asRecord(object.noCreate);
	if (noCreate && hasNoCreateViolation(noCreate)) {
		alerts.push(noCreateAlert(sourceFromReport(object), path, noCreate));
	}
	return alerts;
}

function activeWriteAlerts(report: unknown, path: string | null) {
	const object = asRecord(report);
	if (!object) return [];
	const noCreate = asRecord(object.noCreate);
	return noCreate && hasNoCreateViolation(noCreate)
		? [noCreateAlert(sourceFromReport(object), path, noCreate)]
		: [];
}

function noPartialAlerts(report: unknown, path: string | null) {
	const object = asRecord(report);
	if (!object) return [];
	const conclusion = object.conclusion ?? object.status;
	if (conclusion !== "FAIL") return [];
	return [
		makeAlert({
			condition: "no_partial_verification_fail",
			source: stringOrNull(object.source) ?? stringOrNull(asRecord(object.expected)?.source),
			path,
			message: "No-partial verification failed.",
			noPartialVerificationPath: path,
			evidence: {
				failedCommand: object.failedCommand,
				error: object.error,
				writeReportExists: object.writeReportExists,
				expected: object.expected,
				nextRequiredAction: object.nextRequiredAction,
			},
		}),
	];
}

function errorArtifactAlerts(
	report: unknown,
	path: string | null,
	noPartialPath: string | null,
) {
	const object = asRecord(report);
	if (!object) return [];
	const message = errorMessage(object);
	const source = stringOrNull(object.source) ?? stringOrNull(asRecord(object.expected)?.source);
	const stoppedBeforeWrite = booleanOrNull(object.stoppedBeforeWrite ?? object.stoppedBeforeTransaction);
	const conditions: DirectRefreshAlertCondition[] = [];
	if (/transaction not found|p2028/i.test(message)) conditions.push("prisma_transaction_not_found");
	else if (/timed out fetching a new connection|connection pool|pool exhaustion|p2024/i.test(message)) conditions.push("prisma_pool_exhaustion");
	else if (/timeout|timed out|transaction api error/i.test(message)) conditions.push("active_writer_timeout");
	if (/prewrite report is stale|maximum age is 15 minutes|stale prewrite/i.test(message)) conditions.push("prewrite_stale");
	if (/hash mismatch|row ids? mismatch|product eans? mismatch|sku ids? mismatch|confirmation.*mismatch|mismatch.*confirmation/i.test(message)) conditions.push("confirmation_mismatch");
	return uniqueSorted(conditions).map((condition) =>
		makeAlert({
			condition: condition as DirectRefreshAlertCondition,
			source,
			path,
			message: `Direct-refresh error matched ${condition}: ${message}`,
			stoppedBeforeWrite,
			noPartialVerificationPath: noPartialPath,
			evidence: {
				command: object.command ?? object.failedCommand,
				error: object.error,
				attemptedAt: object.attemptedAt,
				writeReportExists: object.writeReportExists,
				writeReportPath: object.writeReportPath,
			},
		}),
	);
}

function noCreateAlert(source: string | null, path: string | null, noCreate: Record<string, unknown>) {
	return makeAlert({
		condition: "no_create_invariant_violation",
		source,
		path,
		message: "No-create invariant delta is non-zero.",
		evidence: { noCreate },
	});
}

function makeAlert({
	condition,
	source,
	path,
	message,
	evidence,
	stoppedBeforeWrite = null,
	noPartialVerificationPath = null,
}: {
	condition: DirectRefreshAlertCondition;
	source: string | null;
	path: string | null;
	message: string;
	evidence: Record<string, unknown>;
	stoppedBeforeWrite?: boolean | null;
	noPartialVerificationPath?: string | null;
}): DirectRefreshAlert {
	const policy = POLICY[condition];
	return {
		id: [condition, source ?? "global", path ?? "no-artifact"].join(":"),
		severity: policy.severity,
		condition,
		source,
		artifactPaths: path ? [path] : [],
		owner: policy.owner,
		channel: policy.channel,
		message,
		requiredResponse: policy.requiredResponse,
		stoppedBeforeWrite,
		noPartialVerificationPath,
		retryAllowed: policy.retryAllowed,
		nextAction: policy.nextAction,
		evidence,
	};
}

function buildInputs(
	artifacts: DirectRefreshAlertArtifacts,
	paths: DirectRefreshAlertArtifactPaths,
): DirectRefreshAlertsReport["inputs"] {
	const keys: Array<keyof DirectRefreshAlertArtifacts> = [
		"sourceHealth",
		"freshnessBaseline",
		"manifest",
		"prewrite",
		"postwrite",
		"noPartial",
		"errorArtifact",
		"activeWrite",
	];
	return keys.map((kind) => {
		const object = asRecord(artifacts[kind]);
		return {
			kind,
			path: paths[kind],
			present: Boolean(artifacts[kind]),
			audit: stringOrNull(object?.audit ?? object?.report ?? object?.artifact),
			status: stringOrNull(object?.status ?? object?.conclusion),
			generatedAt: stringOrNull(object?.generatedAt ?? object?.attemptedAt),
		};
	});
}

function aggregateStatus(alerts: DirectRefreshAlert[]): DirectRefreshAlertsStatus {
	if (alerts.some((alert) => alert.severity === "CRITICAL" || alert.severity === "HIGH")) return "FAIL";
	if (alerts.length > 0) return "WARN";
	return "PASS";
}

function countSeverity(alerts: DirectRefreshAlert[], severity: DirectRefreshAlertSeverity) {
	return alerts.filter((alert) => alert.severity === severity).length;
}

function severityRank(severity: DirectRefreshAlertSeverity) {
	return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[severity];
}

function sourceFromReport(report: Record<string, unknown>) {
	return stringOrNull(asRecord(report.source)?.slug ?? report.sourceSlug ?? asRecord(report.writeReport)?.source);
}

function hasNoCreateViolation(noCreate: Record<string, unknown> | null) {
	if (!noCreate) return false;
	return Number(noCreate.productDelta ?? 0) !== 0 || Number(noCreate.supermarketProductDelta ?? 0) !== 0;
}

function errorMessage(object: Record<string, unknown>) {
	const error = object.error;
	if (typeof error === "string") return error;
	const errorObject = asRecord(error);
	return [errorObject?.name, errorObject?.code, errorObject?.message, object.message]
		.filter((value): value is string => typeof value === "string")
		.join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringOrNull(value: unknown) {
	return typeof value === "string" && value.trim() ? value : null;
}

function booleanOrNull(value: unknown) {
	return typeof value === "boolean" ? value : null;
}
