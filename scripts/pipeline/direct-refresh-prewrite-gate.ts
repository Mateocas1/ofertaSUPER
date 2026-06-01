import { createHash } from "node:crypto";

import type { NormalizedProduct } from "../../src/lib/vtex/normalize";

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
	sourceSlug: "carrefour";
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
	audit: "carrefour-direct-refresh-prewrite-gate";
	status: GateStatus;
	generatedAt: string;
	basis: "production";
	dryRun: true;
	writeBoundary: "read-only pre-write gate; no production writes, no staging/ingestion runs, no active refresh/reconcile, no scheduler/cron/workflow side effects";
	source: {
		slug: "carrefour";
		supermarketId: number | null;
		baseUrl: string | null;
		expectedHost: "carrefour.com.ar";
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
		strategy: "oldest-public-rankable-existing-rows";
		requestedSampleSize: number;
		selectedRows: number;
	};
	summary: {
		passRows: number;
		failRows: number;
		expectedSupermarketProductUpdates: number;
		expectedProductUpdates: number;
		expectedPriceHistoryInserts: number;
		failClosedReasons: string[];
	};
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
			source: "carrefour";
			reportHash: string;
			rowIds: string[];
			skuIds: string[];
			productEans: string[];
		};
	};
	rows: DirectRefreshPrewriteRow[];
};

const CARREFOUR_SOURCE = "carrefour" as const;
const CARREFOUR_HOST = "carrefour.com.ar" as const;
const WRITE_BOUNDARY =
	"read-only pre-write gate; no production writes, no staging/ingestion runs, no active refresh/reconcile, no scheduler/cron/workflow side effects" as const;
const MAX_PRICE_DELTA_PERCENT = 200;
const IDENTITY_GUARDS = [
	"existing Carrefour row",
	"current DB product snapshot",
	"non-empty EAN",
	"non-empty SKU",
	"sourceSlug+skuId unique in existing DB rows",
	"exactly one live product from direct SKU lookup",
	"exact EAN match",
	"exact SKU match",
	"live URL host is carrefour.com.ar",
	"no existing/live host drift when existing URL has a host",
	"positive live price",
	`live price delta is <= ${MAX_PRICE_DELTA_PERCENT}% when current DB price is positive`,
	"rollback snapshot fields are present",
];
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

export async function buildCarrefourDirectRefreshPrewriteGate({
	repository,
	fetchDirectProducts,
	sourceSlug = CARREFOUR_SOURCE,
	sampleSize = 10,
	now = new Date(),
	maxPriceDeltaPercent = MAX_PRICE_DELTA_PERCENT,
}: {
	repository: DirectRefreshPrewriteRepository;
	fetchDirectProducts(
		sourceSlug: "carrefour",
		lookup: { kind: "sku-id"; value: string },
	): Promise<NormalizedProduct[]>;
	sourceSlug?: string;
	sampleSize?: number;
	now?: Date;
	maxPriceDeltaPercent?: number;
}): Promise<CarrefourDirectRefreshPrewriteGate> {
	if (sourceSlug !== CARREFOUR_SOURCE) {
		throw new Error(
			"direct refresh pre-write gate is restricted to source=carrefour",
		);
	}

	const generatedAt = now.toISOString();
	const source = await repository.getSource(CARREFOUR_SOURCE);
	const selectedRows = source
		? await repository.listOldestPublicRankableRows(
				CARREFOUR_SOURCE,
				sampleSize,
			)
		: [];
	const maxPriceHistoryId = source
		? await repository.getMaxPriceHistoryId()
		: null;
	const rows = await Promise.all(
		selectedRows.map((row) =>
			evaluatePrewriteRow({
				row,
				repository,
				fetchDirectProducts,
				generatedAt,
				maxPriceDeltaPercent,
			}),
		),
	);
	const sourceFailReasons = source ? [] : ["source carrefour not found"];
	const selectedFailReasons =
		selectedRows.length === 0 ? ["no rows selected"] : [];
	const rowFailReasons = rows.flatMap((row) =>
		row.guards.status === "FAIL" ? row.guards.reasons : [],
	);
	const failClosedReasons = uniqueSorted([
		...sourceFailReasons,
		...selectedFailReasons,
		...rowFailReasons,
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
		audit: "carrefour-direct-refresh-prewrite-gate" as const,
		status:
			failClosedReasons.length === 0 &&
			rows.every((row) => row.guards.status === "PASS")
				? ("PASS" as const)
				: ("FAIL" as const),
		generatedAt,
		basis: "production" as const,
		dryRun: true as const,
		writeBoundary: WRITE_BOUNDARY,
		source: {
			slug: CARREFOUR_SOURCE,
			supermarketId: source?.id ?? null,
			baseUrl: source?.baseUrl ?? null,
			expectedHost: CARREFOUR_HOST,
		},
		primitive: {
			kind: "vtex-catalog-direct-lookup" as const,
			lookupKind: "sku-id" as const,
			endpointPattern:
				"/api/catalog_system/pub/products/search?fq=skuId:<skuId>" as const,
		},
		identity: {
			model: "sourceSlug+skuId" as const,
			guards: IDENTITY_GUARDS,
		},
		selection: {
			strategy: "oldest-public-rankable-existing-rows" as const,
			requestedSampleSize: sampleSize,
			selectedRows: selectedRows.length,
		},
		summary,
		rollbackSnapshot,
		rows,
	};
	const confirmationShape = {
		source: CARREFOUR_SOURCE,
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
}: {
	row: DirectRefreshPrewriteExistingRow;
	repository: DirectRefreshPrewriteRepository;
	fetchDirectProducts(
		sourceSlug: "carrefour",
		lookup: { kind: "sku-id"; value: string },
	): Promise<NormalizedProduct[]>;
	generatedAt: string;
	maxPriceDeltaPercent: number;
}): Promise<DirectRefreshPrewriteRow> {
	const hasProductSnapshot = Boolean(row.product);
	const hasEan = Boolean(row.ean?.trim());
	const hasSkuId = Boolean(row.skuId?.trim());
	const skuMatches = hasSkuId
		? await repository.findRowsBySourceSku(CARREFOUR_SOURCE, row.skuId ?? "")
		: [];
	const sourceSkuUnique =
		hasSkuId && skuMatches.length === 1 && skuMatches[0]?.id === row.id;
	let lookupError: string | null = null;
	let liveProducts: NormalizedProduct[] = [];
	if (hasSkuId && row.sourceSlug === CARREFOUR_SOURCE) {
		try {
			liveProducts = await fetchDirectProducts(CARREFOUR_SOURCE, {
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
	const carrefourHostOnly = liveHost === CARREFOUR_HOST;
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
	});
	const status = reasons.length === 0 ? "PASS" : "FAIL";
	const expectedChanges = buildExpectedChanges(row, liveProduct, generatedAt);

	return {
		rowId: row.id,
		sourceSlug: CARREFOUR_SOURCE,
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
			existingRow: row.sourceSlug === CARREFOUR_SOURCE,
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
}) {
	const reasons: string[] = [];
	if (row.sourceSlug !== CARREFOUR_SOURCE)
		reasons.push("row source is not carrefour");
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
		reasons.push("live product URL host is not carrefour.com.ar");
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
