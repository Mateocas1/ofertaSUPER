import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createServerPublicCatalogAuthorityResolver,
} from "../src/lib/public-catalog-authority.server";
import type { PublicCatalogAuthorityRecord } from "../src/lib/public-catalog-authority";

const identity = {
  version: 1,
  target: "production",
  publicationId: "publication-1",
  deploymentId: "deployment-1",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
};
const rawIdentity = JSON.stringify(identity);

type PublicationQuery = {
  where: { id: string };
  select: {
    id: true;
    target: true;
    state: true;
    verified_at: true;
    promotion_id: true;
    promotion: {
      select: {
        id: true;
        state: true;
        deployment_id: true;
        commit_sha: true;
        candidate_digest: true;
        expires_at: true;
      };
    };
  };
};

type FindUnique = (query: PublicationQuery) => Promise<PublicCatalogAuthorityRecord | null>;

function authority(): PublicCatalogAuthorityRecord {
  return {
    id: identity.publicationId,
    target: "production",
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

function dependencies(findUnique: FindUnique, now = () => new Date("2026-08-13T12:00:00.000Z")) {
  return {
    database: { productionReadinessPublication: { findUnique } },
    now,
  };
}

describe("server public catalog authority", () => {
  it("queries the exact publication once with the full authority selection", async () => {
    const queries: PublicationQuery[] = [];
    const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(async (query) => {
      queries.push(query);
      return authority();
    }));

    assert.deepEqual(await resolve(), {
      publicationId: identity.publicationId,
      promotionId: "promotion-1",
      target: "production",
      deploymentId: identity.deploymentId,
      commitSha: identity.commitSha,
      candidateDigest: identity.candidateDigest,
      verifiedAt: "2026-08-13T11:00:00.000Z",
      expiresAt: "2026-08-13T13:00:00.000Z",
    });
    assert.deepEqual(queries, [{
      where: { id: identity.publicationId },
      select: {
        id: true, target: true, state: true, verified_at: true, promotion_id: true,
        promotion: { select: {
          id: true, state: true, deployment_id: true, commit_sha: true,
          candidate_digest: true, expires_at: true,
        } },
      },
    }]);
  });

  it("rejects missing, invalid JSON, and invalid identities without a query", async () => {
    for (const raw of [undefined, null, "", "{", JSON.stringify({ ...identity, version: 2 })]) {
      let calls = 0;
      const resolve = createServerPublicCatalogAuthorityResolver(raw, dependencies(async () => {
        calls += 1;
        return authority();
      }));
      assert.equal(await resolve(), null);
      assert.equal(calls, 0);
    }
  });

  it("does not query when the injected clock is invalid or throws", async () => {
    for (const now of [() => new Date("invalid"), () => { throw new Error("clock unavailable"); }]) {
      let calls = 0;
      const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(async () => {
        calls += 1;
        return authority();
      }, now));
      assert.equal(await resolve(), null);
      assert.equal(calls, 0);
    }
  });

  it("binds identity at creation while evaluating its clock for each resolution", async () => {
    const times = [new Date("2026-08-13T12:00:00.000Z"), new Date("2026-08-13T13:00:00.000Z")];
    let calls = 0;
    const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(async () => {
      calls += 1;
      return authority();
    }, () => times.shift()!));

    assert.equal((await resolve())?.publicationId, identity.publicationId);
    assert.equal(await resolve(), null);
    assert.equal(calls, 2);
  });

  it("returns null for absent, revoked, or failed exact queries without fallback", async () => {
    const unavailable: FindUnique[] = [
      async () => null,
      async () => ({ ...authority(), state: "REVOKED" }),
      async () => { throw new Error("database unavailable"); },
    ];
    for (const findUnique of unavailable) {
      let calls = 0;
      const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(async (query) => {
        calls += 1;
        return findUnique(query);
      }));
      assert.equal(await resolve(), null);
      assert.equal(calls, 1);
    }
  });
});
