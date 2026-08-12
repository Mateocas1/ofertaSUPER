import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "redis";

import { selectCacheProvider } from "@/lib/redis";

export type RateLimitState = { success: boolean; limit: number; remaining: number; reset: number; pending: Promise<unknown> };
export type RateLimiter = { limit(identifier: string): Promise<RateLimitState> };
const LIMIT = 60;
const WINDOW_MS = 60_000;

const fallback = (): RateLimitState => ({ success: true, limit: LIMIT, remaining: LIMIT, reset: Date.now() + WINDOW_MS, pending: Promise.resolve() });

export function createRateLimiter(env: Readonly<Record<string, string | undefined>>): RateLimiter | null {
  const provider = selectCacheProvider(env);
  if (provider === "upstash") {
    const limiter = new Ratelimit({
      redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL as string, token: env.UPSTASH_REDIS_REST_TOKEN as string }),
      limiter: Ratelimit.slidingWindow(LIMIT, "60 s"), analytics: true, prefix: "ofertas-super:api",
    });
    return { limit: (identifier) => limiter.limit(identifier) };
  }
  if (provider !== "redis") return null;
  const client = createClient({ url: env.REDIS_URL, socket: { connectTimeout: 1_000, reconnectStrategy: false } });
  client.on("error", () => undefined);
  return {
    async limit(identifier) {
      if (!client.isOpen) await client.connect();
      const key = `ofertas-super:api:${identifier}:${Math.floor(Date.now() / WINDOW_MS)}`;
      const count = Number(await client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n", { keys: [key], arguments: [String(WINDOW_MS)] }));
      const reset = (Math.floor(Date.now() / WINDOW_MS) + 1) * WINDOW_MS;
      return { success: count <= LIMIT, limit: LIMIT, remaining: Math.max(0, LIMIT - count), reset, pending: Promise.resolve() };
    },
  };
}

const rateLimiter = createRateLimiter(process.env);

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor ? forwardedFor.split(",")[0]?.trim() || "unknown" : request.headers.get("x-real-ip") ?? "unknown";
}

export async function limitRequestOrFallback(limiter: Pick<RateLimiter, "limit"> | null, identifier: string): Promise<RateLimitState> {
  if (!limiter) return fallback();
  try { return await limiter.limit(identifier); } catch { return fallback(); }
}

async function checkRateLimit(request: NextRequest, scope = "api") {
  return limitRequestOrFallback(rateLimiter, `${scope}:${getClientIp(request)}`);
}

export function withRateLimitHeaders(response: NextResponse, state: RateLimitState) {
  response.headers.set("X-RateLimit-Limit", String(state.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, state.remaining)));
  response.headers.set("X-RateLimit-Reset", String(state.reset));
  if (!state.success) response.headers.set("Retry-After", String(Math.max(1, Math.ceil((state.reset - Date.now()) / 1000))));
  return response;
}

export async function rejectIfRateLimited(request: NextRequest, scope?: string) {
  const state = await checkRateLimit(request, scope);
  if (state.success) return { state, response: null };
  const response = NextResponse.json({ error: "Rate limit exceeded", message: "Too many requests. Try again in a moment." }, { status: 429 });
  return { state, response: withRateLimitHeaders(response, state) };
}
