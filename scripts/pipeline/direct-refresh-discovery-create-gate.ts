import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import {
	buildDirectRefreshDiscoveryAuditReport,
	type DirectRefreshDiscoveryAuditCandidate,
	type DirectRefreshDiscoveryAuditRepository,
} from "./direct-refresh-discovery-audit";

export type DirectRefreshDiscoveryCreateStatus = "PASS" | "FAIL";

type DiscoveryClassification =
	| "product-and-source-discovery"
	| "source-row-discovery";
const MAX_CREATE_PREWRITE_AGE_MS = 15 * 60 * 1000;

export type DirectRefreshDiscoveryCreateProductRow = {
	ean: string;
	name: string;
	brand: string | null;
	description: string | null;
	imageUrl: string | null;
	images: string[];
	category: string | null;
};

export type DirectRefreshDiscoveryCreateSupermarketProductRow = {
	productEan: string;
	supermarketId: number;
	price: number;
	listPrice: number | null;
	referencePrice: number | null;
	referenceUnit: string | null;
	isAvailable: boolean;
	skuId: string;
	sellerId: string | null;
	productUrl: string;
	lastCheckedAt: string;
};

export type DirectRefreshDiscoveryCreatePriceHistoryRow = {
	supermarketProductId: number;
	price: number;
	listPrice: number | null;
	scrapedAt: string;
};

export type DirectRefreshDiscoveryPlannedCreate = {
	idempotencyKey: string;
	classification: DiscoveryClassification;
	product: DirectRefreshDiscoveryCreateProductRow;
	supermarketProduct: DirectRefreshDiscoveryCreateSupermarketProductRow;
	priceHistory: Omit<
		DirectRefreshDiscoveryCreatePriceHistoryRow,
		"supermarketProductId"
	>;
	rollbackPreview: DirectRefreshDiscoveryAuditCandidate["rollbackPreview"];
};

export type DirectRefreshDiscoveryCreatePrewriteReport = {
	schemaVersion: 1;
	gate: "direct-refresh-discovery-create-prewrite";
	status: DirectRefreshDiscoveryCreateStatus;
	issue: number;
	generatedAt: string;
	filters: {
		source: string;
		term: string;
		count: number;
		scanCount: number;
	};
	exactConfirmation: string;
	summary: {
		selectedKeys: string[];
		productCreatesPlanned: number;
		supermarketProductCreatesPlanned: number;
		priceHistoryCreatesPlanned: number;
		failClosedReasons: string[];
	};
	plannedCreates: DirectRefreshDiscoveryPlannedCreate[];
};

export type DirectRefreshDiscoveryCreateApplyReport = {
	schemaVersion: 1;
	gate: "direct-refresh-discovery-create-apply";
	status: DirectRefreshDiscoveryCreateStatus;
	issue: number;
	generatedAt: string;
	prewriteGeneratedAt: string;
	summary: {
		productsCreated: number;
		supermarketProductsCreated: number;
		priceHistoryCreated: number;
		failClosedReasons: string[];
	};
	appliedCreates: Array<{
		idempotencyKey: string;
		productEan: string;
		supermarketProductId: number;
		priceHistoryId: number;
	}>;
};

export type DirectRefreshDiscoveryCreateRepository =
	DirectRefreshDiscoveryAuditRepository & {
		calls?: string[];
		withCreateTransaction<T>(
			fn: (tx: DirectRefreshDiscoveryCreateRepository) => Promise<T>,
		): Promise<T>;
		acquireDiscoveryCreateLock(key: number): Promise<boolean>;
		createProduct(row: DirectRefreshDiscoveryCreateProductRow): Promise<void>;
		createSupermarketProduct(
			row: DirectRefreshDiscoveryCreateSupermarketProductRow,
		): Promise<{ id: number }>;
		createPriceHistory(
			row: DirectRefreshDiscoveryCreatePriceHistoryRow,
		): Promise<{ id: number }>;
	};

export type BuildDirectRefreshDiscoveryCreatePrewriteOptions = {
	source: string;
	term: string;
	count: number;
	scanCount: number;
	issue: number;
	selectedIdempotencyKeys: string[];
	fetchCandidates(): Promise<NormalizedProduct[]>;
	repository: DirectRefreshDiscoveryCreateRepository;
	now?: Date;
};

