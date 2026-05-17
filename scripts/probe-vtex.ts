import "./load-env";

import { listVtexSupermarkets } from "../src/lib/supermarkets";
import { probeVtexHash } from "../src/lib/vtex/client";

function readFlag(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const sourceFilter = readFlag("source")?.split(",").map((value) => value.trim()).filter(Boolean) ?? null;
  const query = readFlag("query") ?? "leche";
  const rawCount = Number(readFlag("count") ?? 5);
  const count = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 5;
  const sources = listVtexSupermarkets().filter((source) => !sourceFilter || sourceFilter.includes(source.slug));

  if (sources.length === 0) {
    throw new Error(`No VTEX sources matched ${sourceFilter?.join(",") ?? "all"}`);
  }

  const results = [];

  for (const source of sources) {
    const result = await probeVtexHash({
      baseUrl: source.baseUrl,
      query,
      count,
    });

    results.push({
      source: source.slug,
      baseUrl: source.baseUrl,
      ...result,
      hash: result.hash ? `${result.hash.slice(0, 8)}...${result.hash.slice(-8)}` : null,
    });
  }

  const hasFailures = results.some((result) => !result.isHealthy);

  console.log(JSON.stringify({ query, count, results }, null, 2));

  if (hasFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
