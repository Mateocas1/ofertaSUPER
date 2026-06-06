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
	now?: Date;
};

type AppliedCreate = DirectRefreshDiscoveryCreateApplyReport["appliedCreates"][number];

export async function buildDirectRefreshDiscoveryCreatePostwriteAudit({
	prewrite,
	apply,
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

	if (failClosedReasons.length === 0) {
		failClosedReasons.push(
			"postwrite row verification requires source and history checks",
		);
	}

	const productAndSourceEans = plannedCreates
		.filter((plan) => plan.classification === "product-and-source-discovery")
		.map((plan) => plan.product.ean);
	const sortedFailClosedReasons = sortedStrings(failClosedReasons);

	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-create-postwrite",
		status: "FAIL",
		issue: prewrite.issue,
		generatedAt,
		source: prewrite.filters.source,
		count: prewrite.filters.count,
		selectedKeys,
		applyGeneratedAt: apply.generatedAt,
		prewriteGeneratedAt: prewrite.generatedAt,
		summary: {
			productsExpected: productAndSourceEans.length,
			productsFound: 0,
			supermarketProductsExpected: plannedCreates.length,
			supermarketProductsFound: 0,
			priceHistoryExpected: plannedCreates.length,
			priceHistoryFound: 0,
			failClosedReasons: sortedFailClosedReasons,
		},
		createdRows: {
			products: [],
			supermarketProducts: [],
			priceHistory: [],
		},
		noExtraRows: {
			products: false,
			supermarketProducts: false,
			priceHistory: false,
		},
		rollbackPlan: {
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

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

function sortedStrings(values: string[]) {
	return Array.from(new Set(values)).sort();
}
