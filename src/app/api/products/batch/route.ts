import type { NextRequest } from "next/server";

import { handleProductsBatch } from "@/lib/public-api";

export async function POST(request: NextRequest) {
  return handleProductsBatch(request);
}
