import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HOME_HEADER_NAV,
  HOME_HERO,
  HOME_PRODUCT_ROWS,
  MARKET_PULSE_ITEMS,
  SMART_BASKET,
  getApprovedHomeCopy,
} from "../src/lib/home-ui-data";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const OVERWHELMING_COPY_PATTERN =
  /\b(dashboard|cockpit|fase|pipeline|instrumentaci[oó]n|observabilidad|production-ready|deploy|promos cargadas)\b/i;

describe("approved home visual slice content", () => {
  it("keeps the approved navigation, hero and signal copy focused on search first", () => {
    assert.deepEqual(HOME_HEADER_NAV.map((item) => item.label), ["Inicio", "Buscar", "Ofertas", "Canasta"]);
    assert.equal(HOME_HERO.heading, "Compará precios. Armá tu canasta. Comprá mejor.");
    assert.equal(
      HOME_HERO.body,
      "Buscá productos de supermercados argentinos, compará precios por EAN y descubrí dónde conviene resolver tu compra.",
    );
    assert.equal(HOME_HERO.searchPlaceholder, "Buscar leche, yerba, arroz, aceite...");
    assert.equal(HOME_HERO.quickSearches.length, 4);
    assert.ok(HOME_HERO.signals.length <= 3);
  });

  it("keeps the smart basket and product preview within the first approved slice", () => {
    assert.equal(SMART_BASKET.title, "Canasta inteligente");
    assert.equal(SMART_BASKET.products.length, 4);
    assert.equal(SMART_BASKET.ranking[0]?.badge, "Mejor canasta completa");
    assert.equal(SMART_BASKET.ranking.some((item) => item.status === "Falta 1"), true);
    assert.equal(HOME_PRODUCT_ROWS.length, 4);
    assert.equal(HOME_PRODUCT_ROWS.every((row) => row.action === "Agregar"), true);
    assert.equal(MARKET_PULSE_ITEMS.length, 3);
  });

  it("does not introduce emojis or overwhelming technical copy in the visible slice", () => {
    const copy = getApprovedHomeCopy().join(" ");

    assert.doesNotMatch(copy, EMOJI_PATTERN);
    assert.doesNotMatch(copy, OVERWHELMING_COPY_PATTERN);
  });
});
