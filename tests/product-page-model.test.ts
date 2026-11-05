import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cheapestCopy,
  cheapestEntries,
  displayBrand,
  dropHeadline,
  formatObservedAt,
  formatShortDay,
  headlineDropEntry,
  joinNames,
  movementOf,
  observationCopy,
  promoLabel,
  promoPriceOf,
  sortByPrice,
} from "../src/components/product/product-price-model";
import {
  dayTicks,
  dayToTimestamp,
  formatAxisDay,
  MIN_SPAN_SHARE,
  priceAxis,
  timeDomain,
  toTimePoints,
} from "../src/components/product/price-history-model";
import { seriesColorFor, SUPERMARKET_SERIES_COLORS } from "../src/lib/series-palette";

function entry(name: string, price: number | null, isAvailable = true) {
  return { supermarket: { name, slug: name.toLowerCase() }, price, isAvailable };
}

describe("product page price model", () => {
  it("sorts by price ascending, ties by name, offers without a price last", () => {
    const sorted = sortByPrice([entry("Vea", 2590), entry("Jumbo", 2750), entry("Coto", null), entry("Disco", 2750), entry("Carrefour", 100, false)]);
    assert.deepEqual(sorted.map((item) => item.supermarket.name), ["Vea", "Disco", "Jumbo", "Carrefour", "Coto"]);
  });

  it("names every supermarket tied at the headline price", () => {
    const entries = [entry("Vea", 2750), entry("Jumbo", 2750), entry("Coto", 2999)];
    const cheapest = cheapestEntries(entries, 2750);
    assert.deepEqual(cheapest.map((item) => item.supermarket.name), ["Jumbo", "Vea"]);
    assert.deepEqual(cheapestCopy(cheapest, 3), { text: "Más barato en Jumbo y Vea", isCheapest: true });
  });

  it("does not say 'más barato' with one offer or when every offer ties", () => {
    assert.deepEqual(cheapestCopy([entry("Carrefour", 14999)], 1), { text: "Precio relevado solo en Carrefour", isCheapest: false });
    const tied = [entry("Disco", 1500), entry("Jumbo", 1500)];
    assert.deepEqual(cheapestCopy(tied, 2), { text: "Mismo precio en los 2 supermercados", isCheapest: false });
    assert.equal(cheapestCopy([], 0), null);
  });

  it("shows all-caps brands capitalized, keeps mixed case and acronyms", () => {
    assert.equal(displayBrand("LA SERENISIMA"), "La Serenisima");
    assert.equal(displayBrand("CONAPROLE"), "Conaprole");
    assert.equal(displayBrand("Proline"), "Proline");
    assert.equal(displayBrand("3M"), "3M");
    assert.equal(displayBrand("BGH"), "BGH");
  });

  it("joins names in Spanish", () => {
    assert.equal(joinNames(["Coto"]), "Coto");
    assert.equal(joinNames(["Coto", "Disco", "Jumbo"]), "Coto, Disco y Jumbo");
  });

  it("writes the drop against the last different price with its date", () => {
    const dropped = { price: 14999, previousPrice: 37399, deltaPercent: -59.89, previousObservedAt: "2026-10-30T16:55:07.954Z" };
    assert.match(dropHeadline(dropped) ?? "", /^Bajó −59,9% desde \$\s?37\.399 \(30 oct\)$/);
    assert.equal(dropHeadline({ ...dropped, deltaPercent: 4 }), null);
    assert.equal(movementOf(0), "flat");
    assert.equal(movementOf(null), null);
    const smaller = { ...dropped, deltaPercent: -5 };
    assert.equal(headlineDropEntry([smaller, dropped, { ...dropped, deltaPercent: 3 }]), dropped);
  });

  it("labels promos without English or a plus sign", () => {
    assert.equal(promoLabel({ type: "percent-off", percent: 15, maxUnits: null, label: "15% OFF" }), "−15% en promo");
    assert.equal(promoLabel({ type: "nth-unit", nth: 2, percent: 50, maxUnits: null, label: "2do al 50%" }), "2do al 50%");
  });

  it("shows a promo price only when the data computes one below the price", () => {
    assert.equal(promoPriceOf({ price: 1000, finalPrice: 1000 }), null);
    assert.equal(promoPriceOf({ price: 1000, finalPrice: null }), null);
    assert.equal(promoPriceOf({ price: 1000, finalPrice: 850 }), 850);
  });

  it("shows observation instants on the Buenos Aires calendar and clock", () => {
    assert.equal(formatObservedAt("2026-11-04T18:15:06.801Z"), "4 nov a las 15:15");
    // 01:30 UTC on 5 nov is still 4 nov in Buenos Aires.
    assert.equal(formatShortDay("2026-11-05T01:30:00.000Z"), "4 nov");
    assert.equal(formatShortDay("not a date"), "fecha desconocida");
  });

  it("states the observation date and says when it is old", () => {
    const format = (value: string) => value.slice(0, 10);
    assert.deepEqual(observationCopy("2026-11-04T18:15:06Z", "fresh", format), { text: "Relevado el 2026-11-04", stale: false });
    const stale = observationCopy("2026-10-01T10:00:00Z", "stale", format);
    assert.equal(stale.stale, true);
    assert.match(stale.text, /^Último precio registrado, relevado el 2026-10-01/);
    assert.doesNotMatch(stale.text, /precio actual|en vivo/i);
  });
});

