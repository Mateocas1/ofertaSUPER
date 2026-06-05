import { createHash } from "node:crypto";

import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import { uniqueSorted } from "./audit-utils";

type AuditStatus = "PASS" | "WARN" | "FAIL";
type CandidateClassification =
	| "product-and-source-discovery"
	| "source-row-discovery"
	| "already-covered"
	| "blocked";
type QualityStatus = "PASS" | "FAIL";

export type DirectRefreshDiscoveryAuditSource = {
	id: number;
	slug: string;
	name: string;
	isActive: boolean;
	isVtex: boolean;
	baseUrl: string;
};

export type DirectRefreshDiscoveryAuditProduct = {
	ean: string;
};

export type DirectRefreshDiscoveryAuditSupermarketProduct = {
	productEan: string;
	supermarketId: number;
	skuId: string | null;
};

export type DirectRefreshDiscoveryAuditStagingRow = {
	ean: string;
	sourceSlug: string;
};

export type DirectRefreshDiscoveryAuditRepository = {
	getSourceBySlug(
		slug: string,
	): Promise<DirectRefreshDiscoveryAuditSource | null>;
	getProductsByEan(
		eans: string[],
	): Promise<DirectRefreshDiscoveryAuditProduct[]>;
	getSupermarketProducts(
		eans: string[],
		supermarketId: number,
	): Promise<DirectRefreshDiscoveryAuditSupermarketProduct[]>;
	getPendingStagingRowsByEan(
		eans: string[],
		sourceSlug: string,
	): Promise<DirectRefreshDiscoveryAuditStagingRow[]>;
	getSupermarketProductsBySourceSku(
		sourceSlug: string,
		skuId: string,
	): Promise<DirectRefreshDiscoveryAuditSupermarketProduct[]>;
};

export type DirectRefreshDiscoveryAuditOptions = {
	source: string;
	term: string;
	count: number;
	scanCount: number;
	fetchCandidates(): Promise<NormalizedProduct[]>;
	repository: DirectRefreshDiscoveryAuditRepository;
	now?: Date;
	issue?: number;
};

export type DirectRefreshDiscoveryAuditCandidate = {
	ean: string;
	name: string;
	skuId: string | null;
	productUrl: string | null;
	productUrlHost: string | null;
	classification: CandidateClassification;
	qualityStatus: QualityStatus;
	idempotencyKey: string;
	blockers: string[];
	rollbackPreview: {
		deleteCreatedProduct: boolean;
		deleteCreatedSupermarketProduct: boolean;
		deleteCreatedPriceHistory: boolean;
	};
};

