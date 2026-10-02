import axios from "axios";

// Public VTEX catalog endpoint that returns the store's live category tree as
// JSON (`[{ id, name, hasChildren, children }]`). Discovery reads it once per
// store and per refresh; the shape is validated by
// `src/lib/discovery/category-plan.ts`, not here.

export type VtexCategoryTreeDependencies = {
  http?: { get: (url: string, config: VtexCategoryTreeRequest) => Promise<{ data: unknown }> };
  sleep?: (ms: number) => Promise<void>;
};

type VtexCategoryTreeRequest = {
  headers: { "user-agent": string; accept: string };
};

const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
];

const http = axios.create({ timeout: 15_000 });

function pickUserAgent() {
  const configured = process.env.VTEX_USER_AGENTS?.split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const pool = configured?.length ? configured : DEFAULT_USER_AGENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchVtexCategoryTree({
  baseUrl,
  level = 2,
  retries = 3,
  dependencies = {},
}: {
  baseUrl: string;
  level?: number;
  retries?: number;
  dependencies?: VtexCategoryTreeDependencies;
}): Promise<unknown> {
  const url = new URL(`/api/catalog_system/pub/category/tree/${level}`, baseUrl).toString();
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await (dependencies.http ?? http).get(url, {
        headers: { "user-agent": pickUserAgent(), accept: "application/json" },
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await (dependencies.sleep ?? sleep)(400 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`VTEX category tree read failed for ${baseUrl}`);
}