describe("price history model", () => {
  const points = [
    { date: "2026-11-04", carrefour: 14999 },
    { date: "2026-10-27", carrefour: 37399 },
    { date: "2026-10-28", carrefour: null },
    { date: "not-a-day", carrefour: 1 },
  ];

  it("puts each day on a numeric time axis, in order, keeping gaps as null", () => {
    const rows = toTimePoints(points, ["carrefour", "coto"]);
    assert.deepEqual(rows.map((row) => formatAxisDay(row.t)), ["27 oct", "28 oct", "4 nov"]);
    assert.equal(rows[1].carrefour, null);
    assert.equal(rows[0].coto, null);
    // Elapsed time, not category index: 27 oct → 4 nov is 8 days.
    assert.equal((rows[2].t - rows[0].t) / 86_400_000, 8);
  });

  it("anchors a day at noon UTC so it reads the same in Buenos Aires", () => {
    const t = dayToTimestamp("2026-10-30")!;
    assert.equal(new Intl.DateTimeFormat("es-AR", { day: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(t), "30");
    assert.equal(dayToTimestamp("30/10/2026"), null);
  });

  it("does not start the price axis at zero, but never lets a small move fill the plot", () => {
    const small = priceAxis([2750, 2800]);
    const [low, high] = small.domain;
    assert.ok(low > 0, "non-zero baseline");
    assert.ok(low <= 2750 && high >= 2800);
    assert.ok(high - low >= 2800 * MIN_SPAN_SHARE, "minimum span keeps slopes proportionate");
    assert.deepEqual(small.ticks, [2400, 2600, 2800, 3000, 3200]);
    const drop = priceAxis([14999, 37399]);
    assert.deepEqual(drop.domain, [10000, 40000]);
    assert.deepEqual(drop.ticks, [10000, 20000, 30000, 40000]);
    assert.deepEqual(priceAxis([]).domain, [0, 1]);
  });

  it("pads a single observed day and thins day ticks", () => {
    const day = dayToTimestamp("2026-11-04")!;
    assert.deepEqual(timeDomain([{ t: day }]), [day - 86_400_000, day + 86_400_000]);
    const start = dayToTimestamp("2026-08-07")!;
    const ticks = dayTicks([start, dayToTimestamp("2026-11-04")!], 6);
    assert.ok(ticks.length <= 6 && ticks.length >= 4);
    assert.equal(ticks[0], start);
  });

  it("colors follow the supermarket, with neutral gray for unknown sources", () => {
    assert.equal(seriesColorFor("coto"), SUPERMARKET_SERIES_COLORS.coto);
    assert.deepEqual(seriesColorFor("nuevo"), { light: "#898781", dark: "#898781" });
    for (const color of Object.values(SUPERMARKET_SERIES_COLORS)) {
      assert.match(color.light, /^#[0-9a-f]{6}$/);
      assert.match(color.dark, /^#[0-9a-f]{6}$/);
    }
  });
});
