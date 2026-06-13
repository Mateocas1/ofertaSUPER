import { createHash } from "node:crypto";

import type { NormalizedProduct } from "@/lib/vtex/normalize";
import type { DirectLookup } from "@/lib/ingestion/adapters/types";
import { listVtexSupermarkets } from "@/lib/supermarkets";

import { getOptionalSingleFlag, parsePositiveIntegerFlag, uniqueSorted } from "./audit-utils";
import type { DirectRefreshDiscoveryDenominatorCandidate } from "./direct-refresh-discovery-denominator";

export type DirectRefreshDiscoveryDenominatorCandidateSource =
	| "disco"
	| "jumbo"
	| "vea"
	| "carrefour"
	| "dia"
	| "mas";

export type DirectRefreshDiscoveryDenominatorCandidateGeneratorOptions = {
	source: DirectRefreshDiscoveryDenominatorCandidateSource;
	terms: string[];
	lookups: DirectLookup[];
	input: string | null;
	requestBudget: number;
	sourceBudget: number;
	issue: number;
	output: string | null;
};

export type DirectRefreshDiscoveryDenominatorCandidateSurface =
	| "input-artifact"
	| "product-suggestions"
	| "direct-catalog-lookup";

export type DirectRefreshDiscoveryDenominatorCandidateFetchDirectProducts = (
	source: DirectRefreshDiscoveryDenominatorCandidateSource,
	lookup: DirectLookup,
) => Promise<NormalizedProduct[]>;

export type DiscoveryDenominatorCandidateExclusion = {
	source: string;
	reason: string;
	ean?: string | null;
	skuId?: string | null;
};

export type DirectRefreshDiscoveryDenominatorCandidateSnapshot = {
	schemaVersion: 1;
	artifact: "direct-refresh-discovery-denominator-candidates";
	generatedAt: string;
	issue: number;
	sources: [DirectRefreshDiscoveryDenominatorCandidateSource];
	coverage: {
		mode: "input-artifact" | "bounded-search" | "direct-identity";
		surface: DirectRefreshDiscoveryDenominatorCandidateSurface;
		exhaustive: false;
		description: string;
	};
	counts: {
		fetchedRows: number;
		candidateRows: number;
		excludedRows: number;
		duplicateRows: number;
	};
	budgets: {
		request: { limit: number; used: number; status: "PASS" | "FAIL" };
		source: { limit: number; usedBySource: Record<string, number>; status: "PASS" | "FAIL" };
	};
	failClosedReasons: string[];
	exclusions: DiscoveryDenominatorCandidateExclusion[];
	candidates: DirectRefreshDiscoveryDenominatorCandidate[];
	posture: {
		readOnly: true;
		noWrites: true;
		writeBoundary: typeof WRITE_BOUNDARY;
		rejectedOperations: string[];
	};
};

const WRITE_BOUNDARY =
	"read-only source-scoped denominator candidate generation; no DB writes, no discovery apply, no scheduler/all-source execution, no deploy, no migrations, no cache purge" as const;
const SUPPORTED_SOURCES = listVtexSupermarkets().map(
	(supermarket) => supermarket.slug,
) as DirectRefreshDiscoveryDenominatorCandidateSource[];
const FORBIDDEN_FLAGS = [
	"--apply",
	"--write",
	"--confirm",
	"--execute",
	"--delete",
	"--scheduler",
	"--all-source",
	"--all-sources",
	"--deploy",
	"--migrations",
	"--purge-cache",
];
const ALLOWED_FLAGS = new Set([
	"--source",
	"--terms",
	"--term",
	"--ean",
	"--eans",
	"--sku-id",
	"--sku-ids",
	"--input",
	"--request-budget",
	"--source-budget",
	"--issue-number",
	"--output",
]);

