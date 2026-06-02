import type { ActiveWriteReport } from "./direct-refresh-active-write";
import type {
	DirectRefreshPrewriteProductSnapshot,
	DirectRefreshPrewritePriceHistorySnapshot,
	DirectRefreshPrewriteRow,
} from "./direct-refresh-prewrite-gate";

type AuditStatus = "PASS" | "FAIL";
type RowStatus = "PASS" | "FAIL";
type Counts = ActiveWriteReport["noCreate"]["after"];
export type DirectRefreshPostwriteSource = "carrefour" | "vea";

type SourceConfig = {
	source: DirectRefreshPostwriteSource;
	displayName: string;
	issue: 45 | 54;
	umbrellaIssue?: 44;
	expectedHost: "carrefour.com.ar" | "vea.com.ar";
	activeWriteReport:
		| "carrefour-direct-refresh-active-write"
		| "vea-direct-refresh-active-write";
	postwriteAudit:
		| "carrefour-direct-refresh-postwrite-audit"
		| "vea-direct-refresh-postwrite-audit";
};

const SOURCE_CONFIGS = {
	carrefour: {
		source: "carrefour",
		displayName: "Carrefour",
		issue: 45,
		umbrellaIssue: 44,
		expectedHost: "carrefour.com.ar",
		activeWriteReport: "carrefour-direct-refresh-active-write",
		postwriteAudit: "carrefour-direct-refresh-postwrite-audit",
	},
	vea: {
		source: "vea",
		displayName: "Vea",
		issue: 54,
		umbrellaIssue: undefined,
		expectedHost: "vea.com.ar",
		activeWriteReport: "vea-direct-refresh-active-write",
		postwriteAudit: "vea-direct-refresh-postwrite-audit",
	},
} as const satisfies Record<DirectRefreshPostwriteSource, SourceConfig>;

type CurrentRow = {
	rowId: string;
	productEan: string;
	skuId: string | null;
	product: DirectRefreshPrewriteProductSnapshot | null;
	supermarketProduct: DirectRefreshPrewriteRow["currentDb"]["supermarketProduct"];
};

type CurrentPriceHistory = DirectRefreshPrewritePriceHistorySnapshot;

export type DirectRefreshPostwriteRepository = {
	readNoCreateCounts(): Promise<Counts>;
	readSelectedRowsByExactIdentity(
		rows: Array<{ rowId: string; productEan: string; skuId: string }>,
	): Promise<CurrentRow[]>;
	readPriceHistoryRowsAboveId(
		maxId: number | null,
		supermarketProductIds: number[],
	): Promise<CurrentPriceHistory[]>;
};

export type DirectRefreshPostwriteAuditRow = {
	rowId: string;
	productEan: string;
	skuId: string;
	status: RowStatus;
	reasons: string[];
	insertedPriceHistoryId: number | null;
};

export type DirectRefreshPostwriteAuditReport = {
	schemaVersion: 1;
	audit:
		| "carrefour-direct-refresh-postwrite-audit"
		| "vea-direct-refresh-postwrite-audit";
	status: AuditStatus;
	basis: "production";
	generatedAt: string;
	writeBoundary: "read-only post-write audit; no production writes, no active refresh/reconcile, no staging/ingestion runs, no scheduler/cron/workflow side effects";
	writeReport: {
		issue: 45 | 54;
		umbrellaIssue?: 44;
		source: DirectRefreshPostwriteSource;
		count: 10;
		prewriteReportHash: string;
		startedAt: string;
		committedAt: string;
	};
	summary: {
		passRows: number;
		failRows: number;
		failClosedReasons: string[];
		priceHistoryRowsExpected: number;
		priceHistoryRowsFound: number;
	};
	noCreate: {
		expected: Counts;
		actual: Counts;
		productDelta: number;
		supermarketProductDelta: number;
	};
	rows: DirectRefreshPostwriteAuditRow[];
};

const WRITE_BOUNDARY =
	"read-only post-write audit; no production writes, no active refresh/reconcile, no staging/ingestion runs, no scheduler/cron/workflow side effects" as const;

