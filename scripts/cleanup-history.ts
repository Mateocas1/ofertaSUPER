import "./load-env";

import { db } from "../src/lib/db";

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  if (process.argv.includes("--dry-run")) {
    const total = await db.priceHistory.count({
      where: {
        scraped_at: {
          lt: cutoff,
        },
      },
    });

    console.log(JSON.stringify({ cutoff: cutoff.toISOString(), deletable: total }, null, 2));
    return;
  }

  const result = await db.priceHistory.deleteMany({
    where: {
      scraped_at: {
        lt: cutoff,
      },
    },
  });

  console.log(JSON.stringify({ cutoff: cutoff.toISOString(), deleted: result.count }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});