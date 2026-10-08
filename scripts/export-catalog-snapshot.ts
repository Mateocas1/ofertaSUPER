#!/usr/bin/env node
// Export the local catalog to the versioned snapshot the public site serves.
// Reads the local PostgreSQL with SELECT-only statements — through Prisma
// when DATABASE_URL reaches the database (the refresh run), or through
// `docker exec psql` otherwise (host runs) — and writes
// data/catalog-snapshot.json deterministically, with generatedAt as the only
// variable field.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFRESH_SOURCES, REFRESH_SOURCES_SQL } from "../src/lib/refresh-sources";
import { DETAILED_CATEGORIES } from "../src/lib/vtex/categories";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(repoRoot, "data", "catalog-snapshot.json");
const container = process.env.CATALOG_SNAPSHOT_CONTAINER ?? "ofertasuper-cmvp-local-bootstrap-postgres-1";
const historyDays = 90;
// Only the app's own categories are published. A product the classifier
// cannot place (decoration, pool toys) keeps whatever raw store name an older
// run stored, because a refresh never blanks a category, so it is dropped here.
const appCategories = new Set(DETAILED_CATEGORIES.map((category) => category.name));

const SOURCES = [...REFRESH_SOURCES];

function psqlRows(sql: string): string[][] {
  // \u0001 never appears in catalog text, so it is a safe field separator for
  // psql's unaligned output (the default | is not: product URLs contain it).
  const stdout = execFileSync(
    "docker",
    ["exec", container, "psql", "-U", "ofertasuper_owner", "-d", "ofertasuper", "-At", "-F", "\u0001", "-c", sql],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\u0001"));
}

function rowFields(row: Record<string, unknown>): string[] {
  return Object.values(row).map((value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "t" : "f";
    return String(value);
  });
}

async function readRows(sql: string): Promise<string[][]> {
  if (process.env.DATABASE_URL) {
    const { db } = await import("../src/lib/db");
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql);
    return rows.map(rowFields);
  }
  return psqlRows(sql);
}

async function main() {
  console.log("exporting catalog snapshot from the local database");
  const counts = await readRows("select (select count(*) from products) as product_count, (select count(*) from supermarket_products where product_ean is not null) as offer_count");
  const productCount = Number(counts[0][0]);
  const offerCount = Number(counts[0][1]);
  console.log(`products: ${productCount}, offers: ${offerCount}`);

  const products = (await readRows(
    `select p.ean, p.name, p.brand, p.image_url, p.category,
          (select c.slug from categories c where c.name = p.category limit 1)
   from products p
   where exists (select 1 from supermarket_products sp where sp.product_ean = p.ean and sp.price is not null)
   order by p.ean`,
  )).map((row) => ({
    ean: row[0],
    name: row[1],
    brand: row[2] === "" ? null : row[2],
    imageUrl: row[3] === "" ? null : row[3],
    category: appCategories.has(row[4]) ? row[4] : null,
    categorySlug: appCategories.has(row[4]) && row[5] !== "" ? row[5] : null,
  }));

  const cutoff = `${historyDays} days`;
  const offers = (await readRows(
    `select sp.product_ean,
          s.slug,
          sp.price,
          sp.list_price,
          sp.is_available,
          sp.product_url,
          to_char(sp.last_checked_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          sp.promo::text,
          coalesce(
            (select json_agg(json_build_object('price', ph.price, 'listPrice', ph.list_price, 'observedAt', to_char(ph.scraped_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by ph.scraped_at asc)::text
             from (
               select price, list_price, scraped_at
               from price_history
               where supermarket_product_id = sp.id
                 and scraped_at >= now() - interval '${cutoff}'
               order by scraped_at desc
               limit 200
             ) ph),
            '[]'::text)
   from supermarket_products sp
   join supermarkets s on s.id = sp.supermarket_id
   where sp.price is not null
     and s.slug in (${REFRESH_SOURCES_SQL})
   order by sp.product_ean, s.slug`,
  )).map((row) => ({
    ean: row[0],
    source: row[1],
    price: row[2] === "" ? null : Number(row[2]),
    listPrice: row[3] === "" ? null : Number(row[3]),
    // Captured simple promotion (Gate 6): stored as jsonb by the refresh.
    promo: row[7] === "" ? null : (JSON.parse(row[7]) as {
      type: "nth-unit" | "percent-off";
      percent: number;
      nth?: number;
      maxUnits: number | null;
      label: string;
    } | null),
    available: row[4] === "t",
    productUrl: row[5] === "" ? null : row[5],
    observedAt: row[6],
    history: JSON.parse(row[8] ?? "[]"),
  }));

  const snapshot = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    products,
    offers,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `snapshot written: ${products.length} products, ${offers.length} offers -> ${outputPath.replace(repoRoot, ".")}`,
  );
}

void main();
