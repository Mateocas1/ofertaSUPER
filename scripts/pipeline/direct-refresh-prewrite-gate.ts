import { createHash } from "node:crypto";

import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import {
	getDirectRefreshCapacityPassRowIds,
	validateDirectRefreshCapacityEvidence,
	type DirectRefreshCapacityEvidenceInput,
	type DirectRefreshCapacityEvidenceLineage,
} from "./direct-refresh-capacity-lineage";

type GateStatus = "PASS" | "FAIL";
type RowGuardStatus = "PASS" | "FAIL";
type JsonValue = string | number | boolean | null | string[];

export type DirectRefreshPrewriteSource = {
	id: number;
	slug: string;
	baseUrl: string;
};

export type DirectRefreshPrewriteProductSnapshot = {
	ean: string;
	name: string;
	brand: string | null;
	description: string | null;
	imageUrl: string | null;
	images: string[];
	category: string | null;
};

export type DirectRefreshPrewritePriceHistorySnapshot = {
	id: number;
	supermarketProductId: number;
	price: number | null;
	listPrice: number | null;
	scrapedAt: string | null;
};

export type DirectRefreshPrewriteExistingRow = {
	id: string;
	sourceSlug: string;
	supermarketId: number;
	ean: string | null;
	skuId: string | null;
	sellerId: string | null;
	productUrl: string | null;
	lastCheckedAt: string | null;
	price: number | null;
	listPrice: number | null;
	referencePrice: number | null;
	referenceUnit: string | null;
	isAvailable: boolean;
	product: DirectRefreshPrewriteProductSnapshot | null;
	latestPriceHistory: DirectRefreshPrewritePriceHistorySnapshot | null;
};

export type DirectRefreshPrewriteRepository = {
	getSource(sourceSlug: string): Promise<DirectRefreshPrewriteSource | null>;
	listOldestPublicRankableRows(
		sourceSlug: string,
		sampleSize: number,
	): Promise<DirectRefreshPrewriteExistingRow[]>;
	findRowsBySourceSku(
		sourceSlug: string,
		skuId: string,
	): Promise<DirectRefreshPrewriteExistingRow[]>;
	getMaxPriceHistoryId(): Promise<number | null>;
};

export type DirectRefreshPrewriteChange = {
	field: string;
	before: JsonValue;
	after: JsonValue;
};

export type DirectRefreshPrewriteRow = {
	rowId: string;
	sourceSlug: DirectRefreshSourceSlug;
	lookup: { kind: "sku-id"; value: string | null };
	currentDb: {
		product: DirectRefreshPrewriteProductSnapshot | null;
		supermarketProduct: {
			id: number | string;
			productEan: string | null;
			supermarketId: number;
			price: number | null;
			listPrice: number | null;
			referencePrice: number | null;
			referenceUnit: string | null;
			isAvailable: boolean;
			skuId: string | null;
			sellerId: string | null;
			productUrl: string | null;
			productUrlHost: string | null;
			lastCheckedAt: string | null;
		};
		latestPriceHistory: DirectRefreshPrewritePriceHistorySnapshot | null;
	};
	live:
		| null
		| (NormalizedProduct & {
				lookupResultCount: number;
				productUrlHost: string | null;
		  });
	expectedChanges: {
		product: DirectRefreshPrewriteChange[];
		supermarketProduct: DirectRefreshPrewriteChange[];
		priceHistory: {
			wouldInsert: boolean;
			price: number | null;
			listPrice: number | null;
		};
	};
	rollbackSnapshotFields: string[];
	guards: {
		status: RowGuardStatus;
		reasons: string[];
		existingRow: boolean;
		hasProductSnapshot: boolean;
		hasEan: boolean;
		hasSkuId: boolean;
		sourceSkuUnique: boolean;
		directLookupCount: number;
		exactEanMatch: boolean;
		exactSkuMatch: boolean;
		carrefourHostOnly: boolean;
		hostDrift: boolean;
		positiveLivePrice: boolean;
		priceDeltaPercent: number | null;
		priceDeltaWithinLimit: boolean;
	};
	stopConditions: string[];
	action: "would-refresh-existing-row" | "blocked";
};

