export type PublicCatalogServingIdentity = {
  version: 1;
  target: "production";
  publicationId: string;
  deploymentId: string;
  commitSha: string;
  candidateDigest: string;
};

export type PublicCatalogReaderEligibility = {
  readerId: string;
  generation: string;
  lineage: string;
  policyDigest: string;
  healthVersion: string;
  buildDigest: string;
  expiresAt: unknown;
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
  readerEligibility?: unknown;
};

export type PublicCatalogAuthorityFingerprint = {
  readonly publicationId: string;
  readonly promotionId: string;
  readonly target: "production";
  readonly deploymentId: string;
  readonly commitSha: string;
  readonly candidateDigest: string;
  readonly verifiedAt: string;
  readonly expiresAt: string;
};

export type PublicCatalogAuthorityDecision = PublicCatalogAuthorityFingerprint & {
  readonly generation: string;
  readonly lineage: string;
  readonly policyDigest: string;
  readonly healthVersion: string;
  readonly buildDigest: string;
  readonly readerExpiresAt: string;
  readonly decisionDeadline: string;
};

type ExactAuthorityRecord = Record<string, unknown> & {
  promotion_id: string;
  promotion: Record<string, unknown> & { id: string };
};

type EligibleAuthorityRecord = ExactAuthorityRecord & {
  verified_at: Date;
  promotion: ExactAuthorityRecord["promotion"] & { expires_at: Date };
  readerEligibility: PublicCatalogReaderEligibility & { expiresAt: Date };
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

function hasEligibleReader(
  record: ExactAuthorityRecord,
  identity: PublicCatalogServingIdentity,
  now: Date,
): record is ExactAuthorityRecord & { readerEligibility: PublicCatalogReaderEligibility & { expiresAt: Date } } {
  const reader = record.readerEligibility;
  if (!isRecord(reader) || !validDate(reader.expiresAt)) return false;
  return reader.readerId === identity.deploymentId
    && isText(reader.generation)
    && isText(reader.lineage)
    && isText(reader.policyDigest)
    && isText(reader.healthVersion)
    && isText(reader.buildDigest)
    && reader.expiresAt > now;
}

function isEligibleAuthority(
  record: ExactAuthorityRecord,
  identity: PublicCatalogServingIdentity,
  now: Date,
): record is EligibleAuthorityRecord {
  const { promotion } = record;
  if (!validDate(record.verified_at) || !validDate(promotion.expires_at)) return false;
  return record.state === "PROMOTED"
    && promotion.state === "PROMOTED"
    && record.verified_at <= now
    && promotion.expires_at > now
    && hasEligibleReader(record, identity, now);
}

function hasTextFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => isText(record[field]));
}

function hasValidDecisionTimes(record: Record<string, unknown>): boolean {
  return [record.verifiedAt, record.expiresAt, record.readerExpiresAt, record.decisionDeadline]
    .every((value) => typeof value === "string" && validDate(new Date(value)));
}

function isValidDecision(decision: unknown): decision is PublicCatalogAuthorityDecision {
  if (!isRecord(decision) || decision.target !== "production") return false;
  if (!hasTextFields(decision, [
    "publicationId", "promotionId", "deploymentId", "generation", "lineage", "policyDigest", "healthVersion", "buildDigest",
  ])) return false;
  return typeof decision.commitSha === "string"
    && /^[a-f0-9]{40}$/.test(decision.commitSha)
    && typeof decision.candidateDigest === "string"
    && /^sha256:[a-f0-9]{64}$/.test(decision.candidateDigest)
    && hasValidDecisionTimes(decision);
}

export function canEmitPublicCatalogDecision(decision: unknown, now: Date): boolean {
  if (!validDate(now) || !isValidDecision(decision)) return false;
  const expiry = new Date(decision.expiresAt);
  const readerExpiry = new Date(decision.readerExpiresAt);
  const deadline = new Date(decision.decisionDeadline);
  return deadline <= expiry && deadline <= readerExpiry && now < deadline && now < expiry && now < readerExpiry;
}

export type PublicCatalogAuthorityOutcome =
  | { readonly status: "eligible"; readonly decision: PublicCatalogAuthorityDecision }
  | { readonly status: "ineligible" }
  | { readonly status: "unavailable" };

export async function resolvePublicCatalogAuthorityOutcome(
  input: unknown,
  loadPublication: (publicationId: string) => Promise<PublicCatalogAuthorityRecord | null>,
  now: Date,
): Promise<PublicCatalogAuthorityOutcome> {
  const identity = parsePublicCatalogServingIdentity(input);
  if (!identity || !validDate(now)) return { status: "ineligible" };

  let record: unknown;
  try {
    record = await loadPublication(identity.publicationId);
  } catch {
    return { status: "unavailable" };
  }
  if (!hasExactPublicationIdentity(record, identity)
    || !matchesPromotionIdentity(record, identity)
    || !isEligibleAuthority(record, identity, now)) return { status: "ineligible" };

  const readerExpiry = record.readerEligibility.expiresAt;
  const decisionDeadline = new Date(Math.min(now.getTime() + 30_000, record.promotion.expires_at.getTime(), readerExpiry.getTime()));
  return { status: "eligible", decision: {
    publicationId: identity.publicationId, promotionId: record.promotion_id, target: identity.target,
    deploymentId: identity.deploymentId, commitSha: identity.commitSha, candidateDigest: identity.candidateDigest,
    verifiedAt: record.verified_at.toISOString(), expiresAt: record.promotion.expires_at.toISOString(),
    generation: record.readerEligibility.generation, lineage: record.readerEligibility.lineage,
    policyDigest: record.readerEligibility.policyDigest, healthVersion: record.readerEligibility.healthVersion,
    buildDigest: record.readerEligibility.buildDigest, readerExpiresAt: readerExpiry.toISOString(),
    decisionDeadline: decisionDeadline.toISOString(),
  } };
}

export async function resolvePublicCatalogAuthority(
  input: unknown,
  loadPublication: (publicationId: string) => Promise<PublicCatalogAuthorityRecord | null>,
  now: Date,
): Promise<PublicCatalogAuthorityDecision | null> {
  const outcome = await resolvePublicCatalogAuthorityOutcome(input, loadPublication, now);
  return outcome.status === "eligible" ? outcome.decision : null;
}
