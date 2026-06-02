type ManifestStatus = "PASS" | "FAIL";
type RowGuardStatus = "PASS" | "FAIL";

type LiveProduct = {
	ean: string;
	skuId: string | null;
	productUrl: string | null;
	price: number | null;
	listPrice: number | null;
	isAvailable: boolean;
};

export type DirectRefreshManifestSource = {
	id: number;
	slug: string;
	baseUrl: string;
};

export type DirectRefreshManifestExistingRow = {
	id: string;
	sourceSlug: string;
	supermarketId: number;
	ean: string | null;
	skuId: string | null;
	productUrl: string | null;
	lastCheckedAt: string | null;
	price: number | null;
	listPrice: number | null;
};

export type DirectRefreshManifestRepository = {
	getSource(sourceSlug: string): Promise<DirectRefreshManifestSource | null>;
	listOldestPublicRankableRows(
		sourceSlug: string,
		sampleSize: number,
	): Promise<DirectRefreshManifestExistingRow[]>;
	findRowsBySourceSku(
		sourceSlug: string,
		skuId: string,
	): Promise<DirectRefreshManifestExistingRow[]>;
};

export type DirectRefreshManifestRow = {
	rowId: string;
	sourceSlug: DirectRefreshSourceSlug;
	lookup: { kind: "sku-id"; value: string | null };
	existing: {
		supermarketProductId: number | string;
		productEan: string | null;
		skuId: string | null;
		productUrl: string | null;
		productUrlHost: string | null;
		lastCheckedAt: string | null;
		price: number | null;
		listPrice: number | null;
	};
	live: null | {
		lookupResultCount: number;
		ean: string;
		skuId: string | null;
		productUrl: string | null;
		productUrlHost: string | null;
		price: number | null;
		listPrice: number | null;
		isAvailable: boolean;
	};
	guards: {
		status: RowGuardStatus;
		reasons: string[];
		existingRow: boolean;
		hasEan: boolean;
		hasSkuId: boolean;
		sourceSkuUnique: boolean;
		directLookupCount: number;
		exactEanMatch: boolean;
		exactSkuMatch: boolean;
		carrefourHostOnly: boolean;
		hostDrift: boolean;
	};
	action: "would-refresh-existing-row" | "blocked";
};

export type CarrefourDirectRefreshManifestDryRun = {
	schemaVersion: 1;
	audit: `${DirectRefreshSourceSlug}-direct-refresh-manifest-dry-run`;
	status: ManifestStatus;
	generatedAt: string;
	basis: "production";
	dryRun: true;
	writeBoundary: "read-only manifest contract; no production writes, no staging/ingestion runs, no scheduler/cron/workflow side effects";
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
		strategy: "oldest-public-rankable-existing-rows";
		requestedSampleSize: number;
		selectedRows: number;
	};
	summary: {
		passRows: number;
		failRows: number;
		failClosedReasons: string[];
	};
	rows: DirectRefreshManifestRow[];
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
} as const;
type DirectRefreshSourceSlug = keyof typeof SOURCE_CONFIGS;
type DirectRefreshExpectedHost =
	(typeof SOURCE_CONFIGS)[DirectRefreshSourceSlug]["expectedHost"];
type DirectRefreshSourceConfig =
	(typeof SOURCE_CONFIGS)[DirectRefreshSourceSlug];
const CARREFOUR_SOURCE = SOURCE_CONFIGS.carrefour.slug;
const ALLOWED_SOURCE_LIST = Object.keys(SOURCE_CONFIGS).join(", ");
const WRITE_BOUNDARY =
	"read-only manifest contract; no production writes, no staging/ingestion runs, no scheduler/cron/workflow side effects" as const;
function identityGuards(config: DirectRefreshSourceConfig) {
	return [
		`existing ${config.displayName} row`,
		"non-empty EAN",
		"non-empty SKU",
		"sourceSlug+skuId unique in existing DB rows",
		"exactly one live product from direct SKU lookup",
		"exact EAN match",
		"exact SKU match",
		`live URL host is ${config.expectedHost}`,
		"no existing/live host drift when existing URL has a host",
	];
}

export async function buildCarrefourDirectRefreshManifestDryRun(
	options: Omit<
		Parameters<typeof buildDirectRefreshManifestDryRun>[0],
		"sourceSlug"
	> & {
		sourceSlug?: string;
	},
): Promise<CarrefourDirectRefreshManifestDryRun> {
	return buildDirectRefreshManifestDryRun({
		...options,
		sourceSlug: options.sourceSlug ?? CARREFOUR_SOURCE,
	});
}

