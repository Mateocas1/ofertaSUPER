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

export type CandidateSelectionMode = "strict" | "existing-only";
type CandidateSkipReason =
	| "missing_product"
	| "missing_supermarket_product"
	| "not_selected_overflow";

type CandidateSkippedCandidate = {
	ean: string;
	name: string;
	reasons: CandidateSkipReason[];
};

type CandidateAuditSelection = {
	mode: CandidateSelectionMode;
	scanCount: number;
	selectedCount: number;
	skippedCandidates: CandidateSkippedCandidate[];
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
	selectionMode?: CandidateSelectionMode;
	scanCount?: number;
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
	selection: CandidateAuditSelection;
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

export type CandidateAuditFailureReport = {
	schemaVersion: 1;
	audit: "ingest-candidates";
	status: "FAIL";
	createdAt: string;
	message: string;
	writeMode: CandidateWriteMode;
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	selection: CandidateAuditSelection;
	candidateHash: null;
	candidateEans: string[];
	selectedCandidateEans: string[];
	missingProducts: string[];
	missingSupermarketProducts: string[];
	candidates: NormalizedProduct[];
};

export class CandidateAuditError extends Error {
	readonly report: CandidateAuditFailureReport;

	constructor(message: string, report: CandidateAuditFailureReport) {
		super(message);
		this.name = "CandidateAuditError";
		this.report = report;
	}
}

export function isCandidateAuditError(
	error: unknown,
): error is CandidateAuditError {
	return error instanceof CandidateAuditError;
}

const EXPECTED_CANDIDATE_COUNT = 5;
const MAX_ALLOWED_MISSING_SUPERMARKET_PRODUCTS = 1;
const MAX_EXISTING_ONLY_SCAN_COUNT = 50;
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

function buildSkippedCandidate(
	candidate: NormalizedProduct,
	reasons: CandidateSkipReason[],
): CandidateSkippedCandidate {
	return {
		ean: candidate.ean,
		name: candidate.name,
		reasons,
	};
}

function buildFailureReport({
	message,
	writeMode,
	source,
	term,
	count,
	queryLimit,
	selection,
	selectedCandidates,
	missingProducts,
	missingSupermarketProducts,
	candidates,
	now,
}: {
	message: string;
	writeMode: CandidateWriteMode;
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	selection: CandidateAuditSelection;
	selectedCandidates: NormalizedProduct[];
	missingProducts: string[];
	missingSupermarketProducts: string[];
	candidates: NormalizedProduct[];
	now: () => Date;
}): CandidateAuditFailureReport {
	return {
		schemaVersion: 1,
		audit: "ingest-candidates",
		status: "FAIL",
		createdAt: now().toISOString(),
		message,
		writeMode,
		source,
		term,
		count,
		queryLimit,
		selection,
		candidateHash: null,
		candidateEans: uniqueSorted(candidates.map((candidate) => candidate.ean)),
		selectedCandidateEans: uniqueSorted(
			selectedCandidates.map((candidate) => candidate.ean),
		),
		missingProducts: uniqueSorted(missingProducts),
		missingSupermarketProducts: uniqueSorted(missingSupermarketProducts),
		candidates,
	};
}

function throwCandidateAuditError(input: Parameters<typeof buildFailureReport>[0]) {
	throw new CandidateAuditError(input.message, buildFailureReport(input));
}

function assertSelectionOptions({
	writeMode,
	selectionMode,
	count,
	scanCount,
}: {
	writeMode: CandidateWriteMode;
	selectionMode: CandidateSelectionMode;
	count: number;
	scanCount: number;
}) {
	if (selectionMode === "existing-only" && writeMode !== "refresh-existing") {
		throw new Error(
			"candidate audit existing-only selection requires --write-mode=refresh-existing",
		);
	}

	if (selectionMode === "existing-only" && scanCount < count) {
		throw new Error(
			"candidate audit existing-only --scan-count must be at least --count",
		);
	}

	if (selectionMode === "existing-only" && scanCount > MAX_EXISTING_ONLY_SCAN_COUNT) {
		throw new Error(
			`candidate audit existing-only --scan-count must be at most ${MAX_EXISTING_ONLY_SCAN_COUNT}`,
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
	selectionMode = "strict",
	scanCount = count,
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

	assertSelectionOptions({ writeMode, selectionMode, count, scanCount });

	const sourceSnapshot = await repository.getSourceBySlug(source);

	if (!sourceSnapshot) {
		throw new Error(`candidate audit source not found: ${source}`);
	}

	if (!sourceSnapshot.isActive || !sourceSnapshot.isVtex) {
		throw new Error(`candidate audit source must be active VTEX: ${source}`);
	}

	assertAllowedWaivers(source, mojibakeWaivers);
	const candidates = await fetchCandidates();
	if (selectionMode === "existing-only") {
		requireDistinctCandidateCount(candidates, scanCount);
	} else if (writeMode === "phase4-count5") {
		requireExactlyFiveDistinctCandidates(candidates);
	} else {
		requireDistinctCandidateCount(candidates, count);
	}
	requirePositiveCandidatePrices(candidates);
	requireNoUnwaivedMojibake(candidates, mojibakeWaivers);

	const scannedCandidateEans = candidates.map((candidate) => candidate.ean);
	const [products, supermarketProducts] = await Promise.all([
		repository.getProductsByEan(scannedCandidateEans),
		repository.getSupermarketProducts(scannedCandidateEans, sourceSnapshot.id),
	]);

	const productEans = new Set(products.map((product) => product.ean));
	const supermarketProductEans = new Set(
		supermarketProducts.map((product) => product.productEan),
	);
	const missingProductEans = scannedCandidateEans.filter(
		(ean) => !productEans.has(ean),
	);
	const missingSupermarketProductEans = scannedCandidateEans.filter(
		(ean) => productEans.has(ean) && !supermarketProductEans.has(ean),
	);
	let selectedCandidates = candidates;
	let skippedCandidates: CandidateSkippedCandidate[] = [];

	if (selectionMode === "existing-only") {
		const selectableCandidates: NormalizedProduct[] = [];

		for (const candidate of candidates) {
			const reasons: CandidateSkipReason[] = [];

			if (!productEans.has(candidate.ean)) {
				reasons.push("missing_product");
			} else if (!supermarketProductEans.has(candidate.ean)) {
				reasons.push("missing_supermarket_product");
			}

			if (reasons.length > 0) {
				skippedCandidates.push(buildSkippedCandidate(candidate, reasons));
			} else {
				selectableCandidates.push(candidate);
			}
		}

		selectedCandidates = selectableCandidates.slice(0, count);
		skippedCandidates = [
			...skippedCandidates,
			...selectableCandidates
				.slice(count)
				.map((candidate) =>
					buildSkippedCandidate(candidate, ["not_selected_overflow"]),
				),
		];

		if (selectedCandidates.length !== count) {
			const selection: CandidateAuditSelection = {
				mode: selectionMode,
				scanCount: candidates.length,
				selectedCount: selectedCandidates.length,
				skippedCandidates,
			};
			const message = `candidate audit existing-only selected ${selectedCandidates.length} of ${count} existing candidates`;

			throwCandidateAuditError({
				message,
				writeMode,
				source,
				term,
				count,
				queryLimit,
				selection,
				selectedCandidates,
				missingProducts: missingProductEans,
				missingSupermarketProducts: missingSupermarketProductEans,
				candidates,
				now,
			});
		}
	} else {
		if (missingProductEans.length > 0) {
			const message = `candidate audit missing existing products: ${missingProductEans.join(",")}`;

			throwCandidateAuditError({
				message,
				writeMode,
				source,
				term,
				count,
				queryLimit,
				selection: {
					mode: selectionMode,
					scanCount: candidates.length,
					selectedCount: candidates.length,
					skippedCandidates: [],
				},
				selectedCandidates: candidates,
				missingProducts: missingProductEans,
				missingSupermarketProducts: missingSupermarketProductEans,
				candidates,
				now,
			});
		}

		if (writeMode === "refresh-existing") {
			if (missingSupermarketProductEans.length > 0) {
				const message = `candidate audit missing existing supermarket_products: ${missingSupermarketProductEans.join(",")}`;

				throwCandidateAuditError({
					message,
					writeMode,
					source,
					term,
					count,
					queryLimit,
					selection: {
						mode: selectionMode,
						scanCount: candidates.length,
						selectedCount: candidates.length,
						skippedCandidates: [],
					},
					selectedCandidates: candidates,
					missingProducts: missingProductEans,
					missingSupermarketProducts: missingSupermarketProductEans,
					candidates,
					now,
				});
			}
		} else {
			requireAllowedMissingSupermarketProducts(
				missingSupermarketProductEans,
				allowMissingSupermarketProductEans,
			);
		}
	}

	const selectedCandidateEans = selectedCandidates.map(
		(candidate) => candidate.ean,
	);
	const selectedCandidateEanSet = new Set(selectedCandidateEans);
	const selectedProducts = products.filter((product) =>
		selectedCandidateEanSet.has(product.ean),
	);
	const selectedSupermarketProducts = supermarketProducts.filter((product) =>
		selectedCandidateEanSet.has(product.productEan),
	);
	const supermarketProductIds = selectedSupermarketProducts.map(
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
			candidates: selectedCandidates,
		}),
		candidateEans: uniqueSorted(selectedCandidateEans),
		candidates: selectedCandidates,
		selection: {
			mode: selectionMode,
			scanCount: candidates.length,
			selectedCount: selectedCandidates.length,
			skippedCandidates,
		},
		mojibakeWaivers,
		allowMissingSupermarketProductEans:
			writeMode === "refresh-existing"
				? []
				: uniqueSorted(allowMissingSupermarketProductEans),
		rollbackPlan: null,
		snapshots: {
			source: sourceSnapshot,
			products: selectedProducts.sort((a, b) => a.ean.localeCompare(b.ean)),
			supermarketProducts: selectedSupermarketProducts.sort((a, b) =>
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
