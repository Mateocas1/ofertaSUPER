import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parsePublicCatalogServingIdentity,
  resolvePublicCatalogAuthority,
  type PublicCatalogAuthorityRecord,
} from "../src/lib/public-catalog-authority";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const identity = {
  version: 1,
  target: "production",
  publicationId: "publication-1",
  deploymentId: "deployment-1",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
} as const;

function authority(): PublicCatalogAuthorityRecord {
  return {
    id: identity.publicationId,
    target: identity.target,
    state: "PROMOTED",
    verified_at: new Date("2026-08-13T11:00:00.000Z"),
    promotion_id: "promotion-1",
    promotion: {
      id: "promotion-1",
      state: "PROMOTED",
      deployment_id: identity.deploymentId,
      commit_sha: identity.commitSha,
      candidate_digest: identity.candidateDigest,
      expires_at: new Date("2026-08-13T13:00:00.000Z"),
    },
  };
}

async function resolve(record: unknown, input: unknown = identity) {
  return resolvePublicCatalogAuthority(
    input,
    async () => record as PublicCatalogAuthorityRecord | null,
    NOW,
  );
}

describe("public catalog authority", () => {
  it("returns a minimal fingerprint after one exact publication lookup", async () => {
    const requestedIds: string[] = [];
    const result = await resolvePublicCatalogAuthority(
      identity,
      async (publicationId) => {
        requestedIds.push(publicationId);
        return authority();
      },
      NOW,
    );

    assert.deepEqual(requestedIds, [identity.publicationId]);
    assert.deepEqual(result, {
      publicationId: "publication-1",
      promotionId: "promotion-1",
      target: "production",
      deploymentId: identity.deploymentId,
      commitSha: identity.commitSha,
      candidateDigest: identity.candidateDigest,
      verifiedAt: "2026-08-13T11:00:00.000Z",
      expiresAt: "2026-08-13T13:00:00.000Z",
    });
  });

  it("rejects invalid or missing supplied identity without consulting authority", async () => {
    const invalidIdentities = [
      null, {}, { ...identity, version: 2 }, { ...identity, publicationId: "" }, { ...identity, deploymentId: "" },
      { ...identity, publicationId: " " }, { ...identity, deploymentId: " " },
      { ...identity, publicationId: 1 }, { ...identity, deploymentId: 1 },
      { ...identity, commitSha: "bad" }, { ...identity, candidateDigest: "bad" },
    ];
    for (const input of invalidIdentities) {
      let calls = 0;
      assert.equal(await resolvePublicCatalogAuthority(input, async () => { calls += 1; return authority(); }, NOW), null);
      assert.equal(calls, 0);
    }
    assert.equal(parsePublicCatalogServingIdentity(identity)?.publicationId, identity.publicationId);
  });

  it("rejects non-exact or non-promoted authority tuples", async () => {
    const cases: Array<[string, (record: PublicCatalogAuthorityRecord) => void]> = [
      ["publication ID", (record) => { record.id = "other"; }],
      ["linked promotion ID", (record) => { record.promotion.id = "other"; }],
      ["target", (record) => { record.target = "staging"; }],
      ["deployment", (record) => { record.promotion.deployment_id = "other"; }],
      ["commit", (record) => { record.promotion.commit_sha = "c".repeat(40); }],
      ["digest", (record) => { record.promotion.candidate_digest = `sha256:${"d".repeat(64)}`; }],
      ["publication state", (record) => { record.state = "PENDING"; }],
      ["promotion state", (record) => { record.promotion.state = "PENDING"; }],
    ];
    for (const [, change] of cases) {
      const record = authority();
      change(record);
      assert.equal(await resolve(record), null);
    }
  });

  it("rejects malformed runtime promotion IDs", async () => {
    const cases: Array<[string, (record: { promotion_id?: unknown; promotion: { id?: unknown } }) => void]> = [
      ["both missing", (record) => { delete record.promotion_id; delete record.promotion.id; }],
      ["publication missing", (record) => { delete record.promotion_id; }],
      ["promotion missing", (record) => { delete record.promotion.id; }],
      ["empty", (record) => { record.promotion_id = record.promotion.id = ""; }],
      ["whitespace", (record) => { record.promotion_id = record.promotion.id = " "; }],
      ["non-string", (record) => { record.promotion_id = record.promotion.id = 1; }],
    ];
    for (const [, change] of cases) {
      const record = authority() as unknown as { promotion_id?: unknown; promotion: { id?: unknown } };
      change(record);
      assert.equal(await resolve(record), null);
    }
  });

  it("rejects malformed dates and unavailable authority", async () => {
    const cases: Array<(record: PublicCatalogAuthorityRecord) => void> = [
      (record) => { record.verified_at = null; },
      (record) => { record.verified_at = "invalid"; },
      (record) => { record.verified_at = new Date("2026-08-13T12:00:00.001Z"); },
      (record) => { record.promotion.expires_at = "invalid"; },
      (record) => { record.promotion.expires_at = new Date("2026-08-13T12:00:00.000Z"); },
    ];
    for (const change of cases) {
      const record = authority();
      change(record);
      assert.equal(await resolve(record), null);
    }
    assert.equal(await resolve(null), null);
    assert.equal(await resolve({}), null);
    assert.equal(await resolvePublicCatalogAuthority(identity, async () => { throw new Error("down"); }, NOW), null);
  });
});
