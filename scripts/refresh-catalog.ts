import "./load-env";

import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { getSupermarketBySlug } from "../src/lib/supermarkets";
import {
  handleVtexHashUnavailable,
  resolveVtexHashForSource,
  sendVtexHashUnavailableAlert,
  VtexHashUnavailableError,
} from "../src/lib/vtex/hash-resolution";
import { createDependencies } from "./acquire-cmvp-catalog-batch";
import { evaluateRefreshGates } from "./lib/refresh-gates";
import { formatRejectedSummary, type RejectedRecord } from "./lib/refresh-summary";
import { runCmvpCatalogBatch, type CmvpCatalogBatchArtifact, type CmvpCatalogBatchRequest } from "./pipeline/cmvp-catalog-batch";
import { topUpUnobservedOffers, type TopUpSummary } from "./pipeline/topup";

// Gate 6 — the single daily catalog refresh command. It replays the 36
// acquisition batches of the cycle-2 plan with fresh daily batch ids (the
// same batchId replays without re-querying), captures Carrefour simple
// promotions during staging, regenerates the snapshot, and prints the run
// summary (batches ok/failed and the under-24h offer share per supermarket).

const PLAN_PATH = "artifacts/cmvp/catalog/expansion-20260920-discovery-25/acquisition-plan-cycle2.json";

type PlanBatch = { ordinal: number; batchId: string; source: string; term: string; count: number; expectedGtins: string[] };

type BatchOutcome = {
  ok: boolean;
  failure: { batchId: string; error: string } | null;
  promosCaptured: number;
  promoReadsFailed: number;
  rejectedProducts: RejectedRecord[];
};

function readFlag(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function batchIdFor(batch: PlanBatch, stamp: string) {
  return `v1-refresh-${stamp}-${String(batch.ordinal).padStart(2, "0")}`;
}

function checkpointState(artifactsDir: string, batchId: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(resolve(artifactsDir, `${batchId}.checkpoint.json`), "utf8")) as { state?: string };
    return typeof parsed.state === "string" ? parsed.state : null;
  } catch {
    return null;
  }
}

function runSummary(artifact: CmvpCatalogBatchArtifact) {
  const run = artifact.runs[0];
  return {
    state: artifact.state,
    acquisitionError: run?.error ?? artifact.reconciliationError ?? null,
    promosCaptured: run?.promosCaptured ?? 0,
    promoReadsFailed: run?.promoReadsFailed ?? 0,
    rejectedProducts: run?.rejectedProducts ?? [],
  };
}

async function runBatch(batch: PlanBatch, stamp: string, artifactsDir: string): Promise<BatchOutcome> {
  // A completed checkpoint replays without re-querying; a failed one gets a
  // fresh batch id so the retry does not double-stage the same products.
  let batchId = batchIdFor(batch, stamp);
  let attempt = 2;
  while (checkpointState(artifactsDir, batchId) !== null && checkpointState(artifactsDir, batchId) !== "completed") {
    batchId = `${batchIdFor(batch, stamp)}-r${attempt}`;
    attempt += 1;
    if (attempt > 10) throw new Error(`batch ${batch.ordinal} kept failing checkpoint validation`);
  }
  const request: CmvpCatalogBatchRequest & { output: string } = {
    batchId,
    source: batch.source,
    term: batch.term,
    count: batch.count,
    expectedGtins: batch.expectedGtins,
    dryRun: false,
    confirmWrite: true,
    refresh: true,
    output: resolve(artifactsDir, `${batchId}.checkpoint.json`),
  };

  process.stdout.write(`[refresh] ${batchId} (${batch.source}: ${batch.term})...\n`);
  try {
    const result = await runCmvpCatalogBatch(request, createDependencies(request.output));
    const summary = runSummary(result.artifact);
    process.stdout.write(`${JSON.stringify({ ...summary, batchId })}\n`);
    const rejectedProducts = summary.rejectedProducts.map((product) => ({ batchId, gtin: product.gtin, qualityFlags: product.qualityFlags }));
    const failure = summary.acquisitionError !== null || summary.state !== "completed"
      ? { batchId, error: summary.acquisitionError ?? `state=${summary.state}` }
      : null;
    return { ok: failure === null, failure, promosCaptured: summary.promosCaptured, promoReadsFailed: summary.promoReadsFailed, rejectedProducts };
  } catch (error) {
    // The pipeline already persisted a blocked artifact when it could; the
    // catch must not overwrite the checkpoint with a non-artifact payload
    // (a malformed checkpoint would poison every later replay).
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`[refresh] ${batchId} failed: ${message}\n`);
    return { ok: false, failure: { batchId, error: message }, promosCaptured: 0, promoReadsFailed: 0, rejectedProducts: [] };
  }
}

function regenerateSnapshot() {
  const exporter = spawnSync(process.execPath, ["--import", "tsx", "scripts/export-catalog-snapshot.ts"], { stdio: "inherit" });
  if (exporter.status !== 0) {
    throw new Error("snapshot export failed");
  }
}

async function freshnessBySupermarket() {
  const rows = await db.$queryRaw<Array<{ slug: string; total: bigint; fresh: bigint }>>`
    select s.slug,
           count(*) as total,
           count(*) filter (where sp.last_checked_at >= now() - interval '24 hours') as fresh
    from supermarket_products sp
    join supermarkets s on s.id = sp.supermarket_id
    where s.slug in ('carrefour', 'disco', 'jumbo') and sp.price is not null
    group by s.slug
    order by s.slug`;
  return rows.map(({ slug, total, fresh }) => ({
    slug,
    offers: Number(total),
    under24hPercent: Number(total) > 0 ? Math.round((Number(fresh) / Number(total)) * 1000) / 10 : 0,
  }));
}