export async function buildDirectRefreshPostwriteAudit({
	source = "carrefour",
	repository,
	writeReport,
	now = new Date(),
}: {
	source?: DirectRefreshPostwriteSource;
	repository: DirectRefreshPostwriteRepository;
	writeReport: ActiveWriteReport;
	now?: Date;
}): Promise<DirectRefreshPostwriteAuditReport> {
	const config = SOURCE_CONFIGS[source];
	const reportReasons = validateWriteReport(writeReport, config);
	const identities = writeReport.rows.map((row) => ({
		rowId: row.rowId,
		productEan: row.productEan,
		skuId: row.skuId,
	}));
	const selectedSupermarketProductIds = writeReport.rows.map((row) =>
		Number(row.rowId),
	);
	const [actualCounts, currentRows, historyRows] = await Promise.all([
		repository.readNoCreateCounts(),
		repository.readSelectedRowsByExactIdentity(identities),
		repository.readPriceHistoryRowsAboveId(
			writeReport.noCreate.before.priceHistoryMaxId,
			selectedSupermarketProductIds,
		),
	]);
	const currentById = new Map(currentRows.map((row) => [row.rowId, row]));
	const rows = writeReport.rows.map((row) =>
		auditRow(row, currentById.get(row.rowId) ?? null),
	);
	const historyReasons = auditPriceHistory(writeReport, historyRows);
	const noCreateReasons = auditNoCreateCounts(writeReport, actualCounts);
	const failClosedReasons = uniqueSorted([
		...reportReasons,
		...rows.flatMap((row) => row.reasons),
		...historyReasons,
		...noCreateReasons,
	]);
	const passRows = rows.filter((row) => row.status === "PASS").length;

	return {
		schemaVersion: 1,
		audit: config.postwriteAudit,
		status: failClosedReasons.length === 0 ? "PASS" : "FAIL",
		basis: "production",
		generatedAt: now.toISOString(),
		writeBoundary: WRITE_BOUNDARY,
		writeReport: {
			issue: config.issue,
			...(config.umbrellaIssue ? { umbrellaIssue: config.umbrellaIssue } : {}),
			source: config.source,
			count: 10,
			prewriteReportHash: writeReport.confirmation?.prewriteReportHash ?? "",
			startedAt: writeReport.startedAt,
			committedAt: writeReport.committedAt,
		},
		summary: {
			passRows,
			failRows: rows.length - passRows,
			failClosedReasons,
			priceHistoryRowsExpected: expectedHistoryIds(writeReport).length,
			priceHistoryRowsFound: historyRows.length,
		},
		noCreate: {
			expected: writeReport.noCreate.after,
			actual: actualCounts,
			productDelta:
				actualCounts.productCount - writeReport.noCreate.before.productCount,
			supermarketProductDelta:
				actualCounts.supermarketProductCount -
				writeReport.noCreate.before.supermarketProductCount,
		},
		rows,
	};
}

export async function buildCarrefourDirectRefreshPostwriteAudit({
	repository,
	writeReport,
	now = new Date(),
}: {
	repository: DirectRefreshPostwriteRepository;
	writeReport: ActiveWriteReport;
	now?: Date;
}): Promise<DirectRefreshPostwriteAuditReport> {
	return buildDirectRefreshPostwriteAudit({
		source: "carrefour",
		repository,
		writeReport,
		now,
	});
}

function validateWriteReport(report: ActiveWriteReport, config: SourceConfig) {
	const reasons: string[] = [];
	if (report.schemaVersion !== 1) reasons.push("write report schema is not v1");
	if (report.report !== config.activeWriteReport)
		reasons.push(`write report type is not ${config.displayName} active write`);
	if (report.status !== "PASS") reasons.push("write report status is not PASS");
	if (
		report.issue !== config.issue ||
		report.umbrellaIssue !== config.umbrellaIssue
	)
		reasons.push("write report issue linkage mismatch");
	if (report.source?.slug !== config.source)
		reasons.push(`write report source is not ${config.source}`);
	if (report.source?.expectedHost !== config.expectedHost)
		reasons.push(`write report expected host is not ${config.expectedHost}`);
	if (report.count !== 10 || report.summary?.rows !== 10)
		reasons.push("write report count is not exactly 10");
	if (report.transaction?.acquired !== true)
		reasons.push("write report transaction lock was not acquired");
	if (
		report.noCreate?.productDelta !== 0 ||
		report.noCreate?.supermarketProductDelta !== 0
	)
		reasons.push("write report no-create deltas are not zero");
	if (report.rows.length !== 10)
		reasons.push("write report rows are not exactly 10");
	if (!report.rollbackSnapshot?.requiresConfirmation)
		reasons.push("rollback snapshot confirmation is missing");
	if (!report.rollbackSnapshot?.touchedProductEans?.length)
		reasons.push("rollback snapshot product references are missing");
	if (!report.rollbackSnapshot?.touchedSupermarketProductIds?.length)
		reasons.push("rollback snapshot supermarketProduct references are missing");
	return reasons;
}

