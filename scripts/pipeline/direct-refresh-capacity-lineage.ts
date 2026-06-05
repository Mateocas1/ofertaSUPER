import { createHash } from "node:crypto";

import type { DirectRefreshCapacityReport } from "./direct-refresh-capacity";

type CapacityEvidenceStatus = "PASS" | "WARN" | "FAIL";
type CapacitySourceClassification = "viable" | "mixed" | "excluded";
type CapacityDirectRefreshSupport = "writer-supported" | "audit-only-no-writer";

export type DirectRefreshCapacityEvidenceInput = {
	report: unknown;
	path?: string | null;
	raw?: string | null;
	expectedIssueNumber?: number | null;
};

export type DirectRefreshCapacityEvidenceLineage = {
	parentArtifacts: [DirectRefreshCapacityEvidenceArtifact];
};

export type DirectRefreshCapacityEvidenceArtifact = {
	kind: "capacity-report";
	path: string | null;
	present: boolean;
	hash: string | null;
	audit: string | null;
	status: string | null;
	generatedAt: string | null;
	issue: number | null;
	basis: string | null;
	dryRun: boolean | null;
	writeBoundary: string | null;
	targetBatchSize: number | null;
	expectedIssueNumber: number | null;
	filtersSources: string[];
	reportSourceCount: number | null;
	summarySourceCount: number | null;
	source: {
		slug: string;
		status: CapacityEvidenceStatus | string;
		classification: CapacitySourceClassification | string;
		directRefreshSupport: CapacityDirectRefreshSupport | string;
		candidateScan: {
			requestedRows: number | null;
			evaluatedRows: number | null;
			viableRows: number | null;
			blockedRows: number | null;
		};
		capacity: {
			recommendedBatchSize: number | null;
			recommendedCandidateScanSize: number | null;
		};
	} | null;
	guardReasons: string[];
};

export type DirectRefreshCapacityEvidenceValidation = {
	lineage: DirectRefreshCapacityEvidenceLineage;
	failClosedReasons: string[];
};

export function getDirectRefreshCapacityPassRowIds(
	evidence: DirectRefreshCapacityEvidenceInput | null | undefined,
	sourceSlug: string,
): Set<string> | null {
	if (!evidence) return null;
	const report = evidence.report;
	if (!isRecord(report)) return new Set();
	const sources = Array.isArray(report.sources) ? report.sources : [];
	const matchingSources = sources.filter(
		(source) => source?.slug === sourceSlug,
	);
	if (matchingSources.length !== 1) return new Set();
	const source = matchingSources[0];
	const rows =
		isRecord(source) && Array.isArray(source.rows) ? source.rows : [];
	return new Set(
		rows
			.filter(
				(row): row is { rowId: string; status: unknown } =>
					isRecord(row) &&
					typeof row.rowId === "string" &&
					row.status === "PASS",
			)
			.map((row) => row.rowId),
	);
}

const READ_ONLY_CAPACITY_AUDIT = "direct-refresh-operating-capacity";
const READ_ONLY_CAPACITY_WRITE_BOUNDARY =
	"read-only operating capacity audit; no production writes, no staging/ingestion runs, no scheduler/cron/workflow side effects";

export function validateDirectRefreshCapacityEvidence({
	evidence,
	sourceSlug,
	sampleSize,
	selectedRows,
}: {
	evidence?: DirectRefreshCapacityEvidenceInput | null;
	sourceSlug: string;
	sampleSize: number;
	selectedRows: Array<{ rowId: string }>;
}): DirectRefreshCapacityEvidenceValidation {
	const baseArtifact = buildBaseArtifact(evidence);
	if (!evidence) return finish(baseArtifact, []);

	const report = evidence.report;
	if (!isRecord(report)) {
		return finish(baseArtifact, ["capacity report is malformed"]);
	}

	const candidateArtifact = hydrateArtifactMetadata(baseArtifact, report);
	const reasons: string[] = [];
	const typedReport = report as Partial<DirectRefreshCapacityReport>;

	if (typedReport.schemaVersion !== 1) {
		reasons.push("capacity report schemaVersion must be 1");
	}
	if (typedReport.audit !== READ_ONLY_CAPACITY_AUDIT) {
		reasons.push(`capacity report audit must be ${READ_ONLY_CAPACITY_AUDIT}`);
	}
	if (typedReport.dryRun !== true) {
		reasons.push("capacity report must be dryRun true");
	}
	if (typedReport.basis !== "production") {
		reasons.push("capacity report basis must be production");
	}
	if (!isReadOnlyCapacityBoundary(typedReport.writeBoundary)) {
		reasons.push("capacity report write boundary must be read-only");
	}

	const filtersSources = Array.isArray(typedReport.filters?.sources)
		? typedReport.filters.sources.filter(
				(source): source is string => typeof source === "string",
			)
		: [];
	if (filtersSources.length !== 1 || filtersSources[0] !== sourceSlug) {
		reasons.push(
			`capacity report filters.sources must be exactly ${sourceSlug}`,
		);
	}
	if (typedReport.filters?.targetBatchSize !== sampleSize) {
		reasons.push(
			`capacity report targetBatchSize must equal requested sample size ${sampleSize}`,
		);
	}
	if (typeof evidence.expectedIssueNumber !== "number") {
		reasons.push("capacity evidence expected issue number is required");
	} else if (typedReport.issue !== evidence.expectedIssueNumber) {
		reasons.push(
			`capacity report issue must equal expected issue ${evidence.expectedIssueNumber}`,
		);
	}

	const reportSources = Array.isArray(typedReport.sources)
		? typedReport.sources
		: [];
	if (reportSources.length !== 1) {
		reasons.push("capacity report must be source-scoped to exactly one source");
	}
	if (typedReport.summary?.sourceCount !== 1) {
		reasons.push("capacity report summary.sourceCount must be 1");
	}
	const matchingSources = reportSources.filter(
		(source) => source?.slug === sourceSlug,
	);
	if (matchingSources.length !== 1) {
		reasons.push(
			`capacity report must contain exactly one source entry for ${sourceSlug}`,
		);
	}
	const source = matchingSources[0];
	const artifact = source
		? hydrateArtifactSource(candidateArtifact, source)
		: candidateArtifact;
	if (source) {
		if (source.directRefreshSupport !== "writer-supported") {
			reasons.push("capacity source must be writer-supported");
		}
		if (source.classification === "excluded") {
			reasons.push("capacity source classification must not be excluded");
		}
		if (source.status === "FAIL") {
			reasons.push("capacity source status must not be FAIL");
		}
		if ((source.candidateScan?.viableRows ?? -1) < sampleSize) {
			reasons.push(
				`capacity source viable rows must be >= requested sample size ${sampleSize}`,
			);
		}
		if ((source.capacity?.recommendedBatchSize ?? -1) < sampleSize) {
			reasons.push(
				`capacity source recommended batch size must be >= requested sample size ${sampleSize}`,
			);
		}

		const capacityRows = new Map(
			Array.isArray(source.rows)
				? source.rows
						.filter((row) => typeof row?.rowId === "string")
						.map((row) => [row.rowId, row])
				: [],
		);
		for (const selectedRow of selectedRows) {
			const capacityRow = capacityRows.get(selectedRow.rowId);
			if (!capacityRow) {
				reasons.push(
					`selected row ${selectedRow.rowId} is missing from capacity report evidence`,
				);
			} else if (capacityRow.status !== "PASS") {
				reasons.push(
					`selected row ${selectedRow.rowId} did not PASS capacity evidence`,
				);
			}
		}
	}

	return finish(artifact, uniqueSorted(reasons));
}

