import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import { classifyPriceFreshness } from "../../src/lib/price-freshness";
import { uniqueSorted } from "./audit-utils";

type AuditStatus = "PASS" | "WARN" | "FAIL";
type RowStatus = "PASS" | "FAIL";
type SourceClassification = "viable" | "mixed" | "excluded";
type DirectRefreshSupport = "writer-supported" | "audit-only-no-writer";

export type DirectRefreshCapacitySource = {
	id: number;
	slug: string;
	displayName: string;
	baseUrl: string;
	freshnessSlaHours: number;
};

export type DirectRefreshCapacityProductSnapshot = {
	ean: string;
	name: string;
};

export type DirectRefreshCapacityRow = {
	id: string;
	sourceSlug: string;
	supermarketId: number;
	ean: string | null;
	skuId: string | null;
	productUrl: string | null;
	lastCheckedAt: string | null;
	price: number | null;
	listPrice: number | null;
	isAvailable: boolean;
	product: DirectRefreshCapacityProductSnapshot | null;
};

export type DirectRefreshCapacityRepository = {
	listSources(sourceSlugs?: string[]): Promise<DirectRefreshCapacitySource[]>;
	listRowsForDenominator(
		sourceSlug: string,
	): Promise<DirectRefreshCapacityRow[]>;
	listOldestPublicRankableRows(
		sourceSlug: string,
		limit: number,
	): Promise<DirectRefreshCapacityRow[]>;
	findRowsBySourceSku(
		sourceSlug: string,
		skuId: string,
	): Promise<DirectRefreshCapacityRow[]>;
};

export type DirectRefreshCapacityOptions = {
	repository: DirectRefreshCapacityRepository;
	fetchDirectProducts(
		sourceSlug: string,
		lookup: { kind: "sku-id"; value: string },
	): Promise<NormalizedProduct[]>;
	sourceSlugs?: string[];
	candidateScanSize?: number;
	targetBatchSize?: number;
	freshnessTargetsPercent?: number[];
	slaHours?: number;
	maxPriceDeltaPercent?: number;
	now?: Date;
	issue?: number;
};

export type DirectRefreshCapacityReport = {
	schemaVersion: 1;
	audit: "direct-refresh-operating-capacity";
	issue: number;
	status: AuditStatus;
	generatedAt: string;
	basis: "production";
	dryRun: true;
	writeBoundary: "read-only operating capacity audit; no production writes, no staging/ingestion runs, no scheduler/cron/workflow side effects";
	filters: {
		sources: string[];
		candidateScanSize: number;
		targetBatchSize: number;
		freshnessTargetsPercent: number[];
		slaHours: number;
		maxPriceDeltaPercent: number;
	};
	thresholds: {
		minViableRowsForPass: number;
		failOnNoPublicRankableRows: boolean;
		failOnSourceHealthError: boolean;
	};
	summary: {
		sourceCount: number;
		publicRankableRows: number;
		freshRows: number;
		staleRows: number;
		viableRowsInScan: number;
		blockedRowsInScan: number;
		excludedSources: string[];
		warnSources: string[];
		failSources: string[];
		recommendedNextPhase:
			| "phase-2-batch-size-generalization"
			| "stop-and-resolve-capacity-blockers";
	};
	sources: DirectRefreshCapacitySourceReport[];
	stopConditions: string[];
};

export type DirectRefreshCapacitySourceReport = {
	slug: string;
	displayName: string;
	directRefreshSupport: DirectRefreshSupport;
	classification: SourceClassification;
	status: AuditStatus;
	sourceHealth: null;
	denominator: {
		totalRows: number;
		publicRankableRows: number;
		excludedRows: number;
		freshRows: number;
		staleRows: number;
		unknownRows: number;
		freshnessPercent: number;
	};
	candidateScan: {
		requestedRows: number;
		evaluatedRows: number;
		viableRows: number;
		blockedRows: number;
		passFillRatePercent: number;
		scanRowsNeededForBatch: number | null;
	};
	blockers: Array<{ reason: string; count: number }>;
	capacity: {
		recommendedBatchSize: number;
		recommendedCandidateScanSize: number;
		estimatedChunks: Record<string, number>;
		estimatedRowsToRefresh: Record<string, number>;
		estimatedDurationMinutesPerChunk: number | null;
	};
	rows: DirectRefreshCapacityRowReport[];
	evidenceGaps: string[];
	recommendation: string;
};

