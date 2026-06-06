import type {
	DirectRefreshDiscoveryCreateApplyReport,
	DirectRefreshDiscoveryCreatePrewriteReport,
	DirectRefreshDiscoveryPlannedCreate,
} from "./direct-refresh-discovery-create-gate";

type DirectRefreshDiscoveryCreatePostwriteStatus = "PASS" | "FAIL";

export type DirectRefreshDiscoveryPostwriteProductRow = {
	ean: string;
	name: string | null;
	brand: string | null;
	description: string | null;
	category: string | null;
	imageUrl: string | null;
	images: string[];
};

export type DirectRefreshDiscoveryPostwriteSupermarketProductRow = {
	id: number;
	productEan: string;
	supermarketId: number;
	skuId: string | null;
	price: number | null;
	listPrice: number | null;
	referencePrice: number | null;
	referenceUnit: string | null;
	isAvailable: boolean;
	sellerId: string | null;
	productUrl: string | null;
	lastCheckedAt: string | null;
};

export type DirectRefreshDiscoveryPostwritePriceHistoryRow = {
	id: number;
	supermarketProductId: number;
	price: number | null;
	listPrice: number | null;
	scrapedAt: string | null;
};

export type DirectRefreshDiscoveryCreatePostwriteRepository = {
	getProductsByEan(
		eans: string[],
	): Promise<DirectRefreshDiscoveryPostwriteProductRow[]>;
	getSupermarketProductsByIds(
		ids: number[],
	): Promise<DirectRefreshDiscoveryPostwriteSupermarketProductRow[]>;
	getSupermarketProductsBySourceEanPairs(
		pairs: Array<{ productEan: string; supermarketId: number }>,
	): Promise<DirectRefreshDiscoveryPostwriteSupermarketProductRow[]>;
	getPriceHistoryRowsByIds(
		ids: number[],
	): Promise<DirectRefreshDiscoveryPostwritePriceHistoryRow[]>;
	getPriceHistoryRowsForSupermarketProductsSince(
		supermarketProductIds: number[],
		sinceIso: string,
	): Promise<DirectRefreshDiscoveryPostwritePriceHistoryRow[]>;
};

export type DirectRefreshDiscoveryCreatePostwriteReport = {
	schemaVersion: 1;
	audit: "direct-refresh-discovery-create-postwrite";
	status: DirectRefreshDiscoveryCreatePostwriteStatus;
	issue: number;
	generatedAt: string;
	source: string;
	count: number;
	selectedKeys: string[];
	applyGeneratedAt: string;
	prewriteGeneratedAt: string;
	summary: {
		productsExpected: number;
		productsFound: number;
		supermarketProductsExpected: number;
		supermarketProductsFound: number;
		priceHistoryExpected: number;
		priceHistoryFound: number;
		failClosedReasons: string[];
	};
	createdRows: {
		products: DirectRefreshDiscoveryPostwriteProductRow[];
		supermarketProducts: DirectRefreshDiscoveryPostwriteSupermarketProductRow[];
		priceHistory: DirectRefreshDiscoveryPostwritePriceHistoryRow[];
	};
	noExtraRows: {
		products: boolean;
		supermarketProducts: boolean;
		priceHistory: boolean;
	};
	rollbackPlan: {
		deletePriceHistoryIds: number[];
		deleteSupermarketProductIds: number[];
		deleteProductEans: string[];
	};
};

export type BuildDirectRefreshDiscoveryCreatePostwriteAuditOptions = {
	prewrite: DirectRefreshDiscoveryCreatePrewriteReport;
	apply: DirectRefreshDiscoveryCreateApplyReport;
	repository: DirectRefreshDiscoveryCreatePostwriteRepository;
	now?: Date;
};

type AppliedCreate = DirectRefreshDiscoveryCreateApplyReport["appliedCreates"][number];

