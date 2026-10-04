import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACQUISITION_NO_RESULTS,
  exceedsRejectionTolerance,
  rejectionTolerance,
  runCmvpCatalogBatch,
  type CmvpCatalogBatchArtifact,
  type CmvpCatalogBatchDependencies,
  type CmvpCatalogBatchRequest,
  type RejectedProduct,
} from "../scripts/pipeline/cmvp-catalog-batch";

// Valid EAN-13 identities generated from a body prefix so the batch contract
// accepts them and normalizeGtin turns them into canonical GTIN-14.
function ean13(sequence: number): string {
  const body = String(779000000000 + sequence);
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

const fetched = Array.from({ length: 25 }, (_, index) => ean13(index));
const canonical = (gtin: string) => gtin.padStart(14, "0");

function request(overrides: Partial<CmvpCatalogBatchRequest> = {}): CmvpCatalogBatchRequest {
  return {
    batchId: "v1-refresh-20261002-28",
    source: "carrefour",
    term: "cafe",
    count: fetched.length,
    expectedGtins: fetched,
    dryRun: true,
    confirmWrite: false,
    refresh: true,
    ...overrides,
  };
}

type Acquisition = {
  runId: number | null;
  startedAt: string;
  finishedAt: string;
  fetchedGtins: string[];
  admittedGtins: string[];
  rejectedCount: number;
  rejectedProducts: RejectedProduct[];
  error: string | null;
};

function acquisition(fetchedGtins: string[], admittedGtins: string[], rejectedProducts: RejectedProduct[], rejectedCount = rejectedProducts.length): Acquisition {
  return {
    runId: 12,
    startedAt: "2026-10-02T00:00:00.000Z",
    finishedAt: "2026-10-02T00:00:01.000Z",
    fetchedGtins,
    admittedGtins,
    rejectedCount,
    rejectedProducts,
    error: null,
  };
}

function dependencies(overrides: Partial<CmvpCatalogBatchDependencies> = {}) {
  const calls: string[] = [];
  return {
    calls,
    loadArtifact: async () => null,
    saveArtifact: async () => { calls.push("save"); },
    acquire: async (): Promise<Acquisition> => acquisition([...fetched], [...fetched], []),
    finalizeAcquisition: async (_runId: number, outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null }) => {
      calls.push(`finalize:${outcome.status}`);
    },
    reconcile: async () => { calls.push("reconcile"); return { runId: 12, promotedCount: fetched.length, error: null }; },
    ...overrides,
  } satisfies CmvpCatalogBatchDependencies & { calls: string[] };
}

const rejectedOne = (index = 7) => {
  const gtin = fetched[index]!;
  const admitted = fetched.filter((value) => value !== gtin);
  const product: RejectedProduct = { gtin, qualityFlags: ["price_no_spike"] };
  return { gtin, admitted, product };
};

describe("rejection tolerance", () => {
  it("allows at least one rejection and then 10% of the fetched products", () => {
    assert.equal(rejectionTolerance(0), 1);
    assert.equal(rejectionTolerance(1), 1);
    assert.equal(rejectionTolerance(9), 1);
    assert.equal(rejectionTolerance(10), 1);
    assert.equal(rejectionTolerance(19), 1);
    assert.equal(rejectionTolerance(20), 2);
    assert.equal(rejectionTolerance(25), 2);
    assert.equal(rejectionTolerance(36), 3);
  });

  it("only fails above the tolerance, never at it", () => {
    assert.equal(exceedsRejectionTolerance(1, 25), false);
    assert.equal(exceedsRejectionTolerance(2, 25), false);
    assert.equal(exceedsRejectionTolerance(3, 25), true);
    assert.equal(exceedsRejectionTolerance(1, 9), false);
    assert.equal(exceedsRejectionTolerance(2, 9), true);
    assert.equal(exceedsRejectionTolerance(1, 1), false);
    assert.equal(exceedsRejectionTolerance(2, 19), true);
  });
});

