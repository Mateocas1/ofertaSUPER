import "./load-env";

import { SUPERMARKETS } from "../src/lib/supermarkets";
import { printScrapeResult, readDryRunFlag, runStoreScraper } from "./scrapers/shared";

async function main() {
  const dryRun = readDryRunFlag();

  for (const supermarket of SUPERMARKETS) {
    const result = await runStoreScraper({
      slug: supermarket.slug,
      dryRun,
    });

    printScrapeResult(result);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});