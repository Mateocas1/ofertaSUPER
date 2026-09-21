import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";

import {
  calculatePromotionalUnitPrice,
  detectAutomaticDiscount,
  getBestPromotionPrice,
} from "../src/lib/promotions/detect";
import { withFallback } from "../src/lib/safe-data";
import { searchQuerySchema } from "../src/lib/schemas/search";
import {
  fetchVtexDirectProducts,
  fetchVtexProducts,
  normalizeVtexCatalogPayload,
} from "../src/lib/vtex/client";
import {
	buildVtexCatalogSearchRequest,
	buildVtexRequest,
} from "../src/lib/vtex/encode";
import { normalizeProduct } from "../src/lib/vtex/normalize";
import {
	getCachedJsonWithClient,
	setCachedJsonWithClient,
} from "../src/lib/redis";
import { limitRequestOrFallback } from "../src/lib/rate-limit";

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function vtexProduct(id: string) {
	return {
		productName: `Product ${id}`,
		items: [
			{
				itemId: id,
				referenceId: [{ Value: "7790000000003" }],
			},
		],
	};
}

describe("VTEX request builder", () => {
	it("builds direct catalog lookup URLs without productSuggestions or persisted hash", () => {
		const sku = buildVtexCatalogSearchRequest({
			kind: "sku-id",
			value: "12345",
		});
		const ean = buildVtexCatalogSearchRequest({
			kind: "ean",
			value: "7790001000011",
		});

		assert.equal(sku.pathname, "/api/catalog_system/pub/products/search");
		assert.equal(sku.search, "fq=skuId:12345");
		assert.equal(ean.search, "fq=alternateIds_Ean:7790001000011");
		assert.doesNotMatch(
			`${sku.pathname}?${sku.search}`,
			/productSuggestions|extensions|sha256Hash|_v\/segment\/graphql/,
		);
		assert.doesNotMatch(
			`${ean.pathname}?${ean.search}`,
			/productSuggestions|extensions|sha256Hash|_v\/segment\/graphql/,
		);
	});

	it("normalizes direct catalog search payloads", () => {
		const products = normalizeVtexCatalogPayload(
			[
				{
					productName: "Leche Directa 1L",
					brand: "Directa",
					linkText: "leche-directa-1l",
					categories: ["/Almacen/Lacteos/"],
					items: [
						{
							itemId: "sku-direct",
							referenceId: [{ Value: "7790000000003" }],
							sellers: [
								{
									sellerId: "1",
									commertialOffer: {
										Price: 900,
										ListPrice: 1000,
										AvailableQuantity: 4,
									},
								},
							],
						},
					],
				},
			],
			"https://www.carrefour.com.ar",
		);

		assert.equal(products.length, 1);
		assert.equal(products[0].ean, "7790000000003");
		assert.equal(products[0].skuId, "sku-direct");
		assert.equal(
			products[0].productUrl,
			"https://www.carrefour.com.ar/leche-directa-1l/p",
		);
		assert.equal(products[0].price, 900);
	});

	it("preserves multiple direct catalog products so ambiguity is visible", () => {
		const payload = ["sku-a", "sku-b"].map((skuId) => ({
			productName: `Producto ${skuId}`,
			linkText: skuId,
			items: [
				{
					itemId: skuId,
					referenceId: [{ Value: "7790000000003" }],
					sellers: [
						{
							sellerId: "1",
							commertialOffer: {
								Price: 900,
								ListPrice: 900,
								AvailableQuantity: 1,
							},
						},
					],
				},
			],
		}));

		const products = normalizeVtexCatalogPayload(
			payload,
			"https://www.carrefour.com.ar",
		);

		assert.equal(products.length, 2);
		assert.deepEqual(
			products.map((product) => product.skuId),
			["sku-a", "sku-b"],
		);
	});

  it("keeps the SHA256 persisted query server-side and encodes productSuggestions variables", () => {
		const hash =
			"3eca26a431d4646a8bbce2644b78d3ca734bf8b4ba46afe4269621b64b0fb67d";
    const request = buildVtexRequest("leche", hash, 12);
    const params = new URLSearchParams(request.search);
    const extensions = JSON.parse(params.get("extensions") ?? "{}") as {
      persistedQuery?: {
        sha256Hash?: string;
      };
      variables?: string;
    };
		const variables = JSON.parse(
			Buffer.from(extensions.variables ?? "", "base64").toString("utf8"),
		) as {
      fullText?: string;
      count?: number;
      productOriginVtex?: boolean;
    };

    assert.equal(request.pathname, "/_v/segment/graphql/v1");
    assert.equal(params.get("operationName"), "productSuggestions");
    assert.equal(params.get("locale"), "es-AR");
    assert.equal(extensions.persistedQuery?.sha256Hash, hash);
    assert.equal(variables.fullText, "leche");
    assert.equal(variables.count, 12);
    assert.equal(variables.productOriginVtex, true);
  });
});

