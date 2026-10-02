import {
  parseCatalogSnapshot,
  setSnapshotOverrideForTests,
  type CatalogSnapshot,
} from "../../src/lib/catalog-snapshot";

// The daily cloud refresh rewrites data/catalog-snapshot.json without running
// the test suite, so behavior tests read this committed fixture instead of the
// real data. It is built here, not loaded from a JSON blob, so the data the
// tests rely on is visible next to them. `tests/catalog-snapshot-schema.test.ts`
// keeps a schema-only check over the real file, so a broken export still fails.

const GENERATED_AT = "2026-01-15T12:00:00.000Z";
const FRESH = "2026-01-15T11:00:00.000Z";
const RECENT = "2026-01-15T10:00:00.000Z";
const OLDER = "2026-01-12T10:00:00.000Z";
const OBSERVED_AT: Record<string, string> = { carrefour: FRESH, disco: RECENT, jumbo: OLDER };
const EARLIER_POINTS = ["2026-01-05T10:00:00.000Z", "2026-01-10T10:00:00.000Z"];

const PRODUCTS: Array<[string, string, string]> = [
  ["Leche Entera La Serenísima 1L", "La Serenísima", "Lácteos"],
  ["Leche Descremada La Serenísima 1L", "La Serenísima", "Lácteos"],
  ["Leche Entera Sancor 3% 1L", "Sancor", "Lácteos"],
  ["Leche Descremada Sancor 1L", "Sancor", "Lácteos"],
  ["Leche Entera Ilolay 1L", "Ilolay", "Lácteos"],
  ["Leche Entera Milkaut 1L", "Milkaut", "Lácteos"],
  ["Leche Chocolatada La Serenísima 1L", "La Serenísima", "Lácteos"],
  ["Leche Entera Manfrey 1L", "Manfrey", "Lácteos"],
  ["Leche Descremada Ilolay 1L", "Ilolay", "Lácteos"],
  ["Leche en Polvo Nido 800g", "Nestlé", "Lácteos"],
  ["Leche Entera La Sibila 1L", "La Sibila", "Lácteos"],
  ["Leche Deslactosada La Serenísima 1L", "La Serenísima", "Lácteos"],
  ["Dulce de Leche Milkaut 400g", "Milkaut", "Lácteos"],
  ["Yogur Natural Yogurísimo 1kg", "Yogurísimo", "Lácteos"],
  ["Queso Crema Casancrem 300g", "Casancrem", "Lácteos"],
  ["Manteca La Serenísima 200g", "La Serenísima", "Lácteos"],
  ["Café Molido La Morenita 500g", "La Morenita", "Almacén"],
  ["Café en Grano Cabrales 1kg", "Cabrales", "Almacén"],
  ["Yerba Mate Taragüí 1kg", "Taragüí", "Almacén"],
  ["Arroz Largo Fino Gallo Oro 1kg", "Gallo Oro", "Almacén"],
  ["Aceite de Girasol Natura 1,5L", "Natura", "Almacén"],
  ["Azúcar Ledesma 1kg", "Ledesma", "Almacén"],
  ["Fideos Matarazzo 500g", "Matarazzo", "Almacén"],
  ["Harina Pureza 000 1kg", "Pureza", "Almacén"],
  ["Atún La Campagnola 170g", "La Campagnola", "Almacén"],
  ["Chocolate con Leche Milka 100g", "Milka", "Almacén"],
  ["Gaseosa Coca-Cola 2,25L", "Coca-Cola", "Bebidas"],
  ["Agua Mineral Villavicencio 2L", "Villavicencio", "Bebidas"],
  ["Cerveza Quilmes 1L", "Quilmes", "Bebidas"],
  ["Jugo Baggio Naranja 1L", "Baggio", "Bebidas"],
];

const CATEGORY_SLUGS: Record<string, string> = {
  "Lácteos": "lacteos",
  "Almacén": "almacen",
  Bebidas: "bebidas",
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Valid EAN-13 with the mod-10 check digit, so GTIN normalization is exercised. */
function ean13(body12: string): string {
  const sum = body12
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body12}${(10 - (sum % 10)) % 10}`;
}

function sourcesFor(index: number): string[] {
  return ["carrefour", ...(index % 2 === 0 ? ["disco"] : []), ...(index % 3 === 0 ? ["jumbo"] : [])];
}

function history(price: number, listPrice: number | null, observedAt: string) {
  return [
    { price: round(price * 1.18), listPrice: listPrice === null ? null : round(listPrice * 1.18), observedAt: EARLIER_POINTS[0] },
    { price: round(price * 1.07), listPrice: listPrice === null ? null : round(listPrice * 1.07), observedAt: EARLIER_POINTS[1] },
    { price, listPrice, observedAt },
  ];
}

/**
 * Deterministic catalog fixture: 30 products across three categories, one to
 * three offers each, some with a list price above the price, some unavailable,
 * one captured promotion and a three-point history per offer.
 */
export function buildSnapshotFixture(): CatalogSnapshot {
  const products = PRODUCTS.map(([name, brand, category], position) => {
    const ean = ean13(`7790001${String(position + 1).padStart(5, "0")}`);
    return {
      ean,
      name,
      brand,
      imageUrl: `https://cdn.ofertasuper.test/${ean}.jpg`,
      category,
      categorySlug: CATEGORY_SLUGS[category] ?? null,
    };
  });

  const offers = products.flatMap((product, position) => {
    const index = position + 1;
    const base = 200 + index * 131;
    return sourcesFor(index).map((source) => {
      const price = round(base * (source === "carrefour" ? 1 : source === "disco" ? 1.12 : 0.94));
      const listPrice = index % 2 === 0 ? round(price * 1.25) : null;
      const unavailable = index % 10 === 0 && source !== "carrefour";
      const observedAt = OBSERVED_AT[source];
      return {
        ean: product.ean,
        source,
        price: unavailable ? null : price,
        listPrice: unavailable ? null : listPrice,
        promo: index % 5 === 0 && source === "carrefour"
          ? { type: "percent-off" as const, percent: 15, maxUnits: null, label: "15% OFF" }
          : null,
        available: !unavailable,
        productUrl: `https://www.${source}.test/producto/${product.ean}`,
        observedAt,
        history: history(price, listPrice, observedAt),
      };
    });
  });

  return parseCatalogSnapshot({
    schemaVersion: 2,
    generatedAt: GENERATED_AT,
    sources: ["carrefour", "disco", "jumbo"],
    products,
    offers,
  });
}

export function loadSnapshotFixture(): CatalogSnapshot {
  return buildSnapshotFixture();
}

/** Installs the fixture as the snapshot every reader in this process serves. */
export function installSnapshotFixture(): CatalogSnapshot {
  const fixture = buildSnapshotFixture();
  setSnapshotOverrideForTests(fixture);
  return fixture;
}
