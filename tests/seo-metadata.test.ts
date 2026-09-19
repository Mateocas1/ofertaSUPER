import assert from "node:assert/strict";
import { test } from "node:test";

import { createUnavailableCatalogMetadata } from "../src/lib/seo/metadata";

test("creates complete non-commercial denial metadata", () => {
  const metadata = createUnavailableCatalogMetadata();

  assert.deepEqual(metadata, {
    title: "Catalog temporarily unavailable",
    description: "Catalog information is temporarily unavailable.",
    robots: { index: false, follow: true },
    alternates: {},
    openGraph: {},
    twitter: {},
  });
});
