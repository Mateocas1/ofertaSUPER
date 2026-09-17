import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPublicCatalogDecisionLeaseStore } from "../src/lib/public-catalog-decision-lease";
import type { PublicCatalogAuthorityDecision } from "../src/lib/public-catalog-authority";

const identity = { version: 1, target: "production", publicationId: "publication-1", deploymentId: "deployment-1", commitSha: "a".repeat(40), candidateDigest: `sha256:${"b".repeat(64)}` } as const;
const decision: PublicCatalogAuthorityDecision = {
  publicationId: identity.publicationId, promotionId: "promotion-1", target: "production", deploymentId: identity.deploymentId,
  commitSha: identity.commitSha, candidateDigest: identity.candidateDigest, verifiedAt: "2026-08-13T11:00:00.000Z",
  expiresAt: "2026-08-13T13:00:00.000Z", generation: "1", lineage: `sha256:${"c".repeat(64)}`,
  policyDigest: `sha256:${"d".repeat(64)}`, healthVersion: "2", buildDigest: `sha256:${"e".repeat(64)}`,
  readerExpiresAt: "2026-08-13T13:00:00.000Z", decisionDeadline: "2026-08-13T12:00:30.000Z",
};

describe("public catalog decision lease", () => {
  it("installs an immutable exact decision only before its original deadline", () => {
    const leases = createPublicCatalogDecisionLeaseStore();
    const source = { ...decision };
    assert.equal(leases.install(identity, source, new Date("2026-08-13T12:00:29.999Z")), true);
    (source as { generation: string }).generation = "changed";
    const hit = leases.get(identity, decision, new Date("2026-08-13T12:00:29.999Z"));
    assert.deepEqual(hit, decision);
    assert.equal(Object.isFrozen(hit), true);
    assert.throws(() => { (hit as { generation: string }).generation = "changed"; });
    assert.equal(leases.get(identity, decision, new Date("2026-08-13T12:00:30.000Z")), null);
    assert.equal(leases.install(identity, decision, new Date("2026-08-13T12:00:30.000Z")), false);
  });

  it("does not slide valid leases but replaces expired leases after fresh successful installation", () => {
    const leases = createPublicCatalogDecisionLeaseStore();
    const before = new Date("2026-08-13T12:00:00.000Z");
    leases.install(identity, decision, before);
    const retry = { ...decision, decisionDeadline: "2026-08-13T12:00:29.000Z" };
    leases.install(identity, retry, before);
    assert.equal(leases.get(identity, decision, new Date("2026-08-13T12:00:29.500Z"))?.decisionDeadline, decision.decisionDeadline);

    const fresh = { ...decision, decisionDeadline: "2026-08-13T12:01:01.000Z" };
    const expired = new Date("2026-08-13T12:00:31.000Z");
    assert.equal(leases.install(identity, decision, expired), false);
    assert.equal(leases.install(identity, fresh, expired), true);
    assert.equal(leases.get(identity, fresh, expired)?.decisionDeadline, fresh.decisionDeadline);
    leases.evict(identity);
    assert.equal(leases.get(identity, fresh, before), null);
  });

  it("rejects malformed identities without creating entries", () => {
    const leases = createPublicCatalogDecisionLeaseStore();
    assert.equal(leases.install({ ...identity, deploymentId: "" }, decision, new Date("2026-08-13T12:00:00.000Z")), false);
    assert.equal(leases.get({ ...identity, deploymentId: "" }, decision, new Date("2026-08-13T12:00:00.000Z")), null);
  });
});
