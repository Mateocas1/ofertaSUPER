import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeQuery, searchSnapshotProducts, snapshotMatchRank } from "../src/lib/catalog-snapshot";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// Behavioral tests for the snapshot search ranking: exact EAN first, then
// names that start with the term as a whole word, then names that start with
// it mid-word, then whole-word matches not preceded by "de", then every other
// name or brand match; inside each tier the generic product precedes the
// specialized one. Stable tiebreak: more supermarkets with an offer first,
// then the name. The snapshot-driven cases run against the committed fixture,
// never against the daily-refreshed data.
const FIXTURE = installSnapshotFixture();

const LECHE = { ean: "7790001000011", name: "Leche Entera La Serenísima 1L", brand: "La Serenísima" };
const DULCE = { ean: "7790002000022", name: "Dulce de Leche Milkaut", brand: "Milkaut" };
const CHOCO = { ean: "7790003000033", name: "Chocolate Sabor Leche", brand: "Milka" };

function productsWithOffers(entries: Array<{ ean: string; supers: number }>) {
  return entries.flatMap(({ ean, supers }) =>
    Array.from({ length: supers }, (_, index) => ({ ean, source: `super${index}` })),
  );
}

describe("snapshot search ranking", () => {
  it("ranks exact EAN matches before everything else", () => {
    assert.equal(snapshotMatchRank(LECHE, "7790001000011"), 0);
    assert.ok(snapshotMatchRank(LECHE, "7790001000011") < snapshotMatchRank({ ...LECHE, ean: "1" }, "7790001000011"));
  });

  it("ranks names that start with the term above whole-word matches", () => {
    assert.equal(snapshotMatchRank(LECHE, "leche"), 1);
    assert.equal(snapshotMatchRank(CHOCO, "leche"), 5);
  });

  it("ignores whole-word matches preceded by 'de' and accents", () => {
    assert.equal(snapshotMatchRank(DULCE, "leche"), 7);
    assert.equal(snapshotMatchRank({ ean: "1", name: "Café en grano" }, "cafe"), 1);
    assert.equal(snapshotMatchRank({ ean: "2", name: "Mi Cafetera" }, "cafe"), 7);
    assert.equal(snapshotMatchRank({ ean: "3", name: "Soluble de Café" }, "cafe"), 7);
  });

  it("orders q=leche with the real milk before chocolate and dulce de leche", () => {
    const ranked = [
      { product: DULCE, offers: productsWithOffers([{ ean: DULCE.ean, supers: 1 }]) },
      { product: CHOCO, offers: productsWithOffers([{ ean: CHOCO.ean, supers: 1 }]) },
      { product: LECHE, offers: productsWithOffers([{ ean: LECHE.ean, supers: 1 }]) },
    ];
    const sorted = [...ranked].sort(
      (a, b) => snapshotMatchRank(a.product, "leche") - snapshotMatchRank(b.product, "leche"),
    );
    assert.deepEqual(sorted.map(({ product }) => product.name), [
      "Leche Entera La Serenísima 1L",
      "Chocolate Sabor Leche",
      "Dulce de Leche Milkaut",
    ]);
  });

  it("breaks ties by supermarkets with an offer, then name", () => {
    const result = searchSnapshotProducts({ query: "leche" });
    assert.ok(result.products.length > 1);
    const supersWithOffer = ({ offers }: { offers: { available: boolean; price: number | null }[] }) =>
      offers.filter((offer) => offer.available && offer.price !== null).length;
    for (let index = 0; index < result.products.length - 1; index += 1) {
      const left = result.products[index];
      const right = result.products[index + 1];
      const rankDiff = snapshotMatchRank(left.product, "leche") - snapshotMatchRank(right.product, "leche");
      if (rankDiff !== 0) {
        assert.ok(rankDiff < 0, "ranks must be non-decreasing");
        continue;
      }
      const supersDiff = supersWithOffer(right) - supersWithOffer(left);
      assert.ok(supersDiff <= 0, "ties must favor more supermarkets with an offer");
      if (supersDiff === 0) {
        assert.ok(left.product.name.localeCompare(right.product.name) <= 0, "ties must end in name order");
      }
    }
  });

  it("serves /buscar?q=leche with a milk product first", () => {
    const result = searchSnapshotProducts({ query: "leche" });
    assert.ok(result.total > 0);
    const firstName = normalizeQuery(result.products[0].product.name);
    assert.ok(firstName.startsWith("leche"), `expected a product whose name starts with leche, got: ${result.products[0].product.name}`);
  });

  it("serves accent-insensitive searches with the accented product first", () => {
    const result = searchSnapshotProducts({ query: "cafe" });
    assert.ok(result.total > 0);
    const firstName = normalizeQuery(result.products[0].product.name);
    assert.ok(firstName.startsWith("cafe"), `expected a product whose name starts with cafe, got: ${result.products[0].product.name}`);
  });

  it("serves an EAN search with exactly that product first", () => {
    const product = FIXTURE.products[7];
    const result = searchSnapshotProducts({ query: product.ean });
    assert.equal(result.products[0].product.ean, product.ean);
  });
});

// Realistic retail names from the November 2026 snapshot. Before this ranking,
// q=leche opened with "Leche Bebé 2 de Continuación…" and "Leche Bebé
// Optipro…" (alphabetical among equally covered products), q=agua with
// micellar water and q=pan with diapers ("Pañal" normalizes to "panal").
function rankNames(query: string, products: Array<{ name: string; category?: string | null }>) {
  return products
    .map((product, index) => ({ ...product, ean: String(9_000_000 + index) }))
    .sort((left, right) => snapshotMatchRank(left, query) - snapshotMatchRank(right, query) || left.name.localeCompare(right.name))
    .map(({ name }) => name);
}

