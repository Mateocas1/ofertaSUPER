import { printScrapeResult, readDryRunFlag, readLimitFlag, runStoreScraper } from "./shared";

async function main() {
  const limit = readLimitFlag(8);
  const result = await runStoreScraper({
    slug: "disco",
    dryRun: readDryRunFlag(),
    limit,
  });

  printScrapeResult(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});