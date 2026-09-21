"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Reviewed = { candidateAdmissionId: string; releaseId: string; deploymentId: string; fullSha: string; domain: string; target: string; scope: string; expiresAt: string; candidateDigest: string; policyDigest: string; baselineDigest: string; technicalVerificationId: string; allowedMutations: string[]; coverage: { unit: string; expectedUniverse: string; observedCount: string }; sourceAges: Record<string, string>; degradation: Record<string, string>; verificationResult: "PASS"; policyDetails: Record<string, unknown>; revocationBoundary: string; retentionBoundary: string };
type Prepared = { id: string; nonce: string; csrfToken: string; reviewed: Reviewed };

export default function CatalogAuthorityReviewPage() {
  const { operationId } = useParams<{ operationId: string }>();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fetch("/api/admin/catalog-authority/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateAdmissionId: operationId }) }).then(async (response) => response.ok ? setPrepared(await response.json() as Prepared) : setError((await response.json() as { error?: string }).error ?? "Unable to prepare review")); }, [operationId]);
  async function approve() {
    if (!prepared) return;
    const response = await fetch("/api/admin/catalog-authority/approve", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": prepared.csrfToken }, body: JSON.stringify({ challengeId: prepared.id, nonce: prepared.nonce, csrfToken: prepared.csrfToken, idempotencyKey: crypto.randomUUID(), consent: true }) });
    if (!response.ok) setError((await response.json() as { error?: string }).error ?? "Approval rejected");
  }
  if (error) return <p role="alert">{error}</p>;
  if (!prepared) return <p>Loading reviewed authority…</p>;
  const { reviewed } = prepared;
  return <main><h1>Review catalog authority</h1><p>Explicit consent applies only to these server-reviewed bytes.</p><dl><dt>Release</dt><dd>{reviewed.releaseId}</dd><dt>Deployment</dt><dd>{reviewed.deploymentId}</dd><dt>Full SHA</dt><dd>{reviewed.fullSha}</dd><dt>Domain / scope</dt><dd>{reviewed.domain} / {reviewed.scope}</dd><dt>Expiry</dt><dd>{reviewed.expiresAt}</dd><dt>Candidate / policy / baseline</dt><dd>{reviewed.candidateDigest} / {reviewed.policyDigest} / {reviewed.baselineDigest}</dd><dt>Technical verification</dt><dd>{reviewed.technicalVerificationId}</dd><dt>Allowed mutations</dt><dd>{reviewed.allowedMutations.join(", ")}</dd><dt>Coverage gaps</dt><dd>{reviewed.coverage.observedCount} of {reviewed.coverage.expectedUniverse} {reviewed.coverage.unit}</dd><dt>Source ages / degradation</dt><dd>{JSON.stringify({ sourceAges: reviewed.sourceAges, degradation: reviewed.degradation })}</dd><dt>Verification result</dt><dd>{reviewed.verificationResult}</dd><dt>Revocation boundary</dt><dd>{reviewed.revocationBoundary}</dd><dt>Retention boundary</dt><dd>{reviewed.retentionBoundary}</dd><dt>Policy details</dt><dd>{JSON.stringify(reviewed.policyDetails)}</dd></dl><button type="button" onClick={approve}>I explicitly approve this exact authority</button></main>;
}
