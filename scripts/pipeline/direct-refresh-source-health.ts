import { uniqueSorted } from "./audit-utils";

export type DirectRefreshSourceHealthStatus = "PASS" | "WARN" | "FAIL";
export type DirectRefreshSupport = "writer-supported" | "audit-only-no-writer";

export const WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES = [
	"carrefour",
	"vea",
	"disco",
	"jumbo",
	"mas",
] as const;
export const AUDIT_ONLY_DIRECT_REFRESH_SOURCES = ["dia"] as const;
export const DIRECT_REFRESH_HEALTH_SOURCES = [
	...WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
	...AUDIT_ONLY_DIRECT_REFRESH_SOURCES,
] as const;

export type DirectRefreshHealthSourceSlug =
	(typeof DIRECT_REFRESH_HEALTH_SOURCES)[number];

type SourceConfig = {
	displayName: string;
	expectedHost: string;
};

const SOURCE_CONFIGS: Record<DirectRefreshHealthSourceSlug, SourceConfig> = {
	carrefour: { displayName: "Carrefour", expectedHost: "carrefour.com.ar" },
	vea: { displayName: "Vea", expectedHost: "vea.com.ar" },
	disco: { displayName: "Disco", expectedHost: "disco.com.ar" },
	jumbo: { displayName: "Jumbo", expectedHost: "jumbo.com.ar" },
	mas: { displayName: "MAS", expectedHost: "masonline.com.ar" },
	dia: {
		displayName: "DIA",
		expectedHost: "diaonline.supermercadosdia.com.ar",
	},
};

const WRITE_BOUNDARY =
	"read-only direct-refresh source health audit; no production writes, no staging/ingestion runs, no scheduler/cron/workflow/all-source side effects" as const;

export type DirectRefreshSourceHealthSource = {
	id: number;
	slug: string;
	displayName: string | null;
	baseUrl: string | null;
	isActive: boolean;
	isVtex: boolean;
	freshnessSlaHours: number;
};

export type DirectRefreshSourceHealthRow = {
	sourceSlug: string;
	productEan: string | null;
	productName: string | null;
	price: number | null;
	isAvailable: boolean;
	lastCheckedAt: string | null;
};

export type DirectRefreshSourceHealthRepository = {
	listSources(
		sourceSlugs: DirectRefreshHealthSourceSlug[],
	): Promise<DirectRefreshSourceHealthSource[]>;
	listRows(
		sourceSlugs: DirectRefreshHealthSourceSlug[],
	): Promise<DirectRefreshSourceHealthRow[]>;
	getStagingState?(): Promise<{
		runningRuns: number;
		pendingStagingRows: number;
	}>;
};

type CapacitySource = {
	slug: string;
	status?: DirectRefreshSourceHealthStatus;
	classification?: string;
	candidateScan?: {
		viableRows?: number;
		blockedRows?: number;
	};
	capacity?: {
		recommendedBatchSize?: number;
		recommendedCandidateScanSize?: number;
	};
	blockers?: Array<{ reason: string; count: number }>;
};

export type DirectRefreshSourceHealthCapacityReport = {
	sources: CapacitySource[];
};

export type DirectRefreshSourceHealthReport = {
	schemaVersion: 1;
	audit: "direct-refresh-source-health";
	status: DirectRefreshSourceHealthStatus;
	generatedAt: string;
	basis: "production";
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	filters: {
		sources: DirectRefreshHealthSourceSlug[];
		freshnessTargetPercent: number;
		failUnderFreshnessPercent: number | null;
		capacityReportPath: string | null;
	};
	summary: {
		sourceCount: number;
		writerSupportedSources: number;
		auditOnlyNoWriterSources: number;
		passSources: number;
		warnSources: number;
		failSources: number;
		writerSupportedStatus: DirectRefreshSourceHealthStatus;
		schedulerGate: "blocked";
	};
	sources: DirectRefreshSourceHealthSourceReport[];
	stagingState: {
		runningRuns: number;
		pendingStagingRows: number;
		status: DirectRefreshSourceHealthStatus;
	};
};

