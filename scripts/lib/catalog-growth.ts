import { readFileSync } from "node:fs";

// Catalog growth metrics for the refresh summary (#568): how many products and
// offers the published snapshot gained or lost against the previous one, and
// how long each phase took, so every catalog-size change can be measured on a
// real run instead of guessed.

export type SnapshotKeys = { products: Set<string>; offers: Set<string> };

export type CatalogGrowth = {
  products: number;
  offers: number;
  newProducts: number;
  goneProducts: number;
  newOffers: number;
  goneOffers: number;
};

function rows(payload: unknown, key: "products" | "offers"): Array<Record<string, unknown>> {
  const value = (payload as Record<string, unknown> | null)?.[key];
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

export function snapshotKeys(payload: unknown): SnapshotKeys {
  return {
    products: new Set(rows(payload, "products").map((row) => String(row.ean))),
    offers: new Set(rows(payload, "offers").map((row) => `${String(row.ean)}@${String(row.source)}`)),
  };
}

// A missing or unreadable snapshot counts as empty: the first run simply
// reports everything as new.
export function readSnapshotKeys(path: string): SnapshotKeys {
  try {
    return snapshotKeys(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { products: new Set(), offers: new Set() };
  }
}

function countMissing(from: Set<string>, into: Set<string>) {
  let missing = 0;
  for (const key of from) if (!into.has(key)) missing += 1;
  return missing;
}

export function catalogGrowth(before: SnapshotKeys, after: SnapshotKeys): CatalogGrowth {
  return {
    products: after.products.size,
    offers: after.offers.size,
    newProducts: countMissing(after.products, before.products),
    goneProducts: countMissing(before.products, after.products),
    newOffers: countMissing(after.offers, before.offers),
    goneOffers: countMissing(before.offers, after.offers),
  };
}

export function formatCatalogGrowth(growth: CatalogGrowth): string {
  return `[refresh] catalog: products=${growth.products} (+${growth.newProducts} new, -${growth.goneProducts} gone); offers=${growth.offers} (+${growth.newOffers} new, -${growth.goneOffers} gone)`;
}

export function formatPhaseTimings(phases: Array<{ name: string; ms: number }>): string {
  return `[refresh] timings: ${phases.map(({ name, ms }) => `${name}=${(ms / 60_000).toFixed(1)}m`).join(" ")}`;
}
