import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSimplePromotion } from "../src/lib/promotions/simple-promos";

// Gate 4c: strict recognition of Carrefour simple promotions from the real
// PromotionTeasers[].Name values recorded by the 4b probe. Anything that does
// not match the rule — or belongs to a card, bank or fidelity program — is
// ignored; no label is ever invented.

describe("simple promotion parser", () => {
  it("recognizes '2do al X%' as nth-unit with max units when present", () => {
    assert.deepEqual(
      parseSimplePromotion("PROMO-2do al 70% Max 24 unidades Iguales-Reg-2-70-Gigante23 al 1.10"),
      { type: "nth-unit", nth: 2, percent: 70, maxUnits: 24, label: "2do al 70%" },
    );
    assert.deepEqual(
      parseSimplePromotion("PROMO-2do al 50% Max 8 unidades Combinable LUCCHETTI-Reg-2-50-Gigante23 al 1.10"),
      { type: "nth-unit", nth: 2, percent: 50, maxUnits: 8, label: "2do al 50%" },
    );
    assert.deepEqual(
      parseSimplePromotion("2do al 25%"),
      { type: "nth-unit", nth: 2, percent: 25, maxUnits: null, label: "2do al 25%" },
    );
  });

  it("recognizes 'X% Off' as percent-off with max units when present", () => {
    assert.deepEqual(
      parseSimplePromotion("PROMO-Exclusivo online 30% Off -Reg-1-30-Nestle23/9 al 1/10"),
      null,
      "'Exclusivo online' stays out of v1 per scope",
    );
    assert.deepEqual(
      parseSimplePromotion("35% Off en Lácteos"),
      { type: "percent-off", percent: 35, maxUnits: null, label: "35% OFF" },
    );
    assert.deepEqual(
      parseSimplePromotion("15% Off Max 6 unidades"),
      { type: "percent-off", percent: 15, maxUnits: 6, label: "15% OFF" },
    );
  });

  it("rejects card, bank and fidelity promotions even when they contain a percent", () => {
    assert.equal(parseSimplePromotion("Tarjeta Carrefour 15%"), null);
    assert.equal(parseSimplePromotion("PROMO-35% Off Mi Crf Max 12 unidades -Reg-1-35-Gigante23 al 1.10"), null);
    assert.equal(parseSimplePromotion("PROMO-Mi CRF -mfl-1-7-Dto de 7% Doble Precio"), null);
    assert.equal(parseSimplePromotion("12 cuotas sin interés"), null);
    assert.equal(parseSimplePromotion("Banco Galicia 20% Off"), null);
  });

  it("rejects anything that does not match the strict rules", () => {
    assert.equal(parseSimplePromotion("Hasta 2do al 70% en Almacén y Bebidas"), null, "campaign badges are not product promos");
    assert.equal(parseSimplePromotion("Semana Italiana"), null);
    assert.equal(parseSimplePromotion("PROMO-2x1 en Panificados"), null, "2x1 is not in the v1 rule set");
    assert.equal(parseSimplePromotion(""), null);
  });
});
