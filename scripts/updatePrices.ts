import "./load-env";

import { db } from "../src/lib/db";
import { readDryRunFlag, runStoreScraper } from "./scrapers/shared";

async function main() {
  const dryRun = readDryRunFlag();
  const limit = 25;
  const catalog = await db.supermarketProduct.findMany({
    take: 500,
    orderBy: { last_checked_at: "asc" },
    include: {
      product: {
        select: {
          name: true,
        },
      },
      supermarket: {
        select: {
          slug: true,
        },
      },
    },
  });

  const grouped = new Map<string, string[]>();

  for (const entry of catalog) {
    const values = grouped.get(entry.supermarket.slug) ?? [];
    if (entry.product.name && !values.includes(entry.product.name)) {
      values.push(entry.product.name);
    }
    grouped.set(entry.supermarket.slug, values);
  }

  for (const [slug, names] of grouped.entries()) {
    const result = await runStoreScraper({
      slug,
      dryRun,
      queryTerms: names,
      limit,
    });

    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});