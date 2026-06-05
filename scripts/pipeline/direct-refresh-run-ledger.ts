import { createHash } from "node:crypto";

import { assertDirectRefreshAllowedBatchCount } from "./direct-refresh-batch-size";
import {
	AUDIT_ONLY_DIRECT_REFRESH_SOURCES,
	WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
} from "./direct-refresh-source-health";
import { uniqueSorted } from "./audit-utils";

export const DIRECT_REFRESH_RUN_LEDGER_STATUSES = [
	"PLANNED",
	"RUNNING",
	"STOPPED",
	"FAILED",
	"COMPLETED",
] as const;

export type DirectRefreshRunLedgerStatus =
	(typeof DIRECT_REFRESH_RUN_LEDGER_STATUSES)[number];
export type DirectRefreshRunLedgerSource =
	(typeof WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES)[number];

export type DirectRefreshRunLedgerIssue = {
	url: string;
	number: number;
	title: string;
	typeLabel: string;
	approvalLabel: string;
};

export type DirectRefreshRunLedgerLineage = {
	artifactRoot: string;
	source?: string | null;
	count?: number | null;
	plannerPath?: string | null;
	sourceHealthPath?: string | null;
	capacityPath?: string | null;
	operationsReportPath?: string | null;
	manifestPath?: string | null;
	prewritePath?: string | null;
	writeReportPath?: string | null;
	postwritePath?: string | null;
	baselinePath?: string | null;
	parentHashes?: Record<string, string>;
};

export type DirectRefreshRunLedgerScope = {
	source: string;
	count: number;
	attemptId: string;
	issue: DirectRefreshRunLedgerIssue;
	lineage: DirectRefreshRunLedgerLineage;
};

export type DirectRefreshRunLedgerEntry = DirectRefreshRunLedgerScope & {
	runKey: string;
	sourceLockKey: number;
	status: DirectRefreshRunLedgerStatus;
	plannedAt: string;
	startedAt?: string | null;
	finishedAt?: string | null;
	lastHeartbeatAt?: string | null;
	stopReason?: string | null;
	errorSummary?: string | null;
};

export class DirectRefreshRunLedgerValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DirectRefreshRunLedgerValidationError";
	}
}

export class DirectRefreshRunLedgerTransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DirectRefreshRunLedgerTransitionError";
	}
}

export class DirectRefreshSourceLockUnavailableError extends Error {
	constructor(source: string) {
		super(`direct-refresh source lock is unavailable for ${source}`);
		this.name = "DirectRefreshSourceLockUnavailableError";
	}
}

const TERMINAL_STATUSES: DirectRefreshRunLedgerStatus[] = [
	"STOPPED",
	"FAILED",
	"COMPLETED",
];
const ACTIVE_STATUSES: DirectRefreshRunLedgerStatus[] = ["PLANNED", "RUNNING"];
const LOCK_KEY_NAMESPACE = "ofertas-super:direct-refresh:source-lock";

export function directRefreshRunKey({
	source,
	count,
	attemptId,
}: Pick<DirectRefreshRunLedgerScope, "source" | "count" | "attemptId">) {
	return `${normalizeSource(source)}:count${count}:${attemptId.trim()}`;
}

export function directRefreshSourceLockKey(source: string) {
	const normalized = normalizeSource(source);
	const digest = createHash("sha256")
		.update(`${LOCK_KEY_NAMESPACE}:${normalized}`)
		.digest();
	const lockKey = digest.readUInt32BE(0) & 0x7fffffff;
	return lockKey === 0 ? 1 : lockKey;
}

