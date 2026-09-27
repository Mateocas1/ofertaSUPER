import type { NextRequest } from "next/server";

import { handleSearch } from "@/lib/public-api";

export function GET(request: NextRequest) {
  return handleSearch(request);
}
