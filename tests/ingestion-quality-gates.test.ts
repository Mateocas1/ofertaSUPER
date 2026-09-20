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
});
