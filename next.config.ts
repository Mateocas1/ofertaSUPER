import type { NextConfig } from "next";

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
// marks them private. They hold no per-user data and the snapshot changes once
// a day, so Vercel's CDN may keep each URL for an hour and serve it stale for
// a day while it refreshes. Vercel strips this header before the browser.
const CDN_CACHED_ROUTES = ["/ofertas", "/buscar", "/categoria/:slug", "/producto/:ean"];
const CDN_CACHE_HEADER = {
  key: "Vercel-CDN-Cache-Control",
  value: "s-maxage=3600, stale-while-revalidate=86400",
};

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
      ...CDN_CACHED_ROUTES.map((source) => ({ source, headers: [CDN_CACHE_HEADER] })),
    ];
  },
};

export default nextConfig;
