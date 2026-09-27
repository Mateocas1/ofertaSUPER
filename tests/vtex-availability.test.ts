import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeProduct } from "../src/lib/vtex/normalize";

// The source does not always say whether an offer can be bought. Assuming it
// can makes an unobserved offer shippable, so an absent signal has to leave
// the offer not eligible for comparison and for the basket.
function productWithOffer(commertialOffer: Record<string, unknown>) {
  return {
    productId: "1",
    productName: "Leche entera 1L",
    linkText: "leche-entera-1l",
    items: [
      {
        itemId: "1",
        ean: "7790895000010",
        measurementUnit: "un",
        sellers: [{ sellerId: "1", commertialOffer }],
      },
    ],
  };
}

describe("vtex availability normalization", () => {
  it("treats an offer with no availability signal as not available", () => {
    const product = normalizeProduct(productWithOffer({ Price: 1000, ListPrice: 1200 }), "https://example.test");

    assert.ok(product, "the fixture must normalize");
    assert.equal(product.isAvailable, false);
  });

  it("keeps an explicit false as false", () => {
    const product = normalizeProduct(
      productWithOffer({ Price: 1000, ListPrice: 1200, IsAvailable: false }),
      "https://example.test",
    );

    assert.ok(product);
    assert.equal(product.isAvailable, false);
  });

  it("keeps an explicit true as true", () => {
    const product = normalizeProduct(
      productWithOffer({ Price: 1000, ListPrice: 1200, IsAvailable: true }),
      "https://example.test",
    );

    assert.ok(product);
    assert.equal(product.isAvailable, true);
  });

  it("treats zero available quantity as not available", () => {
    const product = normalizeProduct(
      productWithOffer({ Price: 1000, ListPrice: 1200, AvailableQuantity: 0 }),
      "https://example.test",
    );

    assert.ok(product);
    assert.equal(product.isAvailable, false);
  });

  it("treats positive available quantity as available", () => {
    const product = normalizeProduct(
      productWithOffer({ Price: 1000, ListPrice: 1200, AvailableQuantity: 7 }),
      "https://example.test",
    );

    assert.ok(product);
    assert.equal(product.isAvailable, true);
  });
});
