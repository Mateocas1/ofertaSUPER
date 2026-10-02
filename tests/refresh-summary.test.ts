import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRejectedSummary, REJECTED_SUMMARY_PREFIX } from "../scripts/lib/refresh-summary";

describe("refresh rejected summary", () => {
  it("prints a greppable one-line summary with the quality flags", () => {
    const line = formatRejectedSummary([
      { batchId: "v1-refresh-20261002-28", gtin: "07790000000007", qualityFlags: ["price_no_spike"] },
    ]);

    assert.equal(line.startsWith(REJECTED_SUMMARY_PREFIX), true);
    assert.equal(REJECTED_SUMMARY_PREFIX, "[refresh] rejected:");
    assert.equal(
      line,
      '[refresh] rejected: 1 products [{"batchId":"v1-refresh-20261002-28","gtin":"07790000000007","qualityFlags":["price_no_spike"]}]',
    );
    assert.equal(line.split("\n").length, 1);
  });

  it("still prints the prefix when nothing was rejected", () => {
    assert.equal(formatRejectedSummary([]), "[refresh] rejected: 0 products []");
  });
});
