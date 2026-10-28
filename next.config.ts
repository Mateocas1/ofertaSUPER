import type { NextConfig } from "next";

import { CATALOG_CDN_CACHE_CONTROL, CDN_CACHE_HEADER } from "./src/lib/http-cache";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Catalog pages read searchParams, so Next.js renders them per request and
// marks them private. They hold no per-user data, so Vercel's CDN may cache
// them like the public API (src/lib/http-cache.ts).
const CDN_CACHED_ROUTES = ["/ofertas", "/buscar", "/categoria/:slug", "/producto/:ean"];
const CDN_CACHE = { key: CDN_CACHE_HEADER, value: CATALOG_CDN_CACHE_CONTROL };

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Product images come from the supermarkets' CDNs and render unoptimized.
  // Turning the optimizer off makes /_next/image answer 404, so nobody can use
  // it to transform arbitrary remote images against the Hobby image quota.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...CDN_CACHED_ROUTES.map((source) => ({ source, headers: [CDN_CACHE] })),
    ];
  },
};

export default nextConfig;
