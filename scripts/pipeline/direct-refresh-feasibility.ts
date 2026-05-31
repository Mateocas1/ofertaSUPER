type RowStatus = "viable" | "ambiguous" | "unviable";
type Recommendation = "direct-refresh" | "search-fallback" | "larger-bounded-chunks" | "cadence-or-SLA-change" | "stop";
type Product = { ean: string; skuId: string | null; productUrl: string | null };

export type DirectRefreshExistingRow = { id: string; sourceSlug: string; ean: string | null; skuId: string | null; productUrl: string | null };
export type DirectRefreshRepository = {
	listSources(slugs?: string[]): Promise<Array<{ slug: string }>>;
	listOldestPublicRankableRows(sourceSlug: string, sampleSize: number): Promise<DirectRefreshExistingRow[]>;
	findRowsBySourceEan(sourceSlug: string, ean: string): Promise<DirectRefreshExistingRow[]>;
};
export type DirectRefreshRowDecision = { rowId: string; status: RowStatus; identifier: "source-url" | "sku-id" | "ean" | null; reasons: string[] };
export type DirectRefreshFeasibilityReport = {
	schemaVersion: 1;
	audit: "direct-refresh-feasibility";
	basis: "production";
	generatedAt: string;
	status: "PASS" | "WARN" | "FAIL";
	sampleSize: number;
	writeBoundary: "read-only feasibility only; no persistence or scheduler side effects";
	sources: Array<{ slug: string; recommendation: Recommendation; rows: DirectRefreshRowDecision[] }>;
};

export async function buildDirectRefreshFeasibilityReport({ repository, fetchProducts, sourceSlugs, sampleSize = 10, now = new Date() }: {
	repository: DirectRefreshRepository;
	fetchProducts(sourceSlug: string, term: string): Promise<Product[]>;
	sourceSlugs?: string[];
	sampleSize?: number;
	now?: Date;
}): Promise<DirectRefreshFeasibilityReport> {
	const sources = sourceSlugs?.length ? sourceSlugs.map((slug) => ({ slug })) : await repository.listSources();
	const summaries = await Promise.all(sources.map(async (source) => {
		const rows = await repository.listOldestPublicRankableRows(source.slug, sampleSize);
		const decisions = await Promise.all(rows.map((row) => evaluateRow({ row, repository, fetchProducts })));
		return { slug: source.slug, recommendation: recommend(decisions), rows: decisions };
	}));
	return { schemaVersion: 1, audit: "direct-refresh-feasibility", basis: "production", generatedAt: now.toISOString(), status: summarizeStatus(summaries.flatMap((source) => source.rows)), sampleSize, writeBoundary: "read-only feasibility only; no persistence or scheduler side effects", sources: summaries };
}

async function evaluateRow({ row, repository, fetchProducts }: { row: DirectRefreshExistingRow; repository: DirectRefreshRepository; fetchProducts(sourceSlug: string, term: string): Promise<Product[]> }): Promise<DirectRefreshRowDecision> {
	const terms = candidateTerms(row);
	if (terms.length === 0) return decision(row, "unviable", null, "no stable identifier available");
	let missed = false;
	for (const term of terms) {
		const products = await fetchProducts(row.sourceSlug, term.value);
		if (products.length === 0) { missed = true; continue; }
		if (products.length > 1) return decision(row, "ambiguous", term.kind, `${term.kind} returned ${products.length} live products`);
		const product = products[0];
		if (product.ean !== row.ean) return decision(row, "unviable", term.kind, `fetched EAN ${product.ean} does not match existing EAN ${row.ean}`);
		if (hasHostDrift(row.productUrl, product.productUrl)) return decision(row, "unviable", term.kind, "source host drift in fetched product URL");
		if (term.kind === "source-url" && product.productUrl && canonicalUrl(row.productUrl) !== canonicalUrl(product.productUrl)) return decision(row, "ambiguous", term.kind, "canonical URL drift needs review");
		if (term.kind === "sku-id" && product.skuId !== row.skuId) return decision(row, "ambiguous", term.kind, "fetched SKU does not match existing SKU");
		if (term.kind === "ean") {
			const matches = await repository.findRowsBySourceEan(row.sourceSlug, row.ean ?? "");
			if (matches.length !== 1) return decision(row, "ambiguous", term.kind, `EAN maps to ${matches.length} existing rows for source`);
			if (matches[0].id !== row.id) return decision(row, "ambiguous", term.kind, "EAN maps to a different existing row");
		}
		return decision(row, "viable", term.kind, `${term.kind} probe matched existing row`);
	}
	return decision(row, "unviable", terms[0].kind, missed ? "no probe term returned a live product" : "no stable match found");
}

function candidateTerms(row: DirectRefreshExistingRow) {
	return [row.productUrl ? { kind: "source-url" as const, value: row.productUrl } : null, row.skuId ? { kind: "sku-id" as const, value: row.skuId } : null, row.ean ? { kind: "ean" as const, value: row.ean } : null].filter((term): term is { kind: "source-url" | "sku-id" | "ean"; value: string } => Boolean(term));
}

function decision(row: DirectRefreshExistingRow, status: RowStatus, identifier: DirectRefreshRowDecision["identifier"], reason: string) {
	return { rowId: row.id, status, identifier, reasons: [reason] };
}
function recommend(rows: DirectRefreshRowDecision[]): Recommendation {
	if (rows.length === 0 || rows.every((row) => row.status === "unviable")) return "stop";
	if (rows.every((row) => row.status === "viable")) return "direct-refresh";
	if (rows.some((row) => row.status === "viable")) return "search-fallback";
	return "larger-bounded-chunks";
}
function summarizeStatus(rows: DirectRefreshRowDecision[]) {
	if (rows.length === 0 || rows.every((row) => row.status === "unviable")) return "FAIL" as const;
	return rows.every((row) => row.status === "viable") ? "PASS" : "WARN";
}
function hasHostDrift(existingUrl: string | null, liveUrl: string | null) {
	const existingHost = host(existingUrl);
	const liveHost = host(liveUrl);
	return Boolean(existingHost && liveHost && existingHost !== liveHost);
}
function host(value: string | null) {
	try { return value ? new URL(value).host.toLowerCase().replace(/^www\./, "") : null; } catch { return null; }
}
function canonicalUrl(value: string | null) {
	try { const url = value ? new URL(value) : null; return url ? `${url.host.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}` : null; } catch { return null; }
}