function buildBaseArtifact(
	evidence?: DirectRefreshCapacityEvidenceInput | null,
): DirectRefreshCapacityEvidenceArtifact {
	return {
		kind: "capacity-report",
		path: evidence?.path ?? null,
		present: Boolean(evidence),
		hash: evidence?.raw ? sha256(evidence.raw) : null,
		audit: null,
		status: null,
		generatedAt: null,
		issue: null,
		basis: null,
		dryRun: null,
		writeBoundary: null,
		targetBatchSize: null,
		expectedIssueNumber: evidence?.expectedIssueNumber ?? null,
		filtersSources: [],
		reportSourceCount: null,
		summarySourceCount: null,
		source: null,
		guardReasons: [],
	};
}

function hydrateArtifactMetadata(
	artifact: DirectRefreshCapacityEvidenceArtifact,
	report: Record<string, unknown>,
): DirectRefreshCapacityEvidenceArtifact {
	const filters = isRecord(report.filters) ? report.filters : null;
	const summary = isRecord(report.summary) ? report.summary : null;
	return {
		...artifact,
		audit: stringOrNull(report.audit),
		status: stringOrNull(report.status),
		generatedAt: stringOrNull(report.generatedAt),
		issue: numberOrNull(report.issue),
		basis: stringOrNull(report.basis),
		dryRun: typeof report.dryRun === "boolean" ? report.dryRun : null,
		writeBoundary: stringOrNull(report.writeBoundary),
		targetBatchSize: numberOrNull(filters?.targetBatchSize),
		reportSourceCount: Array.isArray(report.sources)
			? report.sources.length
			: null,
		summarySourceCount: numberOrNull(summary?.sourceCount),
		filtersSources: Array.isArray(filters?.sources)
			? filters.sources.filter(
					(source): source is string => typeof source === "string",
				)
			: [],
	};
}

function hydrateArtifactSource(
	artifact: DirectRefreshCapacityEvidenceArtifact,
	source: NonNullable<Partial<DirectRefreshCapacityReport>["sources"]>[number],
): DirectRefreshCapacityEvidenceArtifact {
	return {
		...artifact,
		source: {
			slug: source.slug,
			status: source.status,
			classification: source.classification,
			directRefreshSupport: source.directRefreshSupport,
			candidateScan: {
				requestedRows: numberOrNull(source.candidateScan?.requestedRows),
				evaluatedRows: numberOrNull(source.candidateScan?.evaluatedRows),
				viableRows: numberOrNull(source.candidateScan?.viableRows),
				blockedRows: numberOrNull(source.candidateScan?.blockedRows),
			},
			capacity: {
				recommendedBatchSize: numberOrNull(
					source.capacity?.recommendedBatchSize,
				),
				recommendedCandidateScanSize: numberOrNull(
					source.capacity?.recommendedCandidateScanSize,
				),
			},
		},
	};
}

function finish(
	artifact: DirectRefreshCapacityEvidenceArtifact,
	reasons: string[],
): DirectRefreshCapacityEvidenceValidation {
	const guardReasons = uniqueSorted(reasons);
	return {
		lineage: { parentArtifacts: [{ ...artifact, guardReasons }] },
		failClosedReasons: guardReasons,
	};
}

function isReadOnlyCapacityBoundary(value: unknown) {
	return value === READ_ONLY_CAPACITY_WRITE_BOUNDARY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringOrNull(value: unknown) {
	return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sha256(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}
