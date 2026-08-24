import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { createCatalogHealthChecker } from "@/lib/health";

const checkCatalogHealth = createCatalogHealthChecker(() => db.productionReadinessPublication.findFirst({
  where: { target: "production", state: "PROMOTED", verified_at: { not: null }, promotion: { state: "PROMOTED" } },
  orderBy: { verified_at: "desc" },
  select: { verified_at: true },
}));

export async function GET() {
  const health = await checkCatalogHealth();
  return NextResponse.json(health, { status: health.status === "current" ? 200 : 503 });
}
