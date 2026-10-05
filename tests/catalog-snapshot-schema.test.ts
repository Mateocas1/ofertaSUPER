import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  parseCatalogSnapshot,
  probeCatalogSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotUnavailableError,
} from "../src/lib/catalog-snapshot";
import { REFRESH_SOURCES } from "../src/lib/refresh-sources";
import { loadSnapshotFixture } from "./helpers/snapshot-fixture";

// The snapshot is committed to the repo and served by the deployment, so its
// objects must not leak internal fields. This is a data contract on the JSON
// itself, not a grep of source code.
const snapshot = JSON.parse(readFileSync("data/catalog-snapshot.json", "utf8")) as {
  schemaVersion: number;
  generatedAt: string;
  sources: string[];
  products: Record<string, unknown>[];
  offers: { ean: string; source: string; promo: unknown; history: Record<string, unknown>[] }[];
};

const PRODUCT_KEYS = ["ean", "name", "brand", "imageUrl", "category", "categorySlug"].sort();
const OFFER_KEYS = ["ean", "source", "price", "listPrice", "promo", "available", "productUrl", "observedAt", "history"].sort();
const HISTORY_KEYS = ["price", "listPrice", "observedAt"].sort();
const PROMO_KEYS = ["type", "percent", "nth", "maxUnits", "label"].sort();
// SimplePromotion: "nth" belongs to the nth-unit shape only ("2do al 70%");
// a percent-off promotion ("25% OFF") carries no unit position.
const PERCENT_OFF_KEYS = PROMO_KEYS.filter((key) => key !== "nth");

describe("catalog snapshot data contract", () => {
  it("exposes only the allowed keys on every product", () => {
    assert.ok(snapshot.products.length > 0);
    for (const product of snapshot.products) {
      assert.deepEqual(Object.keys(product).sort(), PRODUCT_KEYS, `product ${product.ean} leaked keys`);
    }
  });

  it("exposes only the allowed keys on every offer and history point", () => {
    assert.ok(snapshot.offers.length > 0);
    for (const offer of snapshot.offers) {
      assert.deepEqual(Object.keys(offer).sort(), OFFER_KEYS, `offer ${offer.ean}/${offer.source} leaked keys`);
      for (const point of offer.history) {
        assert.deepEqual(Object.keys(point).sort(), HISTORY_KEYS, `history point leaked keys on ${offer.ean}`);
      }
    }
  });

  it("keeps every captured promotion within the allowed shape", () => {
    for (const offer of snapshot.offers) {
      if (offer.promo === null) continue;
      const promo = offer.promo as { type: string; percent: number; label: string };
      const expectedKeys = promo.type === "percent-off" ? PERCENT_OFF_KEYS : PROMO_KEYS;
      assert.deepEqual(Object.keys(promo).sort(), expectedKeys, `promo leaked keys on ${offer.ean}`);
      assert.ok(["nth-unit", "percent-off"].includes(promo.type), `promo type invalid on ${offer.ean}`);
      assert.ok(promo.percent > 0 && promo.percent <= 99, `promo percent out of range on ${offer.ean}`);
      assert.ok(promo.label.length > 0, `promo label empty on ${offer.ean}`);
    }
  });

  it("keeps top-level metadata honest", () => {
    assert.equal(snapshot.schemaVersion, 2);
    assert.ok(!Number.isNaN(Date.parse(snapshot.generatedAt)));
    assert.deepEqual(snapshot.sources, [...REFRESH_SOURCES]);
  });
});

// The daily cloud refresh rewrites this file without running the test suite, so
// the load assertions below are schema-only: they prove the committed snapshot
// parses and is internally consistent, never that it holds specific values.
describe("snapshot schema-only load", () => {
  it("loads the committed snapshot through the schema gate and the health probe", () => {
    const parsed = parseCatalogSnapshot(snapshot);
    assert.equal(parsed.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    assert.deepEqual(probeCatalogSnapshot(), { generatedAt: parsed.generatedAt });
  });

  it("keeps every product and offer referentially consistent", () => {
    const parsed = parseCatalogSnapshot(snapshot);
    const productEans = new Set(parsed.products.map((product) => product.ean));
    assert.equal(productEans.size, parsed.products.length, "product keys must be unique");
    assert.ok(parsed.offers.length >= parsed.products.length, "every product needs at least one offer");

    for (const product of parsed.products) {
      assert.ok(
        parsed.offers.some((offer) => offer.ean === product.ean),
        `product ${product.ean} has no offer`,
      );
    }

    for (const offer of parsed.offers) {
      assert.ok(productEans.has(offer.ean), `offer ${offer.ean} has no product`);
      assert.ok(!Number.isNaN(Date.parse(offer.observedAt)), `offer ${offer.ean} observedAt must parse`);
      if (offer.price !== null) assert.ok(Number.isFinite(offer.price) && offer.price >= 0, `offer ${offer.ean} price must be a non-negative number`);
      if (offer.listPrice !== null) assert.ok(Number.isFinite(offer.listPrice) && offer.listPrice >= 0, `offer ${offer.ean} listPrice must be a non-negative number`);
      for (const point of offer.history) {
        assert.ok(!Number.isNaN(Date.parse(point.observedAt)), `history point of ${offer.ean} observedAt must parse`);
        if (point.price !== null) assert.ok(Number.isFinite(point.price) && point.price >= 0, `history price of ${offer.ean} must be a non-negative number`);
      }
    }
  });

  it("keeps each offer history sorted oldest first", () => {
    for (const offer of snapshot.offers) {
      const stamps = offer.history.map((point) => Date.parse(String(point.observedAt)));
      assert.deepEqual(stamps, [...stamps].sort((left, right) => left - right), `history of ${offer.ean}/${offer.source} must be ascending`);
    }
  });

  it("rejects a malformed snapshot instead of serving it", () => {
    assert.throws(() => parseCatalogSnapshot({ schemaVersion: 2 }), SnapshotUnavailableError);
    assert.throws(() => parseCatalogSnapshot(parsedWithoutOffers()), SnapshotUnavailableError);
  });

  it("parses the committed test fixture through the same gate", () => {
    const fixture = loadSnapshotFixture();
    assert.equal(fixture.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    assert.ok(fixture.products.length > 0 && fixture.offers.length > 0);
  });
});

function parsedWithoutOffers(): unknown {
  return { ...snapshot, offers: "not-an-array" };
}
