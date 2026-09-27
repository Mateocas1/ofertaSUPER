import type { NextRequest } from "next/server";

import { handleProductHistory } from "@/lib/public-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ean: string }> },
) {
  const { ean } = await context.params;
  return handleProductHistory(request, ean);
}
