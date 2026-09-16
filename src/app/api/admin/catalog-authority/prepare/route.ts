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
    const body = await request.json() as { candidateAdmissionId?: unknown };
    if (typeof body.candidateAdmissionId !== "string" || Object.keys(body).length !== 1) throw new Error("candidate admission ID is required");
    const repository = createPublicationApprovalRepository({ execute: async (sql, values) => ({ rows: await db.$queryRawUnsafe(sql, ...values) as Record<string, unknown>[] }) });
    const prepared = await createApprovalService(repository).prepare(access.principal, body.candidateAdmissionId);
    return NextResponse.json(prepared, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}
