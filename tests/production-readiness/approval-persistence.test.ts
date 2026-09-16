import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { createApprovalService, type ApprovalRepository } from "../../src/lib/production-readiness/approval";
import { createPublicationApprovalRepository } from "../../src/lib/production-readiness/publication-access";

describe("durable publication approval persistence", () => {
  it("requires a typed repository contract for grants, one-use challenges, and exact receipt recovery", () => {
    const repository = createPublicationApprovalRepository({ execute: async () => ({ rows: [] }) });

    assert.equal(typeof repository.findGrant, "function");
    assert.equal(typeof repository.createChallenge, "function");
    assert.equal(typeof repository.consumeChallenge, "function");
    assert.equal(typeof repository.findReceipt, "function");
    assert.equal(typeof repository.saveReceipt, "function");
  });

  it("keeps approval persistence unreachable from authority and publication effects", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../../src/lib/production-readiness/publication-access.ts", import.meta.url), "utf8"),
    );

    assert.doesNotMatch(source, /activate_authority|promote_delta|publish|reserve/i);
  });

  it("delegates grant-bound challenge construction to a guarded server procedure", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const repository = createPublicationApprovalRepository({
      execute: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    });

    await repository.createChallenge({
      candidateAdmissionId: "candidate-admission-1",
      id: "challenge-1",
      nonceHash: "nonce-hash",
      csrfHash: "csrf-hash",
      userId: "user-1",
      sessionId: "session-1",
      requestDigest: "request-digest",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      grantExpiresAt: new Date("2026-01-01T00:05:00.000Z"),
    });

    assert.match(calls[0].sql, /create_approval_challenge/);
    assert.equal(calls[0].values[0], "candidate-admission-1");
    assert.equal(calls[0].values[8] instanceof Date, true);
    assert.doesNotMatch(calls[0].sql, /INSERT INTO public\.approval_challenges/);
  });

  it("preserves millisecond expiry bindings returned by Prisma", async () => {
    const expiry = new Date("2030-01-01T00:00:00.123Z"), calls: Array<{ sql: string; values: unknown[] }> = [];
    const repository = createPublicationApprovalRepository({ execute: async (sql, values) => { calls.push({ sql, values }); return { rows: [{
      user_id: "user-1", scope: "catalog:ar", target: "production", policy_digest: "policy",
      expires_at: expiry, grant_expires_at: expiry, approved_at: expiry,
    }] }; } });
    const grant = await repository.findGrant({ userId: "user-1" }, { scope: "catalog:ar", target: "production", policyDigest: "policy" });
    const receipt = await repository.findReceipt("exact-key", "request-digest", "user-1", expiry);
    assert.equal(grant?.expiresAt.toISOString(), expiry.toISOString());
    assert.equal(receipt?.grantExpiresAt.toISOString(), expiry.toISOString());
    assert.match(calls[1].sql, /idempotency_key = \$1 AND request_digest = \$2 AND actor_id = \$3 AND grant_expires_at = \$4/);
    assert.deepEqual(calls[1].values, ["exact-key", "request-digest", "user-1", expiry]);
  });

  it("loads the immutable grant expiry from durable challenge rows", async () => {
    const repository = createPublicationApprovalRepository({
      execute: async () => ({ rows: [{ id: "challenge-1", candidate_admission_id: "candidate-admission-1", nonce_hash: "nonce", csrf_hash: "csrf", user_id: "user-1", session_id: "session-1", request_digest: "request", expires_at: "2030-01-01T00:00:00.000Z", grant_expires_at: "2026-01-01T00:05:00.000Z", consumed_at: null }] }),
    });

    const challenge = await repository.findChallenge("challenge-1");
    assert.equal(challenge?.grantExpiresAt.toISOString(), "2026-01-01T00:05:00.000Z");
  });

  it("recovers receipts only for the exact immutable challenge proof", async () => {
    const hash = (value: string) => createHash("sha256").update(value).digest("hex"), expiry = new Date("2030-01-01"), receipts = new Map<string, { idempotencyKey: string; requestDigest: string; actorId: string; approvedAt: Date; grantExpiresAt: Date }>();
    let challenge: Parameters<ApprovalRepository["createChallenge"]>[0] | undefined;
    const repository: ApprovalRepository = {
      resolveAdmission: async (id) => ({ candidateAdmissionId: id, candidateManifestBytes: JSON.stringify({ release: { releaseId: "r", deploymentId: "d", fullSha: "a", domain: "catalog.example.test", target: "production", scope: "catalog:ar", expiresAt: expiry.toISOString() }, policy: { digest: "policy", bytes: JSON.stringify({ version: "refresh-policy/v1" }) }, baseline: { dataDigest: "baseline", coverage: { unit: "source-ean", expectedUniverse: "1", observedCount: "1" }, watermarks: { source: "2026-01-01T00:00:00.000Z" }, provenance: { coverage: "complete" } } }), candidateManifestDigest: "manifest", verificationId: "verification", expiresAt: expiry, deadlineAt: expiry }),
      findGrant: async (principal) => ({ userId: principal.userId, action: "approve", scope: "catalog:ar", target: "production", policyDigest: "policy", expiresAt: expiry }),
      createChallenge: async (value) => { challenge = value; }, findChallenge: async () => challenge ?? null,
      consumeChallenge: async () => { if (!challenge || challenge.consumedAt) return null; challenge.consumedAt = new Date(); return challenge; },
      findReceipt: async (key) => receipts.get(key) ?? null,
      saveReceipt: async ({ challengeId: _challengeId, ...value }) => { receipts.set(value.idempotencyKey, value); return value; },
    };
    const service = createApprovalService(repository), principal = { userId: "user-1", sessionId: "session-1" }, prepared = await service.prepare(principal, "candidate");
    const input = { origin: "https://catalog.example.test", fetchSite: "same-origin" as const, csrfToken: prepared.csrfToken, challengeId: prepared.id, nonce: prepared.nonce, idempotencyKey: "key", consent: true as const };
    await service.approve(principal, input);
    await assert.rejects(service.approve({ ...principal, sessionId: "other" }, input), /challenge|conflict/);
    await assert.rejects(service.approve(principal, { ...input, csrfToken: `${prepared.csrfToken}changed` }), /challenge|conflict/);
    assert.equal((await service.approve(principal, input)).actorId, principal.userId);
    assert.equal(challenge?.nonceHash, hash(prepared.nonce));
  });
});
