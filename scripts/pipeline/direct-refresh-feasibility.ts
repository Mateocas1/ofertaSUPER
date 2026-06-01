type RowStatus = "viable" | "ambiguous" | "unviable";
type Recommendation =
	| "direct-refresh"
	| "search-fallback"
	| "larger-bounded-chunks"
	| "cadence-or-SLA-change"
	| "stop";
type Product = { ean: string; skuId: string | null; productUrl: string | null };
export type DirectRefreshLookupKind = "source-url" | "sku-id" | "ean";
export type DirectRefreshLookup = {
	kind: DirectRefreshLookupKind;
	value: string;
};

export type DirectRefreshExistingRow = {
	id: string;
	sourceSlug: string;
	ean: string | null;
	skuId: string | null;
	productUrl: string | null;
};
export type DirectRefreshRepository = {
	listSources(slugs?: string[]): Promise<Array<{ slug: string }>>;
	listOldestPublicRankableRows(
		sourceSlug: string,
		sampleSize: number,
	): Promise<DirectRefreshExistingRow[]>;
	findRowsBySourceEan(
		sourceSlug: string,
		ean: string,
	): Promise<DirectRefreshExistingRow[]>;
};
export type DirectRefreshRowDecision = {
	rowId: string;
	status: RowStatus;
	identifier: "source-url" | "sku-id" | "ean" | null;
	reasons: string[];
};
export type DirectRefreshFeasibilityReport = {
	schemaVersion: 1;
	audit: "direct-refresh-feasibility";
	basis: "production";
	generatedAt: string;
	status: "PASS" | "WARN" | "FAIL";
	sampleSize: number;
	writeBoundary: "read-only feasibility only; no persistence or scheduler side effects";
	sources: Array<{
		slug: string;
		recommendation: Recommendation;
		rows: DirectRefreshRowDecision[];
	}>;
};

export async function buildDirectRefreshFeasibilityReport({
	repository,
	fetchProducts,
	sourceSlugs,
	sampleSize = 10,
	now = new Date(),
}: {
	repository: DirectRefreshRepository;
	fetchProducts(
		sourceSlug: string,
		lookup: DirectRefreshLookup,
	): Promise<Product[]>;
	sourceSlugs?: string[];
	sampleSize?: number;
	now?: Date;
}): Promise<DirectRefreshFeasibilityReport> {
	const sources = await repository.listSources(
		sourceSlugs?.length ? sourceSlugs : undefined,
	);
	const summaries = await Promise.all(
		sources.map(async (source) => {
			const rows = await repository.listOldestPublicRankableRows(
				source.slug,
				sampleSize,
			);
			const decisions = await Promise.all(
				rows.map((row) => evaluateRow({ row, repository, fetchProducts })),
			);
			return {
				slug: source.slug,
				recommendation: recommend(decisions),
				rows: decisions,
			};
		}),
	);
	return {
		schemaVersion: 1,
		audit: "direct-refresh-feasibility",
		basis: "production",
		generatedAt: now.toISOString(),
		status: summarizeStatus(summaries.flatMap((source) => source.rows)),
		sampleSize,
		writeBoundary:
			"read-only feasibility only; no persistence or scheduler side effects",
		sources: summaries,
	};
}

