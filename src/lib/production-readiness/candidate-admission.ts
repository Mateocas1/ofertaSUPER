export type SqlRow = Record<string, unknown>;
export type CandidateAdmissionSql = {
  execute(sql: string, values: unknown[]): Promise<{ rows: SqlRow[] }>;
};

export type CandidateAdmission = {
  candidateAdmissionId: string;
  candidateManifestBytes: string;
  candidateManifestDigest: string;
  candidateVersion: "authority-candidate/v1";
  verificationId: string;
  verificationResult: "PASS";
  verificationEvidenceBytes: string;
  verificationEvidenceDigest: string;
  verifierId: string;
  verifierClass: string;
  verifiedAt: Date;
  deadlineAt: Date;
  expiresAt: Date;
};

export function createCandidateAdmissionRepository(sql: CandidateAdmissionSql) {
  return {
    async resolveEligibleAdmission(candidateAdmissionId: string): Promise<CandidateAdmission> {
      if (!candidateAdmissionId?.trim()) throw new Error("candidate admission ID is required");
      const result = await sql.execute(
        "SELECT * FROM public.resolve_eligible_candidate_admission($1)",
        [candidateAdmissionId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("eligible candidate admission is required");
      return {
        candidateAdmissionId: String(row.candidate_admission_id),
        candidateManifestBytes: String(row.candidate_manifest_bytes),
        candidateManifestDigest: String(row.candidate_manifest_digest),
        candidateVersion: "authority-candidate/v1",
        verificationId: String(row.verification_id),
        verificationResult: "PASS",
        verificationEvidenceBytes: String(row.verification_evidence_bytes),
        verificationEvidenceDigest: String(row.verification_evidence_digest),
        verifierId: String(row.verifier_id),
        verifierClass: String(row.verifier_class),
        verifiedAt: requiredDate(row.verified_at, "verification time"),
        deadlineAt: requiredDate(row.deadline_at, "verification deadline"),
        expiresAt: requiredDate(row.expires_at, "candidate expiry"),
      };
    },
  };
}

function requiredDate(value: unknown, label: string) {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} is invalid`);
  return parsed;
}
