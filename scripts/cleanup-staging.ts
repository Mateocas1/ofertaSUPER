import "./load-env";

import { db } from "../src/lib/db";

const RETENTION_HOURS = 48;

function readDryRunFlag() {
  return process.argv.includes("--dry-run");
}

async function main() {
  const dryRun = readDryRunFlag();
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  if (dryRun) {
    const count = await db.stagingProduct.count({
      where: {
        created_at: {
          lt: cutoff,
        },
      },
    });

    console.log(JSON.stringify({ dryRun: true, cutoff: cutoff.toISOString(), deletable: count }, null, 2));
    return;
  }

  const result = await db.stagingProduct.deleteMany({
    where: {
      created_at: {
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