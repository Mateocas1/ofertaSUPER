import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import { PrismaClient } from "@prisma/client";

const productName = "Snapshot product";
const promotionTitle = "Snapshot promotion";
const ean = "7790000000001";
const rateLimitContainer = `ofertasuper-u16-rate-limit-${randomUUID()}`;

function docker(args: string[], accepted = [0]) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error || !accepted.includes(result.status ?? 1)) {
    throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown error"}`);
  }
  return result.stdout.trim();
}

export function assertEligibleCommercialResponse(route: string, status: number, body: unknown, expectedText: string) {
  assert.equal(status, 200, `${route} eligible response must be 200`);
  assert.match(JSON.stringify(body), new RegExp(expectedText), `${route} eligible response omitted serving projection data`);
}

export function assertDeniedUnavailable(route: string, status: number, body: unknown) {
  assert.equal(status, 503, `${route} denied response must be unavailable, not a false commercial result`);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /"items"\s*:|"count"\s*:|"total"\s*:|Snapshot product|Snapshot promotion/, `${route} denied response leaked commercial payload`);
  assert.doesNotMatch(serialized, /Product not found|\[\]|"count"\s*:\s*0/, `${route} denied response was a false absence`);
}

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(url)).status < 500) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("built Next server did not become available");
}

async function stop(server: ChildProcess) {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
}

async function request(baseUrl: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", "127.0.0.1");
  const response = await fetch(new URL(path, baseUrl), { ...init, headers });
  return { status: response.status, body: await response.json() as unknown };
}

async function startRateLimitRedis() {
  const port = await freePort();
  docker(["run", "--detach", "--rm", "--name", rateLimitContainer, "--publish", `127.0.0.1:${port}:6379`, "redis:7-alpine"]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", rateLimitContainer, "redis-cli", "ping"], [0, 1]).trim() === "PONG") {
      return `redis://127.0.0.1:${port}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("U16 strict route rate-limit Redis did not become available");
}

function stopRateLimitRedis() {
  docker(["rm", "--force", rateLimitContainer], [0, 1]);
}

async function eligible(baseUrl: string) {
  const cases: Array<[string, string, RequestInit | undefined, string]> = [
    ["search", "/api/search?q=Snapshot&limit=10", undefined, productName],
    ["products", "/api/products?limit=10", undefined, productName],
    ["detail", `/api/products/${ean}`, undefined, productName],
    ["batch", "/api/products/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eans: [ean] }) }, productName],
    ["history", `/api/products/${ean}/history?days=30`, undefined, ean],
    ["promotions", "/api/promotions", undefined, promotionTitle],
    ["categories", "/api/categories", undefined, "Almacén"],
  ];
  for (const [route, path, init, expectedText] of cases) {
    const result = await request(baseUrl, path, init);
    assertEligibleCommercialResponse(route, result.status, result.body, expectedText);
  }
  const health = await request(baseUrl, "/api/health/catalog");
  assert.equal(health.status, 200, "catalog health must be current while authority is eligible");
  assert.match(JSON.stringify(health.body), /current/);
}

async function denied(baseUrl: string) {
  const cases: Array<[string, string, RequestInit | undefined]> = [
    ["search", "/api/search?q=Snapshot&limit=10", undefined],
    ["products", "/api/products?limit=10", undefined],
    ["detail", `/api/products/${ean}`, undefined],
    ["batch", "/api/products/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eans: [ean] }) }],
    ["history", `/api/products/${ean}/history?days=30`, undefined],
    ["promotions", "/api/promotions", undefined],
    ["categories", "/api/categories", undefined],
    ["catalog health", "/api/health/catalog", undefined],
  ];
  for (const [route, path, init] of cases) {
    const result = await request(baseUrl, path, init);
    assertDeniedUnavailable(route, result.status, result.body);
  }
}

export async function runU16BuiltServerPostgresSmoke() {
  const databaseUrl = process.env.PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL;
  const identity = process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
  if (!databaseUrl || !identity) throw new Error("U16 PostgreSQL smoke requires guarded database URL and serving identity");

  const rateLimitRedisUrl = await startRateLimitRedis();
  const port = await freePort();
  const server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, REDIS_URL: rateLimitRedisUrl, VERCEL: "1", ADMIN_ENABLED: "false", CLERK_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k", CLERK_SECRET_KEY: "sk_test_placeholder" },
    stdio: "inherit",
  });
  const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${baseUrl}/api/health/live`);
    await eligible(baseUrl);
    await database.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes DISABLE TRIGGER authority_lifecycle_outcomes_immutable");
    await database.$executeRawUnsafe("UPDATE public.authority_lifecycle_outcomes SET proof = '{}'::jsonb WHERE operation_id = 'authority'");
    await database.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes ENABLE TRIGGER authority_lifecycle_outcomes_immutable");
    await denied(baseUrl);
    console.log("U16 built Next server/PostgreSQL authority proof passed: eligible commercial projections and denied 503 responses.");
  } finally {
    await database.$disconnect();
    await stop(server);
    stopRateLimitRedis();
  }
}

if (process.argv[1]?.endsWith("u16-built-server-postgres-smoke.ts")) {
  void runU16BuiltServerPostgresSmoke().catch((error) => { console.error(error); process.exitCode = 1; });
}