function printSummary(stamp: string, ok: number, failures: Array<{ batchId: string; error: string }>, promosCaptured: number, promoReadsFailed: number, topUp: TopUpSummary, freshness: Array<{ slug: string; offers: number; under24hPercent: number }>, rejected: RejectedRecord[]) {
  process.stdout.write(`\n[refresh] summary ${stamp}: batches ok=${ok} failed=${failures.length}; promos captured=${promosCaptured} readsFailed=${promoReadsFailed}; top-up reads ok=${topUp.readsOk} failed=${topUp.readsFailed}\n`);
  for (const entry of freshness) {
    process.stdout.write(`[refresh] ${entry.slug}: ${entry.under24hPercent}% of ${entry.offers} offers under 24h\n`);
  }
  // Rejected products are tolerated when they are isolated; name them and their
  // quality flags so tomorrow's log explains why a product was dropped.
  process.stdout.write(`${formatRejectedSummary(rejected)}\n`);
  if (failures.length > 0) {
    process.stdout.write(`[refresh] failures: ${JSON.stringify(failures, null, 2)}\n`);
  }
  // A failed batch, a supermarket below 90% freshness, or a source whose reads
  // fail more than 20% of the time takes the whole run down with it: neither
  // the cron nor the cloud job may publish a partially refreshed catalog.
  const gate = evaluateRefreshGates({
    failedBatches: failures.length,
    freshness,
    sourceReads: [...topUp.perSource, { slug: "carrefour", readsOk: promosCaptured, readsFailed: promoReadsFailed }],
  });
  if (!gate.ok) {
    console.error(`[refresh] gate check failed: ${gate.message}`);
    process.exitCode = gate.exitCode;
  }
}

// The acquisition path needs the persisted-query hash and the supermarkets can
// rotate it at any time. Each source resolves its own hash: the configured
// hash first, then the last known one from its own runs, then a freshly
// discovered one (which acquisition then persists as the run's vtex_hash).
const resolvedHashes = new Map<string, string>();

async function lastKnownVtexHash(source: string) {
  const rows = await db.$queryRaw<Array<{ vtex_hash: string | null }>>`
    select vtex_hash from ingestion_run where source_slug = ${source} and vtex_hash is not null order by started_at desc limit 1`;
  return rows[0]?.vtex_hash ?? null;
}

async function resolveHashForSource(source: string, explicitHash: string | null) {
  const cached = resolvedHashes.get(source);
  if (cached) return cached;

  const baseUrl = getSupermarketBySlug(source)?.baseUrl;
  if (!baseUrl) throw new Error(`unknown VTEX source ${source}`);

  const resolved = await resolveVtexHashForSource({
    source,
    baseUrl,
    explicitHash,
    readLastKnownHash: lastKnownVtexHash,
  });
  process.stdout.write(`[refresh] ${source}: VTEX hash resolved from ${resolved.source}\n`);
  resolvedHashes.set(source, resolved.hash);
  return resolved.hash;
}

async function main() {
  const explicitHash = process.env.VTEX_SHA256_HASH ?? null;
  const runStartedAt = new Date();
  const plan: { batches: PlanBatch[] } = JSON.parse(await readFile(resolve(PLAN_PATH), "utf8"));
  const stamp = readFlag("date") ?? todayStamp();
  const only = readFlag("batch") !== undefined ? Number(readFlag("batch")) : null;
  const batches = only !== null ? plan.batches.filter((batch) => batch.ordinal === only) : plan.batches;
  if (batches.length === 0) {
    throw new Error("no batches matched the requested filter");
  }

  const artifactsDir = resolve("artifacts/refresh", stamp);
  await mkdir(artifactsDir, { recursive: true });

  let ok = 0;
  let promosCaptured = 0;
  let promoReadsFailed = 0;
  const failures: Array<{ batchId: string; error: string }> = [];
  const rejected: RejectedRecord[] = [];
  for (const batch of batches) {
    process.env.VTEX_SHA256_HASH = await resolveHashForSource(batch.source, explicitHash);
    const outcome = await runBatch(batch, stamp, artifactsDir);
    if (outcome.ok) ok += 1;
    if (outcome.failure) failures.push(outcome.failure);
    promosCaptured += outcome.promosCaptured;
    promoReadsFailed += outcome.promoReadsFailed;
    rejected.push(...outcome.rejectedProducts);
  }

  process.stdout.write("[refresh] re-reading the offers the searches missed\n");
  const topUp = await topUpUnobservedOffers({ stamp, runStartedAt });
  regenerateSnapshot();
  const freshness = await freshnessBySupermarket();
  printSummary(stamp, ok, failures, promosCaptured, promoReadsFailed, topUp, freshness, rejected);
  await db.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(async (error) => {
    await db.$disconnect().catch(() => undefined);
    if (error instanceof VtexHashUnavailableError) {
      process.exitCode = await handleVtexHashUnavailable(error, {
        log: (message) => console.error(message),
        alert: (message) => sendVtexHashUnavailableAlert({ baseUrl: error.baseUrl, details: [message] }),
      });
      return;
    }
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
