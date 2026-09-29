import { NextResponse } from "next/server";

import { probeCatalogSnapshot } from "@/lib/catalog-snapshot";
import { db } from "@/lib/db";
import { createReadinessChecker } from "@/lib/health";

const checkReadiness = createReadinessChecker(() => db.$queryRaw`SELECT 1`, { snapshotProbe: probeCatalogSnapshot });

export async function GET() {
	const readiness = await checkReadiness(process.env);
	return NextResponse.json(readiness, { status: readiness.status === "ready" ? 200 : 503 });
}
