import { createHash } from "node:crypto";

import { normalizeGtin } from "../../src/lib/identity/gtin";

const SOURCES = new Set(["disco", "jumbo", "carrefour"]);

export type CmvpCatalogBatchRequest = {
  batchId: string;
  source: string;
  term: string;
  count: number;
  expectedGtins: string[];
  dryRun: boolean;
  confirmWrite: boolean;
};

type AcquisitionResult = {
  runId: number | null;
  startedAt: string;
  finishedAt: string;
  fetchedGtins: string[];
  admittedGtins: string[];
  rejectedCount: number;
  error: string | null;
};

export type CmvpCatalogBatchArtifact = {
  schemaVersion: 1;
  batchId: string;
  source: string;
  term: string;
  count: number;
  expectedGtins: string[];
  dryRun: boolean;
  contractDigest: string;
  state: "acquiring" | "acquired" | "completed" | "blocked";
  fetchedGtins: string[];
  admittedGtins: string[];
  reconciliationError: string | null;
  runs: Array<{ runId: number | null; startedAt: string; finishedAt: string; fetchedCount: number; admittedCount: number; rejectedCount: number; error: string | null }>;
};

export type CmvpCatalogBatchDependencies = {
  loadArtifact: (batchId: string) => Promise<CmvpCatalogBatchArtifact | null>;
  saveArtifact: (artifact: Readonly<CmvpCatalogBatchArtifact>) => Promise<void>;
  acquire: (request: Readonly<CmvpCatalogBatchRequest>) => Promise<AcquisitionResult>;
  finalizeAcquisition: (runId: number, outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null }) => Promise<void>;
  reconcile: (request: Readonly<CmvpCatalogBatchRequest>) => Promise<{ runId: number | null; promotedCount: number; error: string | null }>;
};

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function normalizeGtins(values: string[], label: string) {
  const gtins = values.map(normalizeGtin);
  if (gtins.some((gtin) => gtin === null)) throw new Error(`${label} GTINs must all be valid normalized GTINs`);
  return (gtins as string[]).toSorted();
}

function normalizeContract(input: CmvpCatalogBatchRequest) {
  if (!SOURCES.has(input.source)) throw new Error("source must be exactly one of disco, jumbo, carrefour");
  const batchId = input.batchId.trim();
  const term = input.term.trim();
  if (!batchId) throw new Error("batchId must be nonblank");
  if (!term) throw new Error("term must be exactly one nonblank value");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 25) throw new Error("count must be an integer from 1 through 25");
  if (input.expectedGtins.length !== input.count) throw new Error("expected GTIN count must match count");
  const expectedGtins = normalizeGtins(input.expectedGtins, "expected");
  if (new Set(expectedGtins).size !== input.count) throw new Error("expected GTINs must be distinct normalized values");
  if (!input.dryRun && !input.confirmWrite) throw new Error("write requires explicit confirmation");
  return { ...input, batchId, term, expectedGtins };
}

function contractDigest(request: ReturnType<typeof normalizeContract>) {
  return digest({ executionMode: request.dryRun ? "dry-run" : "confirmed-write", batchId: request.batchId, source: request.source, term: request.term, count: request.count, expectedGtins: request.expectedGtins });
}

