import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyPriceFreshness,
  getPriceFreshnessCopy,
  getStalenessAgeDays,
} from "../src/lib/price-freshness";

const NOW = new Date("2026-05-19T12:00:00.000Z");

describe("price freshness model", () => {
  it("classifies unknown, fresh and stale prices using source SLA hours", () => {
    assert.equal(classifyPriceFreshness(null, { now: NOW, maxAgeHours: 12 }).status, "unknown");
    assert.equal(
      classifyPriceFreshness("2026-05-19T06:30:00.000Z", { now: NOW, maxAgeHours: 12 }).status,
      "fresh",
    );
    assert.equal(
      classifyPriceFreshness("2026-03-23T02:38:39.230Z", { now: NOW, maxAgeHours: 12 }).status,
      "stale",
    );
  });

  it("uses explicit stale copy instead of presenting old prices as current", () => {
    const stale = classifyPriceFreshness("2026-03-23T02:38:39.230Z", {
      now: NOW,
      maxAgeHours: 12,
    });

    assert.equal(getStalenessAgeDays(stale), 57);
    assert.deepEqual(getPriceFreshnessCopy(stale), {
      priceLabel: "Ultimo precio registrado",
      badgeLabel: "Dato viejo",
      helperText: "Puede estar desactualizado. Revisalo en la web del super antes de comprar.",
    });
  });
});
