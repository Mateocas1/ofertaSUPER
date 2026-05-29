import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  RECONCILE_ADVISORY_LOCK_KEY,
  ReconcileLockUnavailableError,
  ensureReconcileAdvisoryLock,
  findRefreshExistingPreflightViolations,
} from "../scripts/pipeline/reconcile";

describe("reconcile advisory lock guard", () => {
  it("uses a stable positive lock key", () => {
    assert.equal(typeof RECONCILE_ADVISORY_LOCK_KEY, "number");
    assert.ok(Number.isSafeInteger(RECONCILE_ADVISORY_LOCK_KEY));
    assert.ok(RECONCILE_ADVISORY_LOCK_KEY > 0);
  });

  it("allows reconciliation when the transaction acquires the advisory lock", async () => {
    let calls = 0;

    await assert.doesNotReject(
      ensureReconcileAdvisoryLock({
        $queryRaw: async <T>() => {
          calls += 1;
          return [{ locked: true }] as T;
        },
      }),
    );

    assert.equal(calls, 1);
  });

  it("fails fast when another reconciliation already owns the advisory lock", async () => {
    await assert.rejects(
      ensureReconcileAdvisoryLock({
        $queryRaw: async <T>() => [{ locked: false }] as T,
      }),
      ReconcileLockUnavailableError,
    );
  });

  it("acquires the lock before loading batch candidates", async () => {
    const source = await readFile("scripts/pipeline/reconcile.ts", "utf8");
    const lockIndex = source.indexOf("ensureReconcileAdvisoryLock(tx)");
    const loadIndex = source.indexOf("loadCandidates(batchId, tx)");

    assert.ok(lockIndex >= 0, "reconcileStageProducts must acquire the advisory lock inside the transaction");
    assert.ok(loadIndex >= 0, "reconcileStageProducts must load candidates inside the locked transaction");
    assert.ok(lockIndex < loadIndex, "lock must be acquired before loading pending candidates");
  });

  it("detects refresh-existing rows that would be created before writes", () => {
    const candidate = {
      id: 1,
      runId: 42,
      sourceSlug: "carrefour",
      ean: "111",
      name: "Producto",
      brand: null,
      description: null,
      imageUrl: null,
      images: [],
      category: null,
      skuId: "sku",
      sellerId: "1",
      productUrl: "https://example.test/111",
      price: 100,
      listPrice: 100,
      referencePrice: null,
      referenceUnit: null,
      isAvailable: true,
      qualityScore: 1,
      qualityFlags: [],
      status: "PENDING" as const,
    };

    assert.deepEqual(
      findRefreshExistingPreflightViolations({
        candidates: [candidate],
        supermarketIdBySlug: new Map([["carrefour", 7]]),
        existingProductEans: [],
        existingSupermarketProductKeys: [],
      }),
      {
        missingProductEans: ["111"],
        missingSupermarketProducts: [{ ean: "111", sourceSlug: "carrefour" }],
      },
    );
    assert.deepEqual(
      findRefreshExistingPreflightViolations({
        candidates: [candidate],
        supermarketIdBySlug: new Map([["carrefour", 7]]),
        existingProductEans: ["111"],
        existingSupermarketProductKeys: ["111:7"],
      }),
      { missingProductEans: [], missingSupermarketProducts: [] },
    );
  });
});
