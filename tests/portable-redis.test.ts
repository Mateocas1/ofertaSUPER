import assert from "node:assert/strict";
import test from "node:test";

import { getCachedJsonWithClient, selectCacheProvider, setCachedJsonWithClient } from "../src/lib/redis";
import { limitRequestOrFallback, type RateLimitState } from "../src/lib/rate-limit";
import { buildSearchCacheKey } from "../src/lib/cache-keys";

test("selects cache providers deterministically without exposing values", () => {
  assert.equal(selectCacheProvider({}), "none");
  assert.equal(selectCacheProvider({ REDIS_URL: "redis://secret" }), "redis");
  assert.equal(selectCacheProvider({ UPSTASH_REDIS_REST_URL: "https://secret", UPSTASH_REDIS_REST_TOKEN: "secret" }), "upstash");
  assert.equal(selectCacheProvider({ UPSTASH_REDIS_REST_URL: "https://secret" }), "none");
  assert.equal(selectCacheProvider({ REDIS_URL: "redis://preferred", UPSTASH_REDIS_REST_URL: "https://other", UPSTASH_REDIS_REST_TOKEN: "other" }), "redis");
});

test("JSON cache handles hits, misses, malformed values, errors, and delegates TTL", async () => {
  let written: unknown;
  const store = {
    get: async (key: string) => key === "hit" ? '{"ok":true}' : key === "bad" ? "{" : null,
    set: async (...args: unknown[]) => { written = args; },
  };
  assert.deepEqual(await getCachedJsonWithClient(store, "hit"), { ok: true });
  assert.equal(await getCachedJsonWithClient(store, "miss"), null);
  assert.equal(await getCachedJsonWithClient(store, "bad"), null);
  await setCachedJsonWithClient(store, "key", { ok: true }, 30);
  assert.deepEqual(written, ["key", '{"ok":true}', 30]);
  const failing = { get: async () => { throw new Error("redis://secret"); }, set: async () => { throw new Error("redis://secret"); } };
  assert.equal(await getCachedJsonWithClient(failing, "key"), null);
  await assert.doesNotReject(setCachedJsonWithClient(failing, "key", {}, 1));
});

test("rate limiter preserves allow, deny, and fail-open shape", async () => {
  const allowed: RateLimitState = { success: true, limit: 60, remaining: 59, reset: 123, pending: Promise.resolve() };
  const denied: RateLimitState = { ...allowed, success: false, remaining: 0 };
  assert.equal((await limitRequestOrFallback({ limit: async () => allowed }, "id")).success, true);
  assert.deepEqual(await limitRequestOrFallback({ limit: async () => denied }, "id"), denied);
  const open = await limitRequestOrFallback({ limit: async () => { throw new Error("redis://secret"); } }, "id");
  assert.deepEqual({ success: open.success, limit: open.limit, remaining: open.remaining }, { success: true, limit: 60, remaining: 60 });
});

test("integrated search cache isolates the top-level envelope in v3 and excludes degraded writes", async () => {
  assert.equal(buildSearchCacheKey(" Leche ", 8), "search:v3:leche:8");
  const route = await import("node:fs/promises").then(({ readFile }) => readFile("src/app/api/search/route.ts", "utf8"));
  assert.match(route, /if \(!data\.degraded\) \{\s*await setCachedJson\(cacheKey, data,/);
});