export type DirectRefreshCapacityRowReport = {
	rowId: string;
	ean: string | null;
	skuId: string | null;
	lastCheckedAt: string | null;
	currentPrice: number | null;
	status: RowStatus;
	action: "would-refresh-existing-row" | "blocked";
	live: null | {
		lookupResultCount: number;
		ean: string;
		skuId: string | null;
		productUrlHost: string | null;
		price: number | null;
		listPrice: number | null;
		isAvailable: boolean;
	};
	guards: {
		reasons: string[];
		existingRow: boolean;
		hasProductSnapshot: boolean;
		hasEan: boolean;
		hasSkuId: boolean;
		sourceSkuUnique: boolean;
		directLookupCount: number;
		exactEanMatch: boolean;
		exactSkuMatch: boolean;
		expectedHost: boolean;
		hostDrift: boolean;
		liveAvailable: boolean;
		positiveLivePrice: boolean;
		priceDeltaPercent: number | null;
		priceDeltaWithinLimit: boolean;
	};
};

const WRITE_BOUNDARY =
	"read-only operating capacity audit; no production writes, no staging/ingestion runs, no scheduler/cron/workflow side effects" as const;
const DEFAULT_CANDIDATE_SCAN_SIZE = 50;
const DEFAULT_TARGET_BATCH_SIZE = 25;
const DEFAULT_FRESHNESS_TARGETS = [80, 95, 100];
const DEFAULT_SLA_HOURS = 24;
const DEFAULT_MAX_PRICE_DELTA_PERCENT = 200;

const SOURCE_CONFIGS = {
	carrefour: { displayName: "Carrefour", expectedHost: "carrefour.com.ar" },
	vea: { displayName: "Vea", expectedHost: "vea.com.ar" },
	disco: { displayName: "Disco", expectedHost: "disco.com.ar" },
	jumbo: { displayName: "Jumbo", expectedHost: "jumbo.com.ar" },
	mas: { displayName: "MAS", expectedHost: "masonline.com.ar" },
	dia: {
		displayName: "DIA",
		expectedHost: "diaonline.supermercadosdia.com.ar",
	},
} as const;
const WRITER_SUPPORTED_SOURCES = new Set([
	"carrefour",
	"vea",
	"disco",
	"jumbo",
	"mas",
]);

