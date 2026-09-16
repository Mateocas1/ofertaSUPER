import { createPromotionReadyEnvelope } from "./verification";

type CreateDelegate = {
	create(args: { data: Record<string, unknown> }): Promise<unknown>;
};

export type ProductionReadinessClient = {
	productionReadinessPromotion: CreateDelegate;
	productionReadinessReceipt: CreateDelegate;
	productionReadinessPublication: CreateDelegate;
};

type PendingPromotion = {
	candidateDigest: string;
	deploymentId: string;
	commitSha: string;
	owner: string;
	rollbackAuthority: string;
	expiresAt: Date;
};

type PendingReceipt = {
	promotionId: string;
	kind: "PROVENANCE" | "AUTHORIZATION" | "ALERT" | "RESTORE" | "OWNERSHIP";
	payloadDigest: string;
	signer: string;
	scope: string;
	expiresAt: Date;
};

type PendingPublication = { promotionId: string; target: string };

export class ProductionReadinessInputError extends Error {}

export function createProductionReadinessRepository(client: ProductionReadinessClient, now: () => Date = () => new Date()) {
	return {
		async createPendingPromotion(input: PendingPromotion) {
			assertDigest(input.candidateDigest, "candidate digest");
			assertText(input.deploymentId, "deployment ID");
			if (!/^[a-f0-9]{40}$/.test(input.commitSha)) throw new ProductionReadinessInputError("commit SHA must be a lowercase 40-character hash");
			assertText(input.owner, "owner");
			assertText(input.rollbackAuthority, "rollback authority");
			assertExpiry(input.expiresAt, now());
			return client.productionReadinessPromotion.create({ data: { candidate_digest: input.candidateDigest, deployment_id: input.deploymentId, commit_sha: input.commitSha, owner: input.owner, rollback_authority: input.rollbackAuthority, expires_at: input.expiresAt, state: "PENDING" } });
		},
		async recordPendingReceipt(input: PendingReceipt) {
			assertText(input.promotionId, "promotion ID");
			assertDigest(input.payloadDigest, "payload digest");
			assertText(input.signer, "signer");
			assertText(input.scope, "scope");
			assertExpiry(input.expiresAt, now());
			return client.productionReadinessReceipt.create({ data: { promotion_id: input.promotionId, kind: input.kind, payload_digest: input.payloadDigest, signer: input.signer, scope: input.scope, expires_at: input.expiresAt, state: "PENDING" } });
		},
		async recordPendingPublication(input: PendingPublication) {
			assertText(input.promotionId, "promotion ID");
			assertText(input.target, "publication target");
			return client.productionReadinessPublication.create({ data: { promotion_id: input.promotionId, target: input.target, state: "PENDING" } });
		},
	};
}

export type GenerationPromotionFoundationRequest = {
  requestKey: string; admissionId: string; manifestDigest: string; incarnation: string;
  generation: string; predecessorGeneration: string; predecessorLineage: string; resultLineage: string;
  policyDigest: string; buildDigest: string; healthVersion: string; evidenceDigest: string; auditDigest: string;
  publishingAdoptionId: string;
};

