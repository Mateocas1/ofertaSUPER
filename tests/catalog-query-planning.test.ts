import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PRODUCT_CANDIDATE_READ_LIMIT,
  MIN_PRODUCT_CANDIDATE_READ_LIMIT,
  calculateProductCandidateReadLimit,
  calculateSourceProductCandidateReadLimit,
} from "../src/lib/catalog-query-planning";

describe("product listing query planning", () => {
  it("uses a bounded candidate read limit instead of an unbounded catalog scan", () => {
    assert.equal(calculateProductCandidateReadLimit({ page: 1, limit: 24 }), MIN_PRODUCT_CANDIDATE_READ_LIMIT);
    assert.equal(calculateProductCandidateReadLimit({ page: 2, limit: 48 }), 384);
    assert.equal(calculateProductCandidateReadLimit({ page: 99, limit: 48 }), MAX_PRODUCT_CANDIDATE_READ_LIMIT);
  });

  it("normalizes unsafe pagination inputs before calculating the cap", () => {
    assert.equal(calculateProductCandidateReadLimit({ page: 0, limit: 0 }), MIN_PRODUCT_CANDIDATE_READ_LIMIT);
    assert.equal(calculateProductCandidateReadLimit({ page: Number.NaN, limit: Number.NaN }), MIN_PRODUCT_CANDIDATE_READ_LIMIT);
  });

  it("reads a bounded source-product candidate window for freshness-aware ranking", () => {
    assert.equal(calculateSourceProductCandidateReadLimit({ page: 1, limit: 24 }), 1200);
    assert.equal(calculateSourceProductCandidateReadLimit({ page: 99, limit: 48 }), MAX_PRODUCT_CANDIDATE_READ_LIMIT);
  });
});
