import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { requireAdminApiAccess } from "@/lib/admin/access";
import { AdminPromotionError, createPromotion, listAdminPromotions } from "@/lib/admin/promotions";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { promotionUpsertSchema } from "@/lib/schemas/promotion";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid promotion payload",
        issues: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (error instanceof AdminPromotionError) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: "Internal server error",
    },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const limiter = await rejectIfRateLimited(request, "admin-promotions");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  try {
    const items = await listAdminPromotions();
    const response = NextResponse.json({ items });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = errorResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApiAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const limiter = await rejectIfRateLimited(request, "admin-promotions-write");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  try {
    const payload = promotionUpsertSchema.parse(await request.json());
    const item = await createPromotion(payload);
    const response = NextResponse.json({ item }, { status: 201 });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = errorResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