function auditRow(
	row: ActiveWriteReport["rows"][number],
	current: CurrentRow | null,
): DirectRefreshPostwriteAuditRow {
	const reasons: string[] = [];
	if (!current) {
		reasons.push("selected row is missing from current DB state");
	} else {
		if (current.productEan !== row.productEan)
			reasons.push("current row EAN does not match write report");
		if (current.skuId !== row.skuId)
			reasons.push("current row SKU does not match write report");
		if (!current.product) {
			reasons.push("current product row is missing");
		} else {
			reasons.push(
				...fieldMismatchReasons(
					"product",
					current.product,
					row.appliedChanges.product,
				),
			);
		}
		reasons.push(
			...fieldMismatchReasons(
				"supermarketProduct",
				current.supermarketProduct,
				row.appliedChanges.supermarketProduct,
			),
		);
	}
	return {
		rowId: row.rowId,
		productEan: row.productEan,
		skuId: row.skuId,
		status: reasons.length === 0 ? "PASS" : "FAIL",
		reasons,
		insertedPriceHistoryId: row.insertedPriceHistoryId,
	};
}

function fieldMismatchReasons(
	label: string,
	current: Record<string, unknown>,
	changes: Array<{ field: string; after: unknown }>,
) {
	return changes.flatMap((change) => {
		const currentValue = current[change.field];
		return sameValue(currentValue, change.after)
			? []
			: [`${label}.${change.field} does not match write report expected value`];
	});
}

function auditNoCreateCounts(report: ActiveWriteReport, actual: Counts) {
	const reasons: string[] = [];
	if (actual.productCount !== report.noCreate.after.productCount)
		reasons.push("product count does not match write report no-create count");
	if (
		actual.supermarketProductCount !==
		report.noCreate.after.supermarketProductCount
	)
		reasons.push(
			"supermarketProduct count does not match write report no-create count",
		);
	return reasons;
}

function auditPriceHistory(
	report: ActiveWriteReport,
	historyRows: CurrentPriceHistory[],
) {
	const reasons: string[] = [];
	const expected = report.rows
		.filter((row) => row.insertedPriceHistoryId !== null)
		.map((row) => ({
			id: row.insertedPriceHistoryId ?? 0,
			supermarketProductId: Number(row.rowId),
			price: row.live?.price ?? null,
			listPrice: row.live?.listPrice ?? null,
		}));
	const actualById = new Map(historyRows.map((row) => [row.id, row]));
	const expectedIds = new Set(expected.map((row) => row.id));
	for (const row of expected) {
		const actual = actualById.get(row.id);
		if (!actual) {
			reasons.push(`expected price history row ${row.id} is missing`);
			continue;
		}
		if (actual.supermarketProductId !== row.supermarketProductId)
			reasons.push(`price history row ${row.id} supermarketProduct mismatch`);
		if (!sameValue(actual.price, row.price))
			reasons.push(`price history row ${row.id} price mismatch`);
		if (!sameValue(actual.listPrice, row.listPrice))
			reasons.push(`price history row ${row.id} list price mismatch`);
	}
	for (const row of historyRows) {
		if (!expectedIds.has(row.id))
			reasons.push(`unexpected price history row ${row.id} above prewrite max`);
	}
	return reasons;
}

function expectedHistoryIds(report: ActiveWriteReport) {
	return report.rows
		.map((row) => row.insertedPriceHistoryId)
		.filter((id): id is number => id !== null);
}

function sameValue(left: unknown, right: unknown) {
	if (typeof left === "number" || typeof right === "number") {
		return normalizeNumber(left) === normalizeNumber(right);
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
	}
	return left === right;
}

function normalizeNumber(value: unknown) {
	return typeof value === "number" ? Number(value.toFixed(4)) : value;
}

function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}
