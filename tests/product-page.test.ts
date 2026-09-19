import assert from "node:assert/strict";
import { test } from "node:test";

import { PublicCatalogUnavailableError } from "../src/lib/public-catalog-api";
import {
  createGuardedProductPageLoader,
  createProductPageResult,
} from "../src/lib/seo/public-catalog-page";
import { createGuardedProductMetadata } from "../src/lib/seo/metadata";

const ean = "7790001000012";
const product = { ean, name: "Yerba test", displayPrice: 1250 } as never;
const history = { ean, days: 90, series: [], points: [] } as never;

test("product page preserves a non-commercial shell when authority is unavailable", () => {
  const page = createProductPageResult(ean, {
    error: "Catalog temporarily unavailable",
    dataSource: "unavailable",
    degraded: false,
    verifiedAt: null,
  });

  assert.deepEqual(page, { availability: "unavailable", shell: { ean } });
  assert.equal("catalog" in page, false);
  assert.deepEqual(createGuardedProductMetadata(page), {
    title: "Catalog temporarily unavailable",
    description: "Catalog information is temporarily unavailable.",
    robots: { index: false, follow: true },
    alternates: {},
    openGraph: {},
    twitter: {},
  });
});

test("guarded product page loader converts catalog authority denial to an unavailable page", async () => {
  const loadPage = createGuardedProductPageLoader(async () => {
    throw new PublicCatalogUnavailableError();
  }, (loader) => loader);

  assert.deepEqual(await loadPage(ean, 90), {
    availability: "unavailable",
    shell: { ean },
  });
});

test("guarded product page loader rethrows unrelated errors", async () => {
  const unexpected = new Error("database connection lost");
  const loadPage = createGuardedProductPageLoader(async () => {
    throw unexpected;
  }, (loader) => loader);

  await assert.rejects(loadPage(ean, 90), (error) => error === unexpected);
});

test("product page metadata is derived from eligible guarded detail only", () => {
  const page = createProductPageResult(ean, {
    product,
    history,
    dataSource: "database",
    degraded: false,
    verifiedAt: "2026-03-01T00:00:00.000Z",
    latestCheckedAt: null,
  });

  assert.equal(page.availability, "eligible");
  assert.match(String(createGuardedProductMetadata(page).title), /^Yerba test desde \$\s?1\.250$/);
});