export async function buildDirectRefreshDiscoveryCreatePostwriteAudit({
	prewrite,
	apply,
	repository,
	now = new Date(),
}: BuildDirectRefreshDiscoveryCreatePostwriteAuditOptions): Promise<DirectRefreshDiscoveryCreatePostwriteReport> {
	const generatedAt = now.toISOString();
	const selectedKeys = sortedStrings(prewrite.summary.selectedKeys);
	const failClosedReasons: string[] = [];

	validateArtifacts({ prewrite, apply, selectedKeys, failClosedReasons });

	const plannedByKey = new Map(
		prewrite.plannedCreates.map((row) => [row.idempotencyKey, row]),
	);
	const appliedByKey = new Map(
		apply.appliedCreates.map((row) => [row.idempotencyKey, row]),
	);

	for (const key of selectedKeys) {
		if (!plannedByKey.has(key)) {
			failClosedReasons.push(`selected key missing from planned creates: ${key}`);
		}
		if (!appliedByKey.has(key)) {
			failClosedReasons.push(`selected key missing from applied creates: ${key}`);
		}
	}

	const plannedCreates = selectedKeys
		.map((key) => plannedByKey.get(key))
		.filter(isDefined);
	const appliedCreates = selectedKeys
		.map((key) => appliedByKey.get(key))
		.filter(isDefined);

	validateAppliedRows({ plannedCreates, appliedCreates, failClosedReasons });

	const productAndSourceEans = plannedCreates
		.filter((plan) => plan.classification === "product-and-source-discovery")
		.map((plan) => plan.product.ean);
	const supermarketProductIds = appliedCreates.map(
		(row) => row.supermarketProductId,
	);
	const priceHistoryIds = appliedCreates.map((row) => row.priceHistoryId);
	const sourcePairs = plannedCreates.map((plan) => ({
		productEan: plan.product.ean,
		supermarketId: plan.supermarketProduct.supermarketId,
	}));

	let products: DirectRefreshDiscoveryPostwriteProductRow[] = [];
	let supermarketProductsById: DirectRefreshDiscoveryPostwriteSupermarketProductRow[] =
		[];
	let sourceRows: DirectRefreshDiscoveryPostwriteSupermarketProductRow[] = [];
	let priceHistoryById: DirectRefreshDiscoveryPostwritePriceHistoryRow[] = [];
	let priceHistoryForSourceRows: DirectRefreshDiscoveryPostwritePriceHistoryRow[] =
		[];

	if (failClosedReasons.length === 0) {
		[
			products,
			supermarketProductsById,
			sourceRows,
			priceHistoryById,
			priceHistoryForSourceRows,
		] = await Promise.all([
			productAndSourceEans.length
				? repository.getProductsByEan(productAndSourceEans)
				: Promise.resolve([]),
			supermarketProductIds.length
				? repository.getSupermarketProductsByIds(supermarketProductIds)
				: Promise.resolve([]),
			sourcePairs.length
				? repository.getSupermarketProductsBySourceEanPairs(sourcePairs)
				: Promise.resolve([]),
			priceHistoryIds.length
				? repository.getPriceHistoryRowsByIds(priceHistoryIds)
				: Promise.resolve([]),
			supermarketProductIds.length
				? repository.getPriceHistoryRowsForSupermarketProductsSince(
						supermarketProductIds,
						prewrite.generatedAt,
					)
				: Promise.resolve([]),
		]);

		auditProducts({ plannedCreates, products, failClosedReasons });
		auditSupermarketProducts({
			plannedCreates,
			appliedCreates,
			supermarketProductsById,
			failClosedReasons,
		});
		auditPriceHistory({
			plannedCreates,
			appliedCreates,
			priceHistoryById,
			failClosedReasons,
		});
	}

	const expectedSourceIds = new Set(supermarketProductIds);
	const expectedHistoryIds = new Set(priceHistoryIds);
	const extraSourceIds = sortedNumbers(
		sourceRows.map((row) => row.id).filter((id) => !expectedSourceIds.has(id)),
	);
	if (extraSourceIds.length > 0) {
		failClosedReasons.push(
			`extra supermarket_products rows for selected source/EAN: ${extraSourceIds.join(",")}`,
		);
	}
	const extraHistoryIds = sortedNumbers(
		priceHistoryForSourceRows
			.map((row) => row.id)
			.filter((id) => !expectedHistoryIds.has(id)),
	);
	if (extraHistoryIds.length > 0) {
		failClosedReasons.push(
			`extra price_history rows for created source rows: ${extraHistoryIds.join(",")}`,
		);
	}
	const noExtraProductRows = hasExactlyOneProductRowPerEan(
		productAndSourceEans,
		products,
	);
	if (!noExtraProductRows) {
		const extraProductEans = productAndSourceEans.filter(
			(ean) => products.filter((row) => row.ean === ean).length > 1,
		);
		if (extraProductEans.length > 0) {
			failClosedReasons.push(
				`extra product rows for created product EANs: ${sortedStrings(extraProductEans).join(",")}`,
			);
		}
	}

	const sortedFailClosedReasons = sortedStrings(failClosedReasons);
	const status: DirectRefreshDiscoveryCreatePostwriteStatus =
		sortedFailClosedReasons.length === 0 ? "PASS" : "FAIL";

	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-create-postwrite",
		status,
		issue: prewrite.issue,
		generatedAt,
		source: prewrite.filters.source,
		count: prewrite.filters.count,
		selectedKeys,
		applyGeneratedAt: apply.generatedAt,
		prewriteGeneratedAt: prewrite.generatedAt,
		summary: {
			productsExpected: productAndSourceEans.length,
			productsFound: products.length,
			supermarketProductsExpected: plannedCreates.length,
			supermarketProductsFound: supermarketProductsById.length,
			priceHistoryExpected: plannedCreates.length,
			priceHistoryFound: priceHistoryById.length,
			failClosedReasons: sortedFailClosedReasons,
		},
		createdRows: {
			products: [...products].sort((left, right) =>
				left.ean.localeCompare(right.ean),
			),
			supermarketProducts: [...supermarketProductsById].sort(
				(left, right) => left.id - right.id,
			),
			priceHistory: [...priceHistoryById].sort(
				(left, right) => left.id - right.id,
			),
		},
		noExtraRows: {
			products: noExtraProductRows,
			supermarketProducts: extraSourceIds.length === 0,
			priceHistory: extraHistoryIds.length === 0,
		},
		rollbackPlan:
			status === "PASS"
				? {
						deletePriceHistoryIds: sortedNumbers(priceHistoryIds),
						deleteSupermarketProductIds: sortedNumbers(supermarketProductIds),
						deleteProductEans: sortedStrings(productAndSourceEans),
					}
				: {
						deletePriceHistoryIds: [],
						deleteSupermarketProductIds: [],
						deleteProductEans: [],
					},
	};
}

