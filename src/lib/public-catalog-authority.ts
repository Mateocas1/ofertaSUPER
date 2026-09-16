export type PublicCatalogServingIdentity = {
  version: 1;
  target: "production";
  publicationId: string;
  deploymentId: string;
  commitSha: string;
  candidateDigest: string;
};

export type PublicCatalogAuthorityRecord = {
  id: string;
  target: string;
  state: string;
  verified_at: unknown;
  promotion_id: string;
  promotion: {
    id: string;
    state: string;
    deployment_id: string;
    commit_sha: string;
    candidate_digest: string;
    expires_at: unknown;
  };
};

export type PublicCatalogAuthorityFingerprint = {
  publicationId: string;
  promotionId: string;
  target: "production";
  deploymentId: string;
  commitSha: string;
  candidateDigest: string;
  verifiedAt: string;
  expiresAt: string;
};

type ExactAuthorityRecord = Record<string, unknown> & {
  promotion_id: string;
  promotion: Record<string, unknown> & { id: string };
};

type EligibleAuthorityRecord = ExactAuthorityRecord & {
  verified_at: Date;
  promotion: ExactAuthorityRecord["promotion"] & { expires_at: Date };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function parsePublicCatalogServingIdentity(input: unknown): PublicCatalogServingIdentity | null {
  if (!isRecord(input)
    || input.version !== 1
    || input.target !== "production"
    || !isText(input.publicationId)
    || !isText(input.deploymentId)
    || typeof input.commitSha !== "string"
    || !/^[a-f0-9]{40}$/.test(input.commitSha)
    || typeof input.candidateDigest !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(input.candidateDigest)) return null;

  return {
    version: 1,
    target: "production",
    publicationId: input.publicationId,
    deploymentId: input.deploymentId,
    commitSha: input.commitSha,
    candidateDigest: input.candidateDigest,
  };
}

function hasExactPublicationIdentity(record: unknown, identity: PublicCatalogServingIdentity): record is ExactAuthorityRecord {
  if (!isRecord(record) || !isRecord(record.promotion)) return false;
  const promotion = record.promotion;
  if (!isText(record.promotion_id) || !isText(promotion.id)) return false;
  return record.id === identity.publicationId
    && record.target === identity.target
    && record.promotion_id === promotion.id;
}

function matchesPromotionIdentity(record: ExactAuthorityRecord, identity: PublicCatalogServingIdentity) {
  return record.promotion.deployment_id === identity.deploymentId
    && record.promotion.commit_sha === identity.commitSha
    && record.promotion.candidate_digest === identity.candidateDigest;
}

function isEligibleAuthority(record: ExactAuthorityRecord, now: Date): record is EligibleAuthorityRecord {
  const { promotion } = record;
  if (!validDate(record.verified_at) || !validDate(promotion.expires_at)) return false;
  return record.state === "PROMOTED"
    && promotion.state === "PROMOTED"
    && record.verified_at <= now
    && promotion.expires_at > now;
}

export async function resolvePublicCatalogAuthority(
  input: unknown,
  loadPublication: (publicationId: string) => Promise<PublicCatalogAuthorityRecord | null>,
  now: Date,
): Promise<PublicCatalogAuthorityFingerprint | null> {
  const identity = parsePublicCatalogServingIdentity(input);
  if (!identity || !validDate(now)) return null;

  let record: unknown;
  try {
    record = await loadPublication(identity.publicationId);
  } catch {
    return null;
  }
  if (!hasExactPublicationIdentity(record, identity)
    || !matchesPromotionIdentity(record, identity)
    || !isEligibleAuthority(record, now)) return null;

  return {
    publicationId: identity.publicationId,
    promotionId: record.promotion_id,
    target: identity.target,
    deploymentId: identity.deploymentId,
    commitSha: identity.commitSha,
    candidateDigest: identity.candidateDigest,
    verifiedAt: record.verified_at.toISOString(),
    expiresAt: record.promotion.expires_at.toISOString(),
  };
}
