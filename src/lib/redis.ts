import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

type RedisJsonClient = Pick<Redis, "get" | "set">;
type RedisPingClient = Pick<Redis, "ping">;

export type RedisProbeResult = {
  status: "pass" | "degraded";
  reason: string | null;
  latencyMs: number | null;
};

export async function probeRedisWithClient(client: RedisPingClient | null): Promise<RedisProbeResult> {
  if (!client) {
    return { status: "degraded", reason: "missing_redis_client", latencyMs: null };
  }

  const startedAt = Date.now();

  try {
    await client.ping();
    return { status: "pass", reason: null, latencyMs: Date.now() - startedAt };
  } catch {
    return { status: "degraded", reason: "redis_ping_failed", latencyMs: Date.now() - startedAt };
  }
}

export function probeRedis() {
  return probeRedisWithClient(redis);
}


export async function getCachedJsonWithClient<T>(client: Pick<RedisJsonClient, "get"> | null, key: string) {
  if (!client) {
    return null;
  }

  try {
    const value = await client.get<T>(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setCachedJsonWithClient<T>(
  client: Pick<RedisJsonClient, "set"> | null,
  key: string,
  value: T,
  ttlSeconds: number,
) {
  if (!client) {
    return;
  }

  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch {
    return;
  }
}

export function getCachedJson<T>(key: string) {
  return getCachedJsonWithClient<T>(redis, key);
}

export function setCachedJson<T>(key: string, value: T, ttlSeconds: number) {
  return setCachedJsonWithClient(redis, key, value, ttlSeconds);
}
