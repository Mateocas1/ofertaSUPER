import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

type RedisJsonClient = Pick<Redis, "get" | "set">;

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
