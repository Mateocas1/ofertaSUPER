import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { createApprovalService, type ApprovalRepository } from "../../src/lib/production-readiness/approval";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const manifest = JSON.stringify({ version: "authority-candidate/v1", release: { releaseId: "release-1", deploymentId: "deployment-1", fullSha: "a".repeat(40), domain: "catalog.example.test", target: "production", scope: "catalog:ar", expiresAt: "2030-01-01T00:00:00.000Z" }, policy: { digest: digest("c"), permittedMutations: ["offer.price"], bytes: JSON.stringify({ version: "refresh-policy/v1", source: "vea", maximumSourceAgeMs: 60000 }) }, baseline: { dataDigest: digest("d"), coverage: { unit: "source-ean", expectedUniverse: "100", observedCount: "95" }, watermarks: { vea: "2026-06-01T00:00:00.000Z" }, provenance: { degradation: "partial source coverage" } } });
const principal = { userId: "user-1", sessionId: "session-1" };

function repository(grantExpiresAt: Date | (() => Date) = new Date("2031-01-01")): ApprovalRepository {
  const challenges = new Map<string, Parameters<ApprovalRepository["createChallenge"]>[0]>();
  const receipts = new Map<string, Awaited<ReturnType<ApprovalRepository["saveReceipt"]>>>();
  return {
    resolveAdmission: async (id) => ({ candidateAdmissionId: id, candidateManifestBytes: manifest, candidateManifestDigest: digest("b"), verificationId: "verification-1", expiresAt: new Date("2030-01-01"), deadlineAt: new Date("2030-01-01") }),
    findGrant: async () => ({ userId: "user-1", action: "approve", scope: "catalog:ar", target: "production", policyDigest: digest("c"), expiresAt: typeof grantExpiresAt === "function" ? grantExpiresAt() : grantExpiresAt }),
    createChallenge: async (challenge) => { challenges.set(challenge.id, challenge); },
    findChallenge: async (id) => challenges.get(id) ?? null,
    consumeChallenge: async (id) => { const value = challenges.get(id); if (!value?.consumedAt) { if (value) value.consumedAt = new Date(); return value ?? null; } return null; },
    findReceipt: async (id) => receipts.get(id) ?? null,
    saveReceipt: async ({ challengeId: _challengeId, ...receipt }) => { const existing = receipts.get(receipt.idempotencyKey); if (existing && existing.requestDigest !== receipt.requestDigest) throw new Error("idempotency conflict"); receipts.set(receipt.idempotencyKey, existing ?? receipt); return existing ?? receipt; },
  };
}

