import { NextResponse } from "next/server";

import { probeCatalogSnapshot } from "@/lib/catalog-snapshot";
import { catalogHealthStatusCode, createSnapshotCatalogHealthChecker } from "@/lib/health";

const checkSnapshotCatalogHealth = createSnapshotCatalogHealthChecker(probeCatalogSnapshot);

export function GET() {
  const health = checkSnapshotCatalogHealth();
  return NextResponse.json(health, { status: catalogHealthStatusCode(health) });
}