export type ApplyDirectRefreshDiscoveryCreatePrewriteOptions = {
	prewrite: DirectRefreshDiscoveryCreatePrewriteReport;
	exactConfirmation: string;
	repository: DirectRefreshDiscoveryCreateRepository;
	now?: Date;
};

export async function buildDirectRefreshDiscoveryCreatePrewrite({
	source,
	term,
	count,
	scanCount,
	issue,
	selectedIdempotencyKeys,
	fetchCandidates,
	repository,
	now = new Date(),
}: BuildDirectRefreshDiscoveryCreatePrewriteOptions): Promise<DirectRefreshDiscoveryCreatePrewriteReport> {
	const normalizedSource = source.trim();
	const generatedAt = now.toISOString();
	const failClosedReasons: string[] = [];
	const selectedKeys = [...selectedIdempotencyKeys].sort();
	const liveCandidates = await fetchCandidates();
	const liveByCandidateKey = new Map(
		liveCandidates.map((candidate) => [
			candidateKey(normalizedSource, candidate.ean, candidate.skuId),
			candidate,
		]),
	);
	const audit = await buildDirectRefreshDiscoveryAuditReport({
		source: normalizedSource,
		term,
		count,
		scanCount,
		issue,
		fetchCandidates: async () => liveCandidates,
		repository,
		now,
	});

	if (audit.status !== "PASS") {
		failClosedReasons.push(`discovery audit status must be PASS, got ${audit.status}`);
	}
	if (new Set(selectedKeys).size !== selectedKeys.length) {
		failClosedReasons.push("selected discovery keys must be unique");
	}
	if (selectedKeys.length !== count) {
		failClosedReasons.push(`selected discovery key count must equal count ${count}`);
	}

	const sourceRecord = await repository.getSourceBySlug(normalizedSource);
	const auditCandidatesByKey = new Map(
		audit.candidates.map((candidate) => [candidate.idempotencyKey, candidate]),
	);
	const plannedCreates: DirectRefreshDiscoveryPlannedCreate[] = [];

	for (const key of selectedKeys) {
		const candidateAudit = auditCandidatesByKey.get(key);
		const liveCandidate = liveByCandidateKey.get(key);
		if (!candidateAudit || !liveCandidate || !isDiscovery(candidateAudit)) {
			failClosedReasons.push(`selected discovery key is no longer createable: ${key}`);
			continue;
		}
		if (!sourceRecord) {
			failClosedReasons.push(`source not found: ${normalizedSource}`);
			continue;
		}
		plannedCreates.push(
			planCreate({
				key,
				classification: candidateAudit.classification,
				candidate: liveCandidate,
				sourceId: sourceRecord.id,
				generatedAt,
				rollbackPreview: candidateAudit.rollbackPreview,
			}),
		);
	}

	if (plannedCreates.length !== count) {
		failClosedReasons.push(`planned create count must equal count ${count}`);
	}

	const status: DirectRefreshDiscoveryCreateStatus =
		failClosedReasons.length === 0 ? "PASS" : "FAIL";
	return {
		schemaVersion: 1,
		gate: "direct-refresh-discovery-create-prewrite",
		status,
		issue,
		generatedAt,
		filters: {
			source: normalizedSource,
			term: term.trim(),
			count,
			scanCount,
		},
		exactConfirmation: exactConfirmation({ issue, source: normalizedSource, selectedKeys }),
		summary: {
			selectedKeys,
			productCreatesPlanned: plannedCreates.filter(
				(plan) => plan.classification === "product-and-source-discovery",
			).length,
			supermarketProductCreatesPlanned: plannedCreates.length,
			priceHistoryCreatesPlanned: plannedCreates.length,
			failClosedReasons: [...new Set(failClosedReasons)].sort(),
		},
		plannedCreates: status === "PASS" ? plannedCreates : [],
	};
}

