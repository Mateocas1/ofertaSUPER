import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public catalog pages never replace unavailable data with demos", () => {
  const searchPage = readFileSync("src/app/buscar/page.tsx", "utf8");
  const offersPage = readFileSync("src/app/ofertas/page.tsx", "utf8");

  assert.doesNotMatch(searchPage, /getDemoProductPage|isCatalogRuntimeAvailable/);
  assert.match(searchPage, /No podemos mostrar resultados reales en este momento/);
  assert.doesNotMatch(offersPage, /getDemoPromotions|getDemoProductPage|const fallback/);
  assert.match(offersPage, /resolvePublicCatalogData/);
  assert.match(offersPage, /No podemos mostrar promociones ni descuentos reales en este momento/);
});

test("historical catalog data is announced without demo claims", () => {
  const notice = readFileSync("src/components/catalog-provenance-notice.tsx", "utf8");

  assert.match(notice, /role="status"/);
  assert.match(notice, /Información histórica del catálogo/);
  assert.doesNotMatch(notice, /demostración|ejemplos/i);
});

test("the PWA never caches catalog navigation as a healthy page", () => {
  const pwaConfig = readFileSync("next.config.ts", "utf8");

  assert.match(pwaConfig, /cacheOnFrontEndNav:\s*false/);
  assert.match(pwaConfig, /url\.pathname === "\/buscar"/);
  assert.match(pwaConfig, /url\.pathname === "\/ofertas"/);
  assert.match(pwaConfig, /handler:\s*"NetworkOnly"/);
  assert.match(pwaConfig, /extendDefaultRuntimeCaching:\s*true/);
});

test("the browser smoke contracts catalog health runtime transitions", () => {
  const smoke = readFileSync("scripts/production-degradation-ui-smoke.ts", "utf8");

  assert.match(smoke, /(?:fetch|page\.request\.(?:get|fetch))\([^)]*["'`]\/api\/health\/catalog/);
  assert.match(smoke, /\b200\b[\s\S]{0,240}\{\s*status:\s*["']current["']\s*,\s*publication:\s*["']current["']\s*\}/);
  assert.match(smoke, /\b503\b[\s\S]{0,240}\{\s*status:\s*["']degraded["']\s*,\s*publication:\s*["']unproven["']\s*\}/);
});