describe("refresh batch rejection admission", () => {
  it("tolerates one rejected product, records it in the artifact, and publishes the rest", async () => {
    const { admitted, product } = rejectedOne();
    const deps = dependencies({
      acquire: async () => acquisition([...fetched], admitted, [product]),
      reconcile: async () => { deps.calls.push("reconcile"); return { runId: 12, promotedCount: admitted.length, error: null }; },
    });

    const result = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), deps);

    assert.equal(result.artifact.state, "completed");
    assert.equal(result.artifact.reconciliationError, null);
    assert.deepEqual(result.artifact.runs[0]!.rejectedProducts, [{ gtin: canonical(product.gtin), qualityFlags: ["price_no_spike"] }]);
    assert.equal(result.artifact.runs[0]!.rejectedCount, 1);
    assert.equal(result.artifact.admittedGtins.length, 24);
    assert.ok(deps.calls.includes("reconcile"));
  });

  it("blocks when the rejects exceed the tolerance", async () => {
    const rejectedGtins = fetched.slice(0, 3);
    const admitted = fetched.slice(3);
    const products: RejectedProduct[] = rejectedGtins.map((gtin) => ({ gtin, qualityFlags: ["price_positive"] }));
    const deps = dependencies({ acquire: async () => acquisition([...fetched], admitted, products) });

    const result = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), deps);

    assert.equal(result.artifact.state, "blocked");
    assert.equal(result.artifact.runs[0]!.error, "acquisition_rejected_products");
    assert.equal(deps.calls.includes("reconcile"), false);
  });

  it("blocks a batch that admits nothing even when the reject count is within tolerance", async () => {
    const single = [fetched[0]!];
    const deps = dependencies({ acquire: async () => acquisition(single, [], [{ gtin: single[0]!, qualityFlags: ["price_positive"] }]) });

    const result = await runCmvpCatalogBatch(request({ count: 1, expectedGtins: single, dryRun: false, confirmWrite: true }), deps);

    assert.equal(result.artifact.state, "blocked");
    assert.equal(result.artifact.runs[0]!.error, "acquisition_no_admitted_products");
  });

  it("blocks a refresh search that returned nothing with its own no-results error", async () => {
    const deps = dependencies({ acquire: async () => acquisition([], [], []) });

    const result = await runCmvpCatalogBatch(request({ count: 1, expectedGtins: [fetched[0]!], dryRun: false, confirmWrite: true }), deps);

    assert.equal(result.artifact.state, "blocked");
    assert.equal(result.artifact.runs[0]!.error, ACQUISITION_NO_RESULTS);
    assert.ok(deps.calls.includes("finalize:FAILED"));
    assert.equal(deps.calls.includes("reconcile"), false);
  });

  it("keeps an empty frozen-plan search as no admitted products", async () => {
    const deps = dependencies({ acquire: async () => acquisition([], [], []) });

    const result = await runCmvpCatalogBatch(request({ refresh: false, dryRun: false, confirmWrite: true }), deps);

    assert.equal(result.artifact.state, "blocked");
    assert.equal(result.artifact.runs[0]!.error, "acquisition_no_admitted_products");
  });

  it("keeps invalid_acquisition_rejected_count as its own failure", async () => {
    const { admitted } = rejectedOne();
    const deps = dependencies({ acquire: async () => ({ ...acquisition([...fetched], admitted, []), rejectedCount: Number.NaN }) });

    const result = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), deps);

    assert.equal(result.artifact.state, "blocked");
    assert.equal(result.artifact.runs[0]!.error, "invalid_acquisition_rejected_count");
  });

  it("replays a completed checkpoint that recorded a tolerated rejection", async () => {
    const { admitted, product } = rejectedOne();
    let saved: CmvpCatalogBatchArtifact | null = null;
    const first = dependencies({
      acquire: async () => acquisition([...fetched], admitted, [product]),
      saveArtifact: async (artifact) => { saved = artifact; first.calls.push(`save:${artifact.state}`); },
      reconcile: async () => { first.calls.push("reconcile"); return { runId: 12, promotedCount: admitted.length, error: null }; },
    });
    const completed = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), first);
    assert.equal(completed.artifact.state, "completed");

    const replay = dependencies({ loadArtifact: async () => saved });
    const replayed = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), replay);

    assert.equal(replayed.replayed, true);
    assert.equal(replayed.artifact.runs[0]!.rejectedCount, 1);
    assert.deepEqual(replay.calls, []);
  });
});
