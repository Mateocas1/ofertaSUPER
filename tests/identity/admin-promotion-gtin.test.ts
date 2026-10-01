import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeProductEans } from "../../src/lib/admin/promotions";

describe("admin promotion product GTINs", () => {
  it("stores promotion memberships under the canonical GTIN-14 and dedupes equivalent forms", () => {
    assert.deepEqual(normalizeProductEans([" 7791234567898 ", "07791234567898", "036000291452", ""]), [
      "07791234567898",
      "00036000291452",
    ]);
  });

  it("keeps an invalid entry verbatim so the existence check reports it", () => {
    assert.deepEqual(normalizeProductEans(["7791234567899"]), ["7791234567899"]);
  });
});
