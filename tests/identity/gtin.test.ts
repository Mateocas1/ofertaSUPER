import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gtinLookupForms, normalizeGtin } from "../../src/lib/identity/gtin";

describe("GTIN-14 canonical identity", () => {
  it("canonicalizes UPC-12, EAN-13 and GTIN-14 of the same item to one 14-digit key", () => {
    const canonical = "00036000291452";
    for (const variant of ["036000291452", "0036000291452", "00036000291452"]) {
      assert.equal(normalizeGtin(variant), canonical, variant);
    }
  });

  it("canonicalizes an EAN-8 and its zero-padded forms to one 14-digit key", () => {
    const canonical = "00000096385074";
    for (const variant of ["96385074", "000096385074", "0000096385074", "00000096385074"]) {
      assert.equal(normalizeGtin(variant), canonical, variant);
    }
  });

  it("left-pads an Argentine EAN-13 and keeps a packaging-level GTIN-14 distinct", () => {
    assert.equal(normalizeGtin("7791234567898"), "07791234567898");
    assert.equal(normalizeGtin("17791234567895"), "17791234567895");
    assert.notEqual(normalizeGtin("17791234567895"), normalizeGtin("7791234567898"));
  });

  it("is idempotent and strips ASCII spaces and hyphens", () => {
    assert.equal(normalizeGtin("779-1234 567898"), "07791234567898");
    assert.equal(normalizeGtin(normalizeGtin("036000291452")), "00036000291452");
  });

  it("still rejects invalid checksums at every supported length", () => {
    for (const invalid of ["96385075", "036000291453", "7791234567899", "17791234567896"]) {
      assert.equal(normalizeGtin(invalid), null, invalid);
    }
  });

  it("rejects unsupported lengths, non-digits and empty input", () => {
    for (const invalid of ["1234567", "12345678901", "123456789012345", "77912345678a8", "", null, undefined]) {
      assert.equal(normalizeGtin(invalid), null, String(invalid));
    }
  });
});

describe("GTIN source lookup forms", () => {
  it("queries sources with the short forms they publish, most likely first", () => {
    assert.deepEqual(gtinLookupForms("07791234567898"), ["7791234567898"]);
    assert.deepEqual(gtinLookupForms("00036000291452"), ["0036000291452", "036000291452"]);
    assert.deepEqual(gtinLookupForms("00000096385074"), ["96385074", "0000096385074"]);
    assert.deepEqual(gtinLookupForms("17791234567895"), ["17791234567895"]);
  });

  it("accepts any valid form and rejects invalid input", () => {
    assert.deepEqual(gtinLookupForms("7791234567898"), ["7791234567898"]);
    assert.deepEqual(gtinLookupForms("7791234567899"), []);
  });
});
