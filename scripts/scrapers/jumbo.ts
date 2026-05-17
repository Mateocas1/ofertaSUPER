import { printScrapeResult, readDryRunFlag, readLimitFlag, runStoreScraper } from "./shared";

async function main() {
  const limit = readLimitFlag(6);
  const result = await runStoreScraper({
    slug: "jumbo",
    dryRun: readDryRunFlag(),
    limit,
  });

  printScrapeResult(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});