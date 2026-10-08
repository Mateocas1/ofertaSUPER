import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateStageCandidate, type StageValidationCandidate } from "../src/lib/ingestion/quality-gates";

const candidate: StageValidationCandidate = {
  ean: "7790000000003",
  name: "Leche",
  brand: null,
  category: null,
  imageUrl: null,
  images: [],
  price: null,
};

describe("ingestion quality gates", () => {
  it("accepts valid normalized GTIN identities", () => {
    const result = evaluateStageCandidate(
      { ...candidate, ean: "779 000-000 0003" },
      { historicalAverage: null },
    );

    assert.equal(result.status, "PENDING");
    assert.doesNotMatch(result.qualityFlags.join(","), /valid_ean/);
  });

  it("fails closed for missing, malformed, and checksum-invalid identities", () => {
    for (const ean of ["", "not-an-ean", "7790001000012"]) {
      const result = evaluateStageCandidate({ ...candidate, ean }, { historicalAverage: null });

      assert.equal(result.status, "REJECTED");
      assert.ok(result.qualityFlags.includes("valid_ean"));
    }
  });

  it("rejects a 5x price spike only for an offer that is in stock", () => {
    // Out-of-stock VTEX offers keep stale placeholder prices ($99.99 for 5 kg
    // of charcoal); their price is not an offer, so it is never a spike.
    const spike = { ...candidate, ean: "7790139101695", price: 8000 };
    assert.ok(evaluateStageCandidate(spike, { historicalAverage: 100 }).qualityFlags.includes("price_no_spike"));
    assert.ok(evaluateStageCandidate({ ...spike, isAvailable: true }, { historicalAverage: 100 }).qualityFlags.includes("price_no_spike"));
    assert.ok(!evaluateStageCandidate({ ...spike, isAvailable: false }, { historicalAverage: 100 }).qualityFlags.includes("price_no_spike"));
    assert.ok(!evaluateStageCandidate(spike, { historicalAverage: 2000 }).qualityFlags.includes("price_no_spike"));
  });
});