export async function buildDirectRefreshCapacityReport({
	repository,
	fetchDirectProducts,
	sourceSlugs,
	candidateScanSize = DEFAULT_CANDIDATE_SCAN_SIZE,
	targetBatchSize = DEFAULT_TARGET_BATCH_SIZE,
	freshnessTargetsPercent = DEFAULT_FRESHNESS_TARGETS,
	slaHours = DEFAULT_SLA_HOURS,
	maxPriceDeltaPercent = DEFAULT_MAX_PRICE_DELTA_PERCENT,
	now = new Date(),
	issue = 82,
}: DirectRefreshCapacityOptions): Promise<DirectRefreshCapacityReport> {
	if (candidateScanSize <= 0 || !Number.isInteger(candidateScanSize)) {
		throw new Error("candidateScanSize must be a positive integer");
	}
	if (targetBatchSize <= 0 || !Number.isInteger(targetBatchSize)) {
		throw new Error("targetBatchSize must be a positive integer");
	}
	const sources = await repository.listSources(sourceSlugs);
	const sourceReports: DirectRefreshCapacitySourceReport[] = [];
	for (const source of sources) {
		const allRows = await repository.listRowsForDenominator(source.slug);
		const candidateRows = await repository.listOldestPublicRankableRows(
			source.slug,
			candidateScanSize,
		);
		const rows: DirectRefreshCapacityRowReport[] = [];
		for (const row of candidateRows) {
			rows.push(
				await evaluateCapacityRow({
					row,
					repository,
					fetchDirectProducts,
					sourceSlug: source.slug,
					maxPriceDeltaPercent,
				}),
			);
		}
		sourceReports.push(
			buildSourceReport({
				source,
				allRows,
				rows,
				candidateScanSize,
				targetBatchSize,
				freshnessTargetsPercent,
				slaHours,
				now,
			}),
		);
	}
	const failConditions: string[] = [];
	if (sourceReports.length === 0) failConditions.push("no sources selected");
	if (
		sourceReports.reduce(
			(sum, source) => sum + source.denominator.publicRankableRows,
			0,
		) === 0
	) {
		failConditions.push("no public-rankable rows found in selected sources");
	}
	if (
		sourceReports.length > 0 &&
		sourceReports.every((source) => source.candidateScan.viableRows === 0)
	) {
		failConditions.push(
			"no viable direct-refresh rows found in selected candidate scans",
		);
	}
	const failSources = sourceReports
		.filter((source) => source.status === "FAIL")
		.map((source) => source.slug);
	const warnSources = sourceReports
		.filter((source) => source.status === "WARN")
		.map((source) => source.slug);
	const status: AuditStatus =
		failConditions.length > 0 || failSources.length > 0
			? "FAIL"
			: warnSources.length > 0
				? "WARN"
				: "PASS";
	const stopConditions = uniqueSorted([
		...failConditions,
		...sourceReports.flatMap((source) =>
			source.status === "FAIL"
				? [`${source.slug}: ${source.recommendation}`]
				: [],
		),
	]);
	return {
		schemaVersion: 1,
		audit: "direct-refresh-operating-capacity",
		issue,
		status,
		generatedAt: now.toISOString(),
		basis: "production",
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			sources: sources.map((source) => source.slug),
			candidateScanSize,
			targetBatchSize,
			freshnessTargetsPercent,
			slaHours,
			maxPriceDeltaPercent,
		},
		thresholds: {
			minViableRowsForPass: targetBatchSize,
			failOnNoPublicRankableRows: true,
			failOnSourceHealthError: false,
		},
		summary: {
			sourceCount: sourceReports.length,
			publicRankableRows: sum(
				sourceReports,
				(source) => source.denominator.publicRankableRows,
			),
			freshRows: sum(sourceReports, (source) => source.denominator.freshRows),
			staleRows: sum(sourceReports, (source) => source.denominator.staleRows),
			viableRowsInScan: sum(
				sourceReports,
				(source) => source.candidateScan.viableRows,
			),
			blockedRowsInScan: sum(
				sourceReports,
				(source) => source.candidateScan.blockedRows,
			),
			excludedSources: sourceReports
				.filter((source) => source.classification === "excluded")
				.map((source) => source.slug),
			warnSources,
			failSources,
			recommendedNextPhase:
				status === "FAIL"
					? "stop-and-resolve-capacity-blockers"
					: "phase-2-batch-size-generalization",
		},
		sources: sourceReports,
		stopConditions,
	};
}

