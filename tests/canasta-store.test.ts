import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addItemTo, setItemQuantity } from "../src/hooks/use-canasta";

// Gate 5: the cart store mutations. The store itself is shared across every
// hook instance (one cart per browser), and these pure mutations keep
// quantities clamped and removals honest.

describe("canasta store mutations", () => {
  it("adds a new product with the requested quantity", () => {
    assert.deepEqual(addItemTo([], "2941001000003", 2), [{ ean: "2941001000003", qty: 2 }]);
  });

  it("accumulates quantity for a known product and clamps at 99", () => {
    const items = [{ ean: "2941001000003", qty: 98 }];
    assert.deepEqual(addItemTo(items, "2941001000003", 5), [{ ean: "2941001000003", qty: 99 }]);
  });

  it("sets a quantity, clamps it, and removes when it drops to zero", () => {
    const items = [{ ean: "A", qty: 1 }, { ean: "B", qty: 3 }];
    assert.deepEqual(setItemQuantity(items, "A", 7), [{ ean: "A", qty: 7 }, { ean: "B", qty: 3 }]);
    assert.deepEqual(setItemQuantity(items, "A", 500), [{ ean: "A", qty: 99 }, { ean: "B", qty: 3 }]);
    assert.deepEqual(setItemQuantity(items, "A", 0), [{ ean: "B", qty: 3 }]);
    assert.deepEqual(setItemQuantity(items, "B", -2), [{ ean: "A", qty: 1 }]);
  });
});
