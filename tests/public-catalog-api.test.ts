import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPublicCatalogReadiness } from "../src/lib/public-catalog-readiness";
import {
  getDemoPromotions,
  resolveLegacyPublicCatalogData,
  resolveLegacyPublicCategories,
  resolveLegacyPublicProductList,
  resolveLegacyPublicPromotions,
  resolvePublicCatalogData,
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

describe("public catalog API fallback semantics", () => {
  it("keeps validation failures as 400 instead of falling back", async () => {
    let loaderCalls = 0;

    const result = await resolveLegacyPublicProductList(
      { limit: "999" },
      async () => {
        loaderCalls += 1;
        throw new Error("loader should not run");
      },
    );

    assert.equal(result.status, 400);
    assert.equal(loaderCalls, 0);
    assert.equal(result.body.error, "Invalid query parameters");
    assert.ok("issues" in result.body);
  });

  it("returns demo product page when the catalog runtime fails", async () => {
    const result = await resolveLegacyPublicProductList({ q: "leche", limit: "2" }, async () => {
      throw new Error("database unavailable");
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.items[0]?.name, "Leche entera larga vida 1L");
    assert.equal(result.body.dataSource, "demo");
    assert.equal(result.body.degraded, true);
    assert.equal(result.body.latestCheckedAt, null);
    assert.equal("provenance" in result.body, false);
    assert.deepEqual(
      Object.keys(result.body).filter((key) => ["items", "limit", "page", "total", "totalPages"].includes(key)).sort(),
      ["items", "limit", "page", "total", "totalPages"].sort(),
    );
  });

  it("reports successful database rows with their latest check time", async () => {
    const result = await resolveLegacyPublicProductList({}, async () => databasePage as never);

    assert.equal(result.status, 200);
    assert.equal(result.body.dataSource, "database");
    assert.equal(result.body.degraded, false);
    assert.equal(result.body.latestCheckedAt, "2026-08-12T11:00:00.000Z");
    assert.equal("provenance" in result.body, false);
  });

  it("builds honest provenance for database and demo loaders", async () => {
    const database = await resolveLegacyPublicCatalogData(async () => databasePage);
    const demo = await resolveLegacyPublicCatalogData(async () => {
      throw new Error("database unavailable");
    }, databasePage);

    assert.equal(database.dataSource, "database");
    assert.equal(database.latestCheckedAt, "2026-08-12T11:00:00.000Z");
    assert.equal(demo.dataSource, "demo");
    assert.equal(demo.degraded, true);
    assert.equal(demo.latestCheckedAt, null);
    assert.equal("provenance" in demo, false);
  });

  it("returns demo categories when categories runtime fails", async () => {
    const result = await resolveLegacyPublicCategories(async () => {
      throw new Error("database unavailable");
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 3);
    assert.equal(result.body.items[0]?.slug, "almacen");
  });

  it("keeps invalid promotion filters as 400 and falls back on runtime errors", async () => {
    const invalid = await resolveLegacyPublicPromotions({ type: "invalid" }, async () => []);

    assert.equal(invalid.status, 400);

    const degraded = await resolveLegacyPublicPromotions({ super: "disco" }, async () => {
      throw new Error("database unavailable");
    });

    assert.equal(degraded.status, 200);
    assert.equal(degraded.body.items.every((item) => item.supermarket.slug === "disco"), true);
  });

  it("applies the offers page filters to demo promotions", () => {
    assert.deepEqual(getDemoPromotions({ wallet: "mercado", type: "wallet_discount" }).map(({ id }) => id), [1]);
    assert.deepEqual(getDemoPromotions({ supermarket: "jumbo", type: "wallet_discount" }), []);
  });
});

const NOW = new Date("2026-08-13T12:00:00.000Z");
const FRESH_AT = new Date(Date.now() - 60 * 60 * 1000);
const fresh = () => Promise.resolve({ verified_at: FRESH_AT });
const historical = () => Promise.resolve({ verified_at: new Date(Date.now() - 25 * 60 * 60 * 1000) });
const unverified = () => Promise.resolve(null);
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

  it("withholds unverified and failed catalog payloads without demo substitution", async () => {
    assert.deepEqual(await resolvePublicProductList({ q: "leche" }, async () => databasePage, unverified), unavailable);
    assert.deepEqual(await resolvePublicProductList({ q: "leche" }, async () => { throw new Error("db down"); }, fresh), unavailable);
    await assert.rejects(resolvePublicCatalogData(async () => databasePage, unverified));
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