export type CarrefourDirectRefreshPrewriteGate = {
	schemaVersion: 1;
	audit: `${DirectRefreshSourceSlug}-direct-refresh-prewrite-gate`;
	status: GateStatus;
	generatedAt: string;
	basis: "production";
	dryRun: true;
	writeBoundary: "read-only pre-write gate; no production writes, no staging/ingestion runs, no active refresh/reconcile, no scheduler/cron/workflow side effects";
	source: {
		slug: DirectRefreshSourceSlug;
		supermarketId: number | null;
		baseUrl: string | null;
		expectedHost: DirectRefreshExpectedHost;
	};
	primitive: {
		kind: "vtex-catalog-direct-lookup";
		lookupKind: "sku-id";
		endpointPattern: "/api/catalog_system/pub/products/search?fq=skuId:<skuId>";
	};
	identity: {
		model: "sourceSlug+skuId";
		guards: string[];
	};
	selection: {
		strategy:
			| "oldest-public-rankable-existing-rows"
			| "oldest-public-rankable-existing-rows-bounded-viable-scan"
			| "capacity-pass-existing-rows"
			| "capacity-pass-existing-rows-bounded-viable-scan";
		requestedSampleSize: number;
		candidateScanSize: number;
		candidateRows: number;
		selectedRows: number;
		skippedBlockedRows: number;
		capacityEvidence: {
			applied: boolean;
			passCandidateRows: number;
			excludedCandidateRows: number;
		};
	};
	summary: {
		passRows: number;
		failRows: number;
		skippedBlockedRows: number;
		skippedBlockedReasons: string[];
		expectedSupermarketProductUpdates: number;
		expectedProductUpdates: number;
		expectedPriceHistoryInserts: number;
		failClosedReasons: string[];
	};
	lineage: DirectRefreshCapacityEvidenceLineage;
	rollbackSnapshot: {
		requiresConfirmation: true;
		touchedProductEans: string[];
		touchedSupermarketProductIds: Array<number | string>;
		priceHistory: {
			deleteRowsWithIdGreaterThan: number | null;
			restoreLatestRows: DirectRefreshPrewritePriceHistorySnapshot[];
		};
	};
	futureConfirmation: {
		required: true;
		hashSemantics: "exact timestamped evidence hash; rerun the gate and use the new hash before any future write";
		shape: {
			source: DirectRefreshSourceSlug;
			reportHash: string;
			rowIds: string[];
			skuIds: string[];
			productEans: string[];
		};
	};
	rows: DirectRefreshPrewriteRow[];
	skippedRows: DirectRefreshPrewriteRow[];
};

const SOURCE_CONFIGS = {
	carrefour: {
		slug: "carrefour",
		displayName: "Carrefour",
		expectedHost: "carrefour.com.ar",
	},
	vea: {
		slug: "vea",
		displayName: "Vea",
		expectedHost: "vea.com.ar",
	},
	disco: {
		slug: "disco",
		displayName: "Disco",
		expectedHost: "disco.com.ar",
	},
	jumbo: {
		slug: "jumbo",
		displayName: "Jumbo",
		expectedHost: "jumbo.com.ar",
	},
	mas: {
		slug: "mas",
		displayName: "MAS",
		expectedHost: "masonline.com.ar",
	},
} as const;
type DirectRefreshSourceSlug = keyof typeof SOURCE_CONFIGS;
type DirectRefreshExpectedHost =
	(typeof SOURCE_CONFIGS)[DirectRefreshSourceSlug]["expectedHost"];
type DirectRefreshSourceConfig =
	(typeof SOURCE_CONFIGS)[DirectRefreshSourceSlug];
const CARREFOUR_SOURCE = SOURCE_CONFIGS.carrefour.slug;
const ALLOWED_SOURCE_LIST = Object.keys(SOURCE_CONFIGS).join(", ");
const WRITE_BOUNDARY =
	"read-only pre-write gate; no production writes, no staging/ingestion runs, no active refresh/reconcile, no scheduler/cron/workflow side effects" as const;