/** U12b1 validates immutable bindings only; U12b2 owns any promotion write. */
export function createGenerationPromotionFoundationRequest(input: GenerationPromotionFoundationRequest) {
  for (const [label, value] of Object.entries(input)) {
    if (!value) throw new ProductionReadinessInputError(`${label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} is required`);
  }
  for (const [label, value] of Object.entries({ admissionId: input.admissionId, incarnation: input.incarnation, publishingAdoptionId: input.publishingAdoptionId })) {
    assertUuid(value, label === "admissionId" ? "admission ID" : label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`));
  }
  for (const value of [input.manifestDigest, input.predecessorLineage, input.resultLineage, input.policyDigest, input.buildDigest, input.evidenceDigest, input.auditDigest]) assertDigest(value, "foundation digest");
  if (!/^[1-9][0-9]*$/.test(input.generation)) throw new ProductionReadinessInputError("generation must be positive");
  if (!/^(0|[1-9][0-9]*)$/.test(input.predecessorGeneration) || !/^(0|[1-9][0-9]*)$/.test(input.healthVersion)) throw new ProductionReadinessInputError("generation and health bindings must be non-negative");
  return Object.freeze({ ...input });
}

export type SealedGenerationDeltaItem = {
  entity: "product" | "supermarket" | "offer" | "history" | "promotion" | "membership";
  key: string; afterImage: Record<string, unknown> | null; tombstone: boolean;
};

const deltaEntityOrder = ["product", "supermarket", "offer", "history", "promotion", "membership"] as const;

/** U12b1b validates sealed immutable after-images; U12b2 alone applies them. */
export function createSealedGenerationDeltaItems(input: { manifestId: string; admissionId: string; items: readonly SealedGenerationDeltaItem[] }) {
  assertUuid(input.manifestId, "manifest ID");
  assertUuid(input.admissionId, "admission ID");
  if (!input.items.length) throw new ProductionReadinessInputError("sealed delta items are required");
  const ordered = [...input.items].sort((left, right) => deltaEntityOrder.indexOf(left.entity) - deltaEntityOrder.indexOf(right.entity) || left.key.localeCompare(right.key));
  return Object.freeze(ordered.map((item, ordinal) => {
    if (!deltaEntityOrder.includes(item.entity) || !item.key.trim() || item.key.length > 512 || (item.tombstone ? item.afterImage !== null : !isPlainRecord(item.afterImage))) throw new ProductionReadinessInputError("sealed delta item is invalid");
    const previous = ordered[ordinal - 1];
    if (previous?.entity === item.entity && previous.key === item.key) throw new ProductionReadinessInputError("sealed delta item is duplicate");
    return Object.freeze({ manifestId: input.manifestId, admissionId: input.admissionId, ordinal, entity: item.entity, itemKey: item.key, typeIdentity: `${item.entity}:${item.key}`, afterImage: item.tombstone ? null : freezeJson(item.afterImage), tombstone: item.tombstone });
  }));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function freezeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProductionReadinessInputError("sealed delta item is invalid");
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (isPlainRecord(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)])));
  throw new ProductionReadinessInputError("sealed delta item is invalid");
}

export function createGenerationPromotionFoundationRepository(sql: {
  execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
  return {
    async inspect(recordId: string) {
      if (!/^[0-9a-f-]{36}$/.test(recordId)) throw new ProductionReadinessInputError("generation record ID is required");
      return (await sql.execute("SELECT id, manifest_id, incarnation, generation, predecessor_generation, predecessor_lineage, result_lineage, policy_digest, build_digest, health_version, evidence_digest, audit_digest FROM public.governed_generation_records WHERE id = $1", [recordId])).rows[0] ?? null;
    },
  };
}

export type DeltaPromotionRequest = {
  key: string; manifestId: string; expectedGeneration: string; expectedHealthVersion: string;
};

/** U12b2 calls the one guarded SQL public-effect transaction; it never applies images in application code. */
export function createDeltaPromotionRepository(sql: {
  execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
  return {
    async promote(request: DeltaPromotionRequest) {
      assertText(request.key, "promotion key");
      assertUuid(request.manifestId, "manifest ID");
      if (!/^(0|[1-9][0-9]*)$/.test(request.expectedGeneration) || !/^(0|[1-9][0-9]*)$/.test(request.expectedHealthVersion)) {
        throw new ProductionReadinessInputError("promotion generation and health bindings must be non-negative");
      }
      const result = await sql.execute("SELECT public.promote_delta($1::jsonb) AS operation_id", [JSON.stringify(request)]);
      return committedOperation(result.rows[0]?.operation_id, "delta promotion");
    },
  };
}

/** U12c observes the exact U12b2 outcome and live DB-clock eligibility without any effect. */
export function createDeltaRecoveryRepository(sql: {
  execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
  return {
    async inspect(input: { key: string }) {
      assertText(input.key, "promotion recovery key");
      const result = await sql.execute("SELECT public.inspect_delta_promotion($1::jsonb) AS result", [JSON.stringify(input)]);
      if (!result.rows[0]?.result) throw new Error("delta promotion outcome is unknown; do not replay or compensate");
      return result.rows[0].result;
    },
  };
}

export type ForwardCorrectionPromotionRequest = DeltaPromotionRequest & {
  verified: unknown; admissionId: string; envelopeDigest: string; badOperationId: string; badGenerationRecordId: string; expectedLineage: string;
};

/** U14b links a fresh verifier envelope before delegating its only public effect to U12b2 promote_delta. */
export function createForwardCorrectionRepository(sql: {
  execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
  const promotions = createDeltaPromotionRepository(sql);
  return {
    async promote(request: ForwardCorrectionPromotionRequest) {
      assertText(request.key, "forward correction key");
      if (createPromotionReadyEnvelope(request.verified).digest !== request.envelopeDigest) throw new ProductionReadinessInputError("fresh correction envelope digest is required");
      for (const [label, value] of Object.entries({ admissionId: request.admissionId, badOperationId: request.badOperationId, badGenerationRecordId: request.badGenerationRecordId })) assertUuid(value, label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`));
      for (const [label, value] of Object.entries({ envelopeDigest: request.envelopeDigest, expectedLineage: request.expectedLineage })) assertDigest(value, label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`));
      const linkage = { key: request.key, admissionId: request.admissionId, envelopeDigest: request.envelopeDigest, badOperationId: request.badOperationId,
        badGenerationRecordId: request.badGenerationRecordId, expectedGeneration: request.expectedGeneration, expectedLineage: request.expectedLineage };
      const result = await sql.execute("SELECT public.link_forward_correction($1::jsonb) AS result", [JSON.stringify(linkage)]);
      const linked = result.rows[0]?.result as { state?: string } | undefined;
      if (linked?.state !== "LINKED") throw new Error("forward correction is restricted; do not promote or compensate");
      return promotions.promote({ key: request.key, manifestId: request.manifestId, expectedGeneration: request.expectedGeneration, expectedHealthVersion: request.expectedHealthVersion });
    },
  };
}

export type ExistingLiveAdoptionRequest = {
  key: string; publicationId: string; expectedGeneration: string; expectedLineage: string;
  expectedHealthVersion: string; expectedBuildDigest: string; expectedPolicyDigest: string;
};

/** U11b4 persists only proof independently selected by the database. */
export function createExistingLiveAdoptionRepository(sql: {
  execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
  return {
    async adopt(request: ExistingLiveAdoptionRequest) {
      assertText(request.key, "existing LIVE adoption key");
      assertText(request.publicationId, "publication ID");
      for (const [label, value] of Object.entries({ lineage: request.expectedLineage, buildDigest: request.expectedBuildDigest, policyDigest: request.expectedPolicyDigest })) {
        assertDigest(value, label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`));
      }
      if (!/^(0|[1-9][0-9]*)$/.test(request.expectedGeneration) || !/^(0|[1-9][0-9]*)$/.test(request.expectedHealthVersion)) {
        throw new ProductionReadinessInputError("existing LIVE generation and health bindings must be non-negative");
      }
      const result = await sql.execute("SELECT public.adopt_existing_live($1::jsonb) AS operation_id", [JSON.stringify(request)]);
      return committedOperation(result.rows[0]?.operation_id, "existing LIVE adoption");
    },
  };
}