export async function evaluateCapacityRow({
	row,
	repository,
	fetchDirectProducts,
	sourceSlug,
	maxPriceDeltaPercent = DEFAULT_MAX_PRICE_DELTA_PERCENT,
}: {
	row: DirectRefreshCapacityRow;
	repository: DirectRefreshCapacityRepository;
	fetchDirectProducts(
		sourceSlug: string,
		lookup: { kind: "sku-id"; value: string },
	): Promise<NormalizedProduct[]>;
	sourceSlug: string;
	maxPriceDeltaPercent?: number;
}): Promise<DirectRefreshCapacityRowReport> {
	const hasProductSnapshot = Boolean(row.product);
	const hasEan = Boolean(row.ean?.trim());
	const hasSkuId = Boolean(row.skuId?.trim());
	const skuMatches = hasSkuId
		? await repository.findRowsBySourceSku(sourceSlug, row.skuId ?? "")
		: [];
	const sourceSkuUnique =
		hasSkuId && skuMatches.length === 1 && skuMatches[0]?.id === row.id;
	let lookupError: string | null = null;
	let liveProducts: NormalizedProduct[] = [];
	if (hasSkuId && row.sourceSlug === sourceSlug) {
		try {
			liveProducts = await fetchDirectProducts(sourceSlug, {
				kind: "sku-id",
				value: row.skuId ?? "",
			});
		} catch (error) {
			lookupError =
				error instanceof Error ? error.message : "unknown direct lookup error";
		}
	}
	const liveProduct = liveProducts.length === 1 ? liveProducts[0] : null;
	const existingHost = host(row.productUrl);
	const liveHost = host(liveProduct?.productUrl ?? null);
	const expectedHostValue = sourceExpectedHost(sourceSlug);
	const exactEanMatch = Boolean(
		liveProduct && row.ean && liveProduct.ean === row.ean,
	);
	const exactSkuMatch = Boolean(
		liveProduct && row.skuId && liveProduct.skuId === row.skuId,
	);
	const expectedHost = Boolean(liveHost && liveHost === expectedHostValue);
	const hostDrift = Boolean(
		existingHost && liveHost && existingHost !== liveHost,
	);
	const liveAvailable = Boolean(liveProduct?.isAvailable);
	const positiveLivePrice = Boolean(
		liveProduct?.price !== null &&
			liveProduct?.price !== undefined &&
			liveProduct.price > 0,
	);
	const priceDeltaPercent = priceDelta(row.price, liveProduct?.price ?? null);
	const priceDeltaWithinLimit =
		priceDeltaPercent === null || priceDeltaPercent <= maxPriceDeltaPercent;
	const reasons = guardReasons({
		row,
		sourceSlug,
		hasProductSnapshot,
		hasEan,
		hasSkuId,
		sourceSkuUnique,
		directLookupCount: liveProducts.length,
		lookupError,
		exactEanMatch,
		exactSkuMatch,
		expectedHost,
		expectedHostValue,
		hostDrift,
		liveAvailable,
		positiveLivePrice,
		priceDeltaWithinLimit,
		maxPriceDeltaPercent,
	});
	const status: RowStatus = reasons.length === 0 ? "PASS" : "FAIL";
	return {
		rowId: row.id,
		ean: row.ean,
		skuId: row.skuId,
		lastCheckedAt: row.lastCheckedAt,
		currentPrice: row.price,
		status,
		action: status === "PASS" ? "would-refresh-existing-row" : "blocked",
		live: liveProduct
			? {
					lookupResultCount: liveProducts.length,
					ean: liveProduct.ean,
					skuId: liveProduct.skuId,
					productUrlHost: liveHost,
					price: liveProduct.price,
					listPrice: liveProduct.listPrice,
					isAvailable: liveProduct.isAvailable,
				}
			: null,
		guards: {
			reasons,
			existingRow: row.sourceSlug === sourceSlug,
			hasProductSnapshot,
			hasEan,
			hasSkuId,
			sourceSkuUnique,
			directLookupCount: liveProducts.length,
			exactEanMatch,
			exactSkuMatch,
			expectedHost,
			hostDrift,
			liveAvailable,
			positiveLivePrice,
			priceDeltaPercent,
			priceDeltaWithinLimit,
		},
	};
}