export async function applyDirectRefreshDiscoveryCreatePrewrite({
	prewrite,
	exactConfirmation: providedConfirmation,
	repository,
	now = new Date(),
}: ApplyDirectRefreshDiscoveryCreatePrewriteOptions): Promise<DirectRefreshDiscoveryCreateApplyReport> {
	const generatedAt = now.toISOString();
	const initialReasons: string[] = [];
	if (prewrite.status !== "PASS") initialReasons.push("prewrite status must be PASS");
	if (providedConfirmation !== prewrite.exactConfirmation) {
		initialReasons.push("exact confirmation mismatch");
	}
	if (isStalePrewrite(prewrite.generatedAt, now)) {
		initialReasons.push("prewrite is stale; rerun direct-refresh discovery create prewrite");
	}
	if (initialReasons.length > 0) {
		return applyReport({ prewrite, generatedAt, failClosedReasons: initialReasons });
	}

	return repository.withCreateTransaction(async (tx) => {
		const lockKey = discoveryCreateLockKey(prewrite.filters.source);
		if (lockKey === null) {
			return applyReport({
				prewrite,
				generatedAt,
				failClosedReasons: [`unsupported discovery create source: ${prewrite.filters.source}`],
			});
		}
		if (!(await tx.acquireDiscoveryCreateLock(lockKey))) {
			return applyReport({
				prewrite,
				generatedAt,
				failClosedReasons: [
					`discovery create advisory lock unavailable: ${prewrite.filters.source}`,
				],
			});
		}
		const raceReasons = await findApplyRaceReasons(prewrite, tx);
		if (raceReasons.length > 0) {
			return applyReport({ prewrite, generatedAt, failClosedReasons: raceReasons });
		}

		const appliedCreates: DirectRefreshDiscoveryCreateApplyReport["appliedCreates"] = [];
		let productsCreated = 0;
		for (const plan of prewrite.plannedCreates) {
			if (plan.classification === "product-and-source-discovery") {
				await tx.createProduct(plan.product);
				productsCreated += 1;
			}
			const supermarketProduct = await tx.createSupermarketProduct(
				plan.supermarketProduct,
			);
			const priceHistory = await tx.createPriceHistory({
				...plan.priceHistory,
				supermarketProductId: supermarketProduct.id,
			});
			appliedCreates.push({
				idempotencyKey: plan.idempotencyKey,
				productEan: plan.product.ean,
				supermarketProductId: supermarketProduct.id,
				priceHistoryId: priceHistory.id,
			});
		}

		return {
			schemaVersion: 1,
			gate: "direct-refresh-discovery-create-apply",
			status: "PASS",
			issue: prewrite.issue,
			generatedAt,
			prewriteGeneratedAt: prewrite.generatedAt,
			summary: {
				productsCreated,
				supermarketProductsCreated: appliedCreates.length,
				priceHistoryCreated: appliedCreates.length,
				failClosedReasons: [],
			},
			appliedCreates,
		};
	});
}

function planCreate({
	key,
	classification,
	candidate,
	sourceId,
	generatedAt,
	rollbackPreview,
}: {
	key: string;
	classification: DiscoveryClassification;
	candidate: NormalizedProduct;
	sourceId: number;
	generatedAt: string;
	rollbackPreview: DirectRefreshDiscoveryAuditCandidate["rollbackPreview"];
}): DirectRefreshDiscoveryPlannedCreate {
	return {
		idempotencyKey: key,
		classification,
		product: {
			ean: candidate.ean,
			name: candidate.name,
			brand: candidate.brand,
			description: candidate.description,
			imageUrl: candidate.imageUrl,
			images: candidate.images,
			category: candidate.category,
		},
		supermarketProduct: {
			productEan: candidate.ean,
			supermarketId: sourceId,
			price: candidate.price ?? 0,
			listPrice: candidate.listPrice,
			referencePrice: candidate.referencePrice,
			referenceUnit: candidate.referenceUnit,
			isAvailable: candidate.isAvailable,
			skuId: candidate.skuId ?? "",
			sellerId: candidate.sellerId,
			productUrl: candidate.productUrl ?? "",
			lastCheckedAt: generatedAt,
		},
		priceHistory: {
			price: candidate.price ?? 0,
			listPrice: candidate.listPrice,
			scrapedAt: generatedAt,
		},
		rollbackPreview,
	};
}

