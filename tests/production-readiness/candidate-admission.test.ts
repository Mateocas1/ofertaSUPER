import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCandidateAdmissionRepository,
  type CandidateAdmissionSql,
} from "../../src/lib/production-readiness/candidate-admission";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;

function sql(rows: Record<string, unknown>[]): CandidateAdmissionSql {
  return { execute: async () => ({ rows }) };
}

describe("durable candidate technical admission", () => {
  it("resolves only a server-loaded eligible admission by opaque identifier", async () => {
    const repository = createCandidateAdmissionRepository(sql([{
      candidate_admission_id: "candidate-admission-1",
      candidate_manifest_bytes: '{"version":"authority-candidate/v1"}',
      candidate_manifest_digest: digest("a"),
      candidate_version: "authority-candidate/v1",
      verification_id: "verification-1",
      verification_result: "PASS",
      verification_evidence_bytes: "evidence",
      verification_evidence_digest: digest("b"),
      verifier_id: "verifier-1",
      verifier_class: "independent",
      verified_at: "2030-01-01T00:00:00.000Z",
      deadline_at: "2030-01-01T01:00:00.000Z",
      expires_at: "2030-01-01T02:00:00.000Z",
    }]));

    const admission = await repository.resolveEligibleAdmission("candidate-admission-1");

    assert.deepEqual(admission, {
      candidateAdmissionId: "candidate-admission-1",
      candidateManifestBytes: '{"version":"authority-candidate/v1"}',
      candidateManifestDigest: digest("a"),
      candidateVersion: "authority-candidate/v1",
      verificationId: "verification-1",
      verificationResult: "PASS",
      verificationEvidenceBytes: "evidence",
      verificationEvidenceDigest: digest("b"),
      verifierId: "verifier-1",
      verifierClass: "independent",
      verifiedAt: new Date("2030-01-01T00:00:00.000Z"),
      deadlineAt: new Date("2030-01-01T01:00:00.000Z"),
      expiresAt: new Date("2030-01-01T02:00:00.000Z"),
    });
  });

  it("does not accept browser facts when no exact eligible admission is found", async () => {
    const repository = createCandidateAdmissionRepository(sql([]));

    await assert.rejects(repository.resolveEligibleAdmission("candidate-admission-1"), /eligible candidate admission/);
  });
});
