export function buildSearchCacheKey(query: string, limit: number) {
	return `search:v3:${query.trim().toLowerCase()}:${limit}`;
}

export function buildProductDetailCacheKey(ean: string) {
	return `product:detail:${ean}`;
}