function buildSourceReport({
	source,
	allRows,
	rows,
	candidateScanSize,
	targetBatchSize,
	freshnessTargetsPercent,
	slaHours,
	now,
}: {
	source: DirectRefreshCapacitySource;
	allRows: DirectRefreshCapacityRow[];
	rows: DirectRefreshCapacityRowReport[];
	candidateScanSize: number;
	targetBatchSize: number;
	freshnessTargetsPercent: number[];
	slaHours: number;
	now: Date;
}): DirectRefreshCapacitySourceReport {
	const denominator = buildDenominator(
		allRows,
		now,
		source.freshnessSlaHours || slaHours,
	);
	const viableRows = rows.filter((row) => row.status === "PASS").length;
	const blockedRows = rows.length - viableRows;
	const passFillRatePercent = percent(viableRows, rows.length);
	const scanRowsNeededForBatch = recommendCandidateScanSize({
		targetBatchSize,
		viableRows,
		evaluatedRows: rows.length,
	});
	const blockers = summarizeBlockers(rows);
	const classification = classifySource({
		publicRankableRows: denominator.publicRankableRows,
		viableRows,
		blockedRows,
	});
	const directRefreshSupport = directRefreshSupportFor(source.slug);
	const evidenceGaps = [
		"source health was not checked by this read-only capacity audit",
	];
	if (directRefreshSupport === "audit-only-no-writer") {
		evidenceGaps.push(
			"source has read-only adapter evidence but no direct-refresh writer/postwrite contract",
		);
	}
	if (
		rows.length < candidateScanSize &&
		rows.length < denominator.publicRankableRows
	) {
		evidenceGaps.push(
			"candidate scan returned fewer rows than requested before covering the denominator",
		);
	}
	const recommendedBatchSize = recommendBatchSize({
		targetBatchSize,
		viableRows,
		classification,
	});
	const estimatedRowsToRefresh = estimateRowsToRefresh({
		publicRankableRows: denominator.publicRankableRows,
		freshRows: denominator.freshRows,
		freshnessTargetsPercent,
	});
	const estimatedChunks = estimateChunks(
		estimatedRowsToRefresh,
		recommendedBatchSize,
	);
	const status = sourceStatus({
		classification,
		directRefreshSupport,
		publicRankableRows: denominator.publicRankableRows,
		viableRows,
		targetBatchSize,
	});
	return {
		slug: source.slug,
		displayName: source.displayName || sourceDisplayName(source.slug),
		directRefreshSupport,
		classification,
		status,
		sourceHealth: null,
		denominator,
		candidateScan: {
			requestedRows: candidateScanSize,
			evaluatedRows: rows.length,
			viableRows,
			blockedRows,
			passFillRatePercent,
			scanRowsNeededForBatch,
		},
		blockers,
		capacity: {
			recommendedBatchSize,
			recommendedCandidateScanSize: scanRowsNeededForBatch ?? candidateScanSize,
			estimatedChunks,
			estimatedRowsToRefresh,
			estimatedDurationMinutesPerChunk: null,
		},
		rows,
		evidenceGaps,
		recommendation: sourceRecommendation({
			status,
			classification,
			directRefreshSupport,
			targetBatchSize,
			viableRows,
		}),
	};
}

function buildDenominator(
	rows: DirectRefreshCapacityRow[],
	now: Date,
	slaHours: number,
) {
	let publicRankableRows = 0;
	let freshRows = 0;
	let staleRows = 0;
	let unknownRows = 0;
	for (const row of rows) {
		if (!isPublicRankable(row)) continue;
		publicRankableRows += 1;
		const freshness = classifyPriceFreshness(row.lastCheckedAt, {
			now,
			maxAgeHours: slaHours,
		});
		if (freshness.status === "fresh") freshRows += 1;
		else if (freshness.status === "stale") staleRows += 1;
		else unknownRows += 1;
	}
	return {
		totalRows: rows.length,
		publicRankableRows,
		excludedRows: rows.length - publicRankableRows,
		freshRows,
		staleRows,
		unknownRows,
		freshnessPercent: percent(freshRows, publicRankableRows),
	};
}

function isPublicRankable(row: DirectRefreshCapacityRow) {
	return Boolean(
		row.isAvailable &&
			row.price !== null &&
			row.price > 0 &&
			row.product?.name?.trim() &&
			row.ean?.trim(),
	);
}