export type DirectRefreshSourceHealthSourceReport = {
	slug: DirectRefreshHealthSourceSlug;
	displayName: string;
	directRefreshSupport: DirectRefreshSupport;
	status: DirectRefreshSourceHealthStatus;
	reasons: string[];
	recommendation: string;
	sourceRecord: {
		exists: boolean;
		isActive: boolean | null;
		isVtex: boolean | null;
		baseUrl: string | null;
		baseUrlValid: boolean;
		baseUrlHost: string | null;
		expectedHost: string;
		expectedHostMatch: boolean;
	};
	freshness: {
		status: DirectRefreshSourceHealthStatus;
		freshnessPercent: number;
		totalRows: number;
		publicRankableRows: number;
		freshRows: number;
		staleRows: number;
		unknownRows: number;
		oldestCheckAt: string | null;
		latestCheckAt: string | null;
	};
	capacity: {
		source: "input-report" | "not-provided";
		status: DirectRefreshSourceHealthStatus;
		classification: string | null;
		viableRows: number | null;
		blockedRows: number | null;
		recommendedBatchSize: number | null;
		recommendedCandidateScanSize: number | null;
		blockers: Array<{ reason: string; count: number }>;
	};
};

export function directRefreshSupportForSource(
	slug: DirectRefreshHealthSourceSlug,
): DirectRefreshSupport {
	return WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES.includes(
		slug as (typeof WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES)[number],
	)
		? "writer-supported"
		: "audit-only-no-writer";
}

export async function buildDirectRefreshSourceHealthReport({
	repository,
	sources = [...DIRECT_REFRESH_HEALTH_SOURCES],
	capacityReport = null,
	capacityReportPath = null,
	freshnessTargetPercent = 95,
	failUnderFreshnessPercent = null,
	now = new Date(),
}: {
	repository: DirectRefreshSourceHealthRepository;
	sources?: DirectRefreshHealthSourceSlug[];
	capacityReport?: DirectRefreshSourceHealthCapacityReport | null;
	capacityReportPath?: string | null;
	freshnessTargetPercent?: number;
	failUnderFreshnessPercent?: number | null;
	now?: Date;
}): Promise<DirectRefreshSourceHealthReport> {
	const sourceRecords = await repository.listSources(sources);
	const rows = await repository.listRows(sources);
	const stagingState = repository.getStagingState
		? await repository.getStagingState()
		: { runningRuns: 0, pendingStagingRows: 0 };
	const capacityBySlug = new Map(
		(capacityReport?.sources ?? []).map((source) => [source.slug, source]),
	);
	const sourceReports = sources.map((slug) =>
		buildSourceReport({
			slug,
			sourceRecord:
				sourceRecords.find((source) => source.slug === slug) ?? null,
			rows: rows.filter((row) => row.sourceSlug === slug),
			capacitySource: capacityBySlug.get(slug) ?? null,
			capacityReportProvided: Boolean(capacityReport),
			freshnessTargetPercent,
			failUnderFreshnessPercent,
			now,
		}),
	);
	const writerReports = sourceReports.filter(
		(source) => source.directRefreshSupport === "writer-supported",
	);
	const writerSupportedStatus = aggregateStatus(
		writerReports.map((s) => s.status),
	);
	const stagingStatus: DirectRefreshSourceHealthStatus =
		stagingState.runningRuns > 0 || stagingState.pendingStagingRows > 0
			? "WARN"
			: "PASS";
	const status = aggregateStatus([
		...sourceReports.map((source) => source.status),
		stagingStatus,
	]);

	return {
		schemaVersion: 1,
		audit: "direct-refresh-source-health",
		status,
		generatedAt: now.toISOString(),
		basis: "production",
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			sources,
			freshnessTargetPercent,
			failUnderFreshnessPercent,
			capacityReportPath,
		},
		summary: {
			sourceCount: sourceReports.length,
			writerSupportedSources: writerReports.length,
			auditOnlyNoWriterSources: sourceReports.length - writerReports.length,
			passSources: sourceReports.filter((source) => source.status === "PASS")
				.length,
			warnSources: sourceReports.filter((source) => source.status === "WARN")
				.length,
			failSources: sourceReports.filter((source) => source.status === "FAIL")
				.length,
			writerSupportedStatus,
			schedulerGate: "blocked",
		},
		sources: sourceReports,
		stagingState: { ...stagingState, status: stagingStatus },
	};
}

