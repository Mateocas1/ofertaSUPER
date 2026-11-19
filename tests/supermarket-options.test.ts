import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { supermarketOptions } from "../src/components/search/supermarket-options";

describe("supermarket filter options", () => {
  it("lists only the chains the published snapshot has data for", () => {
    const options = supermarketOptions(["carrefour", "coto", "disco", "jumbo", "vea"]);
    assert.deepEqual(options, [
      { value: "", label: "Todos" },
      { value: "disco", label: "Disco" },
      { value: "jumbo", label: "Jumbo" },
      { value: "vea", label: "Vea" },
      { value: "carrefour", label: "Carrefour" },
      { value: "coto", label: "Coto" },
    ]);
    assert.ok(!options.some((option) => option.value === "dia" || option.value === "mas"));
  });

  it("ignores source slugs that are not known supermarkets", () => {
    assert.deepEqual(supermarketOptions(["coto", "unknown"]), [
      { value: "", label: "Todos" },
      { value: "coto", label: "Coto" },
    ]);
  });

  it("falls back to every supermarket when the sources are unknown", () => {
    const options = supermarketOptions(null);
    assert.equal(options.length, 8);
    assert.deepEqual(options[0], { value: "", label: "Todos" });
  });
});
