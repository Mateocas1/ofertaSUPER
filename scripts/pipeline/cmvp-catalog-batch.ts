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

type NormalizedRequest = ReturnType<typeof normalizeContract>;
type CmvpCatalogBatchResult = { artifact: CmvpCatalogBatchArtifact; replayed: boolean };

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function normalizeGtins(values: string[], label: string) {
  const gtins = values.map(normalizeGtin);
  if (gtins.some((gtin) => gtin === null)) throw new Error(`${label} GTINs must all be valid normalized GTINs`);
  return (gtins as string[]).toSorted();
}

function validateContractSource(source: string) {
  if (!SOURCES.has(source)) throw new Error("source must be exactly one of disco, jumbo, carrefour");
}

function normalizeContractText(input: CmvpCatalogBatchRequest) {
  const batchId = input.batchId.trim();
  const term = input.term.trim();
  if (!batchId) throw new Error("batchId must be nonblank");
  if (!term) throw new Error("term must be exactly one nonblank value");
  return { batchId, term };
}

function validateContractCountAndGtins(input: CmvpCatalogBatchRequest) {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 25) throw new Error("count must be an integer from 1 through 25");
  if (input.expectedGtins.length !== input.count) throw new Error("expected GTIN count must match count");
  const expectedGtins = normalizeGtins(input.expectedGtins, "expected");
  if (new Set(expectedGtins).size !== input.count) throw new Error("expected GTINs must be distinct normalized values");
  return expectedGtins;
}

function validateWriteConfirmation(input: CmvpCatalogBatchRequest) {
  if (!input.dryRun && !input.confirmWrite) throw new Error("write requires explicit confirmation");
}

function normalizeContract(input: CmvpCatalogBatchRequest) {
  validateContractSource(input.source);
  const { batchId, term } = normalizeContractText(input);
  const expectedGtins = validateContractCountAndGtins(input);
  validateWriteConfirmation(input);
  return { ...input, batchId, term, expectedGtins };
}

function contractDigest(request: NormalizedRequest) {
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

function matchesCheckpointMetadata(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest, contract: string, state: CmvpCatalogBatchArtifact["state"]) {
  return artifact.schemaVersion === 1 && artifact.state === state && artifact.contractDigest === contract
    && artifact.batchId === request.batchId && artifact.source === request.source && artifact.term === request.term
    && artifact.count === request.count && artifact.dryRun === request.dryRun && artifact.reconciliationError === null;
}

function matchesCheckpointGtins(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest) {
  return sameSet(normalizeGtins(artifact.expectedGtins, "checkpoint expected"), request.expectedGtins)
    && sameSet(normalizeGtins(artifact.fetchedGtins, "checkpoint fetched"), request.expectedGtins)
    && sameSet(normalizeGtins(artifact.admittedGtins, "checkpoint admitted"), request.expectedGtins);
}

function hasValidCheckpointContract(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest, contract: string, state: "acquired" | "completed") {
  return matchesCheckpointMetadata(artifact, request, contract, state)
    && matchesCheckpointGtins(artifact, request) && artifact.runs.length === 1;
}

type ArtifactRun = CmvpCatalogBatchArtifact["runs"][number];

function hasValidCompletedRunId(run: ArtifactRun, request: NormalizedRequest) {
  return request.dryRun ? run.runId === null || isPositiveInteger(run.runId) : isPositiveInteger(run.runId);
}

function hasCompletedRunTimestamps(run: ArtifactRun) {
  return typeof run.startedAt === "string" && Boolean(run.startedAt.trim())
    && typeof run.finishedAt === "string" && Boolean(run.finishedAt.trim());
}

function hasCompletedRunCounts(run: ArtifactRun, request: NormalizedRequest) {
  return run.fetchedCount === request.count && run.admittedCount === request.count
    && run.rejectedCount === 0 && run.error === null;
}

function hasValidCompletedRun(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest) {
  const [run] = artifact.runs;
  return Boolean(run && hasValidCompletedRunId(run, request) && hasCompletedRunTimestamps(run) && hasCompletedRunCounts(run, request));
}

function isValidCompletedCheckpoint(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest, contract: string) {
  try { return hasValidCheckpointContract(artifact, request, contract, "completed") && hasValidCompletedRun(artifact, request); } catch { return false; }
}

function isValidAcquiredCheckpoint(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest, contract: string) {
  try { return hasValidCheckpointContract(artifact, request, contract, "acquired") && hasValidCompletedRun(artifact, request); } catch { return false; }
}

function createArtifact(request: NormalizedRequest, contract: string, state: CmvpCatalogBatchArtifact["state"], acquisition?: AcquisitionResult, fetchedGtins: string[] = [], admittedGtins: string[] = [], error: string | null = null): CmvpCatalogBatchArtifact {
  return {
    schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: request.count,
    expectedGtins: [...request.expectedGtins], dryRun: request.dryRun, contractDigest: contract, state,
    fetchedGtins, admittedGtins, reconciliationError: null,
    runs: acquisition ? [{ runId: acquisition.runId, startedAt: acquisition.startedAt, finishedAt: acquisition.finishedAt, fetchedCount: fetchedGtins.length, admittedCount: admittedGtins.length, rejectedCount: acquisition.rejectedCount, error }] : [],
  };
}

async function persistArtifact(request: NormalizedRequest, artifact: CmvpCatalogBatchArtifact, dependencies: CmvpCatalogBatchDependencies) {
  if (!request.dryRun) await dependencies.saveArtifact(artifact);
}

async function finalizeAcquisition(request: NormalizedRequest, acquisitionRunId: number | null, outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null }, dependencies: CmvpCatalogBatchDependencies) {
  if (!request.dryRun && acquisitionRunId !== null) await dependencies.finalizeAcquisition(acquisitionRunId, outcome);
}