function validateArtifacts({
	prewrite,
	apply,
	selectedKeys,
	failClosedReasons,
}: {
	prewrite: DirectRefreshDiscoveryCreatePrewriteReport;
	apply: DirectRefreshDiscoveryCreateApplyReport;
	selectedKeys: string[];
	failClosedReasons: string[];
}) {
	if (prewrite.status !== "PASS") failClosedReasons.push("prewrite status must be PASS");
	if (apply.status !== "PASS") failClosedReasons.push("apply status must be PASS");
	if (apply.issue !== prewrite.issue) {
		failClosedReasons.push("apply issue must match prewrite issue");
	}
	if (apply.prewriteGeneratedAt !== prewrite.generatedAt) {
		failClosedReasons.push(
			"apply prewriteGeneratedAt must match prewrite generatedAt",
		);
	}
	if (selectedKeys.length !== prewrite.filters.count) {
		failClosedReasons.push(
			`selected key count must match prewrite count ${prewrite.filters.count}`,
		);
	}
	if (prewrite.plannedCreates.length !== selectedKeys.length) {
		failClosedReasons.push("planned create count must match selected key count");
	}
	if (apply.appliedCreates.length !== selectedKeys.length) {
		failClosedReasons.push("applied create count must match selected key count");
	}
	if (new Set(prewrite.plannedCreates.map((row) => row.idempotencyKey)).size !== prewrite.plannedCreates.length) {
		failClosedReasons.push("planned create keys must be unique");
	}
	if (new Set(apply.appliedCreates.map((row) => row.idempotencyKey)).size !== apply.appliedCreates.length) {
		failClosedReasons.push("applied create keys must be unique");
	}
}

