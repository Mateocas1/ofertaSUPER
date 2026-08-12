import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { createReadinessChecker } from "@/lib/health";

const checkReadiness = createReadinessChecker(() => db.$queryRaw`SELECT 1`);

export async function GET() {
	const readiness = await checkReadiness(process.env);
	return NextResponse.json(readiness, { status: readiness.status === "ready" ? 200 : 503 });
}