export type DirectRefreshDiscoveryAuditReport = {
	schemaVersion: 1;
	audit: "direct-refresh-discovery-audit";
	status: AuditStatus;
	issue: number;
	generatedAt: string;
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	filters: {
		source: string;
		term: string;
		count: number;
		scanCount: number;
	};
	summary: {
		scannedCandidates: number;
		selectedDiscoveries: number;
		productCreatesPreview: number;
		sourceRowCreatesPreview: number;
		blockedCandidates: number;
		failClosedReasons: string[];
	};
	candidates: DirectRefreshDiscoveryAuditCandidate[];
	nextManualAction: string;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh discovery audit; no production writes, no staging/ingestion writes, no manifest/prewrite generation, no active writer invocation, no scheduler/cron/workflow execution, no all-source or repeated-batch execution" as const;
const MOJIBAKE_PATTERN = /Ãƒ|Ã‚|ï¿½/;
const WRITER_SUPPORTED_SOURCES = new Set([
	"carrefour",
	"vea",
	"disco",
	"jumbo",
	"mas",
]);
const EXPECTED_HOSTS: Record<string, string> = {
	carrefour: "carrefour.com.ar",
	vea: "vea.com.ar",
	disco: "disco.com.ar",
	jumbo: "jumbo.com.ar",
	mas: "masonline.com.ar",
};

export async function buildDirectRefreshDiscoveryAuditReport({
	source,
	term,
	count,
	scanCount,
	fetchCandidates,
	repository,
	now = new Date(),
	issue = 21,
}: DirectRefreshDiscoveryAuditOptions): Promise<DirectRefreshDiscoveryAuditReport> {
	const normalizedSource = source.trim();
	const failClosedReasons = validateTopLevel({
		source: normalizedSource,
		term,
		count,
		scanCount,
		issue,
	});
	const sourceRecord = await repository.getSourceBySlug(normalizedSource);
	if (!sourceRecord) failClosedReasons.push(`source not found: ${normalizedSource}`);
	if (sourceRecord && !sourceRecord.isActive)
		failClosedReasons.push(`source is inactive: ${normalizedSource}`);
	if (sourceRecord && !sourceRecord.isVtex)
		failClosedReasons.push(`source is not VTEX: ${normalizedSource}`);
	if (!WRITER_SUPPORTED_SOURCES.has(normalizedSource)) {
		failClosedReasons.push(`source is not writer-supported: ${normalizedSource}`);
	}

	const liveCandidates = await fetchCandidates();
	const distinctCandidates = uniqueByEan(liveCandidates).slice(0, scanCount);
	const eans = distinctCandidates.map((candidate) => candidate.ean);
	const [products, supermarketProducts, stagingRows] = sourceRecord
		? await Promise.all([
				repository.getProductsByEan(eans),
				repository.getSupermarketProducts(eans, sourceRecord.id),
				repository.getPendingStagingRowsByEan(eans, normalizedSource),
			])
		: [[], [], []] as const;

	const productEans = new Set(products.map((product) => product.ean));
	const sourceRowEans = new Set(
		supermarketProducts.map((product) => product.productEan),
	);
	const stagingKeys = new Set(
		stagingRows.map((row) => `${row.sourceSlug}:${row.ean}`),
	);
	const candidates: DirectRefreshDiscoveryAuditCandidate[] = [];

	for (const candidate of distinctCandidates) {
		const skuMatches = candidate.skuId
			? await repository.getSupermarketProductsBySourceSku(
					normalizedSource,
					candidate.skuId,
				)
			: [];
		candidates.push(
			buildCandidateReport({
				source: normalizedSource,
				sourceRecord,
				candidate,
				productExists: productEans.has(candidate.ean),
				sourceRowExists: sourceRowEans.has(candidate.ean),
				stagingConflict: stagingKeys.has(`${normalizedSource}:${candidate.ean}`),
				sourceSkuMatches: skuMatches.length,
			}),
		);
	}

	const selectedDiscoveries = candidates.filter(
		(candidate) =>
			candidate.classification === "product-and-source-discovery" ||
			candidate.classification === "source-row-discovery",
	);
	const blockedCandidates = candidates.filter(
		(candidate) =>
			candidate.classification === "blocked" ||
			candidate.classification === "already-covered",
	);
	const status: AuditStatus =
		failClosedReasons.length > 0
			? "FAIL"
			: selectedDiscoveries.length > 0
				? "PASS"
				: blockedCandidates.length > 0
					? "WARN"
					: "WARN";

	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-audit",
		status,
		issue,
		generatedAt: now.toISOString(),
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: {
			source: normalizedSource,
			term: term.trim(),
			count,
			scanCount,
		},
		summary: {
			scannedCandidates: candidates.length,
			selectedDiscoveries: selectedDiscoveries.length,
			productCreatesPreview: selectedDiscoveries.filter(
				(candidate) =>
					candidate.classification === "product-and-source-discovery",
			).length,
			sourceRowCreatesPreview: selectedDiscoveries.length,
			blockedCandidates: blockedCandidates.length,
			failClosedReasons: uniqueSorted(failClosedReasons),
		},
		candidates,
		nextManualAction: nextManualAction(status, selectedDiscoveries.length),
	};
}

function validateTopLevel({
	source,
	term,
	count,
	scanCount,
	issue,
}: {
	source: string;
	term: string;
	count: number;
	scanCount: number;
	issue: number;
}) {
	const reasons: string[] = [];
	if (!source || source.includes(",")) reasons.push("exactly one source is required");
	if (!term.trim() || term.includes(","))
		reasons.push("exactly one discovery term is required");
	if (!Number.isInteger(count) || count <= 0 || count > 5)
		reasons.push("count must be a positive integer at most 5");
	if (!Number.isInteger(scanCount) || scanCount < count || scanCount > 50) {
		reasons.push("scanCount must be between count and 50");
	}
	if (!Number.isInteger(issue) || issue <= 0)
		reasons.push("issue must be a positive integer");
	return reasons;
}

