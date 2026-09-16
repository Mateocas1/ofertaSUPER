import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type ClerkPrincipal = { userId: string; sessionId: string };
export type ReviewedAuthority = {
  candidateAdmissionId: string; releaseId: string; deploymentId: string; fullSha: string;
  domain: string; target: string; scope: string; expiresAt: string; candidateDigest: string;
  policyDigest: string; baselineDigest: string; technicalVerificationId: string; allowedMutations: string[];
  coverage: { unit: string; expectedUniverse: string; observedCount: string }; sourceAges: Record<string, string>;
  degradation: Record<string, string>; verificationResult: "PASS"; policyDetails: Record<string, unknown>;
  revocationBoundary: string; retentionBoundary: string;
};
type Grant = { userId: string; action: "approve"; scope: string; target: string; policyDigest: string; expiresAt: Date };
type Admission = { candidateAdmissionId: string; candidateManifestBytes: string; candidateManifestDigest: string; verificationId: string; expiresAt: Date; deadlineAt: Date };
type Challenge = { id: string; candidateAdmissionId: string; nonceHash: string; csrfHash: string; userId: string; sessionId: string; requestDigest: string; expiresAt: Date; grantExpiresAt: Date; consumedAt?: Date };
type Receipt = { idempotencyKey: string; requestDigest: string; actorId: string; approvedAt: Date; grantExpiresAt: Date };
export type ApprovalRepository = {
  resolveAdmission(candidateAdmissionId: string): Promise<Admission>;
  findGrant(principal: ClerkPrincipal, request: ReviewedAuthority): Promise<Grant | null>;
  createChallenge(challenge: Challenge): Promise<void>;
  findChallenge(id: string): Promise<Challenge | null>;
  consumeChallenge(id: string): Promise<Challenge | null>;
  findReceipt?(idempotencyKey: string, requestDigest: string, actorId: string, grantExpiresAt: Date): Promise<Receipt | null>;
  saveReceipt(receipt: Receipt & { challengeId: string }): Promise<Receipt>;
};
type ApprovalInput = { origin: string; fetchSite: string | null; csrfToken: string; challengeId: string; nonce: string; idempotencyKey: string; consent: true };

export function createApprovalService(repository: ApprovalRepository, now = () => new Date()) {
  async function admission(id: string) {
    const value = await repository.resolveAdmission(id);
    return { value, reviewed: reviewedAuthority(value) };
  }
  async function authorize(principal: ClerkPrincipal | null, reviewed: ReviewedAuthority) {
    return authorizeApproval(repository, now, principal, reviewed);
  }
  return {
    async prepare(principal: ClerkPrincipal | null, candidateAdmissionId: string) {
      const { value, reviewed } = await admission(candidateAdmissionId);
      const authorized = await authorize(principal, reviewed);
      const nonce = randomBytes(32).toString("base64url"), csrfToken = randomBytes(32).toString("base64url");
      const nonceHash = digest(nonce), csrfHash = digest(csrfToken);
      const requestDigest = approvalRequestDigest(value, authorized.grant, authorized.principal, nonceHash, csrfHash);
      const challenge = { id: randomBytes(16).toString("hex"), candidateAdmissionId: value.candidateAdmissionId, nonceHash, csrfHash, userId: authorized.principal.userId, sessionId: authorized.principal.sessionId, requestDigest, expiresAt: new Date(Math.min(value.expiresAt.valueOf(), value.deadlineAt.valueOf(), authorized.grant.expiresAt.valueOf(), now().valueOf() + 10 * 60_000)), grantExpiresAt: authorized.grant.expiresAt };
      await repository.createChallenge(challenge);
      return { id: challenge.id, nonce, csrfToken, expiresAt: challenge.expiresAt.toISOString(), reviewed };
    },
    async approve(principal: ClerkPrincipal | null, input: ApprovalInput) {
      assertApprovalInput(input);
      const requested = await repository.findChallenge(input.challengeId);
      assertRequestedChallenge(requested, now());
      const { value, reviewed } = await admission(requested.candidateAdmissionId);
      assertApprovalOrigin(input, reviewed);
      const authorized = await authorize(principal, reviewed);
      const requestDigest = approvalRequestDigest(value, authorized.grant, authorized.principal, requested.nonceHash, requested.csrfHash);
      assertChallengeBinding(requested, authorized, requestDigest, input);
      return completeApproval(repository, now, input, authorized, requestDigest);
    },
  };
}

type ReviewedManifest = { release?: Record<string, string>; policy?: { digest?: string; permittedMutations?: string[]; bytes?: string }; baseline?: { dataDigest?: string; coverage?: { unit?: string; expectedUniverse?: string; observedCount?: string }; watermarks?: Record<string, string>; provenance?: Record<string, string> } };