const MAX_PRICE_DELTA_PERCENT = 200;
function identityGuards(config: DirectRefreshSourceConfig) {
	return [
		`existing ${config.displayName} row`,
		"current DB product snapshot",
		"non-empty EAN",
		"non-empty SKU",
		"sourceSlug+skuId unique in existing DB rows",
		"exactly one live product from direct SKU lookup",
		"exact EAN match",
		"exact SKU match",
		`live URL host is ${config.expectedHost}`,
		"no existing/live host drift when existing URL has a host",
		"positive live price",
		`live price delta is <= ${MAX_PRICE_DELTA_PERCENT}% when current DB price is positive`,
		"rollback snapshot fields are present",
	];
}
const ROLLBACK_FIELDS = [
	"product.ean",
	"product.name",
	"product.brand",
	"product.description",
	"product.imageUrl",
	"product.images",
	"product.category",
	"supermarketProduct.id",
	"supermarketProduct.productEan",
	"supermarketProduct.supermarketId",
	"supermarketProduct.price",
	"supermarketProduct.listPrice",
	"supermarketProduct.referencePrice",
	"supermarketProduct.referenceUnit",
	"supermarketProduct.isAvailable",
	"supermarketProduct.skuId",
	"supermarketProduct.sellerId",
	"supermarketProduct.productUrl",
	"supermarketProduct.lastCheckedAt",
	"latestPriceHistory.id",
	"latestPriceHistory.price",
	"latestPriceHistory.listPrice",
	"latestPriceHistory.scrapedAt",
];

export async function buildCarrefourDirectRefreshPrewriteGate(
	options: Omit<
		Parameters<typeof buildDirectRefreshPrewriteGate>[0],
		"sourceSlug"
	> & {
		sourceSlug?: string;
	},
): Promise<CarrefourDirectRefreshPrewriteGate> {
	return buildDirectRefreshPrewriteGate({
		...options,
		sourceSlug: options.sourceSlug ?? CARREFOUR_SOURCE,
	});
}

