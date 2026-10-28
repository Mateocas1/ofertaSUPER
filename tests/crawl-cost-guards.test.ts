import assert from "node:assert/strict";
import { describe, it } from "node:test";

import nextConfig from "../next.config";
import robots from "../src/app/robots";
import * as sitemapRoute from "../src/app/sitemap";
import { buildSitemap } from "../src/lib/sitemap";
import { DETAILED_CATEGORIES } from "../src/lib/vtex/categories";
import { naiveSitemapEans } from "./helpers/naive-snapshot-oracle";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// Guards that keep crawler traffic from turning into function CPU on Vercel
// Hobby: a build-time sitemap, CDN caching for catalog pages and robots rules
// for AI crawlers that leave search indexing as it was.

const FIXTURE = installSnapshotFixture();

describe("sitemap route", () => {
  it("is generated at build time instead of on every request", () => {
    assert.equal("dynamic" in sitemapRoute, false);
    assert.equal("revalidate" in sitemapRoute, false);
  });

  it("lists the same URLs as the full-scan catalog", async () => {
    const expected = await buildSitemap(
      async () => ({ products: naiveSitemapEans(FIXTURE) }),
      DETAILED_CATEGORIES.map(({ slug }) => ({ slug })),
      () => false,
    );
    assert.deepEqual(await sitemapRoute.default(), expected);
  });
});

describe("catalog page CDN caching", () => {
  const CDN_CACHE = "s-maxage=3600, stale-while-revalidate=86400";

  async function headersFor(source: string) {
    const rules = await nextConfig.headers!();
    return rules.find((rule) => rule.source === source)?.headers ?? [];
  }

  for (const source of ["/ofertas", "/buscar", "/categoria/:slug", "/producto/:ean"]) {
    it(`lets Vercel's CDN cache ${source} for an hour and serve it stale for a day`, async () => {
      assert.deepEqual(await headersFor(source), [{ key: "Vercel-CDN-Cache-Control", value: CDN_CACHE }]);
    });
  }

  it("keeps the security headers on every path", async () => {
    const keys = (await headersFor("/:path*")).map(({ key }) => key);
    assert.deepEqual(keys, [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
  });
});

describe("image optimizer", () => {
  it("is off, so /_next/image cannot be used to transform arbitrary remote images", () => {
    assert.equal(nextConfig.images?.unoptimized, true);
    assert.equal(nextConfig.images?.remotePatterns, undefined);
  });
});

describe("robots.txt", () => {
  const rules = [robots().rules].flat();

  it("keeps the rules for every crawler and Googlebot unchanged", () => {
    assert.deepEqual(rules[0], { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] });
    assert.deepEqual(rules[1], {
      userAgent: "Googlebot",
      allow: ["/", "/ofertas", "/buscar", "/categoria/", "/producto/", "/canasta"],
      disallow: ["/admin/", "/api/"],
    });
  });

  it("disallows the whole site for AI crawlers without naming search crawlers", () => {
    const aiRule = rules[2];
    assert.equal(aiRule.disallow, "/");
    const agents = [aiRule.userAgent].flat();
    for (const agent of ["GPTBot", "ClaudeBot", "CCBot", "PerplexityBot", "Bytespider", "Amazonbot", "Google-Extended", "Meta-ExternalAgent"]) {
      assert.ok(agents.includes(agent), agent);
    }
    for (const searchCrawler of ["Googlebot", "Bingbot", "*"]) {
      assert.equal(agents.includes(searchCrawler), false, searchCrawler);
    }
    assert.equal(rules.length, 3);
  });
});