async function findApplyRaceReasons(
	prewrite: DirectRefreshDiscoveryCreatePrewriteReport,
	repository: DirectRefreshDiscoveryCreateRepository,
) {
	const reasons: string[] = [];
	const source = await repository.getSourceBySlug(prewrite.filters.source);
	if (!source) return [`source not found: ${prewrite.filters.source}`];
	const eans = prewrite.plannedCreates.map((plan) => plan.product.ean);
	const [products, supermarketProducts, stagingRows] = await Promise.all([
		repository.getProductsByEan(eans),
		repository.getSupermarketProducts(eans, source.id),
		repository.getPendingStagingRowsByEan(eans, source.slug),
	]);
	const productEans = new Set(products.map((product) => product.ean));
	const sourceRowEans = new Set(supermarketProducts.map((row) => row.productEan));
	const stagingEans = new Set(stagingRows.map((row) => row.ean));

	for (const plan of prewrite.plannedCreates) {
		if (plan.classification === "product-and-source-discovery" && productEans.has(plan.product.ean)) {
			reasons.push(`product already exists: ${plan.product.ean}`);
		}
		if (plan.classification === "source-row-discovery" && !productEans.has(plan.product.ean)) {
			reasons.push(`global product missing: ${plan.product.ean}`);
		}
		if (sourceRowEans.has(plan.product.ean)) {
			reasons.push(`source row already exists: ${source.slug}:${plan.product.ean}`);
		}
		if (stagingEans.has(plan.product.ean)) {
			reasons.push(`pending staging row already exists: ${source.slug}:${plan.product.ean}`);
		}
		const skuMatches = await repository.getSupermarketProductsBySourceSku(
			source.slug,
			plan.supermarketProduct.skuId,
		);
		if (skuMatches.length > 0) {
			reasons.push(`source SKU is not unique: ${source.slug}:${plan.supermarketProduct.skuId}`);
		}
	}
	return [...new Set(reasons)].sort();
}

function applyReport({
	prewrite,
	generatedAt,
	failClosedReasons,
}: {
	prewrite: DirectRefreshDiscoveryCreatePrewriteReport;
	generatedAt: string;
	failClosedReasons: string[];
}): DirectRefreshDiscoveryCreateApplyReport {
	return {
		schemaVersion: 1,
		gate: "direct-refresh-discovery-create-apply",
		status: "FAIL",
		issue: prewrite.issue,
		generatedAt,
		prewriteGeneratedAt: prewrite.generatedAt,
		summary: {
			productsCreated: 0,
			supermarketProductsCreated: 0,
			priceHistoryCreated: 0,
			failClosedReasons: [...new Set(failClosedReasons)].sort(),
		},
		appliedCreates: [],
	};
}

function isDiscovery(
	candidate: DirectRefreshDiscoveryAuditCandidate,
): candidate is DirectRefreshDiscoveryAuditCandidate & {
	classification: DiscoveryClassification;
} {
	return candidate.classification === "product-and-source-discovery" ||
		candidate.classification === "source-row-discovery";
}

function candidateKey(source: string, ean: string, skuId: string | null) {
	return `discovery:${source}:${ean}:${skuId ?? "no-sku"}`;
}

function exactConfirmation({
	issue,
	source,
	selectedKeys,
}: {
	issue: number;
	source: string;
	selectedKeys: string[];
}) {
	return `direct-refresh-discovery-create issue=${issue} source=${source} count=${selectedKeys.length} keys=${selectedKeys.join(",")}`;
}

function isStalePrewrite(generatedAt: string, now: Date) {
	const parsed = Date.parse(generatedAt);
	return !Number.isFinite(parsed) || now.getTime() - parsed > MAX_CREATE_PREWRITE_AGE_MS;
}

function discoveryCreateLockKey(source: string) {
	const keys: Record<string, number> = {
		carrefour: 44214510,
		vea: 54214510,
		disco: 61214510,
		jumbo: 68214510,
		mas: 75214510,
	};
	return keys[source] ?? null;
}
