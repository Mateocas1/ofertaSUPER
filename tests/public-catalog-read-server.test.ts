import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPublicCatalogGuardedRead } from "../src/lib/public-catalog-read.server";
import { createPublicCatalogDecisionLeaseStore } from "../src/lib/public-catalog-decision-lease";
import type { PublicCatalogAuthorityRecord, PublicCatalogReaderEligibility } from "../src/lib/public-catalog-authority";

const identity = JSON.stringify({
  version: 1,
  target: "production",
  publicationId: "publication-1",
  deploymentId: "deployment-1",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
});
const now = new Date("2026-08-13T12:00:00.000Z");
const reader: PublicCatalogReaderEligibility = {
  readerId: "deployment-1", generation: "1", lineage: `sha256:${"c".repeat(64)}`,
  policyDigest: `sha256:${"d".repeat(64)}`, healthVersion: "2",
  buildDigest: `sha256:${"e".repeat(64)}`, expiresAt: new Date("2026-08-13T13:00:00.000Z"),
};

function publication(): PublicCatalogAuthorityRecord {
  return {
    id: "publication-1", target: "production", state: "PROMOTED", verified_at: new Date("2026-08-13T11:00:00.000Z"),
    promotion_id: "promotion-1",
    promotion: {
      id: "promotion-1", state: "PROMOTED", deployment_id: "deployment-1", commit_sha: "a".repeat(40),
      candidate_digest: `sha256:${"b".repeat(64)}`, expires_at: new Date("2026-08-13T13:00:00.000Z"),
    },
  };
}

function database(events: string[], authority = publication(), rejectAfterCallback = false) {
  const transaction = {
    $executeRaw: async <T>(query: TemplateStringsArray) => { events.push(query.join("")); return 0 as T; },
    $queryRaw: async <T>(query: TemplateStringsArray) => {
      if (query.join("").includes("clock_timestamp")) {
        events.push("clock");
        return [{ now }] as T;
      }
      events.push("reader");
      return [reader] as T;
    },
    productionReadinessPublication: {
      findUnique: async () => { events.push("publication"); return authority; },
    },
    servingProduct: { findMany: async () => [] },
    servingSupermarket: { findMany: async () => [] },
    servingOffer: { findMany: async () => [] },
    servingHistory: { findMany: async () => [] },
    servingPromotion: { findMany: async () => [] },
    servingMembership: { findMany: async () => [] },
  };
  return {
    $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>, options: { isolationLevel: "RepeatableRead" }) => {
      events.push(`transaction:${options.isolationLevel}`);
      const result = await callback(transaction);
      if (rejectAfterCallback) throw new Error("commit failed");
      return result;
    },
  } as never;
}

describe("public catalog guarded read", () => {
  it("uses one repeatable-read, read-only snapshot for authority then the narrowed projection", async () => {
    const events: string[] = [];
    const read = createPublicCatalogGuardedRead(identity, { database: database(events) });
    const result = await read(async (projection) => {
      assert.deepEqual(Object.keys(projection).sort(), [
        "servingHistory", "servingMembership", "servingOffer", "servingProduct", "servingPromotion", "servingSupermarket",
      ]);
      // @ts-expect-error Mutable source delegates are deliberately unavailable.
      void projection.product;
      // @ts-expect-error The callback cannot issue arbitrary raw SQL.
      void projection.$queryRaw;
      // @ts-expect-error Serving writes are unavailable even inside the read-only transaction.
      void projection.servingProduct.create;
      // @ts-expect-error Serving writes are unavailable even inside the read-only transaction.
      void projection.servingOffer.update;
      // @ts-expect-error Serving writes are unavailable even inside the read-only transaction.
      void projection.servingHistory.delete;
      events.push("projection");
      return 0;
    });

    assert.equal(result.available, true);
    if (result.available) assert.equal(result.value, 0);
    assert.deepEqual(events, ["transaction:RepeatableRead", "SET TRANSACTION READ ONLY", "clock", "publication", "reader", "projection", "clock"]);
  });

  it("keeps legitimate null and empty callback values available", async () => {
    for (const value of [null, "", []] as const) {
      const result = await createPublicCatalogGuardedRead(identity, { database: database([]), trustedClock: async () => now })(async () => value);
      assert.deepEqual(result.available ? result.value : undefined, value);
      assert.equal(result.available, true);
    }
  });

  it("installs only timely snapshots, evicts confirmed ineligibility, and preserves leases on outages", async () => {
    const leases = createPublicCatalogDecisionLeaseStore();
    const first = await createPublicCatalogGuardedRead(identity, { database: database([]), trustedClock: async () => now, leases })(async () => "value");
    assert.equal(first.available, true);
    if (!first.available) return;
    const parsed = JSON.parse(identity);
    assert.ok(leases.get(parsed, first.decision, now));

    const slow = await createPublicCatalogGuardedRead(identity, {
      database: database([]), leases,
      trustedClock: (() => { let calls = 0; return async () => new Date(now.getTime() + (calls++ ? 31_000 : 0)); })(),
    })(async () => "value");
    assert.equal(slow.available, false);
    assert.equal(leases.get(parsed, first.decision, now)?.decisionDeadline, first.decision.decisionDeadline);

    const outage = await createPublicCatalogGuardedRead(identity, {
      database: { $transaction: async () => { throw new Error("outage"); } } as never, trustedClock: async () => now, leases,
    })(async () => "value");
    assert.equal(outage.available, false);
    assert.ok(leases.get(parsed, first.decision, now));

    const rolledBackIneligible = await createPublicCatalogGuardedRead(identity, {
      database: database([], { ...publication(), state: "REVOKED" }, true), trustedClock: async () => now, leases,
    })(async () => "value");
    assert.equal(rolledBackIneligible.available, false);
    assert.ok(leases.get(parsed, first.decision, now));

    const revoked = await createPublicCatalogGuardedRead(identity, { database: database([], { ...publication(), state: "REVOKED" }), trustedClock: async () => now, leases })(async () => "value");
    assert.equal(revoked.available, false);
    assert.equal(leases.get(parsed, first.decision, now), null);
  });

  it("fails closed before callback on authority failure and after callback on expiry or errors", async () => {
    const deniedEvents: string[] = [];
    const denied = await createPublicCatalogGuardedRead(identity, { database: database(deniedEvents, { ...publication(), state: "REVOKED" }), trustedClock: async () => now })(async () => {
      deniedEvents.push("callback");
      return "unexpected";
    });
    assert.deepEqual(denied, { available: false });
    assert.equal(deniedEvents.includes("callback"), false);

    const expired = await createPublicCatalogGuardedRead(identity, {
      database: database([]), trustedClock: (() => { let calls = 0; return async () => new Date(now.getTime() + (calls++ ? 31_000 : 0)); })(),
    })(async () => "value");
    assert.deepEqual(expired, { available: false });

    const failed = await createPublicCatalogGuardedRead(identity, { database: database([]), trustedClock: async () => now })(async () => { throw new Error("failed"); });
    assert.deepEqual(failed, { available: false });

    const transactionFailure = await createPublicCatalogGuardedRead(identity, {
      database: { $transaction: async () => { throw new Error("transaction failed"); } } as never,
      trustedClock: async () => now,
    })(async () => "unexpected");
    assert.deepEqual(transactionFailure, { available: false });
  });
});