export async function buildDirectRefreshManifestDryRun({
	repository,
	fetchDirectProducts,
	sourceSlug = CARREFOUR_SOURCE,
	sampleSize = 10,
	now = new Date(),
}: {
	repository: DirectRefreshManifestRepository;
	fetchDirectProducts(
		sourceSlug: DirectRefreshSourceSlug,
		lookup: { kind: "sku-id"; value: string },
	): Promise<LiveProduct[]>;
	sourceSlug?: string;
	sampleSize?: number;
	now?: Date;
}): Promise<CarrefourDirectRefreshManifestDryRun> {
	const config = sourceConfig(sourceSlug);
	const source = await repository.getSource(config.slug);
	const selectedRows = source
		? await repository.listOldestPublicRankableRows(config.slug, sampleSize)
		: [];
	const rows = await Promise.all(
		selectedRows.map((row) =>
			evaluateManifestRow({ row, repository, fetchDirectProducts, config }),
		),
	);
	const selectedFailReasons =
		selectedRows.length === 0 ? ["no rows selected"] : [];
	const rowFailReasons = rows.flatMap((row) =>
		row.guards.status === "FAIL" ? row.guards.reasons : [],
	);
	const sourceFailReasons = source ? [] : [`source ${config.slug} not found`];
	const failClosedReasons = uniqueSorted([
		...sourceFailReasons,
		...selectedFailReasons,
		...rowFailReasons,
	]);
	const failRows = rows.filter((row) => row.guards.status === "FAIL").length;

	return {
		schemaVersion: 1,
		audit: `${config.slug}-direct-refresh-manifest-dry-run`,
		status:
			failClosedReasons.length === 0 &&
			rows.every((row) => row.guards.status === "PASS")
				? "PASS"
				: "FAIL",
		generatedAt: now.toISOString(),
		basis: "production",
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		source: {
			slug: config.slug,
			supermarketId: source?.id ?? null,
			baseUrl: source?.baseUrl ?? null,
			expectedHost: config.expectedHost,
		},
		primitive: {
			kind: "vtex-catalog-direct-lookup",
			lookupKind: "sku-id",
			endpointPattern:
				"/api/catalog_system/pub/products/search?fq=skuId:<skuId>",
		},
		identity: {
			model: "sourceSlug+skuId",
			guards: identityGuards(config),
		},
		selection: {
			strategy: "oldest-public-rankable-existing-rows",
			requestedSampleSize: sampleSize,
			selectedRows: selectedRows.length,
		},
		summary: {
			passRows: rows.length - failRows,
			failRows,
			failClosedReasons,
		},
		rows,
	};
}

async function evaluateManifestRow({
	row,
	repository,
	fetchDirectProducts,
	config,
}: {
	row: DirectRefreshManifestExistingRow;
	repository: DirectRefreshManifestRepository;
	fetchDirectProducts(
		sourceSlug: DirectRefreshSourceSlug,
		lookup: { kind: "sku-id"; value: string },
	): Promise<LiveProduct[]>;
	config: DirectRefreshSourceConfig;
}): Promise<DirectRefreshManifestRow> {
	const hasEan = Boolean(row.ean?.trim());
	const hasSkuId = Boolean(row.skuId?.trim());
	const skuMatches = hasSkuId
		? await repository.findRowsBySourceSku(config.slug, row.skuId ?? "")
		: [];
	const sourceSkuUnique =
		hasSkuId && skuMatches.length === 1 && skuMatches[0]?.id === row.id;
	let lookupError: string | null = null;
	let liveProducts: LiveProduct[] = [];
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
	const reasons = guardReasons({
		row,
		hasEan,
		hasSkuId,
		sourceSkuUnique,
		directLookupCount: liveProducts.length,
		lookupError,
		exactEanMatch,
		exactSkuMatch,
		carrefourHostOnly,
		hostDrift,
		config,
	});
	const status = reasons.length === 0 ? "PASS" : "FAIL";

	return {
		rowId: row.id,
		sourceSlug: config.slug,
		lookup: { kind: "sku-id", value: row.skuId },
		existing: {
			supermarketProductId: numericId(row.id),
			productEan: row.ean,
			skuId: row.skuId,
			productUrl: row.productUrl,
			productUrlHost: existingHost,
			lastCheckedAt: row.lastCheckedAt,
			price: row.price,
			listPrice: row.listPrice,
		},
		live: liveProduct
			? {
					lookupResultCount: liveProducts.length,
					ean: liveProduct.ean,
					skuId: liveProduct.skuId,
					productUrl: liveProduct.productUrl,
					productUrlHost: liveHost,
					price: liveProduct.price,
					listPrice: liveProduct.listPrice,
					isAvailable: liveProduct.isAvailable,
				}
			: null,
		guards: {
			status,
			reasons,
			existingRow: row.sourceSlug === config.slug,
			hasEan,
			hasSkuId,
			sourceSkuUnique,
			directLookupCount: liveProducts.length,
			exactEanMatch,
			exactSkuMatch,
			carrefourHostOnly,
			hostDrift,
		},
		action: status === "PASS" ? "would-refresh-existing-row" : "blocked",
	};
}

function guardReasons({
	row,
	hasEan,
	hasSkuId,
	sourceSkuUnique,
	directLookupCount,
	lookupError,
	exactEanMatch,
	exactSkuMatch,
	carrefourHostOnly,
	hostDrift,
	config,
}: {
	row: DirectRefreshManifestExistingRow;
	hasEan: boolean;
	hasSkuId: boolean;
	sourceSkuUnique: boolean;
	directLookupCount: number;
	lookupError: string | null;
	exactEanMatch: boolean;
	exactSkuMatch: boolean;
	carrefourHostOnly: boolean;
	hostDrift: boolean;
	config: DirectRefreshSourceConfig;
}) {
	const reasons: string[] = [];
	if (row.sourceSlug !== config.slug)
		reasons.push(`row source is not ${config.slug}`);
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
	return reasons;
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

function sourceConfig(sourceSlug: string): DirectRefreshSourceConfig {
	if (sourceSlug in SOURCE_CONFIGS) {
		return SOURCE_CONFIGS[sourceSlug as DirectRefreshSourceSlug];
	}
	throw new Error(
		`direct refresh manifest is restricted to allowlisted source (${ALLOWED_SOURCE_LIST})`,
	);
}