async function failReconciliation(request: NormalizedRequest, artifact: CmvpCatalogBatchArtifact, error: string, dependencies: CmvpCatalogBatchDependencies): Promise<never> {
  await finalizeAcquisition(request, runId(artifact), { status: "FAILED", errorSummary: error }, dependencies);
  const blocked = { ...artifact, state: "blocked" as const, reconciliationError: error, runs: artifact.runs.map((run) => ({ ...run, error })) };
  await persistArtifact(request, blocked, dependencies);
  throw new Error(`reconciliation failed: ${error}`);
}

function rejectedReconciliationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `reconciliation dependency rejected: ${message.trim() || "unknown_error"}`;
}

async function reconcile(request: NormalizedRequest, artifact: CmvpCatalogBatchArtifact, dependencies: CmvpCatalogBatchDependencies) {
  let reconciliation: Awaited<ReturnType<CmvpCatalogBatchDependencies["reconcile"]>>;
  try { reconciliation = await dependencies.reconcile(request); }
  catch (error) { return failReconciliation(request, artifact, rejectedReconciliationError(error), dependencies); }
  const reportedError = normalizedError(reconciliation.error, "reconciliation");
  const reconciliationError = reportedError ?? (!isNonNegativeInteger(reconciliation.promotedCount)
    ? "invalid_reconciliation_promoted_count"
    : reconciliation.promotedCount === request.count ? null
      : `reconciliation promoted count mismatch: expected ${request.count}, got ${reconciliation.promotedCount}`);
  if (reconciliationError) return failReconciliation(request, artifact, reconciliationError, dependencies);
  await finalizeAcquisition(request, runId(artifact), { status: "SUCCESS", errorSummary: null }, dependencies);
  const completed = { ...artifact, state: "completed" as const, reconciliationError: null };
  await persistArtifact(request, completed, dependencies);
  return completed;
}

function replayCompletedCheckpoint(artifact: CmvpCatalogBatchArtifact, request: NormalizedRequest, contract: string): CmvpCatalogBatchResult {
  if (!isValidCompletedCheckpoint(artifact, request, contract)) throw new Error("invalid completed checkpoint");
  return { artifact, replayed: true };
}

async function replayAcquiringCheckpoint(request: NormalizedRequest, artifact: CmvpCatalogBatchArtifact, dependencies: CmvpCatalogBatchDependencies): Promise<CmvpCatalogBatchResult> {
  const error = "acquisition checkpoint lacks durable outcome";
  const blocked = { ...artifact, state: "blocked" as const, reconciliationError: error };
  await persistArtifact(request, blocked, dependencies);
  return { artifact: blocked, replayed: false };
}

