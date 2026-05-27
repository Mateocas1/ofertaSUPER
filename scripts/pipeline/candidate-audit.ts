import type { NormalizedProduct } from "../../src/lib/vtex/normalize";

type CandidateAuditSourceSnapshot = {
	id: number;
	slug: string;
	name: string;
	isActive: boolean;
	isVtex: boolean;
};

type ProductSnapshot = {
	ean: string;
	name: string;
	brand: string | null;
	description: string | null;
	imageUrl: string | null;
	images: string[];
	category: string | null;
};

type SupermarketProductSnapshot = {
	id: number;
	productEan: string;
	supermarketId: number;
	price: number | null;
	listPrice: number | null;
	referencePrice: number | null;
	referenceUnit: string | null;
	isAvailable: boolean;
	skuId: string | null;
	sellerId: string | null;
	productUrl: string | null;
	lastCheckedAt: string;
};

type PriceHistorySnapshot = {
	id: number;
	supermarketProductId: number;
	price: number | null;
	listPrice: number | null;
	scrapedAt: string;
};

export type CandidateAuditRepository = {
	getSourceBySlug(slug: string): Promise<CandidateAuditSourceSnapshot | null>;
	getProductsByEan(eans: string[]): Promise<ProductSnapshot[]>;
	getSupermarketProducts(
		eans: string[],
		supermarketId: number,
	): Promise<SupermarketProductSnapshot[]>;
	getLatestPriceHistory(
		supermarketProductIds: number[],
	): Promise<PriceHistorySnapshot[]>;
	getMaxPriceHistoryId(): Promise<number | null>;
};

export type MojibakeWaiver = {
	ean: string;
	field: string;
	reason: string;
};

export type CandidateAuditOptions = {
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	fetchCandidates(): Promise<NormalizedProduct[]>;
	repository: CandidateAuditRepository;
	now?: () => Date;
	mojibakeWaivers?: MojibakeWaiver[];
	allowMissingSupermarketProductEans?: string[];
};

export type CandidateAudit = {
	createdAt: string;
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	candidateEans: string[];
	candidates: NormalizedProduct[];
	mojibakeWaivers: MojibakeWaiver[];
	allowMissingSupermarketProductEans: string[];
	snapshots: {
		source: CandidateAuditSourceSnapshot;
		products: ProductSnapshot[];
		supermarketProducts: SupermarketProductSnapshot[];
		priceHistory: {
			maxId: number | null;
			latest: PriceHistorySnapshot[];
		};
	};
};

const EXPECTED_CANDIDATE_COUNT = 5;
const MAX_ALLOWED_MISSING_SUPERMARKET_PRODUCTS = 1;
const MOJIBAKE_PATTERN = /Ã|Â|�/;

type CandidateMetadataField =
	| "name"
	| "brand"
	| "description"
	| "category"
	| "referenceUnit";

function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}

function findDuplicates(values: string[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		} else {
			seen.add(value);
		}
	}

	return Array.from(duplicates).sort();
}

function requireExactlyFiveDistinctCandidates(candidates: NormalizedProduct[]) {
	const eans = candidates.map((candidate) => candidate.ean);
	const distinctEans = new Set(eans);

	if (
		candidates.length !== EXPECTED_CANDIDATE_COUNT ||
		distinctEans.size !== EXPECTED_CANDIDATE_COUNT
	) {
		throw new Error(
			`candidate audit requires exactly 5 distinct candidate EANs; received candidates=${candidates.length} distinct=${distinctEans.size}`,
		);
	}

	const duplicates = findDuplicates(eans);

	if (duplicates.length > 0) {
		throw new Error(
			`candidate audit requires exactly 5 distinct candidate EANs; duplicates=${duplicates.join(",")}`,
		);
	}
}

function requirePositiveCandidatePrices(candidates: NormalizedProduct[]) {
	for (const candidate of candidates) {
		if (candidate.price === null || candidate.price <= 0) {
			throw new Error(
				`candidate audit requires positive non-null price for EAN ${candidate.ean}`,
			);
		}
	}
}

function metadataEntries(
	candidate: NormalizedProduct,
): Array<[CandidateMetadataField, string | null]> {
	return [
		["name", candidate.name],
		["brand", candidate.brand],
		["description", candidate.description],
		["category", candidate.category],
		["referenceUnit", candidate.referenceUnit],
	];
}

function isMojibakeWaived(
	waivers: MojibakeWaiver[],
	ean: string,
	field: string,
) {
	return waivers.some(
		(waiver) =>
			waiver.ean === ean &&
			waiver.field === field &&
			waiver.reason.trim().length > 0,
	);
}

function assertAllowedWaivers(source: string, waivers: MojibakeWaiver[]) {
	if (source !== "dia" && waivers.length > 0) {
		throw new Error(
			"mojibake waivers are only allowed for DIA pre-existing encoding issues",
		);
	}
}

