import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleBasketProductsRequest, loadBasketProducts } from "../src/lib/basket-products";
import { BASKET_PRODUCTS_BATCH_SIZE, basketProductsBodySchema, basketProductsResponseSchema } from "../src/lib/basket-products-contract";
import { fetchBasketProducts } from "../src/lib/basket-products-client";

const ean = (index: number) => String(index).padStart(8, "0");
const product = (code: string) => ({ ean: code, name: code, brand: null, imageUrl: null, minPrice: null,
  freshMinPrice: null, hasFreshPrice: false, priceEntries: [] });
const envelope = (items: ReturnType<typeof product>[], missing: string[] = []) =>
  ({ items, missing, dataSource: "database", degraded: false, latestCheckedAt: null });
const demoEnvelope = (items: ReturnType<typeof product>[], missing: string[] = []) =>
  ({ ...envelope(items, missing), dataSource: "demo" as const, degraded: true });

describe("basket product endpoint", () => {
  it("validates raw request length before dedupe and preserves trimmed first order", () => {
    assert.deepEqual(basketProductsBodySchema.parse({ eans: [" 12345678 ", "87654321", "12345678"] }).eans,
      ["12345678", "87654321"]);
    const invalid = [null, [], {}, { eans: null }, { eans: "12345678" }, { eans: [] }, { eans: [1] },
      { eans: [" "] }, { eans: ["1234567"] }, { eans: ["1234567890123456789"] }, { eans: ["1234567x"] },
      { eans: Array(BASKET_PRODUCTS_BATCH_SIZE + 1).fill("12345678") }];
    invalid.forEach((body) => assert.equal(basketProductsBodySchema.safeParse(body).success, false));
    assert.equal(basketProductsBodySchema.safeParse({ eans: ["12345678", "123456789012345678"] }).success, true);
  });

  it("returns generic route results for malformed JSON, DB failure, and success", async (t) => {
    const previousOfflineMode = process.env.CATALOG_OFFLINE_MODE;
    process.env.CATALOG_OFFLINE_MODE = "false";
    t.after(() => { if (previousOfflineMode === undefined) delete process.env.CATALOG_OFFLINE_MODE; else process.env.CATALOG_OFFLINE_MODE = previousOfflineMode; });
    const malformed = await handleBasketProductsRequest(async () => { throw new SyntaxError(); });
    assert.deepEqual(malformed, { status: 400, body: { error: "Invalid request body" } });
    const failed = await handleBasketProductsRequest(async () => ({ eans: [ean(1)] }), async () => { throw new Error(); });
    assert.deepEqual(failed, { status: 503, body: { error: "Catalog temporarily unavailable" } });
    const success = await handleBasketProductsRequest(async () => ({ eans: [ean(1)] }), async () => ({ items: [product(ean(1))], missing: [] }));
    assert.deepEqual(success, { status: 200, body: envelope([product(ean(1))]) });
  });

  it("does not synthesize demo basket data in offline mode", async (t) => {
    const previousOfflineMode = process.env.CATALOG_OFFLINE_MODE;
    process.env.CATALOG_OFFLINE_MODE = "true";
    t.after(() => { if (previousOfflineMode === undefined) delete process.env.CATALOG_OFFLINE_MODE; else process.env.CATALOG_OFFLINE_MODE = previousOfflineMode; });
    let loaderCalls = 0;
    const result = await handleBasketProductsRequest(
      async () => ({ eans: ["7790002000022", "7799999999999", "7790002000022"] }),
      async () => { loaderCalls += 1; throw new Error("database unavailable"); },
    );
    assert.equal(loaderCalls, 1);
    assert.deepEqual(result, { status: 503, body: { error: "Catalog temporarily unavailable" } });
  });

  it("rejects malformed route bodies and extra properties", async () => {
    for (const body of [null, "bad", [], { eans: null }, { eans: [ean(1)], extra: true }]) {
      const result = await handleBasketProductsRequest(async () => body);
      assert.deepEqual(result, { status: 400, body: { error: "Invalid request body" } });
    }
  });

  it("uses one set query and maps partial results in request order", async () => {
    const calls: unknown[] = [];
    const rows = [ean(2), ean(1)].map((code) => ({ ean: code, name: code, brand: null, image_url: null, supermarket_products: [] }));
    const client = { product: { findMany: async (query: unknown) => { calls.push(query); return rows; } } };
    const result = await loadBasketProducts([ean(1), ean(0), ean(2)], client as never);
    assert.equal(calls.length, 1);
    assert.deepEqual(result.items.map(({ ean: code }) => code), [ean(1), ean(2)]);
    assert.deepEqual(result.missing, [ean(0)]);
  });
});