function validateAppliedRows({
	plannedCreates,
	appliedCreates,
	failClosedReasons,
}: {
	plannedCreates: DirectRefreshDiscoveryPlannedCreate[];
	appliedCreates: AppliedCreate[];
	failClosedReasons: string[];
}) {
	const plannedByKey = new Map(
		plannedCreates.map((row) => [row.idempotencyKey, row]),
	);

	for (const applied of appliedCreates) {
		const planned = plannedByKey.get(applied.idempotencyKey);
		if (!planned) continue;
		if (applied.productEan !== planned.product.ean) {
			failClosedReasons.push(
				`applied create productEan mismatch for selected key ${applied.idempotencyKey}`,
			);
		}
		if (planned.supermarketProduct.productEan !== planned.product.ean) {
			failClosedReasons.push(
				`planned supermarket_products productEan mismatch for selected key ${applied.idempotencyKey}`,
			);
		}
	}
}

function auditProducts({
	plannedCreates,
	products,
	failClosedReasons,
}: {
	plannedCreates: DirectRefreshDiscoveryPlannedCreate[];
	products: DirectRefreshDiscoveryPostwriteProductRow[];
	failClosedReasons: string[];
}) {
	const productByEan = new Map(products.map((row) => [row.ean, row]));
	for (const plan of plannedCreates) {
		if (plan.classification !== "product-and-source-discovery") continue;
		const actual = productByEan.get(plan.product.ean);
		if (!actual) {
			failClosedReasons.push(`missing created product ean ${plan.product.ean}`);
			continue;
		}
		addMismatchReason(failClosedReasons, `product ean ${plan.product.ean} name mismatch`, actual.name, plan.product.name);
		addMismatchReason(failClosedReasons, `product ean ${plan.product.ean} brand mismatch`, actual.brand, plan.product.brand);
		addMismatchReason(failClosedReasons, `product ean ${plan.product.ean} description mismatch`, actual.description, plan.product.description);
		addMismatchReason(failClosedReasons, `product ean ${plan.product.ean} category mismatch`, actual.category, plan.product.category);
		addMismatchReason(failClosedReasons, `product ean ${plan.product.ean} imageUrl mismatch`, actual.imageUrl, plan.product.imageUrl);
		addArrayMismatchReason(failClosedReasons, `product ean ${plan.product.ean} images mismatch`, actual.images, plan.product.images);
	}
}