type AuthorizedApproval = { principal: ClerkPrincipal; grant: Grant };

function reviewedAuthority(value: Admission): ReviewedAuthority {
  const manifest = JSON.parse(value.candidateManifestBytes) as ReviewedManifest;
  const policyDetails = manifest.policy?.bytes ? JSON.parse(manifest.policy.bytes) : undefined;
  const context = reviewedContext(manifest, policyDetails);
  if (!context) throw new Error("complete reviewed consent context required");
  const { release, baseline, policy } = context;
  return {
    candidateAdmissionId: value.candidateAdmissionId, releaseId: release.releaseId, deploymentId: release.deploymentId,
    fullSha: release.fullSha, domain: release.domain, target: release.target, scope: release.scope, expiresAt: release.expiresAt,
    candidateDigest: value.candidateManifestDigest, policyDigest: policy.digest, baselineDigest: baseline.dataDigest,
    technicalVerificationId: value.verificationId, allowedMutations: policy.permittedMutations ?? ["review server-owned policy"],
    coverage: baseline.coverage, sourceAges: baseline.watermarks, degradation: baseline.provenance, verificationResult: "PASS",
    policyDetails: context.policyDetails, revocationBoundary: "Authority revocation only; governed source data remains retained.",
    retentionBoundary: "Evidence is retained for 180 days after its final authority reference expires.",
  };
}

type CompleteReviewedContext = {
  release: Record<string, string> & { releaseId: string; deploymentId: string; fullSha: string; domain: string; target: string; scope: string; expiresAt: string };
  policy: { digest: string; permittedMutations?: string[]; bytes?: string };
  baseline: { dataDigest: string; coverage: { unit: string; expectedUniverse: string; observedCount: string }; watermarks: Record<string, string>; provenance: Record<string, string> };
  policyDetails: Record<string, unknown>;
};

function reviewedContext(manifest: ReviewedManifest, policyDetails: unknown): CompleteReviewedContext | null {
  if (!isPolicyDetails(policyDetails) || !hasCompleteRelease(manifest.release)
    || !hasCompleteBaseline(manifest.baseline) || !hasCompletePolicy(manifest.policy)) return null;
  return { release: manifest.release, baseline: manifest.baseline, policy: manifest.policy, policyDetails };
}