describe("basket product client", () => {
  it("enables degraded demo estimates only when every successful chunk is demo", async () => {
    const originalFetch = globalThis.fetch;
    const requested = Array.from({ length: 25 }, (_, index) => ean(index));
    globalThis.fetch = async (_url, init) => {
      const chunk = (JSON.parse(String(init?.body)) as { eans: string[] }).eans;
      return Response.json(demoEnvelope(chunk.map(product)));
    };
    try {
      const result = await fetchBasketProducts(requested);
      assert.equal(result.degradedDemo, true);
      assert.deepEqual(result.items.map(({ ean: code }) => code), requested);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("fails closed for mixed and non-demo successful provenance", async () => {
    const originalFetch = globalThis.fetch;
    const requested = Array.from({ length: 25 }, (_, index) => ean(index));
    try {
      for (const provenance of ["mixed", "database"] as const) {
        let calls = 0;
        globalThis.fetch = async (_url, init) => {
          const chunk = (JSON.parse(String(init?.body)) as { eans: string[] }).eans;
          calls += 1;
          return Response.json(provenance === "mixed" && calls === 1
            ? demoEnvelope(chunk.map(product)) : envelope(chunk.map(product)));
        };
        const result = await fetchBasketProducts(requested);
        assert.equal(result.degradedDemo, false);
        assert.deepEqual(result.items.map(({ ean: code }) => code), requested);
      }
    } finally { globalThis.fetch = originalFetch; }
  });

  it("fails closed for malformed successful envelopes", () => {
    const valid = envelope([product(ean(1))]);
    const invalid = [
      { ...valid, dataSource: "cache" }, { ...valid, degraded: true },
      { ...valid, dataSource: "demo" }, { ...valid, dataSource: "demo", degraded: false },
      { ...valid, latestCheckedAt: "yesterday" }, { ...valid, extra: true },
      { ...valid, items: null }, { ...valid, missing: null },
      { ...valid, items: [{ ...product(ean(1)), name: null }] },
      { ...valid, items: [{ ...product(ean(1)), minPrice: "1" }] },
      { ...valid, items: [{ ...product(ean(1)), priceEntries: [{ supermarket: { id: 1, name: "S", slug: "s", logoUrl: null }, price: 1, isAvailable: true, productUrl: null, freshnessStatus: "bad" }] }] },
      { ...valid, items: [{ ...product(ean(1)), priceEntries: [{ supermarket: { id: "1", name: "S", slug: "s", logoUrl: null }, price: 1, isAvailable: true, productUrl: null, freshnessStatus: "fresh" }] }] },
    ];
    invalid.forEach((value) => assert.equal(basketProductsResponseSchema.safeParse(value).success, false));
    assert.equal(basketProductsResponseSchema.safeParse({ ...valid, latestCheckedAt: "2026-08-13T12:00:00.000Z" }).success, true);
  });

  it("rejects invalid EAN correspondence", async () => {
    const requested = [ean(1), ean(2)];
    const variants = [
      envelope([product(ean(9))], requested),
      envelope([product(ean(1)), product(ean(1))], [ean(2)]),
      envelope([product(ean(1))], [ean(1), ean(2)]),
      envelope([product(ean(1))]),
      envelope([product(ean(1))], [ean(2), ean(9)]),
    ];
    const originalFetch = globalThis.fetch;
    try {
      for (const value of variants) {
        globalThis.fetch = async () => Response.json(value);
        await assert.rejects(fetchBasketProducts(requested), { message: "No se pudo cargar la canasta." });
      }
    } finally { globalThis.fetch = originalFetch; }
  });

  it("preserves an earlier chunk when a later chunk is malformed", async () => {
    const originalFetch = globalThis.fetch;
    const requested = Array.from({ length: 25 }, (_, index) => ean(index));
    let calls = 0;
    globalThis.fetch = async (_url, init) => ++calls === 1
      ? Response.json(envelope((JSON.parse(String(init?.body)) as { eans: string[] }).eans.map(product)))
      : Response.json({ ...envelope([], [requested[24]]), degraded: true });
    try {
      const result = await fetchBasketProducts(requested);
      assert.deepEqual(result.items.map(({ ean: code }) => code), requested.slice(0, 24));
      assert.deepEqual(result.missing, [requested[24]]);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("chunks sequentially, forwards request details, and aggregates stable partial results", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Parameters<typeof fetch>[] = [];
    const controller = new AbortController();
    const requested = Array.from({ length: 26 }, (_, index) => ean(index));
    globalThis.fetch = async (...args) => {
      calls.push(args);
      const body = JSON.parse(String(args[1]?.body)) as { eans: string[] };
      if (calls.length === 1) return new Response("down", { status: 503 });
      return Response.json(envelope(body.eans.slice().reverse().map(product)));
    };
    try {
      const result = await fetchBasketProducts(requested, controller.signal);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls.map((call) => JSON.parse(String(call[1]?.body)).eans), [requested.slice(0, 24), requested.slice(24)]);
      assert.ok(calls.every((call) => call[0] === "/api/products/batch" && call[1]?.method === "POST" &&
        call[1]?.headers && (call[1].headers as Record<string, string>)["content-type"] === "application/json" && call[1]?.signal === controller.signal));
      assert.deepEqual(result.items.map(({ ean: code }) => code), requested.slice(24));
      assert.deepEqual(result.missing, requested.slice(0, 24));
    } finally { globalThis.fetch = originalFetch; }
  });

  it("propagates abort while a later chunk is pending and starts no further chunk", async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    const requested = Array.from({ length: 49 }, (_, index) => ean(index));
    let calls = 0;
    let releaseSecond!: () => void;
    const secondStarted = new Promise<void>((resolve) => { releaseSecond = resolve; });
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      assert.equal(init?.signal, controller.signal);
      const body = JSON.parse(String(init?.body)) as { eans: string[] };
      if (calls === 1) return Response.json(envelope(body.eans.map(product)));
      releaseSecond();
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")), { once: true }));
    };
    try {
      const load = fetchBasketProducts(requested, controller.signal);
      await secondStarted;
      controller.abort();
      await assert.rejects(load, { name: "AbortError" });
      assert.equal(calls, 2);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("uses one call for <=24 and treats malformed 200 responses as unavailable", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return Response.json({ items: [{ ean: ean(1) }], missing: [] }); };
    try {
      await assert.rejects(fetchBasketProducts([ean(1), ean(2)]), { message: "No se pudo cargar la canasta." });
      assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; }
  });
});
