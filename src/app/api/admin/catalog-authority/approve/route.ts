import { NextResponse, type NextRequest } from "next/server";

import { requirePublicationApprovalAccess } from "@/lib/admin/access";
import { createApprovalService } from "@/lib/production-readiness/approval";
import { createPublicationApprovalRepository } from "@/lib/production-readiness/publication-access";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  const access = await requirePublicationApprovalAccess();
  if ("denied" in access) return access.denied;
  try {
    const body = await request.json() as { challengeId?: unknown; nonce?: unknown; csrfToken?: unknown; idempotencyKey?: unknown; consent?: unknown };
    if (typeof body.challengeId !== "string" || typeof body.nonce !== "string" || typeof body.csrfToken !== "string" || typeof body.idempotencyKey !== "string" || body.consent !== true || Object.keys(body).length !== 5) throw new Error("invalid approval request");
    const repository = createPublicationApprovalRepository({ execute: async (sql, values) => ({ rows: await db.$queryRawUnsafe(sql, ...values) as Record<string, unknown>[] }) });
    const receipt = await createApprovalService(repository).approve(access.principal, { challengeId: body.challengeId, nonce: body.nonce, csrfToken: body.csrfToken, idempotencyKey: body.idempotencyKey, consent: true, origin: request.headers.get("origin") ?? "", fetchSite: request.headers.get("sec-fetch-site") });
    return NextResponse.json(receipt, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}