async function replayExistingCheckpoint(request: NormalizedRequest, contract: string, existing: CmvpCatalogBatchArtifact, dependencies: CmvpCatalogBatchDependencies): Promise<CmvpCatalogBatchResult | CmvpCatalogBatchArtifact> {
  if (existing.state === "completed") return replayCompletedCheckpoint(existing, request, contract);
  if (existing.state === "acquiring") return replayAcquiringCheckpoint(request, existing, dependencies);
  if (existing.state === "acquired" && !isValidAcquiredCheckpoint(existing, request, contract)) throw new Error("invalid acquired checkpoint");
  if (existing.state === "blocked" && (!existing.reconciliationError || existing.reconciliationError === "acquisition checkpoint lacks durable outcome")) return { artifact: existing, replayed: true };
  return existing;
}

async function replayCheckpoint(request: NormalizedRequest, contract: string, dependencies: CmvpCatalogBatchDependencies): Promise<CmvpCatalogBatchResult | CmvpCatalogBatchArtifact | null> {
  const existing = await dependencies.loadArtifact(request.batchId);
  if (!existing) return null;
  if (existing.contractDigest !== contract) throw new Error("checkpoint contract conflict");
  return replayExistingCheckpoint(request, contract, existing, dependencies);
}

function acquisitionOutcome(acquisition: AcquisitionResult) {
  let fetchedGtins: string[] = [];
  let admittedGtins: string[] = [];
  let error = normalizedError(acquisition.error, "acquisition");
  if (!isNonNegativeInteger(acquisition.rejectedCount)) error = "invalid_acquisition_rejected_count";
  else if (acquisition.rejectedCount !== 0) error = "acquisition_rejected_products";
  try { fetchedGtins = normalizeGtins(acquisition.fetchedGtins, "fetched"); admittedGtins = normalizeGtins(acquisition.admittedGtins, "admitted"); } catch { error = "invalid_acquisition_gtins"; }
  return { fetchedGtins, admittedGtins, error };
}

async function handleAcquisitionOutcome(request: NormalizedRequest, contract: string, acquisition: AcquisitionResult, dependencies: CmvpCatalogBatchDependencies): Promise<CmvpCatalogBatchResult | CmvpCatalogBatchArtifact> {
  const { fetchedGtins, admittedGtins, error } = acquisitionOutcome(acquisition);
  const artifact = createArtifact(request, contract, error ? "blocked" : "acquired", acquisition, fetchedGtins, admittedGtins, error);
  await persistArtifact(request, artifact, dependencies);
  if (error) {
    await finalizeAcquisition(request, acquisition.runId, { status: "FAILED", errorSummary: error }, dependencies);
    return { artifact, replayed: false };
  }
  if (!sameSet(fetchedGtins, request.expectedGtins) || !sameSet(admittedGtins, request.expectedGtins)) {
    const mismatch = "fetched/admitted GTIN mismatch before reconciliation";
    await finalizeAcquisition(request, acquisition.runId, { status: "FAILED", errorSummary: mismatch }, dependencies);
    const blocked = { ...artifact, state: "blocked" as const, runs: artifact.runs.map((run) => ({ ...run, error: mismatch })) };
    await persistArtifact(request, blocked, dependencies);
    return { artifact: blocked, replayed: false };
  }
  return artifact;
}

export async function runCmvpCatalogBatch(input: CmvpCatalogBatchRequest, dependencies: CmvpCatalogBatchDependencies): Promise<CmvpCatalogBatchResult> {
  const request = normalizeContract(input);
  const contract = contractDigest(request);
  const checkpoint = await replayCheckpoint(request, contract, dependencies);
  if (checkpoint) {
    if ("artifact" in checkpoint) return checkpoint;
    if (!request.dryRun && (checkpoint.state === "acquired" || checkpoint.reconciliationError)) return { artifact: await reconcile(request, checkpoint, dependencies), replayed: false };
    return { artifact: checkpoint, replayed: true };
  }

  if (!request.dryRun) await persistArtifact(request, createArtifact(request, contract, "acquiring"), dependencies);
  const outcome = await handleAcquisitionOutcome(request, contract, await dependencies.acquire(request), dependencies);
  if ("artifact" in outcome) return outcome;
  if (request.dryRun) return { artifact: { ...outcome, state: "completed" }, replayed: false };
  return { artifact: await reconcile(request, outcome, dependencies), replayed: false };
}
