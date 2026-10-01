import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPublicLatestCheckedAt, publicCatalogUnavailable } from "../src/lib/public-catalog-api";
import { classifyPublicCatalogReadiness } from "../src/lib/public-catalog-readiness";

const NOW = new Date("2026-08-13T12:00:00.000Z");

describe("public catalog publication gate", () => {
  it("classifies strict 24-hour, future, and source-SLA boundaries", () => {
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T12:00:00.001Z") }, { now: NOW }).status,
      "fresh",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T12:00:00.000Z") }, { now: NOW }).status,
      "degraded",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-13T12:00:00.001Z") }, { now: NOW }).status,
      "unavailable",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-13T10:00:00.000Z") }, { now: NOW, sourceSlaHours: 1 }).status,
      "degraded",
    );
    assert.equal(
      classifyPublicCatalogReadiness({ verified_at: new Date("2026-08-12T11:00:00.000Z") }, { now: NOW, sourceSlaHours: 48 }).status,
      "degraded",
    );
    assert.equal(classifyPublicCatalogReadiness(null, { now: NOW }).status, "unavailable");
  });

  it("reports the newest item check and a stable unavailable envelope", () => {
    assert.equal(
      getPublicLatestCheckedAt({
        items: [{ latestCheckedAt: "2026-08-12T10:00:00.000Z" }, { latestCheckedAt: "2026-08-12T11:00:00.000Z" }, {}],
      }),
      "2026-08-12T11:00:00.000Z",
    );
    assert.equal(getPublicLatestCheckedAt({ items: [] }), null);
    assert.equal(getPublicLatestCheckedAt(null), null);
    assert.deepEqual(publicCatalogUnavailable(), {
      error: "Catalog temporarily unavailable",
      dataSource: "unavailable",
      degraded: false,
      verifiedAt: null,
    });
  });
});
