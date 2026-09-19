import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildSitemap } from "../src/lib/sitemap";

const categories = [{ slug: "almacen", children: [{ slug: "aceites" }] }];

test("sitemap combines static routes with independently static categories and guarded products", async () => {
  const routes = await buildSitemap(async () => ({
    products: [{ ean: "7790000000001" }],
  }), categories, () => false);

  assert.deepEqual(routes.map(({ url }) => new URL(url).pathname), [
    "/", "/ofertas", "/buscar", "/categoria/almacen", "/categoria/aceites", "/producto/7790000000001",
  ]);
  assert.equal(routes.at(-1)?.lastModified, undefined);
});

test("known catalog unavailability retains independently static taxonomy without EANs or commercial timestamps", async () => {
  const unavailable = new Error("offline");
  const routes = await buildSitemap(async () => { throw unavailable; }, categories, (error) => error === unavailable);

  assert.deepEqual(routes.map(({ url }) => new URL(url).pathname), ["/", "/ofertas", "/buscar", "/categoria/almacen", "/categoria/aceites"]);
  assert.ok(routes.every(({ lastModified }) => lastModified === undefined));
  assert.equal(JSON.stringify(routes).includes("7790000000001"), false);
});

test("metadata route is dynamic and only reads guarded serving products", () => {
  const source = readFileSync("src/app/sitemap.ts", "utf8");

  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /resolvePublicCatalogDataFromGuardedRead/);
  assert.match(source, /createPublicCatalogGuardedRead/);
  assert.match(source, /servingProduct\.findMany/);
  assert.match(source, /async \(projection\) => \(\{\s*products: await projection\.servingProduct\.findMany\(/);
  assert.match(source, /catalog\.products\.map\(\(\{ ean \}\) => \(\{ ean \}\)\)/);
  assert.match(source, /DETAILED_CATEGORIES/);
  assert.doesNotMatch(source, /\bdb\.|getCategories|revalidate/);
});

test("programming errors escape the catalog availability boundary", async () => {
  await assert.rejects(
    buildSitemap(async () => { throw new TypeError("broken mapper"); }, categories, () => false),
    TypeError,
  );
});
