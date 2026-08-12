import { Redis } from "@upstash/redis";
import { createClient, type RedisClientType } from "redis";

export type CacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  ping?(): Promise<unknown>;
};

export type CacheProvider = "none" | "redis" | "upstash";
type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export function selectCacheProvider(env: RuntimeEnv): CacheProvider {
  const conventional = Boolean(env.REDIS_URL?.trim());
  const upstashUrl = Boolean(env.UPSTASH_REDIS_REST_URL?.trim());
  const upstashToken = Boolean(env.UPSTASH_REDIS_REST_TOKEN?.trim());
  if (conventional) return "redis";
  return upstashUrl && upstashToken ? "upstash" : "none";
}

export function createRedisCache(url: string, makeClient = createClient): CacheStore {
  let client: RedisClientType | null = null;
  async function connected() {
    if (!client) {
      client = makeClient({
        url,
        socket: { connectTimeout: 1_000, reconnectStrategy: false },
      }) as RedisClientType;
      client.on("error", () => undefined);
    }
    if (!client.isOpen) await client.connect();
    return client;
  }
  return {
    async get(key) { return (await connected()).get(key); },
    async set(key, value, ttlSeconds) {
      await (await connected()).set(key, value, {
        expiration: { type: "EX", value: ttlSeconds },
      });
    },
    async ping() { return (await connected()).ping(); },
  };
}

function createUpstashCache(url: string, token: string): CacheStore {
  const client = new Redis({ url, token, automaticDeserialization: false });
  return {
    async get(key) {
      const value = await client.get<unknown>(key);
      return value == null ? null : typeof value === "string" ? value : JSON.stringify(value);
    },
    async set(key, value, ttlSeconds) { await client.set(key, value, { ex: ttlSeconds }); },
    ping: () => client.ping(),
  };
}

export function createCacheStore(env: RuntimeEnv): CacheStore | null {
  const provider = selectCacheProvider(env);
  if (provider === "redis") return createRedisCache(env.REDIS_URL as string);
  if (provider === "upstash") {
    return createUpstashCache(env.UPSTASH_REDIS_REST_URL as string, env.UPSTASH_REDIS_REST_TOKEN as string);
  }
  return null;
}

export const cacheStore = createCacheStore(process.env);
// Deferred script-only compatibility; application cache/rate-limit consumers use capability ports.
export const redis = selectCacheProvider(process.env) === "upstash"
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    })
  : null;

export type RedisProbeResult = { status: "pass" | "degraded"; reason: string | null; latencyMs: number | null };

export async function probeRedisWithClient(client: Pick<CacheStore, "ping"> | null): Promise<RedisProbeResult> {
  if (!client?.ping) return { status: "degraded", reason: "missing_redis_client", latencyMs: null };
  const startedAt = Date.now();
  try {
    await client.ping();
    return { status: "pass", reason: null, latencyMs: Date.now() - startedAt };
  } catch {
    return { status: "degraded", reason: "redis_ping_failed", latencyMs: Date.now() - startedAt };
  }
}

export function probeRedis() { return probeRedisWithClient(cacheStore); }

export async function getCachedJsonWithClient<T>(client: Pick<CacheStore, "get"> | null, key: string) {
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value == null ? null : JSON.parse(value) as T;
  } catch { return null; }
}

export async function setCachedJsonWithClient<T>(client: Pick<CacheStore, "set"> | null, key: string, value: T, ttlSeconds: number) {
  if (!client) return;
  try { await client.set(key, JSON.stringify(value), ttlSeconds); } catch { return; }
}

export function getCachedJson<T>(key: string) { return getCachedJsonWithClient<T>(cacheStore, key); }
export function setCachedJson<T>(key: string, value: T, ttlSeconds: number) { return setCachedJsonWithClient(cacheStore, key, value, ttlSeconds); }