function guardReasons({
	row,
	sourceSlug,
	hasProductSnapshot,
	hasEan,
	hasSkuId,
	sourceSkuUnique,
	directLookupCount,
	lookupError,
	exactEanMatch,
	exactSkuMatch,
	expectedHost,
	expectedHostValue,
	hostDrift,
	liveAvailable,
	positiveLivePrice,
	priceDeltaWithinLimit,
	maxPriceDeltaPercent,
}: {
	row: DirectRefreshCapacityRow;
	sourceSlug: string;
	hasProductSnapshot: boolean;
	hasEan: boolean;
	hasSkuId: boolean;
	sourceSkuUnique: boolean;
	directLookupCount: number;
	lookupError: string | null;
	exactEanMatch: boolean;
	exactSkuMatch: boolean;
	expectedHost: boolean;
	expectedHostValue: string;
	hostDrift: boolean;
	liveAvailable: boolean;
	positiveLivePrice: boolean;
	priceDeltaWithinLimit: boolean;
	maxPriceDeltaPercent: number;
}) {
	const reasons: string[] = [];
	if (row.sourceSlug !== sourceSlug)
		reasons.push(`row source is not ${sourceSlug}`);
	if (!hasProductSnapshot) reasons.push("current DB product snapshot missing");
	if (!hasEan) reasons.push("existing row lacks EAN");
	if (!hasSkuId) reasons.push("existing row lacks SKU id");
	if (hasSkuId && !sourceSkuUnique) {
		reasons.push("sourceSlug+skuId is not unique for the existing row");
	}
	if (lookupError) {
		reasons.push(`direct sku-id lookup failed: ${lookupError}`);
	} else if (hasSkuId && directLookupCount !== 1) {
		reasons.push(
			`direct sku-id lookup returned ${directLookupCount} live products`,
		);
	}
	if (directLookupCount === 1 && !exactEanMatch) {
		reasons.push("direct lookup EAN does not match existing EAN");
	}
	if (directLookupCount === 1 && !exactSkuMatch) {
		reasons.push("direct lookup SKU does not match existing SKU");
	}
	if (directLookupCount === 1 && !expectedHost) {
		reasons.push(`live product URL host is not ${expectedHostValue}`);
	}
	if (hostDrift) reasons.push("existing/live product URL host drift");
	if (directLookupCount === 1 && !liveAvailable) {
		reasons.push("live product is unavailable");
	}
	if (directLookupCount === 1 && !positiveLivePrice) {
		reasons.push("live price is not positive");
	}
	if (!priceDeltaWithinLimit) {
		reasons.push(`live price delta exceeds ${maxPriceDeltaPercent}%`);
	}
	return reasons;
}

