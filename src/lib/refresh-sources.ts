// The supermarkets the daily refresh acquires, tops up, gates and publishes.
// One list, so adding a store is one change here plus its discovery
// allowlist (config/catalog-discovery.json) and its supermarket row. Every
// store is VTEX except Coto, which has its own client (src/lib/coto).
export const REFRESH_SOURCES = ["carrefour", "coto", "disco", "jumbo", "vea"] as const;

export type RefreshSource = (typeof REFRESH_SOURCES)[number];

// For the raw SQL `in (...)` filters; the slugs are constants, never input.
export const REFRESH_SOURCES_SQL = REFRESH_SOURCES.map((slug) => `'${slug}'`).join(", ");
