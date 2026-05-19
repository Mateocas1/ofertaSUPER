import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const DATA_JOB_WORKFLOWS = [
  ".github/workflows/ingest.yml",
  ".github/workflows/update-prices.yml",
] as const;

function topLevelBlock(workflow: string, key: string): string {
  const match = workflow.match(
    new RegExp(`^${key}:\\r?\\n(?<block>(?:^[ \\t]+.*(?:\\r?\\n|$))+)(?:\\r?\\n)*^jobs:`, "m"),
  );
  return match?.groups?.block ?? "";
}

test("data-write workflows serialize ingestion/update jobs instead of overlapping", async () => {
  for (const filePath of DATA_JOB_WORKFLOWS) {
    const workflow = await readFile(filePath, "utf8");
    const concurrencyBlock = topLevelBlock(workflow, "concurrency");

    assert.notEqual(concurrencyBlock, "", `${filePath} must declare top-level concurrency`);
    assert.match(concurrencyBlock, /group:\s+ofertas-super-data-jobs/);
    assert.match(concurrencyBlock, /cancel-in-progress:\s+false/);
  }
});