async function evaluateRow({
	row,
	repository,
	fetchProducts,
}: {
	row: DirectRefreshExistingRow;
	repository: DirectRefreshRepository;
	fetchProducts(
		sourceSlug: string,
		lookup: DirectRefreshLookup,
	): Promise<Product[]>;
}): Promise<DirectRefreshRowDecision> {
	const terms = candidateTerms(row);
	if (terms.length === 0)
		return decision(row, "unviable", null, "no stable identifier available");
	let missed = false;
	let skippedSourceUrl = false;
	for (const term of terms) {
		if (term.kind === "source-url") {
			skippedSourceUrl = true;
			continue;
		}
		const products = await fetchProducts(row.sourceSlug, term);
		if (products.length === 0) {
			missed = true;
			continue;
		}
		if (products.length > 1)
			return decision(
				row,
				"ambiguous",
				term.kind,
				`direct ${term.kind} lookup returned ${products.length} live products`,
			);
		const product = products[0];
		if (product.ean !== row.ean)
			return decision(
				row,
				"unviable",
				term.kind,
				`direct lookup fetched EAN ${product.ean} does not match existing EAN ${row.ean}`,
			);
		if (hasHostDrift(row.productUrl, product.productUrl))
			return decision(
				row,
				"unviable",
				term.kind,
				"source host drift in fetched product URL",
			);
		if (term.kind === "sku-id" && product.skuId !== row.skuId)
			return decision(
				row,
				"ambiguous",
				term.kind,
				"direct lookup fetched SKU does not match existing SKU",
			);
		if (term.kind === "ean") {
			const matches = await repository.findRowsBySourceEan(
				row.sourceSlug,
				row.ean ?? "",
			);
			if (matches.length !== 1)
				return decision(
					row,
					"ambiguous",
					term.kind,
					`EAN maps to ${matches.length} existing rows for source`,
				);
			if (matches[0].id !== row.id)
				return decision(
					row,
					"ambiguous",
					term.kind,
					"EAN maps to a different existing row",
				);
		}
		return decision(
			row,
			"viable",
			term.kind,
			`direct ${term.kind} lookup matched existing row`,
		);
	}
	const attempted =
		terms.find((term) => term.kind !== "source-url") ?? terms[0];
	return decision(
		row,
		"unviable",
		attempted.kind,
		endReason({
			missed,
			skippedSourceUrl,
			attemptedDirectLookup: Boolean(
				terms.find((term) => term.kind !== "source-url"),
			),
		}),
	);
}

function candidateTerms(row: DirectRefreshExistingRow): DirectRefreshLookup[] {
	return [
		row.productUrl
			? { kind: "source-url" as const, value: row.productUrl }
			: null,
		row.skuId ? { kind: "sku-id" as const, value: row.skuId } : null,
		row.ean ? { kind: "ean" as const, value: row.ean } : null,
	].filter((term): term is DirectRefreshLookup => Boolean(term));
}

function endReason({
	missed,
	skippedSourceUrl,
	attemptedDirectLookup,
}: {
	missed: boolean;
	skippedSourceUrl: boolean;
	attemptedDirectLookup: boolean;
}) {
	if (!attemptedDirectLookup && skippedSourceUrl)
		return "source-url direct lookup is not implemented";
	if (missed)
		return skippedSourceUrl
			? "source-url direct lookup is not implemented; no direct lookup returned a live product"
			: "no direct lookup returned a live product";
	return "no stable direct lookup match found";
}

function decision(
	row: DirectRefreshExistingRow,
	status: RowStatus,
	identifier: DirectRefreshRowDecision["identifier"],
	reason: string,
) {
	return { rowId: row.id, status, identifier, reasons: [reason] };
}
function recommend(rows: DirectRefreshRowDecision[]): Recommendation {
	if (rows.length === 0 || rows.every((row) => row.status === "unviable"))
		return "stop";
	if (rows.every((row) => row.status === "viable")) return "direct-refresh";
	if (rows.some((row) => row.status === "viable")) return "search-fallback";
	return "larger-bounded-chunks";
}
function summarizeStatus(rows: DirectRefreshRowDecision[]) {
	if (rows.length === 0 || rows.every((row) => row.status === "unviable"))
		return "FAIL" as const;
	return rows.every((row) => row.status === "viable") ? "PASS" : "WARN";
}
function hasHostDrift(existingUrl: string | null, liveUrl: string | null) {
	const existingHost = host(existingUrl);
	const liveHost = host(liveUrl);
	return Boolean(existingHost && liveHost && existingHost !== liveHost);
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
