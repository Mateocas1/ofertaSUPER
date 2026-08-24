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
