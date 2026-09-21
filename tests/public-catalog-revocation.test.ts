import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const identity = {
  version: 1,
  target: "production",
  publicationId: "publication-1",
  deploymentId: "deployment-1",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
};

const unavailable = {
  error: "Catalog temporarily unavailable",
  dataSource: "unavailable",
  degraded: false,
  verifiedAt: null,
};

type Scenario = "historical" | "missing" | "revoked" | "warm" | "global" | "client" | "error" | "timeout" | "missing-provider" | "missing-ip" | "non-vercel" | "spoofed";

function runRouteScenario(scenario: Scenario, route: "search" | "product" = scenario === "revoked" ? "search" : "product") {
  const fixtureUrl = new URL("./fixtures/public-catalog-revocation-dependencies.ts", import.meta.url).href;
  const script = `
    import { registerHooks } from "node:module";
    const fixtureUrl = ${JSON.stringify(fixtureUrl)};
    const substitutedDependencies = new Set(["@/lib/catalog", "@/lib/db", "@/lib/redis", "@upstash/ratelimit", "@upstash/redis"]);
    registerHooks({ resolve(specifier, context, nextResolve) {
      return substitutedDependencies.has(specifier) ? { shortCircuit: true, url: fixtureUrl } : nextResolve(specifier, context);
    } });
    const scenario = ${JSON.stringify(scenario)};
    process.env.TEST_ADMISSION_SCENARIO = ["global", "client", "error", "timeout"].includes(scenario) ? scenario : "admitted";
    process.env.VERCEL = scenario === "non-vercel" ? "0" : "1";
    if (scenario !== "missing-provider") {
      process.env.UPSTASH_REDIS_REST_URL = "https://fixture.invalid";
      process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
    }
    if (scenario === "missing") delete process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
    else process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON = ${JSON.stringify(JSON.stringify(identity))};
    const fixtureModule = await import("./tests/fixtures/public-catalog-revocation-dependencies.ts");
    const dependencies = fixtureModule.default ?? fixtureModule;
    const { NextRequest } = await import("next/server");
    const [searchModule, productDetailModule] = await Promise.all([
      import("./src/app/api/search/route.ts"), import("./src/app/api/products/[ean]/route.ts"),
    ]);
    const searchGet = searchModule.GET ?? searchModule.default.GET;
    const productDetailGet = productDetailModule.GET ?? productDetailModule.default.GET;
    const forwarded = scenario === "missing-ip" ? {} : { "x-forwarded-for": scenario === "spoofed" ? "203.0.113.8, 198.51.100.4" : "203.0.113.8" };
    const searchRequest = () => new NextRequest("http://catalog.test/api/search?q=yerba&limit=5", { headers: forwarded });
    const productRequest = () => new NextRequest("http://catalog.test/api/products/7790000000001", { headers: forwarded });
    const productContext = () => ({ params: Promise.resolve({ ean: "7790000000001" }) });
    const snapshot = async (response) => ({ status: response.status, body: await response.json() });
    dependencies.resetPublicCatalogDependencies();
    if (scenario === "historical") dependencies.useHistoricalPublication();
    else if (scenario !== "missing") dependencies.promotePublication();
    const isSearch = ${JSON.stringify(route)} === "search";
    const handler = isSearch ? searchGet : productDetailGet;
    const request = isSearch ? searchRequest : productRequest;
    const context = isSearch ? undefined : productContext;
    const call = () => context ? handler(request(), context()) : handler(request());
    const initial = await snapshot(await call());
    if (scenario === "revoked") dependencies.revokePublication();
    const followUp = scenario === "warm" || scenario === "revoked" ? await snapshot(await call()) : null;
    console.log(JSON.stringify({ initial, followUp, observations: dependencies.dependencyObservations(), admissionKeys: dependencies.admissionObservations() }));
  `;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: process.cwd(), encoding: "utf8",
  });

  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout) as {
    initial: { status: number; body: unknown };
    followUp: { status: number; body: unknown } | null;
    admissionKeys: string[];
    observations: { authorityReads: number; cacheReads: number; cacheWrites: number; catalogReads: number; cachedEntries: number };
  };
}

describe("public catalog cache revocation", () => {
  it("uses a valid authority for each real GET request and serves warm cache data", () => {
    const actual = runRouteScenario("warm");
    assert.equal(actual.initial.status, 200);
    assert.equal(actual.followUp?.status, 200);
    assert.deepEqual(actual.followUp?.body, {
      item: { ean: "7790000000001", name: "Cached product" }, dataSource: "database", degraded: false,
      verifiedAt: actual.initial.body && typeof actual.initial.body === "object" ? (actual.initial.body as { verifiedAt: string }).verifiedAt : undefined,
      latestCheckedAt: null,
    });
    assert.deepEqual(actual.observations, { authorityReads: 2, cacheReads: 2, cacheWrites: 1, catalogReads: 1, cachedEntries: 1 });
  });

  it("denies a warm cache after revocation before another catalog or Redis read", () => {
    const actual = runRouteScenario("revoked");
    assert.deepEqual(actual.followUp, { status: 503, body: unavailable });
    assert.deepEqual(actual.observations, { authorityReads: 2, cacheReads: 1, cacheWrites: 1, catalogReads: 1, cachedEntries: 1 });
  });

  it("denies a missing startup identity without authority, catalog, or cache access", () => {
    const actual = runRouteScenario("missing");
    assert.deepEqual(actual.initial, { status: 503, body: unavailable });
    assert.deepEqual(actual.observations, { authorityReads: 0, cacheReads: 0, cacheWrites: 0, catalogReads: 0, cachedEntries: 0 });
  });

  it("serves valid historical authority data as degraded without caching it", () => {
    const actual = runRouteScenario("historical");
    assert.equal(actual.initial.status, 200);
    assert.equal((actual.initial.body as { degraded: boolean }).degraded, true);
    assert.deepEqual(actual.observations, { authorityReads: 1, cacheReads: 1, cacheWrites: 0, catalogReads: 1, cachedEntries: 0 });
  });

  for (const scenario of ["global", "client", "error", "timeout", "missing-provider", "missing-ip", "non-vercel", "spoofed"] as const) {
    for (const route of ["search", "product"] as const) {
      it(`rejects ${scenario} admission before ${route} data access`, () => {
        const actual = runRouteScenario(scenario, route);
        assert.equal(actual.initial.status, scenario === "global" || scenario === "client" ? 429 : 503);
        assert.deepEqual(actual.observations, { authorityReads: 0, cacheReads: 0, cacheWrites: 0, catalogReads: 0, cachedEntries: 0 });
        const expectedCalls = scenario === "client" ? 2 : ["missing-provider", "missing-ip", "non-vercel", "spoofed"].includes(scenario) ? 0 : 1;
        assert.equal(actual.admissionKeys.length, expectedCalls);
        if (expectedCalls) assert.equal(actual.admissionKeys[0], `strict:${route === "product" ? "products" : "search"}:global`);
      });
    }
  }
});
