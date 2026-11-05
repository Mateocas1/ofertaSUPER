import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { filterPromotions, promotionPaymentNames } from "../src/app/ofertas/promotion-filters";
import { filterHref } from "../src/components/search/filter-href";
import { resultCountLabel } from "../src/components/search/result-count";
import type { PromotionSummary } from "../src/lib/catalog";

describe("search filters", () => {
  it("drops empty fields so 'Todos' and the default sort leave a clean URL", () => {
    assert.equal(filterHref("/buscar", [["q", "leche"], ["super", ""], ["sort", ""]]), "/buscar?q=leche");
    assert.equal(filterHref("/buscar", [["q", "leche"], ["super", "disco"], ["sort", "price-asc"]]), "/buscar?q=leche&super=disco&sort=price-asc");
    assert.equal(filterHref("/categoria/lacteos", [["super", ""], ["offers", "1"]]), "/categoria/lacteos?offers=1");
    assert.equal(filterHref("/ofertas", []), "/ofertas");
    assert.equal(filterHref("/buscar", [["q", "café & té"]]), "/buscar?q=caf%C3%A9+%26+t%C3%A9");
  });

  it("counts results in es-AR and says when only the first page is shown", () => {
    assert.equal(resultCountLabel(2656, 24), "2.656 productos · mostramos los primeros 24");
    assert.equal(resultCountLabel(3, 3), "3 productos");
    assert.equal(resultCountLabel(1, 1), "1 producto");
    assert.equal(resultCountLabel(0, 0), "0 productos");
  });
});

function promotion(overrides: Partial<PromotionSummary>): PromotionSummary {
  return {
    id: 1,
    title: "25% con Modo",
    type: "wallet_discount",
    discountValue: 25,
    walletProvider: "Modo",
    bankName: null,
    conditions: null,
    startDate: null,
    endDate: null,
    supermarket: { id: 1, name: "Disco", slug: "disco", logoUrl: null },
    productCount: 0,
    ...overrides,
  };
}

describe("/ofertas promotion filters", () => {
  const promotions = [
    promotion({ id: 1 }),
    promotion({ id: 2, type: "bank_discount", walletProvider: null, bankName: "Banco Galicia", supermarket: { id: 2, name: "Jumbo", slug: "jumbo", logoUrl: null } }),
    promotion({ id: 3, type: "2x1", walletProvider: null }),
  ];

  it("filters by supermarket, type and wallet or bank without accents or case", () => {
    assert.deepEqual(filterPromotions(promotions, {}).map(({ id }) => id), [1, 2, 3]);
    assert.deepEqual(filterPromotions(promotions, { supermarket: "jumbo" }).map(({ id }) => id), [2]);
    assert.deepEqual(filterPromotions(promotions, { type: "2x1" }).map(({ id }) => id), [3]);
    assert.deepEqual(filterPromotions(promotions, { wallet: "galicía" }).map(({ id }) => id), [2]);
    assert.deepEqual(filterPromotions(promotions, { wallet: "MODO", supermarket: "jumbo" }), []);
  });

  it("offers only the wallets and banks that appear in a promotion", () => {
    assert.deepEqual(promotionPaymentNames(promotions), ["Banco Galicia", "Modo"]);
    assert.deepEqual(promotionPaymentNames([]), []);
  });
});

describe("search and offers page contract", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("keeps the fail-closed copy the browser test relies on", () => {
    const states = read("src/components/search/catalog-states.tsx");
    assert.match(states, /role="alert"/);
    assert.match(states, /El catálogo no está disponible\./);
    assert.match(read("src/app/buscar/page.tsx"), /No podemos mostrar resultados reales/);
  });

  it("drops the admin-flavored /ofertas copy and English", () => {
    const offers = read("src/app/ofertas/page.tsx");
    for (const banned of [/list price/i, /\bhub\b/i, /Carga manual administrable/, /Promos manuales/]) {
      assert.doesNotMatch(offers, banned);
    }
    assert.match(offers, /promotions\.length > 0 \? <PromotionsSection/, "promotions render only when they exist");
  });

  it("never claims live prices on the redesigned listing surfaces", () => {
    // Same pattern as tests/public-copy-claims.test.ts, over the files this
    // redesign owns that the shared list does not cover.
    const livePrice = /\b(Mercado vivo|precio actual|precio real|(?<!no )(?<!no son )(?<!no muestra )precios actuales|mejor total actual|en vivo|Actualizado hoy|Datos actualizados hoy|última semana|ultima semana)\b/i;
    for (const path of [
      "src/app/buscar/page.tsx",
      "src/app/categoria/[slug]/page.tsx",
      "src/components/product-card.tsx",
      "src/lib/product-card-offers.ts",
      "src/components/stale-results-notice.tsx",
      "src/components/catalog-provenance-notice.tsx",
    ]) {
      assert.doesNotMatch(read(path), livePrice, path);
    }
  });

  it("keeps product cards free of debug data and decoration", () => {
    const card = read("src/components/product-card.tsx");
    for (const banned of [/EAN \{/, /font-mono/, /rounded-full/, /\blift\b/, /uppercase/, /border-dashed/, /supers con precio/, /slice\(0, 3\)/]) {
      assert.doesNotMatch(card, banned);
    }
  });
});