function buildSourceReport({
	slug,
	sourceRecord,
	rows,
	capacitySource,
	capacityReportProvided,
	freshnessTargetPercent,
	failUnderFreshnessPercent,
	now,
}: {
	slug: DirectRefreshHealthSourceSlug;
	sourceRecord: DirectRefreshSourceHealthSource | null;
	rows: DirectRefreshSourceHealthRow[];
	capacitySource: CapacitySource | null;
	capacityReportProvided: boolean;
	freshnessTargetPercent: number;
	failUnderFreshnessPercent: number | null;
	now: Date;
}): DirectRefreshSourceHealthSourceReport {
	const config = SOURCE_CONFIGS[slug];
	const directRefreshSupport = directRefreshSupportForSource(slug);
	const sourceRecordReport = buildSourceRecordReport(sourceRecord, config);
	const freshness = buildFreshnessReport({
		rows,
		slaHours: sourceRecord?.freshnessSlaHours ?? 12,
		freshnessTargetPercent,
		failUnderFreshnessPercent,
		now,
	});
	const capacity = buildCapacityReport(capacitySource, capacityReportProvided);
	const reasons = sourceReasons({
		slug,
		directRefreshSupport,
		sourceRecord: sourceRecordReport,
		freshness,
		capacity,
	});
	const status = reasons.some((reason) => reason.startsWith("FAIL:"))
		? "FAIL"
		: reasons.length > 0
			? "WARN"
			: "PASS";

	return {
		slug,
		displayName: sourceRecord?.displayName ?? config.displayName,
		directRefreshSupport,
		status,
		reasons: reasons.map((reason) => reason.replace(/^(WARN|FAIL): /, "")),
		recommendation: recommendation(status, directRefreshSupport, slug),
		sourceRecord: sourceRecordReport,
		freshness,
		capacity,
	};
}

function buildSourceRecordReport(
	sourceRecord: DirectRefreshSourceHealthSource | null,
	config: SourceConfig,
) {
	const baseUrlHost = host(sourceRecord?.baseUrl ?? null);
	return {
		exists: Boolean(sourceRecord),
		isActive: sourceRecord?.isActive ?? null,
		isVtex: sourceRecord?.isVtex ?? null,
		baseUrl: sourceRecord?.baseUrl ?? null,
		baseUrlValid: Boolean(baseUrlHost),
		baseUrlHost,
		expectedHost: config.expectedHost,
		expectedHostMatch: baseUrlHost === config.expectedHost,
	};
}

function buildFreshnessReport({
	rows,
	slaHours,
	freshnessTargetPercent,
	failUnderFreshnessPercent,
	now,
}: {
	rows: DirectRefreshSourceHealthRow[];
	slaHours: number;
	freshnessTargetPercent: number;
	failUnderFreshnessPercent: number | null;
	now: Date;
}): DirectRefreshSourceHealthSourceReport["freshness"] {
	const publicRankableRows = rows.filter(isPublicRankable);
	const freshCutoff = now.getTime() - slaHours * 60 * 60 * 1000;
	const freshRows = publicRankableRows.filter((row) => {
		if (!row.lastCheckedAt) return false;
		return new Date(row.lastCheckedAt).getTime() >= freshCutoff;
	}).length;
	const unknownRows = publicRankableRows.filter(
		(row) => !row.lastCheckedAt,
	).length;
	const freshnessPercent = percent(freshRows, publicRankableRows.length);
	const status =
		publicRankableRows.length === 0 ||
		(failUnderFreshnessPercent !== null &&
			freshnessPercent < failUnderFreshnessPercent)
			? "FAIL"
			: freshnessPercent >= freshnessTargetPercent
				? "PASS"
				: "WARN";
	const checkedDates = publicRankableRows
		.map((row) => row.lastCheckedAt)
		.filter((value): value is string => Boolean(value))
		.map((value) => new Date(value).getTime())
		.filter(Number.isFinite)
		.sort((left, right) => left - right);
	return {
		status,
		freshnessPercent,
		totalRows: rows.length,
		publicRankableRows: publicRankableRows.length,
		freshRows,
		staleRows: publicRankableRows.length - freshRows - unknownRows,
		unknownRows,
		oldestCheckAt: checkedDates[0]
			? new Date(checkedDates[0]).toISOString()
			: null,
		latestCheckAt: checkedDates.at(-1)
			? new Date(checkedDates.at(-1) ?? 0).toISOString()
			: null,
	};
}

