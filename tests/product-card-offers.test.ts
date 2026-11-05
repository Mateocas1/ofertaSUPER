import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardCoverageLabel, cardVerdictLabel, formatObservedDay, promotionLabel, summarizeCardOffers } from "../src/lib/product-card-offers";

const SUPERMARKETS: Record<string, string> = { carrefour: "Carrefour", coto: "Coto", disco: "Disco", jumbo: "Jumbo", vea: "Vea" };

function entry(slug: string, price: number | null, isAvailable = true) {
  return { supermarket: { name: SUPERMARKETS[slug], slug }, price, isAvailable };
}

describe("product card offer summary", () => {
  it("names the supermarket that holds the headline price, even when the snapshot lists it last", () => {
    // The design review case: a $2.190 headline over chips showing $2.205,
    // $2.205 and $2.400 because the chips were the first three in slug order.
    const summary = summarizeCardOffers(
      [entry("carrefour", 2205), entry("coto", 2205), entry("disco", 2400), entry("vea", 2190)],
      2190,
    );
    assert.deepEqual(summary.cheapest.map((item) => item.supermarket.name), ["Vea"]);
    assert.equal(cardVerdictLabel(summary.verdict), "Más barato en Vea");
    assert.deepEqual(
      summary.others.map((row) => [row.entry.supermarket.name, row.entry.price, row.difference]),
      [["Carrefour", 2205, 15], ["Coto", 2205, 15], ["Disco", 2400, 210]],
    );
    assert.equal(summary.coverage, 4);
    assert.equal(cardCoverageLabel(summary.coverage), "en 4 supermercados");
  });

  it("reports ties in words instead of picking one supermarket", () => {
    const pair = summarizeCardOffers([entry("jumbo", 1500), entry("disco", 1500), entry("coto", 1700)], 1500);
    assert.equal(cardVerdictLabel(pair.verdict), "Mismo precio en Disco y Jumbo");
    assert.deepEqual(pair.others.map((row) => row.entry.supermarket.slug), ["coto"]);
    assert.deepEqual(pair.unnamedCheapest, [], "both tied supermarkets are named in the sentence");

    const three = summarizeCardOffers([entry("jumbo", 900), entry("disco", 900), entry("vea", 900)], 900);
    assert.equal(cardVerdictLabel(three.verdict), "Mismo precio en 3 supermercados");
    assert.equal(three.others.length, 0);
    assert.deepEqual(three.unnamedCheapest.map((item) => item.supermarket.name), ["Disco", "Jumbo", "Vea"],
      "a tie the sentence only counts is listed by name");
  });

  it("does not call a lone price the cheapest", () => {
    const summary = summarizeCardOffers([entry("coto", 3100), entry("disco", null), entry("jumbo", 2800, false)], 3100);
    assert.equal(cardVerdictLabel(summary.verdict), "Solo en Coto");
    assert.equal(summary.coverage, 1);
    assert.equal(cardCoverageLabel(summary.coverage), "en 1 supermercado");
  });

  it("lists an older, lower reading without calling the headline the cheapest", () => {
    // displayPrice prefers recent prices, so a stale reading can sit below it.
    const summary = summarizeCardOffers([entry("disco", 2000), entry("vea", 1900)], 2000);
    assert.equal(cardVerdictLabel(summary.verdict), "Menor precio reciente en Disco");
    assert.deepEqual(summary.others.map((row) => [row.entry.supermarket.slug, row.difference, row.olderCheaper]), [["vea", -100, true]]);
  });

  it("degrades to no verdict without a headline or priced offers", () => {
    const none = summarizeCardOffers([entry("disco", null)], null);
    assert.deepEqual(none.verdict, { kind: "none" });
    assert.equal(cardVerdictLabel(none.verdict), null);
    assert.equal(cardCoverageLabel(none.coverage), null);

    const unmatched = summarizeCardOffers([entry("jumbo", 1200), entry("coto", 1100)], null);
    assert.deepEqual(unmatched.verdict, { kind: "none" });
    assert.deepEqual(unmatched.others.map((row) => row.entry.supermarket.slug), ["coto", "jumbo"]);
  });

  it("writes promotions in Spanish and observation days in Argentine time", () => {
    assert.equal(promotionLabel({ type: "percent-off", percent: 25, label: "25% OFF" }), "Promo −25%");
    assert.equal(promotionLabel({ type: "nth-unit", percent: 70, label: "2do al 70%" }), "2do al 70%");
    assert.equal(formatObservedDay("2026-11-04T19:15:35.000Z"), "4 nov");
    assert.equal(formatObservedDay("2026-11-05T01:00:00.000Z"), "4 nov", "01:00 UTC is still the 4th in Buenos Aires");
    assert.equal(formatObservedDay("not a date"), null);
  });

  it("treats entries without an availability flag as available", () => {
    const summary = summarizeCardOffers([{ supermarket: { name: "Disco", slug: "disco" }, price: 10 }], 10);
    assert.equal(summary.coverage, 1);
  });
});
