import type { NormalizedProduct } from "../../src/lib/vtex/normalize";

import {
	buildCandidateRollbackPlan,
	buildCandidateSnapshotHash,
	type CandidateRollbackPlan,
	type CandidateWriteMode,
} from "./candidate-snapshot";

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
	writeMode?: CandidateWriteMode;
};

export type CandidateAudit = {
	schemaVersion: 1;
	createdAt: string;
	writeMode: CandidateWriteMode;
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	candidateHash: string;
	candidateEans: string[];
	candidates: NormalizedProduct[];
	mojibakeWaivers: MojibakeWaiver[];
	allowMissingSupermarketProductEans: string[];
	rollbackPlan: CandidateRollbackPlan | null;
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

function requireDistinctCandidateCount(
	candidates: NormalizedProduct[],
	expectedCount: number,
) {
	const eans = candidates.map((candidate) => candidate.ean);
	const distinctEans = new Set(eans);

	if (
		candidates.length !== expectedCount ||
		distinctEans.size !== expectedCount
	) {
		throw new Error(
			`candidate audit requires exactly ${expectedCount} distinct candidate EANs; received candidates=${candidates.length} distinct=${distinctEans.size}`,
		);
	}

	const duplicates = findDuplicates(eans);

	if (duplicates.length > 0) {
		throw new Error(
			`candidate audit requires exactly ${expectedCount} distinct candidate EANs; duplicates=${duplicates.join(",")}`,
		);
	}
}

function requireExactlyFiveDistinctCandidates(candidates: NormalizedProduct[]) {
	requireDistinctCandidateCount(candidates, EXPECTED_CANDIDATE_COUNT);
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
	writeMode = "phase4-count5",
}: CandidateAuditOptions): Promise<CandidateAudit> {
	if (!source || source.includes(",")) {
		throw new Error("candidate audit requires exactly one source");
	}

	if (!term || term.includes(",")) {
		throw new Error("candidate audit requires exactly one term");
	}

	if (writeMode === "phase4-count5" && count !== EXPECTED_CANDIDATE_COUNT) {
		throw new Error("candidate audit requires --count=5");
	}

	if (writeMode === "refresh-existing" && count > 25) {
		throw new Error(
			"candidate audit refresh-existing count must be at most 25",
		);
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
	if (writeMode === "phase4-count5") {
		requireExactlyFiveDistinctCandidates(candidates);
	} else {
		requireDistinctCandidateCount(candidates, count);
	}
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
	if (writeMode === "refresh-existing") {
		requireNoMissingRows("supermarket_products", missingSupermarketProductEans);
	} else {
		requireAllowedMissingSupermarketProducts(
			missingSupermarketProductEans,
			allowMissingSupermarketProductEans,
		);
	}

	const supermarketProductIds = supermarketProducts.map(
		(product) => product.id,
	);
	const [latestPriceHistory, maxPriceHistoryId] = await Promise.all([
		repository.getLatestPriceHistory(supermarketProductIds),
		repository.getMaxPriceHistoryId(),
	]);

	const audit: CandidateAudit = {
		schemaVersion: 1,
		createdAt: now().toISOString(),
		writeMode,
		source,
		term,
		count,
		queryLimit,
		candidateHash: buildCandidateSnapshotHash({
			source,
			term,
			count,
			queryLimit,
			writeMode,
			candidates,
		}),
		candidateEans: uniqueSorted(candidateEans),
		candidates,
		mojibakeWaivers,
		allowMissingSupermarketProductEans:
			writeMode === "refresh-existing"
				? []
				: uniqueSorted(allowMissingSupermarketProductEans),
		rollbackPlan: null,
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

	return {
		...audit,
		rollbackPlan: buildCandidateRollbackPlan(audit),
	};
}
