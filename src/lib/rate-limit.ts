import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse, type NextRequest } from "next/server";

import { redis } from "@/lib/redis";

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      analytics: true,
      prefix: "ofertas-super:api",
    })
  : null;

export type RateLimitState = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
};

const FALLBACK_RATE_LIMIT_STATE: RateLimitState = {
  success: true,
  limit: 60,
  remaining: 60,
  reset: Date.now() + 60_000,
  pending: Promise.resolve(),
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

async function checkRateLimit(request: NextRequest, scope = "api"): Promise<RateLimitState> {
  if (!ratelimit) {
    return { ...FALLBACK_RATE_LIMIT_STATE, reset: Date.now() + 60_000 };
  }

  const identifier = `${scope}:${getClientIp(request)}`;
  return limitRequestOrFallback(ratelimit, identifier);
}

export async function limitRequestOrFallback(
  limiter: Pick<Ratelimit, "limit">,
  identifier: string,
): Promise<RateLimitState> {
  try {
    const result = await limiter.limit(identifier);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      pending: result.pending,
    };
  } catch {
    return { ...FALLBACK_RATE_LIMIT_STATE, reset: Date.now() + 60_000 };
  }
}

export function withRateLimitHeaders(response: NextResponse, state: RateLimitState) {
  response.headers.set("X-RateLimit-Limit", String(state.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, state.remaining)));
  response.headers.set("X-RateLimit-Reset", String(state.reset));

  if (!state.success) {
    const retryAfter = Math.max(1, Math.ceil((state.reset - Date.now()) / 1000));
    response.headers.set("Retry-After", String(retryAfter));
  }

  return response;
}

export async function rejectIfRateLimited(request: NextRequest, scope?: string) {
  const state = await checkRateLimit(request, scope);

  if (state.success) {
    return { state, response: null };
  }

  const response = NextResponse.json(
    {
      error: "Rate limit exceeded",
      message: "Too many requests. Try again in a moment.",
    },
    { status: 429 },
  );

  return {
    state,
    response: withRateLimitHeaders(response, state),
  };
}
