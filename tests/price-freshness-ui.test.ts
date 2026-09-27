import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDemoSearchSuggestions } from "../src/lib/demo-data";
import { getApprovedHomeCopy } from "../src/lib/home-ui-data";

describe("public price freshness UI contracts", () => {
  it("does not claim public catalog data was updated today from static home copy", () => {
    const copy = getApprovedHomeCopy().join(" ");

    assert.doesNotMatch(copy, /Actualizado hoy|Hoy \d{1,2}:\d{2}|Datos actualizados hoy/i);
    assert.match(copy, /frescura visible|registro disponible|verific/i);
  });

  it("exposes freshness metadata in search suggestion payloads", () => {
    const [suggestion] = getDemoSearchSuggestions("leche", 1);

    assert.ok(suggestion);
    assert.equal(typeof suggestion.latestCheckedAt, "string");
    assert.match(suggestion.freshnessStatus, /fresh|stale|unknown/);
  });
});