function uniqueByEan(candidates: NormalizedProduct[]) {
	const seen = new Set<string>();
	const output: NormalizedProduct[] = [];
	for (const candidate of candidates) {
		if (!seen.has(candidate.ean)) {
			seen.add(candidate.ean);
			output.push(candidate);
		}
	}
	return output;
}

function buildCandidateReport({
	source,
	sourceRecord,
	candidate,
	productExists,
	sourceRowExists,
	stagingConflict,
	sourceSkuMatches,
}: {
	source: string;
	sourceRecord: DirectRefreshDiscoveryAuditSource | null;
	candidate: NormalizedProduct;
	productExists: boolean;
	sourceRowExists: boolean;
	stagingConflict: boolean;
	sourceSkuMatches: number;
}): DirectRefreshDiscoveryAuditCandidate {
	const blockers = candidateBlockers({
		source,
		sourceRecord,
		candidate,
		stagingConflict,
		sourceSkuMatches,
	});
	let classification: CandidateClassification;
	if (sourceRowExists) {
		classification = "already-covered";
		blockers.splice(0, blockers.length, "source row already exists");
	} else if (blockers.length > 0) {
		classification = "blocked";
	} else {
		classification = productExists
			? "source-row-discovery"
			: "product-and-source-discovery";
	}
	return {
		ean: candidate.ean,
		name: candidate.name,
		skuId: candidate.skuId,
		productUrl: candidate.productUrl,
		productUrlHost: host(candidate.productUrl),
		classification,
		qualityStatus: classification === "blocked" ? "FAIL" : "PASS",
		idempotencyKey: buildIdempotencyKey(source, candidate),
		blockers: uniqueSorted(blockers),
		rollbackPreview: {
			deleteCreatedProduct: classification === "product-and-source-discovery",
			deleteCreatedSupermarketProduct:
				classification === "product-and-source-discovery" ||
				classification === "source-row-discovery",
			deleteCreatedPriceHistory:
				classification === "product-and-source-discovery" ||
				classification === "source-row-discovery",
		},
	};
}

function candidateBlockers({
	source,
	sourceRecord,
	candidate,
	stagingConflict,
	sourceSkuMatches,
}: {
	source: string;
	sourceRecord: DirectRefreshDiscoveryAuditSource | null;
	candidate: NormalizedProduct;
	stagingConflict: boolean;
	sourceSkuMatches: number;
}) {
	const blockers: string[] = [];
	if (!candidate.ean.trim()) blockers.push("EAN is required");
	if (!candidate.skuId?.trim()) blockers.push("SKU id is required");
	if (!candidate.name.trim()) blockers.push("name is required");
	if (MOJIBAKE_PATTERN.test(candidate.name)) blockers.push("mojibake detected");
	if (candidate.price === null || candidate.price <= 0)
		blockers.push("positive price is required");
	if (!candidate.isAvailable) blockers.push("live product must be available");
	const expectedHost = EXPECTED_HOSTS[source] ?? host(sourceRecord?.baseUrl ?? null);
	const productHost = host(candidate.productUrl);
	if (!productHost || productHost !== expectedHost) {
		blockers.push(`product URL host must be ${expectedHost}`);
	}
	if (stagingConflict) blockers.push("pending staging row already exists");
	if (sourceSkuMatches !== 0) blockers.push("source SKU is not unique");
	return blockers;
}

function buildIdempotencyKey(source: string, candidate: NormalizedProduct) {
	const raw = `discovery:${source}:${candidate.ean}:${candidate.skuId ?? "no-sku"}`;
	return raw.length <= 120
		? raw
		: `discovery:${createHash("sha256").update(raw).digest("hex")}`;
}

function nextManualAction(status: AuditStatus, selectedDiscoveries: number) {
	if (status === "FAIL")
		return "Stop. Fix fail-closed discovery audit reasons before planning create-capable discovery.";
	if (selectedDiscoveries === 0)
		return "No create-capable discovery is selected; review blocked candidates before any implementation.";
	return "Use this read-only audit as discovery planning input only; create-capable discovery still requires separate reviewed write gates.";
}

function host(value: string | null) {
	try {
		return value ? new URL(value).host.toLowerCase().replace(/^www\./, "") : null;
	} catch {
		return null;
	}
}
