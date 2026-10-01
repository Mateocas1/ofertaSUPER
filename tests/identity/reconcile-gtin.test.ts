import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCandidates } from "../../scripts/pipeline/reconcile";

const stagedRow = (id: number, ean: string) => ({
  id, run_id: 1, source_slug: "disco", ean, name: "Yerba", brand: null, description: null, image_url: null,
  images: [], category: null, sku_id: null, seller_id: null, product_url: null, price: null, list_price: null,
  reference_price: null, reference_unit: null, is_available: true, quality_score: 1, quality_flags: [],
  status: "PENDING", promo: null, run: { started_at: new Date("2026-10-01T10:00:00.000Z") },
});

describe("reconcile GTIN identity", () => {
  it("routes staged EAN-13 and UPC-12 rows through the canonical GTIN-14 key", async () => {
    const client = {
      stagingProduct: {
        findMany: async () => [stagedRow(1, "7791234567898"), stagedRow(2, "036000291452"), stagedRow(3, "00036000291452")],
      },
    };

    const candidates = await loadCandidates("batch-1", undefined, client as never);

    assert.deepEqual(candidates.map((candidate) => candidate.ean), ["07791234567898", "00036000291452", "00036000291452"]);
  });
});
