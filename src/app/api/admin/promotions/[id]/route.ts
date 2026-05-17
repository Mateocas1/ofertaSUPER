import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { requireAdminApiAccess } from "@/lib/admin/access";
import { AdminPromotionError, deletePromotion, updatePromotion } from "@/lib/admin/promotions";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { promotionIdSchema, promotionUpsertSchema } from "@/lib/schemas/promotion";

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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
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
    const { id } = await context.params;
    const promotionId = promotionIdSchema.parse(id);
    const payload = promotionUpsertSchema.parse(await request.json());
    const item = await updatePromotion(promotionId, payload);
    const response = NextResponse.json({ item });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = errorResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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
    const { id } = await context.params;
    const promotionId = promotionIdSchema.parse(id);
    await deletePromotion(promotionId);
    const response = NextResponse.json({ ok: true });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = errorResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
