import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

const disablePwa = process.env.DISABLE_PWA === "true";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || disablePwa,
  register: true,
  reloadOnOnline: true,
  // The plugin's frontend-navigation cache ignores query strings, so it cannot safely cache catalog routes.
  cacheOnFrontEndNav: false,
  fallbacks: {
    document: "/~offline",
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: ({ sameOrigin, url }) => sameOrigin && (url.pathname === "/buscar" || url.pathname === "/ofertas"),
        handler: "NetworkOnly",
        options: { cacheName: "catalog-navigation" },
      },
    ],
  },
  extendDefaultRuntimeCaching: true,
});

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

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withPWA(nextConfig);
