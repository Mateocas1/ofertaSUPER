import assert from "node:assert/strict";
import { test } from "node:test";

import { publicCatalogUnavailable, type PublicCatalogData } from "../src/lib/public-catalog-api";
import { createPublicCatalogPageResult } from "../src/lib/seo/public-catalog-page";

test("keeps the static shell while only eligible page results receive commercial data", () => {
  const shell = { navigation: ["/buscar", "/ofertas"] };
  const catalog: PublicCatalogData<{ items: Array<{ name: string; price: number }> }> = {
    items: [{ name: "Protected product", price: 1234 }],
    dataSource: "database",
    degraded: false,
    verifiedAt: "2026-03-01T12:00:00.000Z",
    latestCheckedAt: "2026-03-01T12:00:00.000Z",
  };

  assert.deepEqual(createPublicCatalogPageResult(shell, catalog), {
    availability: "eligible",
    shell,
    catalog,
  });

  const unavailable = createPublicCatalogPageResult(shell, publicCatalogUnavailable());
  assert.deepEqual(unavailable, {
    availability: "unavailable",
    shell,
  });
  assert.equal("catalog" in unavailable, false);
  assert.doesNotMatch(JSON.stringify(unavailable), /Protected product|1234/);
});
