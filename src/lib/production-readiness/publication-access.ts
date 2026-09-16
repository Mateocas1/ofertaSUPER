import { createCandidateAdmissionRepository } from "./candidate-admission";

export type SqlRow = Record<string, unknown>;
export type ApprovalSql = { execute(sql: string, values: unknown[]): Promise<{ rows: SqlRow[] }> };

type Grant = { userId: string; action: "approve"; scope: string; target: string; policyDigest: string; expiresAt: Date };
type Challenge = { id: string; candidateAdmissionId: string; nonceHash: string; csrfHash: string; userId: string; sessionId: string; requestDigest: string; expiresAt: Date; grantExpiresAt: Date; consumedAt?: Date };
type Receipt = { idempotencyKey: string; requestDigest: string; actorId: string; approvedAt: Date; grantExpiresAt: Date };
const date = (value: unknown) => new Date(value instanceof Date ? value.valueOf() : String(value));

export function createPublicationApprovalRepository(sql: ApprovalSql) {
  const candidateAdmissions = createCandidateAdmissionRepository(sql);
  const challenge = (row: SqlRow): Challenge => ({ id: String(row.id), candidateAdmissionId: String(row.candidate_admission_id), nonceHash: String(row.nonce_hash), csrfHash: String(row.csrf_hash), userId: String(row.user_id), sessionId: String(row.session_id), requestDigest: String(row.request_digest), expiresAt: date(row.expires_at), grantExpiresAt: date(row.grant_expires_at), consumedAt: row.consumed_at ? date(row.consumed_at) : undefined });
  const receipt = (row: SqlRow): Receipt => ({ idempotencyKey: String(row.idempotency_key), requestDigest: String(row.request_digest), actorId: String(row.actor_id), approvedAt: date(row.approved_at), grantExpiresAt: date(row.grant_expires_at) });
  return {
    resolveAdmission: candidateAdmissions.resolveEligibleAdmission,
    async findGrant(principal: { userId: string }, request: { scope: string; target: string; policyDigest: string }): Promise<Grant | null> {
      const result = await sql.execute("SELECT user_id, action, scope, target, policy_digest, expires_at FROM public.publication_grants WHERE user_id = $1 AND action = 'approve' AND scope = $2 AND target = $3 AND policy_digest = $4 AND revoked_at IS NULL AND expires_at > clock_timestamp() ORDER BY expires_at LIMIT 1", [principal.userId, request.scope, request.target, request.policyDigest]);
      const row = result.rows[0];
      return row ? { userId: String(row.user_id), action: "approve", scope: String(row.scope), target: String(row.target), policyDigest: String(row.policy_digest), expiresAt: date(row.expires_at) } : null;
    },
    async createChallenge(value: Challenge) {
      await sql.execute("SELECT * FROM public.create_approval_challenge($1,$2,$3,$4,$5,$6,$7,$8,$9)", [value.candidateAdmissionId, value.id, value.nonceHash, value.csrfHash, value.userId, value.sessionId, value.requestDigest, value.expiresAt, value.grantExpiresAt]);
    },
    async findChallenge(id: string): Promise<Challenge | null> {
      const row = (await sql.execute("SELECT id, candidate_admission_id, nonce_hash, csrf_hash, user_id, session_id, request_digest, expires_at, grant_expires_at, consumed_at FROM public.approval_challenges WHERE id = $1 AND grant_expires_at IS NOT NULL", [id])).rows[0];
      return row ? challenge(row) : null;
    },
    async consumeChallenge(id: string): Promise<Challenge | null> {
      const row = (await sql.execute("SELECT * FROM public.consume_approval_challenge($1)", [id])).rows[0];
      return row ? challenge(row) : null;
    },
    async findReceipt(idempotencyKey: string, requestDigest: string, actorId: string, grantExpiresAt: Date): Promise<Receipt | null> {
      const row = (await sql.execute("SELECT idempotency_key, request_digest, actor_id, approved_at, grant_expires_at FROM public.approval_receipts WHERE idempotency_key = $1 AND request_digest = $2 AND actor_id = $3 AND grant_expires_at = $4", [idempotencyKey, requestDigest, actorId, grantExpiresAt])).rows[0];
      return row ? receipt(row) : null;
    },
    async saveReceipt(value: Receipt & { challengeId: string }): Promise<Receipt> {
      const row = (await sql.execute("SELECT * FROM public.record_candidate_approval_receipt($1,$2,$3,$4,$5)", [value.idempotencyKey, value.requestDigest, value.actorId, value.approvedAt, value.challengeId])).rows[0];
      if (!row) throw new Error("approval receipt was not recorded");
      return receipt(row);
    },
  };
}