export async function buildDirectRefreshPrewriteGate({
	repository,
	fetchDirectProducts,
	sourceSlug = CARREFOUR_SOURCE,
	sampleSize = 10,
	candidateScanSize = sampleSize,
	now = new Date(),
	maxPriceDeltaPercent = MAX_PRICE_DELTA_PERCENT,
	capacityEvidence = null,
}: {
	repository: DirectRefreshPrewriteRepository;
	fetchDirectProducts(
		sourceSlug: DirectRefreshSourceSlug,
		lookup: { kind: "sku-id"; value: string },
	): Promise<NormalizedProduct[]>;
	sourceSlug?: string;
	sampleSize?: number;
	candidateScanSize?: number;
	now?: Date;
	maxPriceDeltaPercent?: number;
	capacityEvidence?: DirectRefreshCapacityEvidenceInput | null;
}): Promise<CarrefourDirectRefreshPrewriteGate> {
	const config = sourceConfig(sourceSlug);
	const generatedAt = now.toISOString();
	const source = await repository.getSource(config.slug);
	if (candidateScanSize < sampleSize)
		throw new Error("candidate scan size must be >= sample size");
	const candidateRows = source
		? await repository.listOldestPublicRankableRows(
				config.slug,
				candidateScanSize,
			)
		: [];
	const maxPriceHistoryId = source
		? await repository.getMaxPriceHistoryId()
		: null;
	const candidateEvaluations: DirectRefreshPrewriteRow[] = [];
	for (const row of candidateRows) {
		candidateEvaluations.push(
			await evaluatePrewriteRow({
				row,
				repository,
				fetchDirectProducts,
				generatedAt,
				maxPriceDeltaPercent,
				config,
			}),
		);
	}
	const boundedViableScan = candidateScanSize > sampleSize;
	const capacityPassRowIds = getDirectRefreshCapacityPassRowIds(
		capacityEvidence,
		config.slug,
	);
	const capacityAlignedSelection = capacityPassRowIds !== null;
	const viableRows = candidateEvaluations.filter(
		(row) => row.guards.status === "PASS",
	);
	const capacityPassRows = capacityAlignedSelection
		? viableRows.filter((row) => capacityPassRowIds.has(row.rowId))
		: viableRows;
	const capacityExcludedRows = capacityAlignedSelection
		? viableRows.filter((row) => !capacityPassRowIds.has(row.rowId))
		: [];
	const shouldFilterSelection = boundedViableScan || capacityAlignedSelection;
	const selectionPoolRows = capacityAlignedSelection
		? capacityPassRows
		: viableRows;
	const skippedRows = shouldFilterSelection
		? candidateEvaluations.filter((row) => row.guards.status === "FAIL")
		: [];
	const rows = shouldFilterSelection
		? selectionPoolRows.slice(0, sampleSize)
		: candidateEvaluations;
	const sourceFailReasons = source ? [] : [`source ${config.slug} not found`];
	const selectedFailReasons =
		candidateRows.length === 0 ? ["no rows selected"] : [];
	const insufficientViableReasons =
		shouldFilterSelection && rows.length < sampleSize
			? [
					capacityAlignedSelection
						? `insufficient capacity-PASS rows: selected ${rows.length} of ${sampleSize} from ${candidateRows.length} candidates (${capacityPassRows.length} capacity-PASS candidates)`
						: `insufficient viable rows: selected ${rows.length} of ${sampleSize} from ${candidateRows.length} candidates`,
				]
			: [];
	const skippedBlockedReasons = uniqueSorted(
		skippedRows.flatMap((row) => row.guards.reasons),
	);
	const rowFailReasons = boundedViableScan
		? insufficientViableReasons.length > 0
			? skippedBlockedReasons
			: []
		: rows.flatMap((row) =>
				row.guards.status === "FAIL" ? row.guards.reasons : [],
			);
	const capacityValidation = validateDirectRefreshCapacityEvidence({
		evidence: capacityEvidence,
		sourceSlug: config.slug,
		sampleSize,
		selectedRows: rows,
	});
	const failClosedReasons = uniqueSorted([
		...sourceFailReasons,
		...selectedFailReasons,
		...insufficientViableReasons,
		...rowFailReasons,
		...capacityValidation.failClosedReasons,
	]);
	const passRows = rows.filter((row) => row.guards.status === "PASS");
	const failRows = rows.length - passRows.length;
	const rollbackSnapshot = {
		requiresConfirmation: true as const,
		touchedProductEans: uniqueSorted(
			passRows.map((row) => row.currentDb.supermarketProduct.productEan ?? ""),
		).filter(Boolean),
		touchedSupermarketProductIds: passRows
			.map((row) => row.currentDb.supermarketProduct.id)
			.toSorted((left, right) => String(left).localeCompare(String(right))),
		priceHistory: {
			deleteRowsWithIdGreaterThan: maxPriceHistoryId,
			restoreLatestRows: passRows
				.map((row) => row.currentDb.latestPriceHistory)
				.filter((row): row is DirectRefreshPrewritePriceHistorySnapshot =>
					Boolean(row),
				)
				.toSorted(
					(left, right) =>
						left.supermarketProductId - right.supermarketProductId,
				),
		},
	};
	const summary = {
		passRows: passRows.length,
		failRows,
		skippedBlockedRows: skippedRows.length,
		skippedBlockedReasons,
		expectedSupermarketProductUpdates: passRows.filter(
			(row) => row.expectedChanges.supermarketProduct.length > 0,
		).length,
		expectedProductUpdates: passRows.filter(
			(row) => row.expectedChanges.product.length > 0,
		).length,
		expectedPriceHistoryInserts: passRows.filter(
			(row) => row.expectedChanges.priceHistory.wouldInsert,
		).length,
		failClosedReasons,
	};
	const reportWithoutConfirmation = {
		schemaVersion: 1 as const,
		audit: `${config.slug}-direct-refresh-prewrite-gate` as const,
		status:
			failClosedReasons.length === 0 &&
			(!boundedViableScan || rows.length === sampleSize) &&
			rows.every((row) => row.guards.status === "PASS")
				? ("PASS" as const)
				: ("FAIL" as const),
		generatedAt,
		basis: "production" as const,
		dryRun: true as const,
		writeBoundary: WRITE_BOUNDARY,
		source: {
			slug: config.slug,
			supermarketId: source?.id ?? null,
			baseUrl: source?.baseUrl ?? null,
			expectedHost: config.expectedHost,
		},
		primitive: {
			kind: "vtex-catalog-direct-lookup" as const,
			lookupKind: "sku-id" as const,
			endpointPattern:
				"/api/catalog_system/pub/products/search?fq=skuId:<skuId>" as const,
		},
		identity: {
			model: "sourceSlug+skuId" as const,
			guards: identityGuards(config),
		},
		selection: {
			strategy: capacityAlignedSelection
				? boundedViableScan
					? ("capacity-pass-existing-rows-bounded-viable-scan" as const)
					: ("capacity-pass-existing-rows" as const)
				: boundedViableScan
					? ("oldest-public-rankable-existing-rows-bounded-viable-scan" as const)
					: ("oldest-public-rankable-existing-rows" as const),
			requestedSampleSize: sampleSize,
			candidateScanSize,
			candidateRows: candidateRows.length,
			selectedRows: rows.length,
			skippedBlockedRows: skippedRows.length,
			capacityEvidence: {
				applied: capacityAlignedSelection,
				passCandidateRows: capacityPassRows.length,
				excludedCandidateRows: capacityExcludedRows.length,
			},
		},
		summary,
		lineage: capacityValidation.lineage,
		rollbackSnapshot,
		rows,
		skippedRows,
	};
	const confirmationShape = {
		source: config.slug,
		reportHash: buildPrewriteReportHash(reportWithoutConfirmation),
		rowIds: passRows.map((row) => row.rowId).sort(),
		skuIds: uniqueSorted(passRows.map((row) => row.lookup.value ?? "")).filter(
			Boolean,
		),
		productEans: uniqueSorted(
			passRows.map((row) => row.currentDb.supermarketProduct.productEan ?? ""),
		).filter(Boolean),
	};

	return {
		...reportWithoutConfirmation,
		futureConfirmation: {
			required: true,
			hashSemantics:
				"exact timestamped evidence hash; rerun the gate and use the new hash before any future write",
			shape: confirmationShape,
		},
	};
}

