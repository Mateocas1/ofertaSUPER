import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "@playwright/test";

const ean = "7790000000001";
const productName = "Snapshot product";
const promotionTitle = "Snapshot promotion";
const supermarket = "One";
const rateLimitContainer = `ofertasuper-u17-rate-limit-${crypto.randomUUID()}`;
const governedFacts = [ean, productName, promotionTitle, supermarket, "$100", "$120", "20%"];
const routes = ["/buscar?q=Snapshot", "/ofertas", "/categoria/almacen", `/producto/${ean}`, "/canasta"] as const;
const basketStorageKey = "ofertas-super:canasta";

export function createBasketStorageValue() {
  return JSON.stringify({ version: 1, value: [{ ean, qty: 1 }] });
}

const allowedDynamicEan = "[allowed dynamic ean route state]";
const nextFlightInlineScript = /<script\b[^>]*>\s*(self\.__next_f\.push\(([\s\S]*?)\))\s*<\/script>/gi;

type FlightRouterState = [unknown, Record<string, unknown>, ...unknown[]];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactAllowedDynamicEanInRouterState(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2 || !isRecord(value[1])) return false;
  const state = value as FlightRouterState;
  const segment = state[0];
  let foundAllowedDynamicEan = false;
  if (Array.isArray(segment) && segment[0] === "ean" && segment[1] === ean && segment[2] === "d") {
    segment[1] = allowedDynamicEan;
    foundAllowedDynamicEan = true;
  }
  for (const child of Object.values(state[1])) {
    foundAllowedDynamicEan = redactAllowedDynamicEanInRouterState(child) || foundAllowedDynamicEan;
  }
  return foundAllowedDynamicEan;
}

function isExactProductRouterCanonical(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === 3 && value[0] === "" && value[1] === "producto" && value[2] === ean;
}

function redactAllowedDynamicEanInFlightRecord(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.f)) return false;
  let foundAllowedDynamicEan = false;
  for (const flightDataPath of value.f) {
    if (Array.isArray(flightDataPath)) {
      foundAllowedDynamicEan = redactAllowedDynamicEanInRouterState(flightDataPath[0]) || foundAllowedDynamicEan;
    }
  }
  if (foundAllowedDynamicEan && isExactProductRouterCanonical(value.c)) value.c[2] = allowedDynamicEan;
  return foundAllowedDynamicEan;
}

function redactAllowedDynamicEanInFlightStream(source: string) {
  return source.replace(/(^|\n)([\da-z]+:)([^\n]+)/gi, (record, prefix: string, id: string, json: string) => {
    try {
      const parsed: unknown = JSON.parse(json);
      return redactAllowedDynamicEanInFlightRecord(parsed) ? `${prefix}${id}${JSON.stringify(parsed)}` : record;
    } catch {
      return record;
    }
  });
}

function assertNoCommercialFacts(label: string, source: string) {
  for (const fact of governedFacts) assert.ok(!source.includes(fact), `${label} leaked governed fact ${fact}`);
  assert.doesNotMatch(source, /application\/ld\+json[^>]*>[\s\S]*?(?:Product|Offer)[\s\S]*?<\/script>/i, `${label} leaked Product/Offer JSON-LD`);
}

function assertNoSeoOrProductLinkEan(label: string, source: string) {
  const eanPattern = ean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.doesNotMatch(source, new RegExp(`<link\\b[^>]*(?:canonical|href)[^>]*${eanPattern}|<meta\\b[^>]*(?:og:|twitter:)[^>]*${eanPattern}|href=\\["'][^"']*\\/producto\\/${eanPattern}`, "i"), `${label} leaked EAN through SEO metadata or a product link`);
}

export function assertDeniedGovernedOutput(label: string, source: string) {
  assertNoCommercialFacts(label, source);
  assertNoSeoOrProductLinkEan(label, source);
}

export function assertDeniedGovernedRsc(label: string, source: string) {
  assertDeniedGovernedOutput(label, redactAllowedDynamicEanInFlightStream(source));
}

export function assertDeniedGovernedHtml(label: string, source: string) {
  const withoutFlightScripts = source.replace(nextFlightInlineScript, (script, _push, serializedPush: string) => {
    try {
      const push: unknown = JSON.parse(serializedPush);
      if (!Array.isArray(push)) return script;
      const flightPayload = push.filter((part): part is string => typeof part === "string").map(redactAllowedDynamicEanInFlightStream).join("");
      assertDeniedGovernedOutput(`${label} Next Flight`, flightPayload);
      return "";
    } catch {
      return script;
    }
  });
  assertDeniedGovernedOutput(label, withoutFlightScripts);
}

export function assertEligibleGovernedOutput(label: string, source: string, options: { ean?: boolean; product?: boolean; promotion?: boolean } = {}) {
  if (options.ean !== false) assert.match(source, new RegExp(ean), `${label} omitted the serving EAN`);
  if (options.product !== false) assert.match(source, new RegExp(productName), `${label} omitted the serving product`);
  if (options.promotion) assert.match(source, new RegExp(promotionTitle), `${label} omitted the serving promotion`);
}

function docker(args: string[], accepted = [0]) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error || !accepted.includes(result.status ?? 1)) throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown error"}`);
  return result.stdout.trim();
}

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
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

async function stop(server: ChildProcess | undefined) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
}

