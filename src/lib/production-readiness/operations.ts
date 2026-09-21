import { createHash } from "node:crypto";

export const BEGIN_BASELINE_ACTION = "begin_baseline";
export type GovernedOperationRequest = { action: typeof BEGIN_BASELINE_ACTION; clientKey: string; payload: { expectedEpoch: number } };
export function createOperationRequest(input: GovernedOperationRequest): GovernedOperationRequest {
  if (!input.clientKey.trim()) throw new Error("operation client key is required");
  if (!Number.isSafeInteger(input.payload.expectedEpoch) || input.payload.expectedEpoch < 0) throw new Error("expected epoch must be a non-negative integer");
  return input;
}
export function canonicalOperationRequest(request: GovernedOperationRequest) { return JSON.stringify({ action: request.action, clientKey: request.clientKey, payload: request.payload }); }
export function operationRequestDigest(request: GovernedOperationRequest) { return `sha256:${createHash("sha256").update(canonicalOperationRequest(request)).digest("hex")}`; }

export type SourceCapture = { operationKey: string; source: "carrefour" | "vea" | "disco" | "jumbo" | "mas"; observedAt: string; items: Array<{ entity: "product" | "offer" | "history"; key: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }> };
export function sourceCaptureOperationKey(input: { source: SourceCapture["source"]; rowIds: string[]; prewriteReportHash: string }) {
  if (!input.prewriteReportHash.startsWith("sha256:")) throw new Error("prewrite report hash is required");
  const rowIds = [...input.rowIds].sort();
  if (!rowIds.length || rowIds.some((id, index) => !id || id === rowIds[index - 1])) throw new Error("source capture identities are required");
  return `source-capture/v1:sha256:${createHash("sha256").update(JSON.stringify({ version: "source-capture/v1", source: input.source, rowIds, prewriteReportHash: input.prewriteReportHash })).digest("hex")}`;
}
export function createSourceCapture(input: SourceCapture & { reportedAt?: string }): SourceCapture {
  if (!input.observedAt || Number.isNaN(Date.parse(input.observedAt))) throw new Error("durable observation time is required");
  if ("reportedAt" in input) throw new Error("report timestamps cannot substitute durable observations");
  if (!input.operationKey.startsWith("source-capture/v1:sha256:")) throw new Error("source capture operation key is invalid");
  const canonicalFacts = (facts: Record<string, unknown>) => Object.fromEntries(Object.entries(facts).sort(([left], [right]) => left.localeCompare(right)));
  const items = input.items.map((item) => ({ ...item, before: item.before && canonicalFacts(item.before), after: item.after && canonicalFacts(item.after) }));
  if (!items.length || items.some((item) => !item.key || JSON.stringify(item.before) === JSON.stringify(item.after))) throw new Error("uncaptured mutation is not allowed");
  return { ...input, items };
}

