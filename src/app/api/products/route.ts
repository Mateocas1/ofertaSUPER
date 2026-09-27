import type { NextRequest } from "next/server";

import { handleProducts } from "@/lib/public-api";

export function GET(request: NextRequest) {
  return handleProducts(request);
}
