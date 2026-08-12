import assert from "node:assert/strict";
import test from "node:test";

import { buildSitemap } from "../src/lib/sitemap";

const now = new Date("2026-08-12T12:00:00.000Z");
const checkedAt = new Date("2026-08-12T10:00:00.000Z");

test("sitemap combines static routes with database categories and products", async () => {
  const routes = await buildSitemap(async () => ({
    categories: [{ slug: "almacen", children: [{ slug: "aceites", children: [] }] }],
    products: [{ ean: "7790000000001", lastCheckedAt: checkedAt }],
  }), now);

  assert.deepEqual(routes.map(({ url }) => new URL(url).pathname), [
    "/", "/ofertas", "/buscar", "/categoria/almacen", "/categoria/aceites", "/producto/7790000000001",
  ]);
  assert.equal(routes.at(-1)?.lastModified, checkedAt);
  assert.equal(routes[0]?.lastModified, now);
});

test("known catalog unavailability returns only valid static routes", async () => {
  const unavailable = new Error("offline");
  const routes = await buildSitemap(async () => { throw unavailable; }, now, (error) => error === unavailable);

  assert.deepEqual(routes.map(({ url }) => new URL(url).pathname), ["/", "/ofertas", "/buscar"]);
  assert.ok(routes.every(({ lastModified }) => lastModified === now));
});

test("programming errors escape the catalog availability boundary", async () => {
  await assert.rejects(
    buildSitemap(async () => { throw new TypeError("broken mapper"); }, now, () => false),
    TypeError,
  );
});
