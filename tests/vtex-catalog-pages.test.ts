import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildVtexCatalogPageRequest, fetchVtexCatalogPages } from "../src/lib/vtex/client";

const baseUrl = "https://www.example.com";

function ean13(sequence: number): string {
  const body = String(779000000000 + sequence);
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

const product = (sequence: number, teaser?: string) => ({
  productName: `Producto ${sequence}`,
  linkText: `producto-${sequence}`,
  items: [{
    itemId: `sku-${sequence}`,
    ean: ean13(sequence),
    referenceId: [{ Value: ean13(sequence) }],
    sellers: [{ sellerId: "1", commertialOffer: { Price: 1000, ListPrice: 1000, AvailableQuantity: 1, PromotionTeasers: teaser ? [{ Name: teaser }] : [] } }],
  }],
});

const page = (from: number, size: number) => Array.from({ length: size }, (_, index) => product(from + index));

function client(...responses: Array<unknown[] | Error>) {
  const urls: string[] = [];
  return {
    urls,
    dependencies: {
      http: {
        get: async (url: string) => {
          urls.push(url);
          const response = responses.shift();
          if (response instanceof Error) throw response;
          if (!response) throw new Error("Unexpected request");
          return { data: JSON.stringify(response), headers: { "content-type": "application/json" } };
        },
      },
      sleep: async () => undefined,
    },
  };
}

describe("paged VTEX catalog search", () => {
  it("builds text and category page requests (spaces percent-encoded, never +)", () => {
    assert.equal(buildVtexCatalogPageRequest({ kind: "text", value: "carne de cerdo" }, 50, 99).search, "ft=carne%20de%20cerdo&_from=50&_to=99");
    const category = buildVtexCatalogPageRequest({ kind: "category", path: "/12/345/" }, 0, 49);
    assert.equal(category.pathname, "/api/catalog_system/pub/products/search");
    assert.equal(category.search, "fq=C:/12/345/&_from=0&_to=49");
  });

  it("reads pages of 50 until the limit", async () => {
    const { urls, dependencies } = client(page(0, 50), page(50, 50), page(100, 50), page(150, 50));
    const products = await fetchVtexCatalogPages({ baseUrl, search: { kind: "category", path: "/1/2/" }, limit: 200, dependencies });

    assert.equal(products.length, 200);
    assert.equal(products.pagesRead, 4);
    assert.deepEqual(urls.map((url) => new URL(url).searchParams.get("_from")), ["0", "50", "100", "150"]);
  });

  it("stops at a short page, and bounds the last page by the limit", async () => {
    const short = client(page(0, 50), page(50, 12));
    const exhausted = await fetchVtexCatalogPages({ baseUrl, search: { kind: "text", value: "yerba" }, limit: 200, dependencies: short.dependencies });
    assert.equal(exhausted.length, 62);
    assert.equal(short.urls.length, 2);

    const bounded = client(page(0, 50), page(50, 20));
    const capped = await fetchVtexCatalogPages({ baseUrl, search: { kind: "text", value: "yerba" }, limit: 70, dependencies: bounded.dependencies });
    assert.equal(capped.length, 70);
    assert.match(bounded.urls[1]!, /_from=50&_to=69$/);
  });

  it("reads the promotion teasers from the same payload", async () => {
    const { dependencies } = client([product(1, "2do al 50%"), product(2)]);
    const products = await fetchVtexCatalogPages({ baseUrl, search: { kind: "text", value: "galletitas" }, limit: 200, dependencies });

    assert.equal(products.promoByEan?.size, 2);
    assert.notEqual(products.promoByEan?.get(products[0]!.ean), null);
    assert.equal(products.promoByEan?.get(products[1]!.ean), null);
  });

  it("raises when the first page fails, keeps the read pages when a later one fails", async () => {
    const failure = () => Object.assign(new Error("network"), { isAxiosError: true });
    await assert.rejects(fetchVtexCatalogPages({ baseUrl, search: { kind: "text", value: "x" }, limit: 100, retries: 2, dependencies: client(failure(), failure()).dependencies }));

    const partial = await fetchVtexCatalogPages({ baseUrl, search: { kind: "text", value: "x" }, limit: 100, retries: 2, dependencies: client(page(0, 50), failure(), failure()).dependencies });
    assert.equal(partial.length, 50);
    assert.equal(partial.pagesFailed, 1);
  });
});