export function parseDirectRefreshDiscoveryDenominatorCandidateCliOptions(
	argv = process.argv,
): DirectRefreshDiscoveryDenominatorCandidateGeneratorOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh discovery denominator candidate generator rejects ${foundForbidden}`,
		);
	}
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag) {
		throw new Error(
			`unknown direct-refresh discovery denominator candidate generator flag ${unknownFlag}`,
		);
	}
	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) {
		throw new Error(
			`direct-refresh discovery denominator candidate generator requires ${bareAllowedFlag}=...`,
		);
	}

	const source = parseSupportedSource(getOptionalSingleFlag(argv, "--source") ?? "vea");
	if (!source) {
		throw new Error(
			`unsupported direct-refresh discovery denominator candidate generator source ${getOptionalSingleFlag(argv, "--source")}; supported sources: ${SUPPORTED_SOURCES.join(", ")}`,
		);
	}

	const terms = uniqueSorted([
		...parseList(getOptionalSingleFlag(argv, "--terms")),
		...parseList(getOptionalSingleFlag(argv, "--term")),
	]);
	const eans = uniqueSorted([
		...parseList(getOptionalSingleFlag(argv, "--eans")),
		...parseList(getOptionalSingleFlag(argv, "--ean")),
	]);
	const skuIds = uniqueSorted([
		...parseList(getOptionalSingleFlag(argv, "--sku-ids")),
		...parseList(getOptionalSingleFlag(argv, "--sku-id")),
	]);
	const lookups: DirectLookup[] = [
		...eans.map((value) => ({ kind: "ean" as const, value })),
		...skuIds.map((value) => ({ kind: "sku-id" as const, value })),
	];
	const input = getOptionalSingleFlag(argv, "--input");
	if (!input && terms.length === 0 && lookups.length === 0) {
		throw new Error(
			"direct-refresh discovery denominator candidate generator requires --input=..., explicit --terms=..., or known --ean/--sku-id identities for bounded read-only generation",
		);
	}

	return {
		source,
		terms,
		lookups,
		input,
		requestBudget: parsePositiveIntegerFlag(argv, "--request-budget", 20),
		sourceBudget: parsePositiveIntegerFlag(argv, "--source-budget", 20),
		issue: parsePositiveIntegerFlag(argv, "--issue-number", 223),
		output: getOptionalSingleFlag(argv, "--output"),
	};
}

export function buildDirectRefreshDiscoveryDenominatorCandidateSnapshot({
	products,
	source = "vea",
	fetchedAt = new Date(),
	requestBudget,
	sourceBudget,
	issue = 223,
	artifactRaw,
	surface = "input-artifact",
}: {
	products: NormalizedProduct[];
	source?: DirectRefreshDiscoveryDenominatorCandidateSource;
	fetchedAt?: Date;
	requestBudget: number;
	sourceBudget: number;
	issue?: number;
	artifactRaw?: string;
	surface?: DirectRefreshDiscoveryDenominatorCandidateSurface;
}): DirectRefreshDiscoveryDenominatorCandidateSnapshot {
	const fetchedAtIso = fetchedAt.toISOString();
	const artifactSha256 = sha256Lineage(artifactRaw ?? stableJson(products));
	const exclusions: DiscoveryDenominatorCandidateExclusion[] = [];
	const duplicateKeys = new Set<string>();
	const candidatesByKey = new Map<string, DirectRefreshDiscoveryDenominatorCandidate>();

	for (const product of products) {
		const ean = product.ean?.trim();
		const skuId = product.skuId?.trim() || null;
		if (!ean) {
			exclusions.push({
				source,
				skuId,
				reason: "missing EAN; denominator audit requires source+EAN identity",
			});
			continue;
		}

		const key = candidateIdentity(source, ean, skuId);
		if (candidatesByKey.has(key)) {
			duplicateKeys.add(key);
			exclusions.push({
				source,
				ean,
				skuId,
				reason: "duplicate source+EAN/SKU candidate identity",
			});
			continue;
		}

		candidatesByKey.set(key, {
			ean,
			source,
			skuId,
			lineage: {
				source,
				fetchedAt: fetchedAtIso,
				artifactSha256,
			},
		});
	}

	const candidates = Array.from(candidatesByKey.values()).sort((left, right) =>
		candidateIdentity(left.source, left.ean, left.skuId ?? null).localeCompare(
			candidateIdentity(right.source, right.ean, right.skuId ?? null),
		),
	);
	const usedBySource = { [source]: products.length };
	const failClosedReasons: string[] = [];
	if (products.length > requestBudget) {
		failClosedReasons.push(
			`request budget exceeded: used ${products.length} > limit ${requestBudget}`,
		);
	}
	if (products.length > sourceBudget) {
		failClosedReasons.push(
			`source budget exceeded for ${source}: used ${products.length} > limit ${sourceBudget}`,
		);
	}

	return {
		schemaVersion: 1,
		artifact: "direct-refresh-discovery-denominator-candidates",
		generatedAt: fetchedAtIso,
		issue,
		sources: [source],
		coverage: {
			mode: coverageMode(surface),
			surface,
			exhaustive: false,
			description: coverageDescription(surface),
		},
		counts: {
			fetchedRows: products.length,
			candidateRows: candidates.length,
			excludedRows: exclusions.length,
			duplicateRows: duplicateKeys.size,
		},
		budgets: {
			request: {
				limit: requestBudget,
				used: products.length,
				status: products.length <= requestBudget ? "PASS" : "FAIL",
			},
			source: {
				limit: sourceBudget,
				usedBySource,
				status: products.length <= sourceBudget ? "PASS" : "FAIL",
			},
		},
		failClosedReasons,
		exclusions,
		candidates,
		posture: {
			readOnly: true,
			noWrites: true,
			writeBoundary: WRITE_BOUNDARY,
			rejectedOperations: [...FORBIDDEN_FLAGS],
		},
	};
}

export async function fetchDirectRefreshDiscoveryDenominatorCandidatesByKnownIdentity({
	source = "vea",
	lookups,
	fetchDirectProducts,
}: {
	source?: DirectRefreshDiscoveryDenominatorCandidateSource;
	lookups: DirectLookup[];
	fetchDirectProducts: DirectRefreshDiscoveryDenominatorCandidateFetchDirectProducts;
}): Promise<NormalizedProduct[]> {
	const products = await Promise.all(
		lookups.map((lookup) => fetchDirectProducts(source, lookup)),
	);
	return products.flat();
}

export function defaultDirectRefreshDiscoveryDenominatorCandidateOutputPath(
	now = new Date(),
) {
	return `audit/direct-refresh-discovery-denominator-candidates-${now
		.toISOString()
		.replace(/[:.]/g, "-")}.json`;
}

function parseList(value: string | null) {
	return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function candidateIdentity(source: string, ean: string, skuId: string | null) {
	return `${source}:${ean}:${skuId || "no-sku"}`;
}

function coverageMode(surface: DirectRefreshDiscoveryDenominatorCandidateSurface) {
	if (surface === "direct-catalog-lookup") return "direct-identity" as const;
	if (surface === "product-suggestions") return "bounded-search" as const;
	return "input-artifact" as const;
}

function coverageDescription(surface: DirectRefreshDiscoveryDenominatorCandidateSurface) {
	if (surface === "direct-catalog-lookup") {
		return "Source-scoped direct catalog lookup from explicit known EAN/SKU identities; not an exhaustive all-source denominator.";
	}
	if (surface === "product-suggestions") {
		return "Bounded source-scoped productSuggestions search from explicit terms; not an exhaustive all-source denominator.";
	}
	return "Bounded source-scoped candidate snapshot from an explicit input artifact; not an exhaustive all-source denominator.";
}

function parseSupportedSource(
	source: string,
): DirectRefreshDiscoveryDenominatorCandidateSource | null {
	return SUPPORTED_SOURCES.includes(
		source as DirectRefreshDiscoveryDenominatorCandidateSource,
	)
		? (source as DirectRefreshDiscoveryDenominatorCandidateSource)
		: null;
}

function sha256Lineage(value: string) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
