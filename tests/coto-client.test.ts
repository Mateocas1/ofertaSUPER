import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cotoGroupIdFromNumber,
  cotoNumberFromGroupId,
  fetchCotoCategoryTree,
  fetchCotoProducts,
  lookupCotoByEan,
  normalizeCotoResult,
  parseCotoPromotion,
} from "../src/lib/coto/client";

// Shapes read live from Coto's Constructor.io search on 2026-10-04.
function result(ean: number, overrides: Record<string, unknown> = {}) {
  return {
    value: `Producto ${ean}`,
    data: {
      id: `prod${ean}`,
      url: `_/R-0000${ean}-200`,
      sku_id: `sku${ean}`,
      product_main_ean: ean,
      sku_display_name: "Puré De Tomate Arcor 520g",
      product_brand: "ARCOR",
      product_format: "Kilo",
      product_weighable: 0,
      product_large_image_url: "https://static.cotodigital3.com.ar/x.jpg",
      store_availability: ["200", "204"],
      price: [
        { store: "200", listPrice: 1220, formatPrice: 2346.15 },
        { store: "710", listPrice: 1500, formatPrice: 2884.62 },
      ],
      discounts: [{ discountText: "25%Dto", discountPrice: "$915.00", regularPriceText: "Precio Contado: $1220" }],
      groups: [{ group_id: "catv00002808", path_list: [{ id: "categoria", display_name: "Categorias" }, { id: "catv00001254", display_name: "Almacén" }] }],
      ...overrides,
    },
  };
}

function client(...responses: unknown[]) {
  const urls: string[] = [];
  return {
    urls,
    dependencies: {
      http: { get: async (url: string) => { urls.push(url); const next = responses.shift(); if (next instanceof Error) throw next; if (!next) throw new Error("unexpected request"); return { data: next }; } },
      sleep: async () => undefined,
    },
  };
}

function ean13(sequence: number): number {
  const body = String(779000000000 + sequence);
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return Number(`${body}${(10 - (sum % 10)) % 10}`);
}

const page = (from: number, size: number) => ({ response: { results: Array.from({ length: size }, (_, index) => result(ean13(from + index))) } });

describe("Coto normalization", () => {
  it("maps the branch-200 shelf price, unit price, promo, category and product URL", () => {
    const normalized = normalizeCotoResult(result(7790070318404));
    assert.ok(normalized);
    assert.equal(normalized.product.ean, "07790070318404");
    assert.equal(normalized.product.price, 1220);
    assert.equal(normalized.product.referencePrice, 2346.15);
    assert.equal(normalized.product.referenceUnit, "Kilo");
    assert.equal(normalized.product.isAvailable, true);
    assert.equal(normalized.product.sellerId, "200");
    assert.match(normalized.product.productUrl ?? "", /^https:\/\/www\.coto\.com\.ar\/productos\/pure-de-tomate-arcor-520g\/_\/R-/);
    assert.deepEqual(normalized.promo, { type: "percent-off", percent: 25, maxUnits: null, label: "25% OFF" });
  });

  it("prices another branch when asked, and marks a product the branch does not sell as unavailable", () => {
    assert.equal(normalizeCotoResult(result(7790070318404, { store_availability: ["200", "710"] }), "710")?.product.price, 1500);
    const absent = normalizeCotoResult(result(7790070318404, { store_availability: ["204"] }));
    assert.equal(absent?.product.isAvailable, false);
    assert.equal(absent?.product.price, null);
    assert.equal(absent?.promo, null);
  });

  it("skips weighable products and invalid EANs", () => {
    assert.equal(normalizeCotoResult(result(7790070318404, { product_weighable: 1 })), null);
    assert.equal(normalizeCotoResult(result(1234)), null);
    assert.equal(normalizeCotoResult({}), null);
  });

  it("parses Coto and shared promotion labels, rejecting card promotions", () => {
    assert.equal(parseCotoPromotion("35%Dto")?.percent, 35);
    assert.equal(parseCotoPromotion("2do al 70%")?.type, "nth-unit");
    assert.equal(parseCotoPromotion("Tarjeta Coto 20%"), null);
    assert.equal(parseCotoPromotion(null), null);
  });

  it("converts Coto group ids to numeric category ids and back", () => {
    assert.equal(cotoNumberFromGroupId("catv00002808"), 2808);
    assert.equal(cotoGroupIdFromNumber(2808), "catv00002808");
    assert.equal(cotoNumberFromGroupId("categoria"), null);
  });
});

describe("Coto search client", () => {
  it("browses a group in pages of 200, filtered to the branch, until the limit", async () => {
    const { urls, dependencies } = client(page(0, 200), page(200, 50));
    const products = await fetchCotoProducts({ search: { kind: "group", groupId: "catv00002808" }, limit: 250, dependencies });

    assert.equal(products.length, 250);
    assert.equal(products.promoByEan?.size, 250);
    const first = new URL(urls[0]!);
    assert.equal(first.pathname, "/browse/group_id/catv00002808");
    assert.equal(first.searchParams.get("num_results_per_page"), "200");
    assert.deepEqual(JSON.parse(first.searchParams.get("pre_filter_expression")!), { name: "store_availability", value: "200" });
    assert.equal(new URL(urls[1]!).searchParams.get("num_results_per_page"), "50");
  });

  it("stops at a short page and keeps the read pages when a later page fails", async () => {
    const short = client(page(0, 30));
    assert.equal((await fetchCotoProducts({ search: { kind: "text", value: "yerba" }, limit: 200, dependencies: short.dependencies })).length, 30);
    assert.equal(short.urls.length, 1);

    const failing = client(page(0, 200), new Error("network"), new Error("network"), new Error("network"));
    const partial = await fetchCotoProducts({ search: { kind: "text", value: "yerba" }, limit: 400, dependencies: failing.dependencies });
    assert.equal(partial.length, 200);
    assert.equal(partial.pagesFailed, 1);
  });

  it("raises when the first page fails", async () => {
    const failing = client(new Error("a"), new Error("b"), new Error("c"));
    await assert.rejects(fetchCotoProducts({ search: { kind: "text", value: "yerba" }, limit: 50, dependencies: failing.dependencies }));
  });

  it("looks a product up by EAN and only accepts an exact GTIN match", async () => {
    const found = await lookupCotoByEan("07790070318404", client({ response: { results: [result(7790070318411), result(7790070318404)] } }).dependencies);
    assert.equal(found?.product.ean, "07790070318404");
    const missing = await lookupCotoByEan("07790070318404", client({ response: { results: [result(7790070318411)] } }).dependencies);
    assert.equal(missing, null);
  });

  it("builds the category tree from the root groups and each department's subgroups", async () => {
    const { dependencies } = client(
      { response: { groups: [{ group_id: "categoria", children: [{ group_id: "catv00001254", display_name: "Almacén" }, { group_id: "bogus", display_name: "x" }] }] } },
      { response: { groups: [{ group_id: "catv00001254", children: [{ group_id: "catv00002808", display_name: "Salsas y Puré de Tomate" }] }] } },
    );
    assert.deepEqual(await fetchCotoCategoryTree(dependencies), [
      { id: 1254, name: "Almacén", hasChildren: true, children: [{ id: 2808, name: "Salsas y Puré de Tomate", hasChildren: false, children: [] }] },
    ]);
  });
});