function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function runId(artifact: CmvpCatalogBatchArtifact) { return artifact.runs[0]?.runId ?? null; }
function isNonNegativeInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0; }
function isPositiveInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) > 0; }
function normalizedError(value: unknown, label: string) {
  if (value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : `invalid_${label}_error`;
}

function isValidCompletedCheckpoint(artifact: CmvpCatalogBatchArtifact, request: ReturnType<typeof normalizeContract>, contract: string) {
  try {
    if (artifact.schemaVersion !== 1 || artifact.state !== "completed" || artifact.contractDigest !== contract
      || artifact.batchId !== request.batchId || artifact.source !== request.source || artifact.term !== request.term
      || artifact.count !== request.count || artifact.dryRun !== request.dryRun || artifact.reconciliationError !== null
      || !sameSet(normalizeGtins(artifact.expectedGtins, "checkpoint expected"), request.expectedGtins)
      || !sameSet(normalizeGtins(artifact.fetchedGtins, "checkpoint fetched"), request.expectedGtins)
      || !sameSet(normalizeGtins(artifact.admittedGtins, "checkpoint admitted"), request.expectedGtins)
      || artifact.runs.length !== 1) return false;
    const [run] = artifact.runs;
    return Boolean(run && (request.dryRun ? run.runId === null || isPositiveInteger(run.runId) : isPositiveInteger(run.runId))
      && typeof run.startedAt === "string" && Boolean(run.startedAt.trim())
      && typeof run.finishedAt === "string" && Boolean(run.finishedAt.trim())
      && run.fetchedCount === request.count && run.admittedCount === request.count
      && run.rejectedCount === 0 && run.error === null);
  } catch { return false; }
}

async function reconcile(request: ReturnType<typeof normalizeContract>, artifact: CmvpCatalogBatchArtifact, dependencies: CmvpCatalogBatchDependencies) {
  const reconciliation = await dependencies.reconcile(request);
  const reportedError = normalizedError(reconciliation.error, "reconciliation");
  const error = reportedError ?? (!isNonNegativeInteger(reconciliation.promotedCount)
    ? "invalid_reconciliation_promoted_count"
    : reconciliation.promotedCount === request.count ? null
      : `reconciliation promoted count mismatch: expected ${request.count}, got ${reconciliation.promotedCount}`);
  const acquisitionRunId = runId(artifact);
  if (error) {
    if (acquisitionRunId !== null) await dependencies.finalizeAcquisition(acquisitionRunId, { status: "FAILED", errorSummary: error });
    const blocked = { ...artifact, state: "blocked" as const, reconciliationError: error, runs: artifact.runs.map((run) => ({ ...run, error })) };
    await dependencies.saveArtifact(blocked);
    throw new Error(`reconciliation failed: ${error}`);
  }
  if (acquisitionRunId !== null) await dependencies.finalizeAcquisition(acquisitionRunId, { status: "SUCCESS", errorSummary: null });
  const completed = { ...artifact, state: "completed" as const, reconciliationError: null };
  await dependencies.saveArtifact(completed);
  return completed;
}

export async function runCmvpCatalogBatch(input: CmvpCatalogBatchRequest, dependencies: CmvpCatalogBatchDependencies): Promise<{ artifact: CmvpCatalogBatchArtifact; replayed: boolean }> {
  const request = normalizeContract(input);
  const contract = contractDigest(request);
  const existing = await dependencies.loadArtifact(request.batchId);
  if (existing) {
    if (existing.contractDigest !== contract) throw new Error("checkpoint contract conflict");
    if (existing.state === "completed") {
      if (!isValidCompletedCheckpoint(existing, request, contract)) throw new Error("invalid completed checkpoint");
      return { artifact: existing, replayed: true };
    }
    if (existing.state === "acquiring") {
      const error = "acquisition checkpoint lacks durable outcome";
      const blocked = { ...existing, state: "blocked" as const, reconciliationError: error };
      await dependencies.saveArtifact(blocked);
      return { artifact: blocked, replayed: false };
    }
    if (existing.state === "blocked" && (!existing.reconciliationError || existing.reconciliationError === "acquisition checkpoint lacks durable outcome")) return { artifact: existing, replayed: true };
    if (!request.dryRun && (existing.state === "acquired" || existing.reconciliationError)) return { artifact: await reconcile(request, existing, dependencies), replayed: false };
    return { artifact: existing, replayed: true };
  }

  let artifact: CmvpCatalogBatchArtifact;
  if (!request.dryRun) {
    artifact = { schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: request.count, expectedGtins: [...request.expectedGtins], dryRun: false, contractDigest: contract, state: "acquiring", fetchedGtins: [], admittedGtins: [], reconciliationError: null, runs: [] };
    await dependencies.saveArtifact(artifact);
  }
  const acquisition = await dependencies.acquire(request);
  let fetchedGtins: string[] = [];
  let admittedGtins: string[] = [];
  let error = normalizedError(acquisition.error, "acquisition");
  if (!isNonNegativeInteger(acquisition.rejectedCount)) error = "invalid_acquisition_rejected_count";
  else if (acquisition.rejectedCount !== 0) error = "acquisition_rejected_products";
  try { fetchedGtins = normalizeGtins(acquisition.fetchedGtins, "fetched"); admittedGtins = normalizeGtins(acquisition.admittedGtins, "admitted"); } catch { error = "invalid_acquisition_gtins"; }
  artifact = { schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: request.count, expectedGtins: [...request.expectedGtins], dryRun: request.dryRun, contractDigest: contract, state: error ? "blocked" : "acquired", fetchedGtins, admittedGtins, reconciliationError: null, runs: [{ runId: acquisition.runId, startedAt: acquisition.startedAt, finishedAt: acquisition.finishedAt, fetchedCount: fetchedGtins.length, admittedCount: admittedGtins.length, rejectedCount: acquisition.rejectedCount, error }] };
  if (!request.dryRun) await dependencies.saveArtifact(artifact);
  if (error) {
    if (!request.dryRun && acquisition.runId !== null) await dependencies.finalizeAcquisition(acquisition.runId, { status: "FAILED", errorSummary: error });
    return { artifact, replayed: false };
  }
  if (!sameSet(fetchedGtins, request.expectedGtins) || !sameSet(admittedGtins, request.expectedGtins)) {
    const mismatch = "fetched/admitted GTIN mismatch before reconciliation";
    if (!request.dryRun && acquisition.runId !== null) await dependencies.finalizeAcquisition(acquisition.runId, { status: "FAILED", errorSummary: mismatch });
    const blocked = { ...artifact, state: "blocked" as const, runs: artifact.runs.map((run) => ({ ...run, error: mismatch })) };
    if (!request.dryRun) await dependencies.saveArtifact(blocked);
    return { artifact: blocked, replayed: false };
  }
  if (request.dryRun) return { artifact: { ...artifact, state: "completed" }, replayed: false };
  return { artifact: await reconcile(request, artifact, dependencies), replayed: false };
}
