import { NextResponse } from "next/server";

import { catalogHealthStatusCode, createCatalogHealthChecker } from "@/lib/health";
import { createPublicCatalogGuardedRead } from "@/lib/public-catalog-read.server";

const checkCatalogHealth = createCatalogHealthChecker(
  createPublicCatalogGuardedRead(process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON),
);

export async function GET() {
  const health = await checkCatalogHealth();
  return NextResponse.json(health, { status: catalogHealthStatusCode(health) });
}