function auditSupermarketProducts({
	plannedCreates,
	appliedCreates,
	supermarketProductsById,
	failClosedReasons,
}: {
	plannedCreates: DirectRefreshDiscoveryPlannedCreate[];
	appliedCreates: AppliedCreate[];
	supermarketProductsById: DirectRefreshDiscoveryPostwriteSupermarketProductRow[];
	failClosedReasons: string[];
}) {
	const plannedByKey = new Map(
		plannedCreates.map((row) => [row.idempotencyKey, row]),
	);
	const actualById = new Map(supermarketProductsById.map((row) => [row.id, row]));

	for (const applied of appliedCreates) {
		const planned = plannedByKey.get(applied.idempotencyKey);
		const actual = actualById.get(applied.supermarketProductId);
		if (!planned) continue;
		if (!actual) {
			failClosedReasons.push(
				`missing created supermarket_products id ${applied.supermarketProductId}`,
			);
			continue;
		}
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} productEan mismatch`, actual.productEan, planned.supermarketProduct.productEan);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} supermarketId mismatch`, actual.supermarketId, planned.supermarketProduct.supermarketId);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} skuId mismatch`, actual.skuId, planned.supermarketProduct.skuId);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} price mismatch`, actual.price, planned.supermarketProduct.price);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} listPrice mismatch`, actual.listPrice, planned.supermarketProduct.listPrice);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} referencePrice mismatch`, actual.referencePrice, planned.supermarketProduct.referencePrice);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} referenceUnit mismatch`, actual.referenceUnit, planned.supermarketProduct.referenceUnit);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} isAvailable mismatch`, actual.isAvailable, planned.supermarketProduct.isAvailable);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} sellerId mismatch`, actual.sellerId, planned.supermarketProduct.sellerId);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} productUrl mismatch`, actual.productUrl, planned.supermarketProduct.productUrl);
		addMismatchReason(failClosedReasons, `supermarket_products id ${applied.supermarketProductId} lastCheckedAt mismatch`, actual.lastCheckedAt, planned.supermarketProduct.lastCheckedAt);
	}
}

function auditPriceHistory({
	plannedCreates,
	appliedCreates,
	priceHistoryById,
	failClosedReasons,
}: {
	plannedCreates: DirectRefreshDiscoveryPlannedCreate[];
	appliedCreates: AppliedCreate[];
	priceHistoryById: DirectRefreshDiscoveryPostwritePriceHistoryRow[];
	failClosedReasons: string[];
}) {
	const plannedByKey = new Map(
		plannedCreates.map((row) => [row.idempotencyKey, row]),
	);
	const actualById = new Map(priceHistoryById.map((row) => [row.id, row]));

	for (const applied of appliedCreates) {
		const planned = plannedByKey.get(applied.idempotencyKey);
		const actual = actualById.get(applied.priceHistoryId);
		if (!planned) continue;
		if (!actual) {
			failClosedReasons.push(
				`missing created price_history id ${applied.priceHistoryId}`,
			);
			continue;
		}
		addMismatchReason(failClosedReasons, `price_history id ${applied.priceHistoryId} supermarketProductId mismatch`, actual.supermarketProductId, applied.supermarketProductId);
		addMismatchReason(failClosedReasons, `price_history id ${applied.priceHistoryId} price mismatch`, actual.price, planned.priceHistory.price);
		addMismatchReason(failClosedReasons, `price_history id ${applied.priceHistoryId} listPrice mismatch`, actual.listPrice, planned.priceHistory.listPrice);
		addMismatchReason(failClosedReasons, `price_history id ${applied.priceHistoryId} scrapedAt mismatch`, actual.scrapedAt, planned.priceHistory.scrapedAt);
	}
}

function addMismatchReason(
	reasons: string[],
	message: string,
	actual: unknown,
	expected: unknown,
) {
	if (actual !== expected) reasons.push(message);
}

function addArrayMismatchReason(
	reasons: string[],
	message: string,
	actual: string[],
	expected: string[],
) {
	if (!sameStringArray(actual, expected)) reasons.push(message);
}

function hasExactlyOneProductRowPerEan(
	eans: string[],
	products: DirectRefreshDiscoveryPostwriteProductRow[],
) {
	return eans.every(
		(ean) => products.filter((product) => product.ean === ean).length === 1,
	);
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

function sortedNumbers(values: number[]) {
	return Array.from(new Set(values)).sort((left, right) => left - right);
}

function sortedStrings(values: string[]) {
	return Array.from(new Set(values)).sort();
}

function sameStringArray(left: string[], right: string[]) {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}