describe("VTEX persisted-query term-search fallback", () => {
  const baseUrl = "https://www.example.com";
  const hashInvalidPayload = JSON.stringify({
    errors: [{ message: "PersistedQueryNotFound" }],
  });
  const catalogProduct = (ean: string, skuId = "sku-1") => ({
    productName: "Leche entera",
    linkText: "leche-entera",
    items: [{
      itemId: skuId,
      referenceId: [{ Value: ean }],
      sellers: [{ sellerId: "1", commertialOffer: { Price: 1000, ListPrice: 1000, AvailableQuantity: 1 } }],
    }],
  });
  const client = (...responses: Array<{ data: string; headers?: Record<string, string> } | Error>) => {
    const urls: string[] = [];
    return {
      urls,
      http: {
        get: async (url: string) => {
          urls.push(url);
          const response = responses.shift();
          if (response instanceof Error) throw response;
          if (!response) throw new Error("Unexpected request");
          return { data: response.data, headers: response.headers ?? { "content-type": "application/json" } };
        },
      },
      sleep: async () => undefined,
    };
  };

  it("uses one encoded catalog term fallback after the first hash-invalid persisted request, dedupes EANs, and marks metadata", async () => {
    const dependency = client(
      { data: hashInvalidPayload },
      { data: JSON.stringify([catalogProduct("7790000000003"), catalogProduct("7790000000003", "sku-2")]) },
    );

    const products = await fetchVtexProducts({
      baseUrl,
      query: "leche & crema",
      hash: "hash",
      count: 2,
      retries: 3,
      dependencies: dependency,
    });

    assert.equal(dependency.urls.length, 2);
    assert.match(dependency.urls[0], /\/_v\/segment\/graphql\/v1\?/);
    assert.equal(dependency.urls[1], "https://www.example.com/api/catalog_system/pub/products/search?ft=leche+%26+crema&_from=0&_to=1");
    assert.deepEqual(products.map((product) => product.ean), ["7790000000003"]);
    assert.equal(products.fallbackUsed, true);
  });

  it("does not fall back for blocked, timeout, network, unknown, or malformed persisted responses and preserves retry counts", async () => {
    const cases: Array<[string, Error | { data: string; headers?: Record<string, string> }, number]> = [
      ["blocked", Object.assign(new Error("blocked"), { isAxiosError: true, response: { status: 403, data: "denied" } }), 3],
      ["timeout", Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" }), 3],
      ["network", Object.assign(new Error("network"), { isAxiosError: true }), 3],
      ["unknown", new Error("unknown"), 3],
      ["malformed", { data: "not json" }, 3],
    ];

    for (const [name, failure, expectedRequests] of cases) {
      const dependency = client(failure, failure, failure);
      await assert.rejects(
        fetchVtexProducts({ baseUrl, query: "leche", hash: "hash", retries: 3, dependencies: dependency }),
        isError,
        name,
      );
      assert.equal(dependency.urls.length, expectedRequests, name);
      assert.ok(dependency.urls.every((url) => url.includes("/_v/segment/graphql/v1")), name);
    }
  });

  it("does not request either path when the hash is missing", async () => {
    const dependency = client();
    await assert.rejects(fetchVtexProducts({ baseUrl, query: "leche", hash: "", dependencies: dependency }));
    assert.equal(dependency.urls.length, 0);
  });

  it("caps fallback catalog bounds at the established count limit", async () => {
    const dependency = client({ data: hashInvalidPayload }, { data: "[]" });
    await fetchVtexProducts({ baseUrl, query: "leche", hash: "hash", count: 51, dependencies: dependency });
    assert.match(dependency.urls[1], /[?&]_to=49$/);
  });

  it("normalizes invalid and fractional fallback counts to integer catalog bounds", async () => {
    const cases: Array<[string, number, string]> = [
      ["zero", 0, "0"],
      ["negative", -3, "0"],
      ["non-finite", Number.POSITIVE_INFINITY, "49"],
      ["fractional", 2.7, "1"],
    ];

    for (const [name, count, expectedTo] of cases) {
      const dependency = client({ data: hashInvalidPayload }, { data: "[]" });
      await fetchVtexProducts({
        baseUrl,
        query: "leche",
        hash: "hash",
        count,
        dependencies: dependency,
      });
      assert.match(dependency.urls[1], new RegExp(`[?&]_to=${expectedTo}$`), name);
    }
  });

  it("makes one fallback attempt when its payload is malformed", async () => {
    const dependency = client({ data: hashInvalidPayload }, { data: "not json" });
    await assert.rejects(fetchVtexProducts({ baseUrl, query: "leche", hash: "hash", retries: 3, dependencies: dependency }));
    assert.equal(dependency.urls.length, 2);
    assert.match(dependency.urls[1], /\/api\/catalog_system\/pub\/products\/search\?ft=leche&_from=0&_to=49$/);
  });

  it("keeps direct EAN/SKU requests on their established catalog URLs and never exposes fallback metadata", async () => {
    const dependency = client(
      { data: JSON.stringify([catalogProduct("7790000000003")]) },
      { data: JSON.stringify([catalogProduct("7790000000003")]) },
    );
    const eanProducts = await fetchVtexDirectProducts({
      baseUrl,
      lookup: { kind: "ean", value: "7790000000003" },
      dependencies: dependency,
    });
    const skuProducts = await fetchVtexDirectProducts({
      baseUrl,
      lookup: { kind: "sku-id", value: "sku-1" },
      dependencies: dependency,
    });

    assert.deepEqual(dependency.urls, [
      "https://www.example.com/api/catalog_system/pub/products/search?fq=alternateIds_Ean:7790000000003",
      "https://www.example.com/api/catalog_system/pub/products/search?fq=skuId:sku-1",
    ]);
    assert.equal(eanProducts.fallbackUsed, undefined);
    assert.equal(skuProducts.fallbackUsed, undefined);
  });
});

describe("VTEX payload traversal", () => {
	const baseUrl = "https://www.example.com";

	it("preserves breadth-first extraction order across nested arrays and objects", () => {
		const products = normalizeVtexCatalogPayload(
			{
				first: [vtexProduct("1"), { nested: vtexProduct("3") }],
				second: vtexProduct("2"),
			},
			baseUrl,
		);

		assert.deepEqual(
			products.map((product) => product.skuId),
			["2", "1", "3"],
		);
	});

	it("discovers valid records behind non-record wrapper objects", () => {
		const products = normalizeVtexCatalogPayload(
			{ data: { search: { results: [{ node: vtexProduct("4") }] } } },
			baseUrl,
		);

		assert.deepEqual(products.map((product) => product.skuId), ["4"]);
	});

	it("ignores malformed records, primitives, and null while preserving duplicates", () => {
		const duplicate = vtexProduct("5");
		const products = normalizeVtexCatalogPayload(
			[
				null,
				false,
				"text",
				42,
				{ productName: "Missing items and EAN" },
				{ items: [{ itemId: "missing-ean" }] },
				duplicate,
				duplicate,
			],
			baseUrl,
		);

		assert.deepEqual(products.map((product) => product.skuId), ["5", "5"]);
	});

	it("extracts a deterministic wide and deep payload in breadth-first order", () => {
		const width = 200;
		const roots = Array.from({ length: width }, (_, index) => ({
			product: vtexProduct(String(index + 1)),
			child: { product: vtexProduct(String(width + index + 1)) },
		}));

		const products = normalizeVtexCatalogPayload({ roots }, baseUrl);
		const expected = [
			...Array.from({ length: width }, (_, index) => String(index + 1)),
			...Array.from({ length: width }, (_, index) => String(width + index + 1)),
		];

		assert.equal(products.length, width * 2);
		assert.deepEqual(products.map((product) => product.skuId), expected);
	});
});

describe("safe data fallback", () => {
  it("returns fallback data when a runtime dependency is unavailable", async () => {
		const value = await withFallback(
			Promise.reject(new Error("database unavailable")),
			{
      items: [],
      total: 0,
			},
		);

    assert.deepEqual(value, { items: [], total: 0 });
  });

  it("fails open when Redis cache reads or writes are unavailable", async () => {
    const failingClient = {
      get: async () => {
        throw new Error("redis unavailable");
      },
      set: async () => {
        throw new Error("redis unavailable");
      },
    };

		await assert.doesNotReject(() =>
			setCachedJsonWithClient(failingClient, "key", { ok: true }, 60),
		);
    assert.equal(await getCachedJsonWithClient(failingClient, "key"), null);
  });

  it("fails open when the rate-limit backend is unavailable", async () => {
		const state = await limitRequestOrFallback(
			{
      limit: async () => {
        throw new Error("rate limit backend unavailable");
      },
			},
			"product-detail:unknown",
		);

    assert.equal(state.success, true);
    assert.equal(state.limit, 60);
    assert.equal(state.remaining, 60);
  });
});

describe("promotion calculations", () => {
  it("detects automatic discounts from list price differences", () => {
    assert.deepEqual(detectAutomaticDiscount(800, 1000), {
      percentOff: 20,
      amountOff: 200,
    });
    assert.equal(detectAutomaticDiscount(1000, 800), null);
  });

  it("calculates common promotion unit prices and picks the best one", () => {
		assert.equal(
			calculatePromotionalUnitPrice(1000, { type: "2x1", discountValue: null }),
			500,
		);
		assert.equal(
			calculatePromotionalUnitPrice(1000, {
				type: "2nd_50",
				discountValue: null,
			}),
			750,
		);
		assert.equal(
			calculatePromotionalUnitPrice(1000, {
				type: "wallet_discount",
				discountValue: 30,
			}),
			700,
		);
		assert.equal(
			calculatePromotionalUnitPrice(1000, {
				type: "percentage",
				discountValue: 120,
			}),
			null,
		);

    const best = getBestPromotionPrice(1000, [
      { type: "2nd_50", discountValue: null, name: "second" },
      { type: "percentage", discountValue: 40, name: "percent" },
    ]);

    assert.equal(best?.finalPrice, 600);
    assert.equal(best?.promotion.name, "percent");
  });
});

describe("search query schema", () => {
  it("trims query text and bounds public search limits", () => {
    assert.deepEqual(searchQuerySchema.parse({ q: "  leche  ", limit: "12" }), {
      q: "leche",
      limit: 12,
    });
    assert.throws(() => searchQuerySchema.parse({ q: "x", limit: "999" }));
  });
});

describe("VTEX product normalizer", () => {
  it("extracts EAN, prices and product URL from a VTEX-like payload", () => {
    const product = normalizeProduct(
      {
        productName: "Leche Entera 1L",
        brand: "La Serenisima",
        linkText: "leche-entera-1l",
        categories: ["/Almacen/Lacteos/Leches/"],
        items: [
          {
            itemId: "sku-1",
            referenceId: [{ Value: "7790000000003" }],
            images: [{ imageUrl: "/arquivos/leche.jpg" }],
            sellers: [
              {
                sellerId: "1",
                commertialOffer: {
                  Price: 1200,
                  ListPrice: 1500,
                  AvailableQuantity: 8,
                },
              },
            ],
          },
        ],
      },
      "https://www.disco.com.ar",
    );

    assert.equal(product?.ean, "7790000000003");
    assert.equal(product?.name, "Leche Entera 1L");
    assert.equal(product?.brand, "La Serenisima");
    assert.equal(product?.price, 1200);
    assert.equal(product?.listPrice, 1500);
    assert.equal(product?.isAvailable, true);
		assert.equal(
			product?.productUrl,
			"https://www.disco.com.ar/leche-entera-1l/p",
		);
		assert.deepEqual(product?.images, [
			"https://www.disco.com.ar/arquivos/leche.jpg",
		]);
  });

  it("normalizes ASCII spaces and hyphens in valid GTIN references", () => {
    const product = normalizeProduct(
      {
        productName: "Leche con GTIN formateado",
        items: [{ referenceId: [{ Value: "779 000-000 0003" }] }],
      },
      "https://www.disco.com.ar",
    );

    assert.equal(product?.ean, "7790000000003");
  });

  it("rejects products without a valid checksummed EAN", () => {
    for (const value of ["ABC", "7790001000012"]) {
      const product = normalizeProduct(
        {
          productName: "Producto sin EAN",
          items: [{ referenceId: [{ Value: value }] }],
        },
        "https://www.disco.com.ar",
      );

      assert.equal(product, null);
    }
  });
});
