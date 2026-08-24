import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPublicCatalogReadiness } from "../src/lib/public-catalog-readiness";
import {
  getDemoPromotions,
  resolvePublicCatalogData,
  resolvePublicCategories,
  resolvePublicProductList,
  resolvePublicPromotions,
} from "../src/lib/public-catalog-api";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const FRESH_AT = new Date(Date.now() - 60 * 60 * 1000);
const fresh = () => Promise.resolve({ verified_at: FRESH_AT });
const historical = () => Promise.resolve({ verified_at: new Date(Date.now() - 25 * 60 * 60 * 1000) });
const unverified = () => Promise.resolve(null);
const databasePage = { items: [{ latestCheckedAt: "2026-08-12T11:00:00.000Z" }], total: 1, page: 1, limit: 24, totalPages: 1 };

const unavailable = { status: 503, body: {
  error: "Catalog temporarily unavailable", dataSource: "unavailable", degraded: false, verifiedAt: null,
} } as const;

describe("public catalog publication gate", () => {
  it("classifies the 24-hour boundary exclusively and can re-evaluate a cached watermark", () => {
    assert.equal(classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T12:00:00.001Z") }, { now: NOW }).status, "fresh");
    assert.equal(classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T12:00:00.000Z") }, { now: NOW }).status, "degraded");
    assert.equal(classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-13T12:00:00.001Z") }, { now: NOW }).status, "unavailable");
    assert.equal(classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-13T10:00:00.000Z") }, { now: NOW, sourceSlaHours: 1 }).status, "degraded");
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

  it("keeps invalid product and promotion input at 400 without executing loaders", async () => {
    let calls = 0;
    assert.equal((await resolvePublicProductList({ limit: "999" }, async () => { calls += 1; return databasePage; }, fresh)).status, 400);
    assert.equal((await resolvePublicPromotions({ type: "invalid" }, async () => { calls += 1; return []; }, fresh)).status, 400);
    assert.equal(calls, 0);
  });

  it("applies the offers page filters to demo promotions", () => {
    assert.deepEqual(getDemoPromotions({ wallet: "mercado", type: "wallet_discount" }).map(({ id }) => id), [1]);
    assert.deepEqual(getDemoPromotions({ supermarket: "jumbo", type: "wallet_discount" }), []);
  });
});