async function evaluatePrewriteRow({
	row,
	repository,
	fetchDirectProducts,
	generatedAt,
	maxPriceDeltaPercent,
	config,
}: {
	row: DirectRefreshPrewriteExistingRow;
	repository: DirectRefreshPrewriteRepository;
	fetchDirectProducts(
		sourceSlug: DirectRefreshSourceSlug,
		lookup: { kind: "sku-id"; value: string },
	): Promise<NormalizedProduct[]>;
	generatedAt: string;
	maxPriceDeltaPercent: number;
	config: DirectRefreshSourceConfig;
}): Promise<DirectRefreshPrewriteRow> {
	const hasProductSnapshot = Boolean(row.product);
	const hasEan = Boolean(row.ean?.trim());
	const hasSkuId = Boolean(row.skuId?.trim());
	const skuMatches = hasSkuId
		? await repository.findRowsBySourceSku(config.slug, row.skuId ?? "")
		: [];
	const sourceSkuUnique =
		hasSkuId && skuMatches.length === 1 && skuMatches[0]?.id === row.id;
	let lookupError: string | null = null;
	let liveProducts: NormalizedProduct[] = [];
	if (hasSkuId && row.sourceSlug === config.slug) {
		try {
			liveProducts = await fetchDirectProducts(config.slug, {
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
	const exactEanMatch = Boolean(
		liveProduct && row.ean && liveProduct.ean === row.ean,
	);
	const exactSkuMatch = Boolean(
		liveProduct && row.skuId && liveProduct.skuId === row.skuId,
	);
	const carrefourHostOnly = liveHost === config.expectedHost;
	const hostDrift = Boolean(
		existingHost && liveHost && existingHost !== liveHost,
	);
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
		hasProductSnapshot,
		hasEan,
		hasSkuId,
		sourceSkuUnique,
		directLookupCount: liveProducts.length,
		lookupError,
		exactEanMatch,
		exactSkuMatch,
		carrefourHostOnly,
		hostDrift,
		positiveLivePrice,
		priceDeltaWithinLimit,
		maxPriceDeltaPercent,
		config,
	});
	const status = reasons.length === 0 ? "PASS" : "FAIL";
	const expectedChanges = buildExpectedChanges(row, liveProduct, generatedAt);

	return {
		rowId: row.id,
		sourceSlug: config.slug,
		lookup: { kind: "sku-id", value: row.skuId },
		currentDb: {
			product: row.product,
			supermarketProduct: {
				id: numericId(row.id),
				productEan: row.ean,
				supermarketId: row.supermarketId,
				price: row.price,
				listPrice: row.listPrice,
				referencePrice: row.referencePrice,
				referenceUnit: row.referenceUnit,
				isAvailable: row.isAvailable,
				skuId: row.skuId,
				sellerId: row.sellerId,
				productUrl: row.productUrl,
				productUrlHost: existingHost,
				lastCheckedAt: row.lastCheckedAt,
			},
			latestPriceHistory: row.latestPriceHistory,
		},
		live: liveProduct
			? {
					...liveProduct,
					lookupResultCount: liveProducts.length,
					productUrlHost: liveHost,
				}
			: null,
		expectedChanges,
		rollbackSnapshotFields: ROLLBACK_FIELDS,
		guards: {
			status,
			reasons,
			existingRow: row.sourceSlug === config.slug,
			hasProductSnapshot,
			hasEan,
			hasSkuId,
			sourceSkuUnique,
			directLookupCount: liveProducts.length,
			exactEanMatch,
			exactSkuMatch,
			carrefourHostOnly,
			hostDrift,
			positiveLivePrice,
			priceDeltaPercent,
			priceDeltaWithinLimit,
		},
		stopConditions: reasons,
		action: status === "PASS" ? "would-refresh-existing-row" : "blocked",
	};
}

function guardReasons({
	row,
	hasProductSnapshot,
	hasEan,
	hasSkuId,
	sourceSkuUnique,
	directLookupCount,
	lookupError,
	exactEanMatch,
	exactSkuMatch,
	carrefourHostOnly,
	hostDrift,
	positiveLivePrice,
	priceDeltaWithinLimit,
	maxPriceDeltaPercent,
	config,
}: {
	row: DirectRefreshPrewriteExistingRow;
	hasProductSnapshot: boolean;
	hasEan: boolean;
	hasSkuId: boolean;
	sourceSkuUnique: boolean;
	directLookupCount: number;
	lookupError: string | null;
	exactEanMatch: boolean;
	exactSkuMatch: boolean;
	carrefourHostOnly: boolean;
	hostDrift: boolean;
	positiveLivePrice: boolean;
	priceDeltaWithinLimit: boolean;
	maxPriceDeltaPercent: number;
	config: DirectRefreshSourceConfig;
}) {
	const reasons: string[] = [];
	if (row.sourceSlug !== config.slug)
		reasons.push(`row source is not ${config.slug}`);
	if (!hasProductSnapshot) reasons.push("current DB product snapshot missing");
	if (!hasEan) reasons.push("existing row lacks EAN");
	if (!hasSkuId) reasons.push("existing row lacks SKU id");
	if (hasSkuId && !sourceSkuUnique)
		reasons.push("sourceSlug+skuId is not unique for the existing row");
	if (lookupError) {
		reasons.push(`direct sku-id lookup failed: ${lookupError}`);
	} else if (hasSkuId && directLookupCount !== 1) {
		reasons.push(
			`direct sku-id lookup returned ${directLookupCount} live products`,
		);
	}
	if (directLookupCount === 1 && !exactEanMatch)
		reasons.push("direct lookup EAN does not match existing EAN");
	if (directLookupCount === 1 && !exactSkuMatch)
		reasons.push("direct lookup SKU does not match existing SKU");
	if (directLookupCount === 1 && !carrefourHostOnly)
		reasons.push(`live product URL host is not ${config.expectedHost}`);
	if (hostDrift) reasons.push("existing/live product URL host drift");
	if (directLookupCount === 1 && !positiveLivePrice)
		reasons.push("live price is not positive");
	if (!priceDeltaWithinLimit)
		reasons.push(`live price delta exceeds ${maxPriceDeltaPercent}%`);
	return reasons;
}

function buildExpectedChanges(
	row: DirectRefreshPrewriteExistingRow,
	liveProduct: NormalizedProduct | null,
	generatedAt: string,
) {
	const product: DirectRefreshPrewriteChange[] = [];
	const supermarketProduct: DirectRefreshPrewriteChange[] = [];
	if (liveProduct && row.product) {
		pushChange(product, "name", row.product.name, liveProduct.name);
		pushChange(product, "brand", row.product.brand, liveProduct.brand);
		pushChange(
			product,
			"description",
			row.product.description,
			liveProduct.description,
		);
		pushChange(product, "imageUrl", row.product.imageUrl, liveProduct.imageUrl);
		pushArrayChange(product, "images", row.product.images, liveProduct.images);
		pushChange(product, "category", row.product.category, liveProduct.category);
	}
	if (liveProduct) {
		pushChange(supermarketProduct, "price", row.price, liveProduct.price);
		pushChange(
			supermarketProduct,
			"listPrice",
			row.listPrice,
			liveProduct.listPrice,
		);
		pushChange(
			supermarketProduct,
			"referencePrice",
			row.referencePrice,
			liveProduct.referencePrice,
		);
		pushChange(
			supermarketProduct,
			"referenceUnit",
			row.referenceUnit,
			liveProduct.referenceUnit,
		);
		pushChange(
			supermarketProduct,
			"isAvailable",
			row.isAvailable,
			liveProduct.isAvailable,
		);
		pushChange(supermarketProduct, "skuId", row.skuId, liveProduct.skuId);
		pushChange(
			supermarketProduct,
			"sellerId",
			row.sellerId,
			liveProduct.sellerId,
		);
		pushChange(
			supermarketProduct,
			"productUrl",
			row.productUrl,
			liveProduct.productUrl,
		);
		pushChange(
			supermarketProduct,
			"lastCheckedAt",
			row.lastCheckedAt,
			generatedAt,
		);
	}
	return {
		product,
		supermarketProduct,
		priceHistory: {
			wouldInsert: shouldInsertHistory(row.latestPriceHistory, liveProduct),
			price: liveProduct?.price ?? null,
			listPrice: liveProduct?.listPrice ?? null,
		},
	};
}

function pushChange(
	changes: DirectRefreshPrewriteChange[],
	field: string,
	before: JsonValue,
	after: JsonValue,
) {
	if (!sameScalar(before, after)) changes.push({ field, before, after });
}

function pushArrayChange(
	changes: DirectRefreshPrewriteChange[],
	field: string,
	before: string[],
	after: string[],
) {
	const normalizedBefore = [...before].sort();
	const normalizedAfter = [...after].sort();
	if (JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter)) {
		changes.push({ field, before: normalizedBefore, after: normalizedAfter });
	}
}

function shouldInsertHistory(
	latestHistory: DirectRefreshPrewritePriceHistorySnapshot | null,
	liveProduct: NormalizedProduct | null,
) {
	if (!liveProduct) return false;
	if (!latestHistory) return true;
	return (
		normalizeComparablePrice(latestHistory.price) !==
			normalizeComparablePrice(liveProduct.price) ||
		normalizeComparablePrice(latestHistory.listPrice) !==
			normalizeComparablePrice(liveProduct.listPrice)
	);
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

function normalizeComparablePrice(value: number | null) {
	return value === null ? null : value.toFixed(2);
}

function sameScalar(left: JsonValue, right: JsonValue) {
	if (typeof left === "number" || typeof right === "number") {
		return normalizeNumber(left) === normalizeNumber(right);
	}
	return left === right;
}

function normalizeNumber(value: JsonValue) {
	return typeof value === "number" ? Number(value.toFixed(4)) : value;
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

function numericId(value: string) {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : value;
}

function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}

export function buildPrewriteReportHash(value: unknown) {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableJson).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function sourceConfig(sourceSlug: string): DirectRefreshSourceConfig {
	if (sourceSlug in SOURCE_CONFIGS) {
		return SOURCE_CONFIGS[sourceSlug as DirectRefreshSourceSlug];
	}
	throw new Error(
		`direct refresh pre-write gate is restricted to allowlisted source (${ALLOWED_SOURCE_LIST})`,
	);
}
