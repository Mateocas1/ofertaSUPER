import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import {
  runCmvpCatalogBatch,
  type CmvpCatalogBatchArtifact,
  type CmvpCatalogBatchDependencies,
  type CmvpCatalogBatchRequest,
} from "./pipeline/cmvp-catalog-batch";
import { reconcileStageProducts } from "./pipeline/reconcile";
import { stageSourceProducts } from "./pipeline/stage";
import { validateStageProducts } from "./pipeline/validate";

type CliRequest = CmvpCatalogBatchRequest & { output: string };

function requiredFlag(argv: string[], name: string) {
  const values = argv.filter((value) => value.startsWith(`${name}=`)).map((value) => value.slice(name.length + 1));
  if (values.length !== 1 || !values[0]?.trim()) throw new Error(`requires exactly one ${name}=...`);
  return values[0].trim();
}

export function parseCmvpCatalogBatchCliOptions(argv = process.argv): CliRequest {
  return {
    batchId: requiredFlag(argv, "--batch-id"),
    source: requiredFlag(argv, "--source"),
    term: requiredFlag(argv, "--term"),
    count: Number(requiredFlag(argv, "--count")),
    expectedGtins: requiredFlag(argv, "--expected-gtins").split(",").map((value) => value.trim()),
    dryRun: argv.includes("--dry-run"),
    confirmWrite: argv.includes("--confirm-write"),
    output: requiredFlag(argv, "--output"),
  };
}

function requireExplicitEnvironment() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must be explicitly supplied by the execution environment");
}

type CheckpointFilesystem = {
  writeFile: (path: string, contents: string, options: { encoding: "utf8"; flag: "wx"; flush: true }) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  rm: (path: string, options: { force: true }) => Promise<void>;
};

export async function replaceCheckpointAtomically(output: string, contents: string, filesystem: CheckpointFilesystem = { writeFile, rename, rm }) {
  const temporaryOutput = `${output}.${randomUUID()}.tmp`;
  try {
    await filesystem.writeFile(temporaryOutput, contents, { encoding: "utf8", flag: "wx", flush: true });
    await filesystem.rename(temporaryOutput, output);
  } catch (error) {
    await filesystem.rm(temporaryOutput, { force: true }).catch(() => undefined);
    throw error;
  }
}

function createDependencies(output: string): CmvpCatalogBatchDependencies {
  const acquisitionMetrics = new Map<number, { queries_sent: number; products_fetched: number; products_staged: number; products_rejected: number }>();
  return {
    async loadArtifact() {
      try { return JSON.parse(await readFile(output, "utf8")) as CmvpCatalogBatchArtifact; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async saveArtifact(artifact) {
      const run = artifact.runs[0];
      const directory = `${output}.artifacts/${artifact.contractDigest}`;
      const name = `${artifact.state}-${run?.runId ?? "none"}-${run?.finishedAt.replaceAll(":", "-") ?? "unknown"}-${randomUUID()}.json`;
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/${name}`, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await mkdir(dirname(output), { recursive: true });
      await replaceCheckpointAtomically(output, `${JSON.stringify(artifact, null, 2)}\n`);
    },
    async acquire(request) {
      const startedAt = new Date();
      let runId: number | undefined;
      try {
        if (!request.dryRun) {
          const supermarket = await db.supermarket.findFirst({ where: { slug: request.source, is_active: true, is_vtex: true }, select: { id: true } });
          if (!supermarket) throw new Error(`active staged source not found: ${request.source}`);
          const run = await db.ingestionRun.create({ data: { batch_id: request.batchId, source_slug: request.source, supermarket_id: supermarket.id, started_at: startedAt, status: "RUNNING", vtex_hash: process.env.VTEX_SHA256_HASH ?? null }, select: { id: true } });
          runId = run.id;
        }
        const stage = await stageSourceProducts({ runId, slug: request.source, dryRun: request.dryRun, queryTerms: [request.term], queryLimit: 1, count: request.count });
        const validation = await validateStageProducts({ runId, slug: request.source, products: request.dryRun ? stage.products : undefined, dryRun: request.dryRun });
        if (runId) acquisitionMetrics.set(runId, { queries_sent: stage.queriesSent, products_fetched: stage.productsFetched, products_staged: stage.productsStaged, products_rejected: validation.rejected });
        return { runId: runId ?? null, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), fetchedGtins: stage.products.map((product) => product.ean), admittedGtins: validation.candidates.filter((candidate) => candidate.status === "PENDING").map((candidate) => candidate.ean), rejectedCount: validation.rejected, error: null };
      } catch (error) {
        return { runId: runId ?? null, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), fetchedGtins: [], admittedGtins: [], rejectedCount: 0, error: error instanceof Error ? error.message : "unknown_acquisition_error" };
      }
    },
    async finalizeAcquisition(runId, outcome) {
      await db.ingestionRun.update({ where: { id: runId }, data: { finished_at: new Date(), status: outcome.status, error_summary: outcome.errorSummary, ...acquisitionMetrics.get(runId) } });
    },
    async reconcile(request) {
      try {
        const summary = await reconcileStageProducts({ batchId: request.batchId, batchSize: request.count, dryRun: false, writeMode: "standard" });
        return { runId: null, promotedCount: summary.promoted, error: null };
      } catch (error) { return { runId: null, promotedCount: 0, error: error instanceof Error ? error.message : "unknown_reconciliation_error" }; }
    },
  };
}

async function main() {
  requireExplicitEnvironment();
  const request = parseCmvpCatalogBatchCliOptions();
  const result = await runCmvpCatalogBatch(request, createDependencies(request.output));
  process.stdout.write(`${JSON.stringify(result.artifact, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
