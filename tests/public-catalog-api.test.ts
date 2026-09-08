import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPublicCatalogReadiness } from "../src/lib/public-catalog-readiness";
import {
  createPublicCatalogCacheEnvelope,
  PublicCatalogUnavailableError,
  readPublicCatalogCacheEnvelope,
  reclassifyCachedPublicCatalogData,
  resolvePublicCatalogData,
  resolvePublicCatalogDataFromAuthority,
  resolvePublicCategories,
  resolvePublicProductList,
  resolvePublicPromotions,
} from "../src/lib/public-catalog-api";

const databasePage = {
  items: [
    {
      latestCheckedAt: "2026-08-12T10:00:00.000Z",
    },
    {
      latestCheckedAt: "2026-08-12T11:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 24,
  totalPages: 1,
};

const NOW = new Date("2026-08-13T12:00:00.000Z");
const FRESH_AT = new Date(Date.now() - 60 * 60 * 1000);
const fresh = () => Promise.resolve({ verified_at: FRESH_AT });
const historical = () => Promise.resolve({ verified_at: new Date(Date.now() - 25 * 60 * 60 * 1000) });
const unverified = () => Promise.resolve(null);
const authority = {
  publicationId: "publication-1",
  promotionId: "promotion-1",
  target: "production" as const,
  deploymentId: "deployment-1",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
  verifiedAt: "2026-08-13T11:00:00.000Z",
  expiresAt: "2026-08-14T12:00:00.000Z",
};

const cachePayload = {
  ...databasePage,
  dataSource: "database" as const,
  degraded: false,
  verifiedAt: authority.verifiedAt,
  latestCheckedAt: "2026-08-12T11:00:00.000Z",
};

const unavailable = {
  status: 503,
  body: {
    error: "Catalog temporarily unavailable",
    dataSource: "unavailable",
    degraded: false,
    verifiedAt: null,
  },
} as const;

describe("public catalog publication gate", () => {
  it("classifies strict 24-hour, future, and source-SLA boundaries", () => {
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T12:00:00.001Z") }, { now: NOW }).status,
      "fresh",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T12:00:00.000Z") }, { now: NOW }).status,
      "degraded",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-13T12:00:00.001Z") }, { now: NOW }).status,
      "unavailable",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-13T10:00:00.000Z") }, { now: NOW, sourceSlaHours: 1 }).status,
      "degraded",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T11:00:00.000Z") }, { now: NOW, sourceSlaHours: 48 }).status,
      "degraded",
    );
    assert.equal(classifyPublicCatalogReadiness(null, { now: NOW }).status, "unavailable");
  });

  it("returns fresh real data only behind a fresh verified publication", async () => {
    const result = await resolvePublicProductList({}, async () => databasePage, fresh);

    assert.equal(result.status, 200);
    assert.equal(result.body.dataSource, "database");
    assert.equal(result.body.degraded, false);
    assert.equal(result.body.verifiedAt, FRESH_AT.toISOString());
  });

  it("returns historical real data explicitly degraded at the watermark boundary", async () => {
    const result = await resolvePublicProductList({}, async () => databasePage, historical);

    assert.equal(result.status, 200);
    assert.equal(result.body.dataSource, "database");
    assert.equal(result.body.degraded, true);
  });

  it("reclassifies cached database payloads and rejects demo, invalid, and future watermarks", () => {
    const cached = {
      ...databasePage,
      dataSource: "database" as const,
      degraded: false,
      verifiedAt: "2026-08-12T12:00:00.000Z",
      latestCheckedAt: null,
    };

    assert.deepEqual(reclassifyCachedPublicCatalogData(cached, NOW), { ...cached, degraded: true });
    assert.equal(reclassifyCachedPublicCatalogData({ ...cached, dataSource: "demo" } as never, NOW), null);
    assert.equal(reclassifyCachedPublicCatalogData({ ...cached, verifiedAt: "invalid" }, NOW), null);
    assert.equal(
      reclassifyCachedPublicCatalogData({ ...cached, verifiedAt: "2026-08-13T12:00:00.001Z" }, NOW),
      null,
    );
  });

  it("uses an already resolved authority without loading the default publication", async () => {
    let loadCalls = 0;

    const result = await resolvePublicCatalogDataFromAuthority(async () => {
      loadCalls += 1;
      return databasePage;
    }, authority, NOW);

    assert.equal(loadCalls, 1);
    assert.deepEqual(result, cachePayload);
  });

  it("withholds unavailable authority before loading data but serves degraded history", async () => {
    for (const candidate of [null, { ...authority, verifiedAt: "invalid" }]) {
      let loadCalls = 0;

      await assert.rejects(resolvePublicCatalogDataFromAuthority(async () => {
        loadCalls += 1;
        return databasePage;
      }, candidate, NOW), PublicCatalogUnavailableError);
      assert.equal(loadCalls, 0);
    }

    let loadCalls = 0;
    const historical = await resolvePublicCatalogDataFromAuthority(async () => {
      loadCalls += 1;
      return databasePage;
    }, { ...authority, verifiedAt: "2026-08-12T12:00:00.000Z" }, NOW);
    assert.equal(loadCalls, 1);
    assert.equal(historical.degraded, true);
  });

  it("creates cache envelopes with a fingerprint snapshot and returns only public payload", () => {
    const envelope = createPublicCatalogCacheEnvelope(authority, cachePayload, NOW);

    assert.ok(envelope);
    assert.notEqual(envelope.authority, authority);
    assert.deepEqual(readPublicCatalogCacheEnvelope(envelope, authority, NOW), cachePayload);
  });

  it("rejects cache entries when any authority fingerprint field differs", () => {
    const envelope = createPublicCatalogCacheEnvelope(authority, cachePayload, NOW);
    assert.ok(envelope);

    for (const [field, value] of Object.entries(authority)) {
      assert.equal(
        readPublicCatalogCacheEnvelope(
          { ...envelope, authority: { ...authority, [field]: `${value}-different` } },
          authority,
          NOW,
        ),
        null,
        field,
      );
    }
  });

  it("rejects legacy, malformed, and provenance-inconsistent cache payloads", () => {
    const envelope = createPublicCatalogCacheEnvelope(authority, cachePayload, NOW);
    assert.ok(envelope);
    const malformed = [
      null,
      [],
      cachePayload,
      { version: 2, authority, payload: cachePayload },
      { version: 1, authority: [], payload: cachePayload },
      { version: 1, authority, payload: [] },
      { ...envelope, payload: { ...cachePayload, dataSource: "demo" } },
      { ...envelope, payload: { ...cachePayload, verifiedAt: "2026-08-13T10:00:00.000Z" } },
      { ...envelope, payload: { ...cachePayload, degraded: "no" } },
      { ...envelope, payload: { ...cachePayload, latestCheckedAt: "wrong" } },
    ];

    for (const cached of malformed) {
      assert.equal(readPublicCatalogCacheEnvelope(cached, authority, NOW), null);
    }
  });

  it("reclassifies cached envelopes at the public freshness boundary", () => {
    const staleAuthority = { ...authority, verifiedAt: "2026-08-12T12:00:00.000Z" };
    const stalePayload = { ...cachePayload, verifiedAt: staleAuthority.verifiedAt };
    const envelope = createPublicCatalogCacheEnvelope(staleAuthority, stalePayload, NOW);

    assert.deepEqual(readPublicCatalogCacheEnvelope(envelope, staleAuthority, NOW), {
      ...stalePayload,
      degraded: true,
    });
  });

  it("withholds unavailable publications before loading data and normalizes loader failures", async () => {
    for (const publication of [
      async () => null,
      async () => ({ verified_at: null }),
      async () => ({ verified_at: new Date("invalid") }),
    ]) {
      let loadCalls = 0;
      await assert.rejects(resolvePublicCatalogData(async () => {
        loadCalls += 1;
        return databasePage;
      }, publication), PublicCatalogUnavailableError);
      assert.equal(loadCalls, 0);
    }

    let historicalLoads = 0;
    const historical = await resolvePublicCatalogData(async () => {
      historicalLoads += 1;
      return databasePage;
    }, async () => ({ verified_at: new Date(Date.now() - 25 * 60 * 60 * 1000) }));
    assert.equal(historicalLoads, 1);
    assert.equal(historical.degraded, true);

    await assert.rejects(resolvePublicCatalogData(async () => { throw new Error("db down"); }, fresh), PublicCatalogUnavailableError);
    assert.deepEqual(await resolvePublicProductList({ q: "leche" }, async () => databasePage, unverified), unavailable);
    assert.deepEqual(await resolvePublicProductList({ q: "leche" }, async () => { throw new Error("db down"); }, fresh), unavailable);
  });

  it("applies the same unavailable API envelope to categories and promotions", async () => {
    assert.deepEqual(await resolvePublicCategories(async () => [{ id: 1 } as never], unverified), unavailable);
    assert.deepEqual(await resolvePublicPromotions({}, async () => [{ id: 1 } as never], unverified), unavailable);
  });

  it("keeps validation failures as 400 instead of falling back", async () => {
    let loaderCalls = 0;
    const result = await resolvePublicProductList(
      { limit: "999" },
      async () => {
        loaderCalls += 1;
        throw new Error("loader should not run");
      },
      fresh,
    );

    assert.equal(result.status, 400);
    assert.equal(loaderCalls, 0);
    assert.equal(result.body.error, "Invalid query parameters");
    assert.ok("issues" in result.body);
  });

  it("keeps invalid promotion filters at 400", async () => {
    const result = await resolvePublicPromotions({ type: "invalid" }, async () => [], fresh);

    assert.equal(result.status, 400);
  });
});
