// CDN caching for public catalog responses. The snapshot changes once a day,
// so Vercel's CDN may serve a URL for an hour and keep serving it stale for a
// day while it refreshes in the background. Vercel consumes this header and
// strips it before the browser. Shared by next.config.ts (pages) and the
// public API handlers.
export const CDN_CACHE_HEADER = "Vercel-CDN-Cache-Control";
export const CATALOG_CDN_CACHE_CONTROL = "s-maxage=3600, stale-while-revalidate=86400";

/** Marks a successful response as CDN-cacheable; errors and 429s never are. */
export function withCatalogCdnCache<T extends Response>(response: T): T {
  if (response.status === 200) {
    response.headers.set(CDN_CACHE_HEADER, CATALOG_CDN_CACHE_CONTROL);
  }
  return response;
}