describe("catalog authority approval", () => {
  it("prepares only from an opaque server-owned candidate admission", async () => {
    const service = createApprovalService(repository());
    const prepared = await service.prepare(principal, "candidate-admission-1");
    assert.equal(prepared.reviewed.candidateAdmissionId, "candidate-admission-1");
    assert.equal(prepared.reviewed.fullSha, "a".repeat(40));
    assert.deepEqual(prepared.reviewed.coverage, { unit: "source-ean", expectedUniverse: "100", observedCount: "95" });
    assert.deepEqual(prepared.reviewed.sourceAges, { vea: "2026-06-01T00:00:00.000Z" });
    assert.deepEqual(prepared.reviewed.degradation, { degradation: "partial source coverage" });
    assert.equal(prepared.reviewed.verificationResult, "PASS");
    assert.deepEqual(prepared.reviewed.policyDetails, { version: "refresh-policy/v1", source: "vea", maximumSourceAgeMs: 60000 });
  });

  it("renders the complete reviewed consent contract before the approval control", async () => {
    const page = await readFile(new URL("../../src/app/admin/catalog-authority/[operationId]/page.tsx", import.meta.url), "utf8");
    for (const label of ["Coverage gaps", "Source ages / degradation", "Verification result", "Revocation boundary", "Retention boundary", "Policy details"]) assert.match(page, new RegExp(label));
    assert.ok(page.indexOf("Coverage gaps") < page.indexOf("I explicitly approve this exact authority"));
  });

  it("keeps approval and revocation consent ingress outside the app role", async () => {
    const grants = await readFile(new URL("../../docker/compose/app-grants.sql", import.meta.url), "utf8");
    assert.match(grants, /REVOKE EXECUTE ON FUNCTION public\.create_approval_challenge[\s\S]*public\.prepare_authority_revoke_consent[\s\S]* FROM PUBLIC, ofertasuper_app/);
    assert.match(grants, /GRANT EXECUTE ON FUNCTION public\.create_approval_challenge[\s\S]*public\.prepare_authority_revoke_consent[\s\S]* TO ofertasuper_authority/);
  });

  it("rejects anonymous actors and missing Fetch Metadata before approval", async () => {
    const service = createApprovalService(repository());
    await assert.rejects(service.prepare(null, "candidate-admission-1"), /authenticated Clerk session/);
    const prepared = await service.prepare(principal, "candidate-admission-1");
    await assert.rejects(service.approve(principal, { origin: "https://catalog.example.test", fetchSite: null, csrfToken: prepared.csrfToken, challengeId: prepared.id, nonce: prepared.nonce, idempotencyKey: "key-1", consent: true }), /origin/);
  });

  it("recovers an exact idempotency retry without reusing consent", async () => {
    const service = createApprovalService(repository());
    const prepared = await service.prepare(principal, "candidate-admission-1");
    const input = { origin: "https://catalog.example.test", fetchSite: "same-origin" as const, csrfToken: prepared.csrfToken, challengeId: prepared.id, nonce: prepared.nonce, idempotencyKey: "key-1", consent: true as const };
    const receipt = await service.approve(principal, input);
    assert.equal((await service.approve(principal, input)).approvedAt, receipt.approvedAt);
  });

  it("caps challenge and receipt validity at the approving grant's original expiry", async () => {
    const grantExpiresAt = new Date("2026-01-01T00:05:00.000Z");
    const service = createApprovalService(repository(grantExpiresAt), () => new Date("2026-01-01T00:00:00.000Z"));
    const prepared = await service.prepare(principal, "candidate-admission-1");
    const input = { origin: "https://catalog.example.test", fetchSite: "same-origin" as const, csrfToken: prepared.csrfToken, challengeId: prepared.id, nonce: prepared.nonce, idempotencyKey: "grant-bound", consent: true as const };
    const receipt = await service.approve(principal, input);
    assert.equal(prepared.expiresAt, grantExpiresAt.toISOString());
    assert.equal(receipt.grantExpiresAt.toISOString(), grantExpiresAt.toISOString());
    assert.equal((await service.approve(principal, input)).grantExpiresAt.toISOString(), grantExpiresAt.toISOString());
  });

  it("conflicts when an idempotency retry changes the approving grant expiry binding", async () => {
    let grantExpiresAt = new Date("2031-01-01T00:00:00.000Z");
    const service = createApprovalService(repository(() => grantExpiresAt));
    const prepared = await service.prepare(principal, "candidate-admission-1");
    const input = { origin: "https://catalog.example.test", fetchSite: "same-origin" as const, csrfToken: prepared.csrfToken, challengeId: prepared.id, nonce: prepared.nonce, idempotencyKey: "grant-binding-conflict", consent: true as const };
    await service.approve(principal, input);
    grantExpiresAt = new Date("2032-01-01T00:00:00.000Z");
    await assert.rejects(service.approve(principal, input), /idempotency conflict/);
  });

  it("binds consent to session, nonce, and exact idempotency request", async () => {
    const service = createApprovalService(repository());
    const prepared = await service.prepare(principal, "candidate-admission-1");
    await assert.rejects(service.approve({ ...principal, sessionId: "other" }, { origin: "https://catalog.example.test", fetchSite: "same-origin", csrfToken: prepared.csrfToken, challengeId: prepared.id, nonce: prepared.nonce, idempotencyKey: "key-1", consent: true }), /challenge/);
    const fresh = await service.prepare(principal, "candidate-admission-1");
    const receipt = await service.approve(principal, { origin: "https://catalog.example.test", fetchSite: "same-origin", csrfToken: fresh.csrfToken, challengeId: fresh.id, nonce: fresh.nonce, idempotencyKey: "key-2", consent: true });
    assert.equal(receipt.actorId, principal.userId);
  });
});
