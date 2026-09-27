#!/usr/bin/env node
// Export the local catalog to the versioned snapshot the public site serves.
// Reads the local PostgreSQL through `docker exec psql` using SELECT-only
// statements and writes data/catalog-snapshot.json deterministically, with
// generatedAt as the only variable field.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(repoRoot, "data", "catalog-snapshot.json");
const container = process.env.CATALOG_SNAPSHOT_CONTAINER ?? "ofertasuper-cmvp-local-bootstrap-postgres-1";
const historyDays = 90;

const SOURCES = ["carrefour", "disco", "jumbo"];

function psqlRows(sql: string) {
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

function count(sql: string) {
  return Number(psqlRows(`select ${sql}`)[0][0]);
}

console.log("exporting catalog snapshot from the local database");
const productCount = count("count(*) from products");
const offerCount = count("count(*) from supermarket_products where product_ean is not null");
console.log(`products: ${productCount}, offers: ${offerCount}`);

const FIELD = "\u0001";

const products = psqlRows(
  `select p.ean, p.name, p.brand, p.image_url, p.category,
          (select c.slug from categories c where c.name = p.category limit 1)
   from products p
   where exists (select 1 from supermarket_products sp where sp.product_ean = p.ean and sp.price is not null)
   order by p.ean`,
).map((row) => ({
  ean: row[0],
  name: row[1],
  brand: row[2] === "" ? null : row[2],
  imageUrl: row[3] === "" ? null : row[3],
  category: row[4] === "" ? null : row[4],
  categorySlug: row[5] === "" ? null : row[5],
}));

const cutoff = `${historyDays} days`;
const offers = psqlRows(
  `select sp.product_ean,
          s.slug,
          sp.price,
          sp.list_price,
          sp.is_available,
          sp.product_url,
          to_char(sp.last_checked_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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
     and s.slug in ('carrefour', 'disco', 'jumbo')
   order by sp.product_ean, s.slug`,
).map((row) => ({
  ean: row[0],
  source: row[1],
  price: row[2] === "" ? null : Number(row[2]),
  listPrice: row[3] === "" ? null : Number(row[3]),
  promo: null, // Simple promos (Gate 4c) are captured by the acquisition refresh; null until then.
  available: row[4] === "t",
  productUrl: row[5] === "" ? null : row[5],
  observedAt: row[6],
  history: JSON.parse(row[7] ?? "[]"),
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
