import assert from "node:assert/strict";
import test from "node:test";

import { buildSitemap } from "../src/lib/sitemap";

const categories = [{ slug: "almacen", children: [{ slug: "aceites" }] }];

test("sitemap combines static routes with independently static categories and guarded products", async () => {
  const routes = await buildSitemap(async () => ({
    products: [{ ean: "7790000000001" }],
  }), categories, () => false);

  assert.deepEqual(routes.map(({ url }) => new URL(url).pathname), [
    "/", "/ofertas", "/bajas", "/bajas/feed.xml", "/buscar", "/categoria/almacen", "/categoria/aceites", "/producto/7790000000001",
  ]);
  assert.equal(routes.at(-1)?.lastModified, undefined);
});

test("sitemap lists every product under its canonical GTIN-14 URL", async () => {
  const routes = await buildSitemap(async () => ({
    products: [{ ean: "2505271000004" }, { ean: "02505271000004" }],
  }), categories, () => false);

  const productPaths = routes
    .map(({ url }) => new URL(url).pathname)
    .filter((path) => path.startsWith("/producto/"));
  assert.deepEqual(productPaths, ["/producto/02505271000004", "/producto/02505271000004"]);
});

test("known catalog unavailability retains independently static taxonomy without EANs or commercial timestamps", async () => {
  const unavailable = new Error("offline");
  const routes = await buildSitemap(async () => { throw unavailable; }, categories, (error) => error === unavailable);

  assert.deepEqual(routes.map(({ url }) => new URL(url).pathname), [
    "/", "/ofertas", "/bajas", "/bajas/feed.xml", "/buscar", "/categoria/almacen", "/categoria/aceites",
  ]);
  assert.ok(routes.every(({ lastModified }) => lastModified === undefined));
  assert.equal(JSON.stringify(routes).includes("7790000000001"), false);
});

test("programming errors escape the catalog availability boundary", async () => {
  await assert.rejects(
    buildSitemap(async () => { throw new TypeError("broken mapper"); }, categories, () => false),
    TypeError,
  );
});