export async function ensureDirectRefreshSourceAdvisoryLock(
	tx: {
		$queryRaw<T = unknown>(
			strings: TemplateStringsArray,
			...values: unknown[]
		): Promise<T>;
	},
	source: string,
) {
	const lockKey = directRefreshSourceLockKey(source);
	const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
		select pg_try_advisory_xact_lock(${lockKey}) as locked
	`;

	if (rows[0]?.locked !== true) {
		throw new DirectRefreshSourceLockUnavailableError(normalizeSource(source));
	}
}

export function validateDirectRefreshRunLedgerScope(
	scope: DirectRefreshRunLedgerScope,
) {
	const reasons: string[] = [];
	const source = normalizeSource(scope.source);
	if (!source) reasons.push("source is required");
	if (AUDIT_ONLY_DIRECT_REFRESH_SOURCES.includes(source as never)) {
		reasons.push(
			`${source} is audit-only/no-writer and cannot be a direct-refresh run scope`,
		);
	} else if (
		!WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.includes(source as never)
	) {
		reasons.push(
			`source must be one of ${WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.join(", ")}`,
		);
	}
	try {
		assertDirectRefreshAllowedBatchCount(
			scope.count,
			"direct-refresh run ledger count",
		);
	} catch (error) {
		reasons.push(error instanceof Error ? error.message : String(error));
	}
	if (!scope.attemptId.trim()) reasons.push("attempt ID is required");
	if (!scope.lineage.artifactRoot.trim())
		reasons.push("artifact root is required");
	if (
		scope.lineage.source !== undefined &&
		scope.lineage.source !== null &&
		normalizeSource(scope.lineage.source) !== source
	) {
		reasons.push("lineage source must match run source");
	}
	if (
		scope.lineage.count !== undefined &&
		scope.lineage.count !== null &&
		scope.lineage.count !== scope.count
	) {
		reasons.push("lineage count must match run count");
	}
	for (const [key, value] of Object.entries(scope.lineage)) {
		if (typeof value === "string" && !value.trim()) {
			reasons.push(`${key} must not be blank when supplied`);
		}
	}
	reasons.push(...validateIssue(scope.issue));
	return uniqueSorted(reasons);
}

export function assertValidDirectRefreshRunLedgerScope(
	scope: DirectRefreshRunLedgerScope,
) {
	const reasons = validateDirectRefreshRunLedgerScope(scope);
	if (reasons.length > 0) {
		throw new DirectRefreshRunLedgerValidationError(reasons.join("; "));
	}
}

export function createPlannedDirectRefreshRunLedgerEntry({
	scope,
	now = new Date(),
}: {
	scope: DirectRefreshRunLedgerScope;
	now?: Date;
}): DirectRefreshRunLedgerEntry {
	assertValidDirectRefreshRunLedgerScope(scope);
	return {
		...scope,
		source: normalizeSource(scope.source) as DirectRefreshRunLedgerSource,
		count: assertDirectRefreshAllowedBatchCount(scope.count),
		runKey: directRefreshRunKey(scope),
		sourceLockKey: directRefreshSourceLockKey(scope.source),
		status: "PLANNED",
		plannedAt: now.toISOString(),
		startedAt: null,
		finishedAt: null,
		lastHeartbeatAt: null,
		stopReason: null,
		errorSummary: null,
	};
}

export function transitionDirectRefreshRunStatus({
	from,
	to,
}: {
	from: DirectRefreshRunLedgerStatus;
	to: DirectRefreshRunLedgerStatus;
}) {
	if (TERMINAL_STATUSES.includes(from)) {
		throw new DirectRefreshRunLedgerTransitionError(
			`cannot transition terminal direct-refresh run status ${from}`,
		);
	}
	const allowed = allowedNextStatuses(from);
	if (!allowed.includes(to)) {
		throw new DirectRefreshRunLedgerTransitionError(
			`cannot transition direct-refresh run status from ${from} to ${to}`,
		);
	}
	return to;
}

export function findActiveDirectRefreshRunConflict(
	entries: Array<
		Pick<
			DirectRefreshRunLedgerEntry,
			"source" | "status" | "runKey" | "attemptId"
		>
	>,
	source: string,
) {
	const normalized = normalizeSource(source);
	return (
		entries.find(
			(entry) =>
				normalizeSource(entry.source) === normalized &&
				ACTIVE_STATUSES.includes(entry.status),
		) ?? null
	);
}

export function isDirectRefreshRunTerminal(
	status: DirectRefreshRunLedgerStatus,
) {
	return TERMINAL_STATUSES.includes(status);
}

export function activeDirectRefreshRunStatuses() {
	return [...ACTIVE_STATUSES];
}

export function terminalDirectRefreshRunStatuses() {
	return [...TERMINAL_STATUSES];
}

function allowedNextStatuses(
	status: DirectRefreshRunLedgerStatus,
): DirectRefreshRunLedgerStatus[] {
	if (status === "PLANNED") return ["RUNNING", "STOPPED", "FAILED"];
	if (status === "RUNNING") return ["COMPLETED", "STOPPED", "FAILED"];
	return [];
}

function validateIssue(issue: DirectRefreshRunLedgerIssue) {
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

function normalizeSource(source: string) {
	return source.trim().toLowerCase();
}
