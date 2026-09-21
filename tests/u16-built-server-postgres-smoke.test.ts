import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDeniedUnavailable,
  assertEligibleCommercialResponse,
} from "../scripts/u16-built-server-postgres-smoke";

test("U16 smoke assertions reject an unavailable commercial response that leaks a false empty payload", () => {
  assert.throws(
    () => assertDeniedUnavailable("search", 503, { items: [] }),
    /search denied response leaked commercial payload/,
  );
});

test("U16 smoke assertions distinguish eligible commercial data from denied authority", () => {
  assertEligibleCommercialResponse("products", 200, { items: [{ name: "Snapshot product" }] }, "Snapshot product");
  assertDeniedUnavailable("products", 503, { error: "Catalog temporarily unavailable" });
});
