import { NextResponse, type NextRequest } from "next/server";

import { requirePublicationApprovalAccess } from "@/lib/admin/access";
import { createApprovalService } from "@/lib/production-readiness/approval";
import { createPublicationApprovalRepository } from "@/lib/production-readiness/publication-access";
import { db } from "@/lib/db";

type ApprovalRequest = { challengeId?: unknown; nonce?: unknown; csrfToken?: unknown; idempotencyKey?: unknown; consent?: unknown };
type ValidApprovalRequest = { challengeId: string; nonce: string; csrfToken: string; idempotencyKey: string; consent: true };

export async function POST(request: NextRequest) {
  if (!isJsonRequest(request)) return contentTypeErrorResponse();
  const access = await requirePublicationApprovalAccess();
  if ("denied" in access) return access.denied;
  try {
    const body = parseApprovalRequest(await request.json() as ApprovalRequest);
    const receipt = await createApprovalService(createRepository()).approve(
      access.principal,
      approvalInput(body, request),
    );
    return NextResponse.json(receipt, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

function isJsonRequest(request: NextRequest) {
  return request.headers.get("content-type")?.split(";", 1)[0] === "application/json";
}

function contentTypeErrorResponse() {
  return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
}

function parseApprovalRequest(body: ApprovalRequest): ValidApprovalRequest {
  if (typeof body.challengeId !== "string" || typeof body.nonce !== "string" || typeof body.csrfToken !== "string" || typeof body.idempotencyKey !== "string" || body.consent !== true || Object.keys(body).length !== 5) throw new Error("invalid approval request");
  return body as ValidApprovalRequest;
}

function createRepository() {
  return createPublicationApprovalRepository({ execute: async (sql, values) => ({ rows: await db.$queryRawUnsafe(sql, ...values) as Record<string, unknown>[] }) });
}

function approvalInput(body: ValidApprovalRequest, request: NextRequest) {
  return { ...body, origin: request.headers.get("origin") ?? "", fetchSite: request.headers.get("sec-fetch-site") };
}
