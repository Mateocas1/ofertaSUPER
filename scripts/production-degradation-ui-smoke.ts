import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "@playwright/test";

const prefix = "ofertasuper-production-readiness-";
const container = `${prefix}${randomUUID()}`;
const localFixture = "local-fixture-not-authority";
let browser: Browser | undefined;
let server: ChildProcess | undefined;
let db: PrismaClient | undefined;
let cleaned = false;

function docker(args: string[], accepted = [0]) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error || !accepted.includes(result.status ?? 1)) throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown error"}`);
  return result.stdout.trim();
}

async function command(command: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)));
  });
}

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const { port } = address;
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(url: string, label: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become available`);
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", container, "pg_isready", "-U", "postgres"], [0, 1, 2]).includes("accepting connections")) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("postgres did not become available");
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  await browser?.close().catch(() => undefined);
  await stop(server).catch(() => undefined);
  await db?.$disconnect().catch(() => undefined);
  const names = docker(["ps", "-aq", "--filter", `name=^/${prefix}`], [0, 1]).split("\n").filter(Boolean);
  if (names.length) docker(["rm", "--force", ...names], [0, 1]);
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(code)); });
}

async function seed(url: string) {
  db = new PrismaClient({ datasources: { db: { url } } });
  const supermarket = await db.supermarket.create({ data: { name: "Supermercado Real", slug: "real", base_url: "https://example.test", is_vtex: false } });
  const product = await db.product.create({ data: { ean: "7790000000001", name: "Yerba mate real", brand: "Marca real", category: "Almacén" } });
  await db.supermarketProduct.create({ data: { product_ean: product.ean, supermarket_id: supermarket.id, price: 1000, list_price: 1200, is_available: true, last_checked_at: new Date() } });
  const promotion = await db.promotion.create({ data: { supermarket_id: supermarket.id, type: "PERCENTAGE", title: "Promoción real de yerba", discount_value: 20, is_active: true } });
  await db.promotionProduct.create({ data: { promotion_id: promotion.id, product_ean: product.ean } });
  const readiness = await db.productionReadinessPromotion.create({ data: {
    candidate_digest: `browser-${randomUUID()}`, deployment_id: "local-browser", commit_sha: "local-browser", owner: "local-browser", rollback_authority: localFixture,
    expires_at: new Date(Date.now() + 60 * 60 * 1000), state: "PROMOTED",
  } });
  return db.productionReadinessPublication.create({ data: { promotion_id: readiness.id, target: "production", state: "PROMOTED", verified_at: new Date(Date.now() - 60_000) } });
}

async function expectCatalogHealth(baseUrl: string, state: "fresh" | "degraded") {
  const response = await fetch(new URL("/api/health/catalog", baseUrl));
  if (state === "fresh") {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "current", publication: "current" });
  } else {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "degraded", publication: "unproven" });
  }
}

async function cacheEvidence(page: Page) {
  const entries = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))).flat().map((request) => new URL(request.url).pathname);
  });
  assert.deepEqual(entries.filter((path) => path === "/buscar" || path === "/ofertas"), []);
}

async function expectState(page: Page, path: string, state: "fresh" | "historical" | "unavailable") {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(100);
  assert.equal(await page.getByText(/demostración|datos de demostración/i).count(), 0, `${path} rendered a demo canary`);
  const catalogAlert = page.locator('[role="alert"]').filter({ hasText: "El catálogo no está disponible." });
  const historicalStatus = page.locator('[role="status"]').filter({ hasText: "Información histórica del catálogo." });
  if (state === "unavailable") {
    assert.equal(await catalogAlert.count(), 1, `${path} did not expose one unavailable alert`);
    assert.equal(await catalogAlert.isVisible(), true, `${path} unavailable alert was hidden`);
    assert.equal(await page.getByRole("heading", { name: "Yerba mate real" }).count(), 0, `${path} retained a catalog card while unavailable`);
  } else {
    assert.equal(await catalogAlert.count(), 0, `${path} exposed an unavailable alert`);
    assert.equal(await page.getByRole("heading", { name: "Yerba mate real" }).count(), 1, `${path} did not retain real catalog content`);
    assert.equal(await historicalStatus.count(), state === "historical" ? 1 : 0, `${path} exposed the wrong historical status count`);
    if (state === "historical") assert.equal(await historicalStatus.isVisible(), true, `${path} historical status was hidden`);
    if (path === "/ofertas") assert.equal(await page.getByRole("heading", { name: "Promoción real de yerba" }).count(), 1);
  }
  await cacheEvidence(page);
}

async function main() {
  const postgresPort = await freePort();
  docker(["run", "--detach", "--rm", "--name", container, "--publish", `127.0.0.1:${postgresPort}:5432`, "-e", "POSTGRES_PASSWORD=local-browser", "postgres:16-alpine"]);
  await waitForPostgres();
  const databaseUrl = `postgresql://postgres:local-browser@127.0.0.1:${postgresPort}/postgres`;
  await command("node_modules/.bin/prisma", ["migrate", "deploy"], { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl });
  const publication = await seed(databaseUrl);
  const webPort = await freePort();
  server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", String(webPort)], { env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, ADMIN_ENABLED: "false", CLERK_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k", CLERK_SECRET_KEY: "sk_test_placeholder" }, stdio: "inherit" });
  await waitFor(`http://127.0.0.1:${webPort}/api/health/live`, "Next production server");
  browser = await chromium.launch({ headless: true });
  const baseUrl = `http://127.0.0.1:${webPort}`;
  const page = await browser.newPage({ baseURL: baseUrl });
  await page.goto("/"); await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expectCatalogHealth(baseUrl, "fresh");
  for (const path of ["/buscar?q=yerba", "/ofertas"]) await expectState(page, path, "fresh");
  await db!.productionReadinessPublication.update({ where: { id: publication.id }, data: { verified_at: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  await expectCatalogHealth(baseUrl, "degraded");
  await expectState(page, "/buscar?q=yerba", "historical");
  await db!.productionReadinessPublication.update({ where: { id: publication.id }, data: { verified_at: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000) } });
  await expectState(page, "/ofertas", "historical");
  await db!.productionReadinessPublication.update({ where: { id: publication.id }, data: { verified_at: null } });
  await expectCatalogHealth(baseUrl, "degraded");
  await expectState(page, "/buscar?q=yerba", "unavailable");
  await expectState(page, "/ofertas", "unavailable");
  console.log("production degradation UI smoke passed: fresh, historical, unavailable, no demos, and no catalog navigation cache entries");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => cleanup());
