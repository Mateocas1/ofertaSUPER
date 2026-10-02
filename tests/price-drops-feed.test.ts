import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadPriceDrops, type PriceDrop, type PriceDropsPayload } from "../src/lib/price-drops";
import {
  buildPriceDropsFeed,
  escapeXml,
  PRICE_DROPS_FEED_HEADERS,
  priceDropEntryId,
  priceDropsFeedResponse,
} from "../src/lib/price-drops-feed";
import { buildAbsoluteUrl, canonicalProductPath } from "../src/lib/seo/metadata";
import { assertWellFormedXml, XmlWellFormednessError } from "./helpers/xml";

const NOW = new Date("2027-01-15T12:00:00.000Z");
const EAN = "07791234500000";

function drop(overrides: Partial<PriceDrop> = {}): PriceDrop {
  return {
    ean: EAN,
    date: "2027-01-15",
    source: "carrefour",
    name: "Leche Entera 1L",
    brand: "La Serenísima",
    category: "Lácteos",
    imageUrl: null,
    previousPrice: 1000,
    currentPrice: 800,
    amountDrop: 200,
    percentDrop: 20,
    previousObservedAt: "2027-01-05T10:00:00.000Z",
    observedAt: NOW.toISOString(),
    productUrl: "https://www.carrefour.test/producto/1",
    ...overrides,
  };
}

function payload(drops: PriceDrop[], overrides: Partial<PriceDropsPayload> = {}): PriceDropsPayload {
  return {
    schemaVersion: 2,
    generatedAt: NOW.toISOString(),
    date: "2027-01-15",
    rules: { minPercentDrop: 10, minAmountDrop: 100, windowDays: 14, maxAgeHours: 24, maxPercentDrop: 60, limit: 100 },
    totalDrops: drops.length,
    drops,
    suspectDrops: 0,
    suspect: [],
    ...overrides,
  };
}

function entryIds(xml: string): string[] {
  return [...xml.matchAll(/<id>(urn:[^<]*)<\/id>/g)].map((match) => match[1]);
}

describe("price drops Atom feed", () => {
  it("builds one well-formed entry per published drop for the committed payload", () => {
    const committed = loadPriceDrops();
    const feed = buildPriceDropsFeed(committed);

    assertWellFormedXml(feed);
    assert.match(feed, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="es-AR">/);
    assert.equal((feed.match(/<entry>/g) ?? []).length, committed.drops.length);
    assert.match(feed, new RegExp(`<updated>${committed.generatedAt}</updated>`));
  });

  it("keeps one stable id per offer and day", () => {
    const drops = [drop(), drop({ ean: "07791234500017", source: "disco" })];
    const first = buildPriceDropsFeed(payload(drops));
    const second = buildPriceDropsFeed(payload(drops, { generatedAt: "2027-01-16T09:00:00.000Z" }));

    const ids = entryIds(first);
    assert.deepEqual(ids, drops.map(priceDropEntryId));
    assert.equal(new Set(ids).size, ids.length, "entry ids must be unique");
    assert.deepEqual(entryIds(second), ids, "a later refresh of the same drops keeps the same ids");
    assert.match(ids[0], /^urn:ofertasuper:baja:07791234500000:carrefour:2027-01-15$/);
  });

  it("links every entry to the canonical product page of its GTIN", () => {
    const drops = [drop(), drop({ ean: "07791234500017" })];
    const feed = buildPriceDropsFeed(payload(drops));

    for (const item of drops) {
      const link = `<link rel="alternate" type="text/html" href="${buildAbsoluteUrl(canonicalProductPath(item.ean))}"/>`;
      assert.ok(feed.includes(link), `missing product link for ${item.ean}`);
    }
  });

  it("escapes markup and entities instead of emitting them", () => {
    const feed = buildPriceDropsFeed(payload([drop({ name: 'Café & "Leche" <1L>' })]));

    assertWellFormedXml(feed);
    assert.ok(feed.includes("Café &amp; &quot;Leche&quot; &lt;1L&gt; bajó"));
    assert.ok(!feed.includes("<1L>"));
    assert.equal(escapeXml("<a & b>"), "&lt;a &amp; b&gt;");
  });

  it("publishes an empty day as a valid feed without entries", () => {
    const feed = buildPriceDropsFeed(payload([]));

    assertWellFormedXml(feed);
    assert.equal((feed.match(/<entry>/g) ?? []).length, 0);
    assert.match(feed, /<subtitle>[^<]*umbrales[^<]*<\/subtitle>/);
  });

  it("is idempotent for the same payload", () => {
    const committed = loadPriceDrops();
    assert.equal(buildPriceDropsFeed(committed), buildPriceDropsFeed(committed));
  });

  it("answers Atom for a readable payload and fails closed for an unreadable one", async () => {
    const response = priceDropsFeedResponse(() => payload([drop()]));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), PRICE_DROPS_FEED_HEADERS["content-type"]);
    assertWellFormedXml(await response.text());

    const broken = priceDropsFeedResponse(() => {
      throw new Error("payload is missing");
    });
    assert.equal(broken.status, 503);
    assert.match(await broken.text(), /unavailable/);
  });
});

describe("xml well-formedness checker", () => {
  it("accepts the generated declarations and self-closing elements", () => {
    assertWellFormedXml('<?xml version="1.0"?>\n<feed><link rel="self" href="/x"/></feed>');
  });

  it("rejects unbalanced tags, raw entities and trailing content", () => {
    assert.throws(() => assertWellFormedXml("<feed><entry></feed>"), XmlWellFormednessError);
    assert.throws(() => assertWellFormedXml("<feed>a & b</feed>"), XmlWellFormednessError);
    assert.throws(() => assertWellFormedXml("<feed></feed><extra/>"), XmlWellFormednessError);
    assert.throws(() => assertWellFormedXml("<feed>"), XmlWellFormednessError);
  });
});
