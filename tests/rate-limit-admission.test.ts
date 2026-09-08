import assert from "node:assert/strict";
import test from "node:test";

import { Ratelimit } from "@upstash/ratelimit";

import {
  admitStrictRateLimit,
  createRateLimiter,
  type RateLimiter,
  type RateLimitState,
} from "../src/lib/rate-limit";

const state = (success: boolean, reason?: string): RateLimitState => ({
  success,
  limit: 60,
  remaining: success ? 59 : 0,
  reset: 123,
  pending: Promise.resolve(),
  ...(reason ? { reason } : {}),
});

test("strict admission requires global then trusted-client capacity", async () => {
  const keys: string[] = [];
  const states = [state(true), state(true)];
  const limiter: RateLimiter = { limit: async (key) => { keys.push(key); return states[keys.length - 1]; } };

  assert.deepEqual(await admitStrictRateLimit(limiter, { routeScope: "search", trustedClientIp: "203.0.113.8" }), {
    status: "admitted",
    global: states[0],
    client: states[1],
  });
  assert.deepEqual(keys, ["strict:search:global", "strict:search:client:203.0.113.8"]);
});

test("global exhaustion returns 429 outcome and skips the client counter", async () => {
  const keys: string[] = [];
  const limiter: RateLimiter = { limit: async (key) => { keys.push(key); return state(false); } };

  const result = await admitStrictRateLimit(limiter, { routeScope: "products", trustedClientIp: "2001:db8::1" });
  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    assert.equal(result.level, "global");
    assert.equal(result.httpStatus, 429);
  }
  assert.deepEqual(keys, ["strict:products:global"]);
});

test("client exhaustion occurs only after global admission", async () => {
  const keys: string[] = [];
  const limiter: RateLimiter = {
    limit: async (key) => {
      keys.push(key);
      return state(!key.includes(":client:"));
    },
  };

  const result = await admitStrictRateLimit(limiter, { routeScope: "search", trustedClientIp: "198.51.100.4" });
  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    assert.equal(result.level, "client");
    assert.equal(result.httpStatus, 429);
  }
  assert.deepEqual(keys, ["strict:search:global", "strict:search:client:198.51.100.4"]);
});

test("route scopes remain distinct while equivalent IPv6 identities share a client key", async () => {
  const keys: string[] = [];
  const limiter: RateLimiter = { limit: async (key) => { keys.push(key); return state(true); } };

  await admitStrictRateLimit(limiter, { routeScope: "search", trustedClientIp: "2001:0DB8:0:0:0:0:0:1" });
  await admitStrictRateLimit(limiter, { routeScope: "products", trustedClientIp: "2001:db8::1" });
  assert.deepEqual(keys, [
    "strict:search:global", "strict:search:client:2001:db8::1",
    "strict:products:global", "strict:products:client:2001:db8::1",
  ]);
});

test("missing backend, backend errors, invalid identity, and dynamic scope fail closed", async () => {
  const unavailable = { status: "unavailable", httpStatus: 503 };
  assert.equal(createRateLimiter({}), null);
  assert.deepEqual(await admitStrictRateLimit(null, { routeScope: "search", trustedClientIp: "203.0.113.8" }), unavailable);
  assert.deepEqual(await admitStrictRateLimit({ limit: async () => { throw new Error("backend unavailable"); } }, { routeScope: "search", trustedClientIp: "203.0.113.8" }), unavailable);
  assert.deepEqual(await admitStrictRateLimit({ limit: async () => state(true) }, { routeScope: "search", trustedClientIp: "unknown" }), unavailable);
  assert.deepEqual(await admitStrictRateLimit({ limit: async () => state(true) }, { routeScope: "search?q=user", trustedClientIp: "203.0.113.8" }), unavailable);
});

test("scoped IPv6 identities fail closed before consuming capacity", async () => {
  let calls = 0;
  const limiter: RateLimiter = { limit: async () => { calls += 1; return state(true); } };

  assert.deepEqual(await admitStrictRateLimit(limiter, { routeScope: "search", trustedClientIp: "fe80::1%eth0" }), { status: "unavailable", httpStatus: 503 });
  assert.equal(calls, 0);
});

test("client backend errors occur after global admission and fail closed", async () => {
  const keys: string[] = [];
  const limiter: RateLimiter = {
    limit: async (key) => {
      keys.push(key);
      if (key.includes(":client:")) throw new Error("client counter failed");
      return state(true);
    },
  };

  assert.deepEqual(await admitStrictRateLimit(limiter, { routeScope: "search", trustedClientIp: "203.0.113.8" }), { status: "unavailable", httpStatus: 503 });
  assert.deepEqual(keys, ["strict:search:global", "strict:search:client:203.0.113.8"]);
});

test("strict global and client operations have bounded deadlines and preserve ordering", async () => {
  const unavailable = { status: "unavailable", httpStatus: 503 };
  const globalKeys: string[] = [];
  const globalHang: RateLimiter = { limit: async (key) => { globalKeys.push(key); return new Promise(() => undefined); } };
  assert.deepEqual(await admitStrictRateLimit(globalHang, { routeScope: "search", trustedClientIp: "203.0.113.8" }), unavailable);
  assert.deepEqual(globalKeys, ["strict:search:global"]);

  const clientKeys: string[] = [];
  const clientHang: RateLimiter = {
    limit: async (key) => {
      clientKeys.push(key);
      return key.includes(":client:") ? new Promise(() => undefined) : state(true);
    },
  };
  assert.deepEqual(await admitStrictRateLimit(clientHang, { routeScope: "search", trustedClientIp: "203.0.113.8" }), unavailable);
  assert.deepEqual(clientKeys, ["strict:search:global", "strict:search:client:203.0.113.8"]);
});

test("strict admission interprets a real Upstash SDK timeout result as unavailable", async () => {
  const upstash = new Ratelimit({
    redis: { eval: async () => new Promise(() => undefined) } as never,
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    analytics: false,
    timeout: 1,
  });
  const limiter: RateLimiter = { limit: (identifier) => upstash.limit(identifier) };

  assert.deepEqual(await admitStrictRateLimit(limiter, { routeScope: "search", trustedClientIp: "203.0.113.8" }), { status: "unavailable", httpStatus: 503 });
});
