import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";

import { handleBasketProductsRequest } from "../src/lib/basket-products";

const ean = "7790002000022";
const fixture = { items: [{ ean, name: "Leche", brand: null, imageUrl: null, minPrice: 100,
  freshMinPrice: 100, hasFreshPrice: true, priceEntries: [] }], missing: [] };

function readJson(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    request.on("error", reject);
  });
}

async function startServer() {
  const server = createServer(async (request, response) => {
    const scenario = request.headers["x-catalog-scenario"];
    const verifiedAt = scenario === "fresh" ? new Date(Date.now() - 60 * 60 * 1000)
      : scenario === "historical" ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null;
    const result = await handleBasketProductsRequest(
      () => readJson(request),
      async () => fixture,
      async () => verifiedAt ? { verified_at: verifiedAt } : null,
    );
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function request(url: string, scenario: "fresh" | "historical" | "unavailable") {
  const response = await fetch(url, { method: "POST", headers: {
    "content-type": "application/json", "x-catalog-scenario": scenario,
  }, body: JSON.stringify({ eans: [ean] }) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function main() {
  const { server, url } = await startServer();
  try {
    const fresh = await request(url, "fresh");
    assert.equal(fresh.status, 200);
    assert.deepEqual({ dataSource: fresh.body.dataSource, degraded: fresh.body.degraded }, { dataSource: "database", degraded: false });
    assert.equal(typeof fresh.body.verifiedAt, "string");

    const historical = await request(url, "historical");
    assert.equal(historical.status, 200);
    assert.deepEqual({ dataSource: historical.body.dataSource, degraded: historical.body.degraded }, { dataSource: "database", degraded: true });

    const unavailable = await request(url, "unavailable");
    assert.equal(unavailable.status, 503);
    assert.deepEqual(unavailable.body, { error: "Catalog temporarily unavailable" });
    for (const body of [fresh.body, historical.body, unavailable.body]) assert.equal(JSON.stringify(body).includes('"demo"'), false);
    console.log("production catalog HTTP smoke passed: fresh 200, historical 200 degraded, unavailable 503, no demo payload");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

void main();
