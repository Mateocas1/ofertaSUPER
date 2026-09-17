import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createServerPublicCatalogAuthorityOutcomeResolver,
  createServerPublicCatalogAuthorityResolver,
} from "../src/lib/public-catalog-authority.server";
import type { PublicCatalogAuthorityRecord, PublicCatalogReaderEligibility } from "../src/lib/public-catalog-authority";

const identity = {
  version: 1,
  target: "production",
  publicationId: "publication-1",
  deploymentId: "deployment-1",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
};
const rawIdentity = JSON.stringify(identity);
const readerEligibility: PublicCatalogReaderEligibility = {
  readerId: identity.deploymentId,
  generation: "1",
  lineage: `sha256:${"c".repeat(64)}`,
  policyDigest: `sha256:${"d".repeat(64)}`,
  healthVersion: "2",
  buildDigest: `sha256:${"e".repeat(64)}`,
  expiresAt: new Date("2026-08-13T13:00:00.000Z"),
};

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
type QueryRaw = <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;

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

function dependencies(
  findUnique: FindUnique,
  trustedClock = async () => new Date("2026-08-13T12:00:00.000Z"),
  queryRaw: QueryRaw = async () => [readerEligibility] as never,
) {
  return {
    database: { productionReadinessPublication: { findUnique }, $queryRaw: queryRaw },
    trustedClock,
  };
}

describe("server public catalog authority", () => {
  it("queries the exact publication once with the full authority selection", async () => {
    const queries: PublicationQuery[] = [];
    const readerQueries: Array<{ query: TemplateStringsArray; values: unknown[] }> = [];
    const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(
      async (query) => {
        queries.push(query);
        return authority();
      },
      undefined,
      async (query, ...values) => {
        readerQueries.push({ query, values });
        return [readerEligibility] as never;
      },
    ));

    assert.deepEqual(await resolve(), {
      publicationId: identity.publicationId,
      promotionId: "promotion-1",
      target: "production",
      deploymentId: identity.deploymentId,
      commitSha: identity.commitSha,
      candidateDigest: identity.candidateDigest,
      verifiedAt: "2026-08-13T11:00:00.000Z",
      expiresAt: "2026-08-13T13:00:00.000Z",
      generation: "1",
      lineage: `sha256:${"c".repeat(64)}`,
      policyDigest: `sha256:${"d".repeat(64)}`,
      healthVersion: "2",
      buildDigest: `sha256:${"e".repeat(64)}`,
      readerExpiresAt: "2026-08-13T13:00:00.000Z",
      decisionDeadline: "2026-08-13T12:00:30.000Z",
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
    assert.deepEqual(readerQueries[0]?.values, [
      identity.deploymentId, new Date("2026-08-13T12:00:00.000Z"), identity.publicationId, new Date("2026-08-13T12:00:00.000Z"),
    ]);
    const readerQuery = readerQueries[0]?.query.join("?") ?? "";
    for (const clause of [
      "reader.surface = 'catalog'", "reader.generation = publisher.generation",
      "catalog.authority_adoption->>'policyDigest' = reader.policy_digest",
      "authority_revoke_outcomes", "catalog_restriction_facts", "surface.fact IS NULL OR surface.surface = 'catalog'",
      "publisher.generation = 0", "baseline.root_digest = publisher.lineage",
      "authority.proof->'adoption'->>'incarnation' = publisher.incarnation::text",
      "publisher.generation > 0", "record.id = publisher.generation_record_id",
      "sealed_generation_manifests", "manifest.publication_id = publisher.publication_id",
      "generation_promotion_operations", "operation.outcome->>'expiresAt'", "record.policy_digest = publisher.policy_digest",
    ]) assert.match(readerQuery, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("fails closed for missing, stale, revoked, or restricted reader eligibility", async () => {
    for (const status of ["missing", "stale", "revoked", "restricted"] as const) {
      let readerQueries = 0;
      const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(
        async () => authority(),
        undefined,
        async () => {
          readerQueries += 1;
          return [] as never;
        },
      ));
      assert.equal(await resolve(), null, status);
      assert.equal(readerQueries, 1, status);
    }
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

  it("does not query when the injected trusted clock is invalid or throws", async () => {
    for (const trustedClock of [async () => new Date("invalid"), async () => { throw new Error("clock unavailable"); }]) {
      let calls = 0;
      const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(async () => {
        calls += 1;
        return authority();
      }, trustedClock));
      assert.equal(await resolve(), null);
      assert.equal(calls, 0);
    }
  });

  it("binds identity at creation while evaluating its trusted clock for each resolution", async () => {
    const times = [new Date("2026-08-13T12:00:00.000Z"), new Date("2026-08-13T13:00:00.000Z")];
    let calls = 0;
    const resolve = createServerPublicCatalogAuthorityResolver(rawIdentity, dependencies(async () => {
      calls += 1;
      return authority();
    }, async () => times.shift()!));

    assert.equal((await resolve())?.publicationId, identity.publicationId);
    assert.equal(await resolve(), null);
    assert.equal(calls, 2);
  });

  it("distinguishes confirmed ineligibility from database unavailability internally", async () => {
    assert.deepEqual(await createServerPublicCatalogAuthorityOutcomeResolver(rawIdentity, dependencies(async () => null))(), { status: "ineligible" });
    assert.deepEqual(await createServerPublicCatalogAuthorityOutcomeResolver(rawIdentity, dependencies(async () => { throw new Error("down"); }))(), { status: "unavailable" });
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