describe("generic queries rank the generic product first", () => {
  it("q=leche puts plain milk before baby formula, flavored and powdered milk", () => {
    const ranked = rankNames("leche", [
      { name: "Leche Bebé 2 de Continuación 200 Ml Nidina", category: "Bebés" },
      { name: "Leche Bebé Optipro 1 190 Ml Nan", category: "Bebés" },
      { name: "Leche chocolatada Cindor 1 lt", category: "Lácteos" },
      { name: "Leche Cultivada Sabor Naranja 100 Grs Actimel", category: "Lácteos" },
      { name: "Leche En Polvo Clásica La Serenisima 800g", category: "Lácteos" },
      { name: "Leche Y Tónico Micelar Nivea 200 Ml", category: "Perfumería" },
      { name: "Leche Uat Nutrilon 2 200 Ml", category: "Bebés" },
      { name: "Leche Entera 3% Sachet 1 Lts La Serenísima", category: "Lácteos" },
      { name: "Leche Descremada 1 Lts Tregar", category: "Lácteos" },
      { name: "Dulce de Leche Milkaut 400g", category: "Lácteos" },
    ]);
    assert.deepEqual(ranked.slice(0, 2), ["Leche Descremada 1 Lts Tregar", "Leche Entera 3% Sachet 1 Lts La Serenísima"]);
    assert.equal(ranked.at(-1), "Dulce de Leche Milkaut 400g");
  });

  it("does not penalize a specializing word the query asks for", () => {
    const powder = { ean: "1", name: "Leche En Polvo Clásica La Serenisima 800g", category: "Lácteos" };
    const fluid = { ean: "2", name: "Leche Entera 1 Lts Ilolay", category: "Lácteos" };
    assert.equal(snapshotMatchRank(powder, "leche en polvo"), 1);
    assert.ok(snapshotMatchRank(powder, "leche") > snapshotMatchRank(fluid, "leche"));
    assert.equal(snapshotMatchRank({ ean: "3", name: "Leche Bebé Optipro 1 190 Ml Nan", category: "Bebés" }, "leche bebe"), 2,
      "a non-staple category stays a uniform penalty: every baby milk shares it");
  });

  it("treats a connector right after the term as a compound product, but not 'de'", () => {
    const ranked = rankNames("arroz", [
      { name: "Arroz Con Leche Clasico Tregar 180 Grm", category: "Lácteos" },
      { name: "Arroz Para Sushi 400 Gr", category: "Almacén" },
      { name: "Arroz Preparado Sabor Queso 240 Grs Gallo", category: "Almacén" },
      { name: "Arroz Largo Fino 1 Kg Cuisine y Co", category: "Almacén" },
    ]);
    assert.equal(ranked[0], "Arroz Largo Fino 1 Kg Cuisine y Co");
    assert.equal(snapshotMatchRank({ ean: "1", name: "Aceite de Girasol 1,5 Lts Natura", category: "Almacén" }, "aceite"), 1);
  });

  it("answers food before cleansers and cosmetics that share the word", () => {
    assert.deepEqual(rankNames("agua", [
      { name: "Agua Micelar 5 En 1 Refrescante 200 Ml Nivea", category: "Perfumería" },
      { name: "Agua Mineral Sin Gas 2 Lts Cellier", category: "Bebidas" },
    ]), ["Agua Mineral Sin Gas 2 Lts Cellier", "Agua Micelar 5 En 1 Refrescante 200 Ml Nivea"]);
    assert.deepEqual(rankNames("aceite", [
      { name: "Aceite Aromatizante Harmony Repuesto 21ml Glade", category: "Limpieza" },
      { name: "Aceite de maíz Arcor 900 cc.", category: "Almacén" },
    ]), ["Aceite de maíz Arcor 900 cc.", "Aceite Aromatizante Harmony Repuesto 21ml Glade"]);
  });

  it("ranks a whole-word start above a mid-word start", () => {
    const ranked = rankNames("pan", [
      { name: "Pañales Babysec Ultrasoft G 40 Un", category: "Bebés" },
      { name: "PANTENE Pro-V Miracles Shampoo 750 Ml", category: "Higiene Personal" },
      { name: "Panceta Ahumada Feteada 100 Grs", category: "Carnes" },
      { name: "Pan de Molde Briosh 315 Grs", category: "Panadería" },
    ]);
    assert.deepEqual(ranked.slice(0, 2), ["Pan de Molde Briosh 315 Grs", "Panceta Ahumada Feteada 100 Grs"]);
    assert.equal(snapshotMatchRank({ ean: "1", name: "Pañales Babysec Ultrasoft G 40 Un", category: "Bebés" }, "pan"), 4);
  });

  it("still ranks a partially typed term by its generic product first", () => {
    assert.deepEqual(rankNames("lech", [
      { name: "Leche Bebé Optipro 1 190 Ml Nan", category: "Bebés" },
      { name: "Leche chocolatada Cindor 1 lt", category: "Lácteos" },
      { name: "Leche Entera 1 Lts Ilolay", category: "Lácteos" },
    ])[0], "Leche Entera 1 Lts Ilolay");
  });

  it("serves the committed fixture's q=leche with plain milk before chocolate and powder", () => {
    const result = searchSnapshotProducts({ query: "leche", pageSize: Number.MAX_SAFE_INTEGER });
    const names = result.products.map(({ product }) => product.name);
    const firstSpecialized = Math.min(names.indexOf("Leche Chocolatada La Serenísima 1L"), names.indexOf("Leche en Polvo Nido 800g"));
    const lastPlain = Math.max(names.indexOf("Leche Entera La Serenísima 1L"), names.indexOf("Leche Descremada Ilolay 1L"));
    assert.ok(lastPlain >= 0 && firstSpecialized > lastPlain, names.join(" | "));
  });
});
