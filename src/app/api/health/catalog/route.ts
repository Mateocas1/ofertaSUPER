import { NextResponse } from "next/server";

import { probeCatalogSnapshot } from "@/lib/catalog-snapshot";
import {
  catalogHealthStatusCode,
  createCatalogHealthChecker,
  createSnapshotCatalogHealthChecker,
  isSnapshotMode,
} from "@/lib/health";
import { createPublicCatalogGuardedRead } from "@/lib/public-catalog-read.server";

const checkPublishedCatalogHealth = createCatalogHealthChecker(
  createPublicCatalogGuardedRead(process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON),
);
const checkSnapshotCatalogHealth = createSnapshotCatalogHealthChecker(probeCatalogSnapshot);

export async function GET() {
  const health = isSnapshotMode(process.env) ? checkSnapshotCatalogHealth() : await checkPublishedCatalogHealth();
  return NextResponse.json(health, { status: catalogHealthStatusCode(health) });
}