function isPolicyDetails(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasCompleteRelease(release: ReviewedManifest["release"]): release is CompleteReviewedContext["release"] {
  return Boolean(release?.releaseId && release.deploymentId && release.fullSha && release.domain && release.target && release.scope && release.expiresAt);
}

function hasCompleteBaseline(baseline: ReviewedManifest["baseline"]): baseline is CompleteReviewedContext["baseline"] {
  return Boolean(baseline?.dataDigest && baseline.coverage?.unit && baseline.coverage.expectedUniverse && baseline.coverage.observedCount
    && completeTextRecord(baseline.watermarks) && completeTextRecord(baseline.provenance));
}

function hasCompletePolicy(policy: ReviewedManifest["policy"]): policy is CompleteReviewedContext["policy"] {
  return Boolean(policy?.digest);
}

async function authorizeApproval(repository: ApprovalRepository, now: () => Date, principal: ClerkPrincipal | null, reviewed: ReviewedAuthority): Promise<AuthorizedApproval> {
  if (!principal?.userId || !principal.sessionId) throw new Error("authenticated Clerk session required");
  const grant = await repository.findGrant(principal, reviewed);
  assertApprovalGrant(grant, principal, reviewed, now());
  return { principal, grant };
}

function assertApprovalGrant(grant: Grant | null, principal: ClerkPrincipal, reviewed: ReviewedAuthority, now: Date): asserts grant is Grant {
  if (!grant || grant.userId !== principal.userId || grant.action !== "approve" || grant.scope !== reviewed.scope
    || grant.target !== reviewed.target || grant.policyDigest !== reviewed.policyDigest || grant.expiresAt <= now) throw new Error("scoped publication grant required");
}

function assertApprovalInput(input: ApprovalInput) {
  if (!input.fetchSite || input.fetchSite === "cross-site" || !input.csrfToken || !input.idempotencyKey || input.consent !== true) throw new Error("request origin validation failed");
}

function assertRequestedChallenge(challenge: Challenge | null, now: Date): asserts challenge is Challenge {
  if (!challenge || challenge.expiresAt <= now) throw new Error("approval challenge is invalid");
}

function assertApprovalOrigin(input: ApprovalInput, reviewed: ReviewedAuthority) {
  if (input.origin !== `https://${reviewed.domain}`) throw new Error("request origin validation failed");
}

function assertChallengeBinding(challenge: Challenge, authorized: AuthorizedApproval, requestDigest: string, input: ApprovalInput) {
  const valid = challenge.userId === authorized.principal.userId && challenge.sessionId === authorized.principal.sessionId
    && challenge.requestDigest === requestDigest && challenge.grantExpiresAt.valueOf() === authorized.grant.expiresAt.valueOf()
    && same(challenge.nonceHash, digest(input.nonce)) && same(challenge.csrfHash, digest(input.csrfToken));
  if (!valid) throw new Error(challenge.consumedAt ? "idempotency conflict" : "approval challenge is invalid");
}

async function completeApproval(repository: ApprovalRepository, now: () => Date, input: ApprovalInput, authorized: AuthorizedApproval, requestDigest: string) {
  const existing = await repository.findReceipt?.(input.idempotencyKey, requestDigest, authorized.principal.userId, authorized.grant.expiresAt);
  if (existing) return existing;
  const challenge = await repository.consumeChallenge(input.challengeId);
  assertConsumedChallenge(challenge, authorized, requestDigest, input);
  return repository.saveReceipt({ idempotencyKey: input.idempotencyKey, requestDigest, actorId: authorized.principal.userId, approvedAt: now(), grantExpiresAt: challenge.grantExpiresAt, challengeId: challenge.id });
}

function assertConsumedChallenge(challenge: Challenge | null, authorized: AuthorizedApproval, requestDigest: string, input: ApprovalInput): asserts challenge is Challenge {
  if (!challenge || challenge.userId !== authorized.principal.userId || challenge.sessionId !== authorized.principal.sessionId
    || challenge.requestDigest !== requestDigest || challenge.grantExpiresAt.valueOf() !== authorized.grant.expiresAt.valueOf()
    || !same(challenge.nonceHash, digest(input.nonce)) || !same(challenge.csrfHash, digest(input.csrfToken))) throw new Error("approval challenge is invalid");
}

function approvalRequestDigest(admission: Admission, grant: Grant, principal: ClerkPrincipal, nonceHash: string, csrfHash: string) {
  return digest(`${admission.candidateAdmissionId}:${admission.candidateManifestDigest}:${admission.verificationId}:${grant.expiresAt.toISOString()}:${principal.userId}:${principal.sessionId}:${nonceHash}:${csrfHash}`);
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function same(left: string, right: string) { return timingSafeEqual(Buffer.from(left), Buffer.from(right)); }
function completeTextRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) => key.trim().length > 0 && typeof item === "string" && item.trim().length > 0);
}

export type RevokeChallenge = { id: string; reviewed: Record<string, unknown>; expiresAt: string };
export type RevokeReceipt = { idempotencyKey: string; challengeId: string; reviewed: Record<string, unknown>; actorId: string; approvedAt: string; expiresAt: string; grantExpiresAt: string };
export type RevokeConsentRepository = {
  prepare(request: Record<string, unknown>): Promise<RevokeChallenge>;
  confirm(request: Record<string, unknown>): Promise<RevokeReceipt>;
};

function consentProof(nonce: string, csrfToken: string) {
  return { nonceHash: digest(nonce), csrfHash: digest(csrfToken) };
}

/** The caller supplies a freshly authenticated server principal, never browser actor claims. */
export function createAuthorityRevokeConsentService(repository: RevokeConsentRepository) {
  function actor(principal: ClerkPrincipal | null) {
    if (!principal?.userId || !principal.sessionId) throw new Error("authenticated Clerk session required");
    return { actorId: principal.userId, sessionHash: digest(JSON.stringify(principal)) };
  }
  return {
    async prepare(principal: ClerkPrincipal | null, operationId: string, reason: string) {
      const identity = actor(principal);
      if (!reason?.trim() || reason.length > 2000) throw new Error("bounded revoke reason required");
      const nonce = randomBytes(32).toString("base64url"), csrfToken = randomBytes(32).toString("base64url");
      const challenge = await repository.prepare({ ...identity, operationId, reason, id: randomBytes(16).toString("hex"), ...consentProof(nonce, csrfToken) });
      return { ...challenge, nonce, csrfToken };
    },
    async confirm(principal: ClerkPrincipal | null, input: Omit<ApprovalInput, "consent"> & { consent: boolean; reviewed: Record<string, unknown> }) {
      const identity = actor(principal);
      if (input.consent !== true || input.fetchSite !== "same-origin" || !input.nonce || !input.csrfToken || !input.idempotencyKey) throw new Error("explicit same-origin consent required");
      return repository.confirm({ ...identity, challengeId: input.challengeId, key: input.idempotencyKey, reviewed: input.reviewed,
        ...consentProof(input.nonce, input.csrfToken), origin: input.origin, fetchSite: input.fetchSite, consent: input.consent });
    },
  };
}