function requireNoUnwaivedMojibake(
	candidates: NormalizedProduct[],
	waivers: MojibakeWaiver[],
) {
	for (const candidate of candidates) {
		for (const [field, value] of metadataEntries(candidate)) {
			if (
				value &&
				MOJIBAKE_PATTERN.test(value) &&
				!isMojibakeWaived(waivers, candidate.ean, field)
			) {
				throw new Error(
					`mojibake detected for EAN ${candidate.ean} field ${field}`,
				);
			}
		}
	}
}

function requireNoMissingRows(label: string, missing: string[]) {
	if (missing.length > 0) {
		throw new Error(
			`candidate audit missing existing ${label}: ${missing.join(",")}`,
		);
	}
}

function requireAllowedMissingSupermarketProducts(
	missing: string[],
	allowed: string[],
) {
	const distinctAllowed = uniqueSorted(allowed);
	const distinctMissing = uniqueSorted(missing);

	if (distinctAllowed.length !== allowed.length) {
		throw new Error(
			"candidate audit missing supermarket_products allowlist must be distinct",
		);
	}

	if (distinctAllowed.length > MAX_ALLOWED_MISSING_SUPERMARKET_PRODUCTS) {
		throw new Error(
			"candidate audit allows at most one missing supermarket_products row",
		);
	}

	if (JSON.stringify(distinctMissing) !== JSON.stringify(distinctAllowed)) {
		throw new Error(
			`candidate audit missing existing supermarket_products: missing=${distinctMissing.join(",") || "none"} allowed=${distinctAllowed.join(",") || "none"}`,
		);
	}
}

export async function buildCandidateAudit({
	source,
	term,
	count,
	queryLimit,
	fetchCandidates,
	repository,
	now = () => new Date(),
	mojibakeWaivers = [],
	allowMissingSupermarketProductEans = [],
}: CandidateAuditOptions): Promise<CandidateAudit> {
	if (!source || source.includes(",")) {
		throw new Error("candidate audit requires exactly one source");
	}

	if (!term || term.includes(",")) {
		throw new Error("candidate audit requires exactly one term");
	}

	if (count !== EXPECTED_CANDIDATE_COUNT) {
		throw new Error("candidate audit requires --count=5");
	}

	const sourceSnapshot = await repository.getSourceBySlug(source);

	if (!sourceSnapshot) {
		throw new Error(`candidate audit source not found: ${source}`);
	}

	if (!sourceSnapshot.isActive || !sourceSnapshot.isVtex) {
		throw new Error(`candidate audit source must be active VTEX: ${source}`);
	}

	assertAllowedWaivers(source, mojibakeWaivers);
	const candidates = await fetchCandidates();
	requireExactlyFiveDistinctCandidates(candidates);
	requirePositiveCandidatePrices(candidates);
	requireNoUnwaivedMojibake(candidates, mojibakeWaivers);

	const candidateEans = candidates.map((candidate) => candidate.ean);
	const [products, supermarketProducts] = await Promise.all([
		repository.getProductsByEan(candidateEans),
		repository.getSupermarketProducts(candidateEans, sourceSnapshot.id),
	]);

	const productEans = new Set(products.map((product) => product.ean));
	const supermarketProductEans = new Set(
		supermarketProducts.map((product) => product.productEan),
	);

	requireNoMissingRows(
		"products",
		candidateEans.filter((ean) => !productEans.has(ean)),
	);
	const missingSupermarketProductEans = candidateEans.filter(
		(ean) => !supermarketProductEans.has(ean),
	);
	requireAllowedMissingSupermarketProducts(
		missingSupermarketProductEans,
		allowMissingSupermarketProductEans,
	);

	const supermarketProductIds = supermarketProducts.map(
		(product) => product.id,
	);
	const [latestPriceHistory, maxPriceHistoryId] = await Promise.all([
		repository.getLatestPriceHistory(supermarketProductIds),
		repository.getMaxPriceHistoryId(),
	]);

	return {
		createdAt: now().toISOString(),
		source,
		term,
		count,
		queryLimit,
		candidateEans: uniqueSorted(candidateEans),
		candidates,
		mojibakeWaivers,
		allowMissingSupermarketProductEans: uniqueSorted(
			allowMissingSupermarketProductEans,
		),
		snapshots: {
			source: sourceSnapshot,
			products: products.sort((a, b) => a.ean.localeCompare(b.ean)),
			supermarketProducts: supermarketProducts.sort((a, b) =>
				a.productEan.localeCompare(b.productEan),
			),
			priceHistory: {
				maxId: maxPriceHistoryId,
				latest: latestPriceHistory.sort(
					(a, b) => a.supermarketProductId - b.supermarketProductId,
				),
			},
		},
	};
}