function buildCapacityReport(
	capacitySource: CapacitySource | null,
	capacityReportProvided: boolean,
): DirectRefreshSourceHealthSourceReport["capacity"] {
	return {
		source: capacitySource ? "input-report" : "not-provided",
		status:
			capacitySource?.status ?? (capacityReportProvided ? "WARN" : "WARN"),
		classification: capacitySource?.classification ?? null,
		viableRows: capacitySource?.candidateScan?.viableRows ?? null,
		blockedRows: capacitySource?.candidateScan?.blockedRows ?? null,
		recommendedBatchSize:
			capacitySource?.capacity?.recommendedBatchSize ?? null,
		recommendedCandidateScanSize:
			capacitySource?.capacity?.recommendedCandidateScanSize ?? null,
		blockers: capacitySource?.blockers ?? [],
	};
}

function sourceReasons({
	slug,
	directRefreshSupport,
	sourceRecord,
	freshness,
	capacity,
}: {
	slug: DirectRefreshHealthSourceSlug;
	directRefreshSupport: DirectRefreshSupport;
	sourceRecord: DirectRefreshSourceHealthSourceReport["sourceRecord"];
	freshness: DirectRefreshSourceHealthSourceReport["freshness"];
	capacity: DirectRefreshSourceHealthSourceReport["capacity"];
}) {
	const reasons: string[] = [];
	if (!sourceRecord.exists) reasons.push("FAIL: source record is missing");
	if (sourceRecord.exists && sourceRecord.isActive !== true)
		reasons.push("FAIL: source is inactive");
	if (sourceRecord.exists && sourceRecord.isVtex !== true)
		reasons.push("FAIL: source is not VTEX");
	if (!sourceRecord.baseUrlValid)
		reasons.push("FAIL: source base URL is invalid");
	if (sourceRecord.baseUrlValid && !sourceRecord.expectedHostMatch)
		reasons.push(
			`FAIL: source base URL host ${sourceRecord.baseUrlHost} does not match expected ${sourceRecord.expectedHost}`,
		);
	if (directRefreshSupport === "audit-only-no-writer")
		reasons.push("WARN: source is audit-only/no-writer");
	if (freshness.status === "FAIL")
		reasons.push("FAIL: freshness failed threshold");
	if (freshness.status === "WARN") reasons.push("WARN: freshness below target");
	if (capacity.source === "not-provided")
		reasons.push("WARN: capacity/readiness report not provided");
	if (capacity.status === "FAIL") reasons.push("FAIL: capacity status is FAIL");
	if (capacity.status === "WARN") reasons.push("WARN: capacity status is WARN");
	if (capacity.classification === "mixed")
		reasons.push("WARN: capacity classification is mixed");
	if ((capacity.blockedRows ?? 0) > 0)
		reasons.push(`WARN: capacity has ${capacity.blockedRows} blocked rows`);
	if (slug === "mas" && (capacity.recommendedCandidateScanSize ?? 0) >= 100)
		reasons.push(
			"WARN: MAS requires rapid-confirmation protocol for large scans",
		);
	return uniqueSorted(reasons);
}

function recommendation(
	status: DirectRefreshSourceHealthStatus,
	directRefreshSupport: DirectRefreshSupport,
	slug: DirectRefreshHealthSourceSlug,
) {
	if (directRefreshSupport === "audit-only-no-writer")
		return "Keep audit-only; do not run active direct-refresh writes.";
	if (status === "PASS")
		return "Eligible for future controlled manual operation only; scheduler remains blocked.";
	if (slug === "mas")
		return "Resolve WARN/FAIL reasons and use rapid-confirmation protocol for large MAS batches.";
	return "Resolve WARN/FAIL reasons before controlled operation; scheduler remains blocked.";
}

function isPublicRankable(row: DirectRefreshSourceHealthRow) {
	return Boolean(
		row.isAvailable &&
			row.productEan?.trim() &&
			row.productName?.trim() &&
			row.price !== null &&
			row.price > 0,
	);
}

function aggregateStatus(statuses: DirectRefreshSourceHealthStatus[]) {
	if (statuses.includes("FAIL")) return "FAIL";
	if (statuses.includes("WARN")) return "WARN";
	return "PASS";
}

function percent(part: number, total: number) {
	return total === 0 ? 0 : Number(((part / total) * 100).toFixed(2));
}

function host(url: string | null) {
	if (!url) return null;
	try {
		return new URL(url).host.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}