export type AuthorityActivationRequest = {
	key: string; reservationId: string; approvalId: string; verificationId: string;
	attemptId: string; expectedEpoch: string; expectedVersion: number;
	expectedGeneration: string | null; actorId: string;
};

export type AuthorityRevokeRequest = {
	key: string; operationId: string; reservationId: string; consentId: string;
	expectedVersion: number; actorId: string; sessionHash: string;
};

/** Activation returns identity only; inspection discovers proof without replaying the request. */
export function createAuthorityLifecycleRepository(sql: {
	execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
	return {
		async inspect(operationId: string, reservationId: string, actorId: string) {
			const result = await sql.execute("SELECT public.inspect_authority($1,$2,$3) AS result", [operationId, reservationId, actorId]);
			if (!result.rows[0]?.result) throw new Error("inspection outcome is unknown");
			return result.rows[0].result;
		},
		async revoke(request: AuthorityRevokeRequest) {
			const result = await sql.execute("SELECT public.revoke_authority($1::jsonb) AS operation_id", [JSON.stringify(request)]);
			return committedOperation(result.rows[0]?.operation_id, "revoke");
		},
		async activate(request: AuthorityActivationRequest) {
			const result = await sql.execute("SELECT public.activate_authority($1::jsonb) AS operation_id", [JSON.stringify(request)]);
			return committedOperation(result.rows[0]?.operation_id, "activation");
		},
	};
}

function committedOperation(operationId: unknown, action: string) {
	if (typeof operationId !== "string") throw new Error(`${action} outcome is unknown; do not replay or compensate`);
	return { operationId };
}

function assertText(value: string, label: string) {
	if (!value?.trim()) throw new ProductionReadinessInputError(`${label} is required`);
}

function assertDigest(value: string, label: string) {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new ProductionReadinessInputError(`${label} must be a SHA-256 digest`);
}

function assertUuid(value: string, label: string) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new ProductionReadinessInputError(`${label} is required`);
}

function assertExpiry(value: Date, current: Date) {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf()) || value <= current) throw new ProductionReadinessInputError("expiry must be a future timestamp");
}

/** Consent persistence only: no authority transition is exposed by this repository. */
export function createAuthorityRevokeConsentRepository(sql: {
  execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}): import("./approval").RevokeConsentRepository {
  async function call<T>(query: string, request: Record<string, unknown>): Promise<T> {
    const result = (await sql.execute(query, [JSON.stringify(request)])).rows[0]?.result;
    if (!result || typeof result !== "object") throw new Error("revoke consent outcome is unknown");
    return result as T;
  }
  return {
    prepare: (request) => call("SELECT public.prepare_authority_revoke_consent($1::jsonb) AS result", request),
    confirm: (request) => call("SELECT public.record_authority_revoke_consent($1::jsonb) AS result", request),
  };
}