function summarizeBlockers(rows: DirectRefreshCapacityRowReport[]) {
	const counts = new Map<string, number>();
	for (const reason of rows.flatMap((row) => row.guards.reasons)) {
		counts.set(reason, (counts.get(reason) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([reason, count]) => ({ reason, count }))
		.sort((left, right) => left.reason.localeCompare(right.reason));
}

function classifySource({
	publicRankableRows,
	viableRows,
	blockedRows,
}: {
	publicRankableRows: number;
	viableRows: number;
	blockedRows: number;
}): SourceClassification {
	if (publicRankableRows === 0 || viableRows === 0) return "excluded";
	return blockedRows > 0 ? "mixed" : "viable";
}

function sourceStatus({
	classification,
	directRefreshSupport,
	publicRankableRows,
	viableRows,
	targetBatchSize,
}: {
	classification: SourceClassification;
	directRefreshSupport: DirectRefreshSupport;
	publicRankableRows: number;
	viableRows: number;
	targetBatchSize: number;
}): AuditStatus {
	if (publicRankableRows === 0) return "FAIL";
	if (classification === "excluded") return "WARN";
	if (directRefreshSupport === "audit-only-no-writer") return "WARN";
	if (classification === "mixed" || viableRows < targetBatchSize) return "WARN";
	return "PASS";
}

function sourceRecommendation({
	status,
	classification,
	directRefreshSupport,
	targetBatchSize,
	viableRows,
}: {
	status: AuditStatus;
	classification: SourceClassification;
	directRefreshSupport: DirectRefreshSupport;
	targetBatchSize: number;
	viableRows: number;
}) {
	if (status === "FAIL") return "stop and resolve missing denominator evidence";
	if (directRefreshSupport === "audit-only-no-writer") {
		return "keep read-only; do not schedule or write until source-specific writer/postwrite contracts exist";
	}
	if (classification === "excluded")
		return "exclude source from scaled direct-refresh until viable rows are found";
	if (viableRows < targetBatchSize) {
		return `increase candidate scan evidence before planning count=${targetBatchSize}`;
	}
	if (classification === "mixed")
		return "eligible for Phase 2 planning with blocker follow-up";
	return "eligible for Phase 2 batch-size generalization planning; not approval to write";
}

export function recommendCandidateScanSize({
	targetBatchSize,
	viableRows,
	evaluatedRows,
}: {
	targetBatchSize: number;
	viableRows: number;
	evaluatedRows: number;
}) {
	if (viableRows <= 0 || evaluatedRows <= 0) return null;
	return Math.ceil(targetBatchSize / (viableRows / evaluatedRows));
}

export function recommendBatchSize({
	targetBatchSize,
	viableRows,
	classification,
}: {
	targetBatchSize: number;
	viableRows: number;
	classification: SourceClassification;
}) {
	if (classification === "excluded" || viableRows <= 0) return 0;
	return Math.min(targetBatchSize, viableRows);
}

function estimateRowsToRefresh({
	publicRankableRows,
	freshRows,
	freshnessTargetsPercent,
}: {
	publicRankableRows: number;
	freshRows: number;
	freshnessTargetsPercent: number[];
}) {
	const rows: Record<string, number> = {};
	for (const target of freshnessTargetsPercent) {
		rows[String(target)] = Math.max(
			0,
			Math.ceil(publicRankableRows * (target / 100)) - freshRows,
		);
	}
	return rows;
}

function estimateChunks(
	rowsToRefresh: Record<string, number>,
	batchSize: number,
) {
	const chunks: Record<string, number> = {};
	for (const [target, rows] of Object.entries(rowsToRefresh)) {
		chunks[target] = batchSize > 0 ? Math.ceil(rows / batchSize) : 0;
	}
	return chunks;
}

function directRefreshSupportFor(sourceSlug: string): DirectRefreshSupport {
	return WRITER_SUPPORTED_SOURCES.has(sourceSlug)
		? "writer-supported"
		: "audit-only-no-writer";
}

function sourceExpectedHost(sourceSlug: string) {
	return (
		SOURCE_CONFIGS[sourceSlug as keyof typeof SOURCE_CONFIGS]?.expectedHost ??
		hostFromSlug(sourceSlug)
	);
}

function sourceDisplayName(sourceSlug: string) {
	return (
		SOURCE_CONFIGS[sourceSlug as keyof typeof SOURCE_CONFIGS]?.displayName ??
		sourceSlug
	);
}

function hostFromSlug(sourceSlug: string) {
	return `${sourceSlug}.unknown-host.invalid`;
}

function priceDelta(currentPrice: number | null, livePrice: number | null) {
	if (
		!currentPrice ||
		currentPrice <= 0 ||
		livePrice === null ||
		livePrice <= 0
	) {
		return null;
	}
	return Number(
		((Math.abs(livePrice - currentPrice) / currentPrice) * 100).toFixed(4),
	);
}

function host(value: string | null) {
	try {
		return value
			? new URL(value).host.toLowerCase().replace(/^www\./, "")
			: null;
	} catch {
		return null;
	}
}

function percent(part: number, total: number) {
	return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function sum<T>(values: T[], selector: (value: T) => number) {
	return values.reduce((total, value) => total + selector(value), 0);
}
