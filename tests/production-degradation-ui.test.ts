import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lighthouseAssertions = {
  "categories:performance": ["warn", { minScore: 0.9 }],
  "categories:accessibility": ["error", { minScore: 0.9 }],
  "categories:best-practices": ["warn", { minScore: 0.9 }],
};

test("Lighthouse keeps SEO enforcement for indexable routes while excluding fail-closed catalog routes", () => {
  const config = JSON.parse(readFileSync("lighthouserc.json", "utf8"));
  const [indexableRoutes, unavailableCatalogRoutes] = config.ci.assert.assertMatrix;
  const matches = (entry: { matchingUrlPattern: string }, url: string) =>
    new RegExp(entry.matchingUrlPattern).test(url);

  assert.deepEqual(indexableRoutes.assertions, {
    ...lighthouseAssertions,
    "categories:seo": ["error", { minScore: 0.9 }],
  });
  assert.deepEqual(unavailableCatalogRoutes.assertions, lighthouseAssertions);

  for (const url of ["http://localhost:3000/", "http://localhost:3000/canasta", "http://localhost:3000/producto/leche"]) {
    assert.ok(matches(indexableRoutes, url));
    assert.ok(!matches(unavailableCatalogRoutes, url));
  }

  for (const url of ["http://localhost:3000/ofertas", "http://localhost:3000/buscar?q=leche"]) {
    assert.ok(!matches(indexableRoutes, url));
    assert.ok(matches(unavailableCatalogRoutes, url));
  }
});

test("public catalog pages never replace unavailable data with demos", () => {
  const searchPage = readFileSync("src/app/buscar/page.tsx", "utf8");
  const offersPage = readFileSync("src/app/ofertas/page.tsx", "utf8");

  assert.doesNotMatch(searchPage, /getDemoProductPage|isCatalogRuntimeAvailable/);
  assert.match(searchPage, /No podemos mostrar resultados reales en este momento/);
  assert.doesNotMatch(offersPage, /getDemoPromotions|getDemoProductPage|const fallback/);
  assert.match(offersPage, /resolveGuardedCatalogPage/);
  assert.doesNotMatch(offersPage, /resolvePublicCatalogData/);
  assert.match(offersPage, /No podemos mostrar promociones ni descuentos reales en este momento/);
});

test("category pages fail closed when catalog authority is unavailable", () => {
  const categoryPage = readFileSync("src/app/categoria/[slug]/page.tsx", "utf8");

  assert.doesNotMatch(categoryPage, /getDemoProductPage|resolvePublicCatalogData|const fallback/);
  assert.match(categoryPage, /page\.availability === "unavailable"/);
  assert.match(categoryPage, /No podemos mostrar productos reales en este momento/);
  assert.match(categoryPage, /<CategoryCatalogState category=\{category\} page=\{page\} \/>/);
});

test("historical catalog data is announced without demo claims", () => {
  const notice = readFileSync("src/components/catalog-provenance-notice.tsx", "utf8");

  assert.match(notice, /role="status"/);
  assert.match(notice, /Información histórica del catálogo/);
  assert.doesNotMatch(notice, /demostración|ejemplos/i);
});

test("the basket denial UI preserves its shell while suppressing commercial facts", () => {
  const basketPage = readFileSync("src/components/canasta-page.tsx", "utf8");

  assert.match(basketPage, /catalogUnavailable/);
  assert.match(basketPage, /role="alert"/);
  assert.match(basketPage, /El catálogo está temporalmente no disponible/);
  assert.match(basketPage, /ocultamos productos y precios/);
  assert.match(basketPage, /setProductsByEan\(\{\}\)/);
});

test("the browser smoke contracts catalog health runtime transitions", () => {
  const smoke = readFileSync("scripts/production-degradation-ui-smoke.ts", "utf8");

  assert.match(smoke, /(?:fetch|page\.request\.(?:get|fetch))\([^)]*["'`]\/api\/health\/catalog/);
  assert.match(smoke, /\b200\b[\s\S]{0,240}\{\s*status:\s*["']current["']\s*,\s*publication:\s*["']current["']\s*\}/);
  assert.match(smoke, /\b503\b[\s\S]{0,240}\{\s*status:\s*["']degraded["']\s*,\s*publication:\s*["']unproven["']\s*\}/);
});