async function startRateLimitRedis() {
  const port = await freePort();
  docker(["run", "--detach", "--rm", "--name", rateLimitContainer, "--publish", `127.0.0.1:${port}:6379`, "redis:7-alpine"]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", rateLimitContainer, "redis-cli", "ping"], [0, 1]).trim() === "PONG") return `redis://127.0.0.1:${port}`;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("U17 strict route rate-limit Redis did not become available");
}

async function documentAt(baseUrl: string, path: string, rsc = false) {
  const response = await fetch(new URL(path, baseUrl), { headers: rsc ? { RSC: "1", accept: "text/x-component" } : { "user-agent": "Twitterbot" } });
  assert.equal(response.status, 200, `${path} must be served`);
  return response.text();
}

async function eligible(baseUrl: string) {
  for (const path of routes) {
    const html = await documentAt(baseUrl, path);
    if (path === "/canasta") assert.match(html, /Canasta/);
    else assertEligibleGovernedOutput(path, html, path === "/ofertas" ? { ean: false, product: false, promotion: true } : { promotion: false });
  }
  const product = await documentAt(baseUrl, `/producto/${ean}`);
  assert.match(product, /application\/ld\+json/i, "eligible product must emit JSON-LD");
  assert.match(product, /"@type":"Product"/, "eligible product JSON-LD must be Product");
  assert.match(await documentAt(baseUrl, "/sitemap.xml"), new RegExp(`/producto/${ean}`), "eligible sitemap must include serving product");
  assertEligibleGovernedOutput("eligible RSC", await documentAt(baseUrl, `/producto/${ean}?_rsc=u17`, true));
}

async function denied(baseUrl: string) {
  for (const path of routes) {
    const html = await documentAt(baseUrl, path);
    assertDeniedGovernedHtml(`${path} HTML/head`, html);
    assert.match(html, /El catálogo no está disponible|Canasta/, `${path} retained its static shell or unavailable state`);
  }
  const sitemap = await documentAt(baseUrl, "/sitemap.xml");
  assertDeniedGovernedOutput("sitemap", sitemap);
  assert.match(sitemap, /categoria\/almacen/, "denied sitemap retains static taxonomy");
  assertDeniedGovernedRsc("denied RSC", await documentAt(baseUrl, `/producto/${ean}?_rsc=u17-denied`, true));
}

async function browserMatrix(browser: Browser, baseUrl: string, denied: boolean) {
  const page = await browser.newPage({ baseURL: baseUrl });
  try {
    await page.goto(`/buscar?q=Snapshot`, { waitUntil: "networkidle" });
    await page.locator('a[href="/ofertas"]').first().hover();
    await page.waitForLoadState("networkidle"); // drain any representative Next prefetch before navigation/teardown
    await page.locator('a[href="/ofertas"]').first().click();
    await page.waitForURL("**/ofertas");
    await page.waitForLoadState("networkidle");
    const content = await page.content();
    if (denied) {
      assertDeniedGovernedHtml("denied client navigation/prefetch", content);
      assert.equal(await page.locator('[role="alert"]').filter({ hasText: "El catálogo no está disponible." }).count(), 1);
    } else {
      assert.match(content, new RegExp(promotionTitle), "eligible client navigation omitted promotion");
    }
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [basketStorageKey, createBasketStorageValue()]);
    const batchResponse = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === "POST" && new URL(response.url()).pathname === "/api/products/batch";
    });
    await page.goto("/canasta", { waitUntil: "domcontentloaded" });
    const batch = await batchResponse;
    await batch.body();
    if (denied) {
      assert.equal(batch.status(), 503, "denied basket batch request must be unavailable");
      await page.getByRole("alert").filter({ hasText: /catálogo.*no disponible/i }).waitFor();
    } else {
      assert.equal(batch.status(), 200, "eligible basket batch request must succeed");
      await page.getByRole("heading", { name: productName }).waitFor();
    }
    await page.waitForLoadState("networkidle");
    const basket = await page.content();
    if (denied) assertDeniedGovernedHtml("denied basket browser", basket);
    else assert.match(basket, new RegExp(productName), "eligible basket omitted product");
  } finally { await page.close(); }
}

export async function runU17BuiltServerBrowserSmoke() {
  const databaseUrl = process.env.PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL;
  const identity = process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
  if (!databaseUrl || !identity) throw new Error("U17 browser smoke requires guarded database URL and serving identity");
  let server: ChildProcess | undefined;
  let browser: Browser | undefined;
  const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const redisUrl = await startRateLimitRedis();
    const port = await freePort();
    server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, REDIS_URL: redisUrl, VERCEL: "1", ADMIN_ENABLED: "false", CLERK_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k", CLERK_SECRET_KEY: "sk_test_placeholder" }, stdio: "inherit" });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitFor(`${baseUrl}/api/health/live`);
    browser = await chromium.launch({ headless: true });
    await eligible(baseUrl);
    await browserMatrix(browser, baseUrl, false);
    await database.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes DISABLE TRIGGER authority_lifecycle_outcomes_immutable");
    await database.$executeRawUnsafe("UPDATE public.authority_lifecycle_outcomes SET proof = '{}'::jsonb WHERE operation_id = 'authority'");
    await database.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes ENABLE TRIGGER authority_lifecycle_outcomes_immutable");
    await denied(baseUrl);
    await browserMatrix(browser, baseUrl, true);
    console.log("U17 built Next server/browser authority matrix passed.");
  } finally {
    await browser?.close();
    await stop(server);
    await database.$disconnect();
    docker(["rm", "--force", rateLimitContainer], [0, 1]);
  }
}

if (process.argv[1]?.endsWith("u17-built-server-browser-smoke.ts")) void runU17BuiltServerBrowserSmoke().catch((error) => { console.error(error); process.exitCode = 1; });