type LifecycleDependencies = { access(): Promise<{ principal: { userId: string; sessionId: string } } | { denied: Response }>; execute(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; executeAuthority?(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
let authorityClient: Promise<import("@prisma/client").PrismaClient> | undefined;
async function executeAuthority(query: string, values: unknown[]) {
  const url = process.env.AUTHORITY_DATABASE_URL;
  if (!url) throw new Error("authority database credential is required");
  authorityClient ??= import("@prisma/client").then(({ PrismaClient }) => new PrismaClient({ datasources: { db: { url } } }));
  return { rows: await (await authorityClient).$queryRawUnsafe(query, ...values) as Record<string, unknown>[] };
}
const lifecycleDependencies: LifecycleDependencies = { access: async () => (await import("@/lib/admin/access")).requirePublicationApprovalAccess(), execute: executeAuthority, executeAuthority };
const MAX_AUTHORITY_REQUEST_BYTES = 8192;
type AuthorityAction = "activate" | "inspect" | "revoke" | "adopt";
type AuthorityResponder = (body: unknown, status?: number) => Response;

function authorityResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function parseAuthorityRequest(request: Request, action: AuthorityAction, respond: AuthorityResponder) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") return respond({ error: "JSON required" }, 415);
  if (request.headers.get("sec-fetch-site") !== "same-origin") return respond({ error: "origin denied" }, 403);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_AUTHORITY_REQUEST_BYTES) return respond({ error: "request too large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return respond({ error: "invalid JSON" }, 400); }
  const { z } = await import("zod");
  const id = z.string().min(1).max(256).regex(/^[a-zA-Z0-9_:-]+$/);
  const generation = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
  const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
  const schema = action === "activate" ? z.object({ key: id, reservationId: id, approvalId: id, verificationId: id, attemptId: id, expectedEpoch: generation, expectedVersion: z.number().int().min(0).max(2147483647), expectedGeneration: z.null() }).strict()
    : action === "revoke" ? z.object({ key: id, operationId: id, reservationId: id, consentId: id, expectedVersion: z.number().int().min(0).max(2147483647) }).strict()
    : action === "adopt" ? z.object({ key: id, publicationId: id, expectedGeneration: generation, expectedLineage: digest, expectedHealthVersion: generation, expectedBuildDigest: digest, expectedPolicyDigest: digest }).strict()
    : z.object({ operationId: id, reservationId: id }).strict();
  const parsed = schema.safeParse(body);
  return parsed.success ? { body, data: parsed.data } : respond({ error: "invalid lifecycle request" }, 400);
}

function authorityBinding(action: AuthorityAction, body: Record<string, unknown>) {
  if (action === "activate") return ["SELECT c.domain FROM public.authority_candidates c JOIN public.approval_receipts a ON a.candidate_admission_id=c.id WHERE a.idempotency_key=$1", body.approvalId] as const;
  if (action === "adopt") return ["SELECT c.domain FROM public.production_readiness_publications p JOIN public.production_readiness_promotions p0 ON p0.id=p.promotion_id JOIN public.authority_candidates c ON c.manifest_digest=p0.candidate_digest WHERE p.id=$1", body.publicationId] as const;
  return ["SELECT proof->'candidate'->>'domain' AS domain FROM public.authority_lifecycle_outcomes WHERE operation_id=$1", body.operationId] as const;
}

function authorityErrorResponse(error: unknown, respond: AuthorityResponder) {
  const detail = error as { message?: string; meta?: { message?: string } };
  const message = detail.meta?.message ?? detail.message ?? "";
  if (/live scoped executor grant required|original revoke grant required|final revoke grant expired|revoke consent proof invalid/.test(message)) return respond({ error: "forbidden" }, 403);
  if (/operation not found|reservation required|bound approval required|revoke consent not found|existing LIVE authority binding/.test(message)) return respond({ error: "not found" }, 404);
  if (/conflict|current FROZEN epoch binding required|stale existing LIVE|existing LIVE adoption drift/.test(message)) return respond({ error: "conflict" }, 409);
  if (/final DB-clock validity check failed|final revoke consent expired|late-ineligible existing LIVE/.test(message)) return respond({ error: "ineligible" }, 422);
  return respond({ error: "outcome unknown; inspect exact operation, do not replay or compensate" }, 503);
}

async function executeAuthorityAction(action: AuthorityAction, data: Record<string, unknown>, body: Record<string, unknown>, principal: { userId: string; sessionId: string }, execute: LifecycleDependencies["execute"]) {
  const { createAuthorityLifecycleRepository, createExistingLiveAdoptionRepository } = await import("./repository");
  const repository = createAuthorityLifecycleRepository({ execute });
  if (action === "activate") return repository.activate({ ...data, actorId: principal.userId } as import("./repository").AuthorityActivationRequest);
  if (action === "revoke") return repository.revoke({ ...data, actorId: principal.userId, sessionHash: createHash("sha256").update(JSON.stringify(principal)).digest("hex") } as import("./repository").AuthorityRevokeRequest);
  if (action === "adopt") return createExistingLiveAdoptionRepository({ execute }).adopt(data as import("./repository").ExistingLiveAdoptionRequest);
  return repository.inspect(String(body.operationId), String(body.reservationId), principal.userId);
}

/** Shared handler boundary: server-derived actor, strict schema and uncached scoped SQL checks. */
export function createAuthorityRoute(action: AuthorityAction, dependencies = lifecycleDependencies) {
  return async (request: Request) => {
    try {
      const access = await dependencies.access();
      if ("denied" in access) return authorityResponse({ error: "access denied" }, access.denied.status);
      if (!access.principal.userId || !access.principal.sessionId) return authorityResponse({ error: "session required" }, 401);
      const parsed = await parseAuthorityRequest(request, action, authorityResponse);
      if (parsed instanceof Response) return parsed;
      const execute = dependencies.executeAuthority ?? dependencies.execute;
      const [query, value] = authorityBinding(action, parsed.body);
      const binding = await execute(query, [value]);
      if (!binding.rows[0]) return authorityResponse({ error: "not found" }, 404);
      if (request.headers.get("origin") !== `https://${binding.rows[0].domain}`) return authorityResponse({ error: "origin denied" }, 403);
      return authorityResponse(await executeAuthorityAction(action, parsed.data, parsed.body, access.principal, execute));
    } catch (error) {
      return authorityErrorResponse(error, authorityResponse);
    }
  };
}
