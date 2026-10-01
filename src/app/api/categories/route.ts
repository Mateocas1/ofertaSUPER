import type { NextRequest } from "next/server";

import { handleCategories } from "@/lib/public-api";

// The public catalog is the committed snapshot (data/catalog-snapshot.json).
export function GET(request: NextRequest) {
  return handleCategories(request);
}
