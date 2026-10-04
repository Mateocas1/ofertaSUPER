import { createHash } from "node:crypto";

import { normalizeGtin } from "../../src/lib/identity/gtin";

// The acquisition contract accepts exactly these stores (the staged sources of
// the daily refresh). Discovery refuses to plan for anything else.
export const CMVP_CATALOG_SOURCES = ["disco", "jumbo", "carrefour"] as const;

const SOURCES = new Set<string>(CMVP_CATALOG_SOURCES);

export type CmvpCatalogBatchRequest = {
  batchId: string;
  source: string;
  term: string;
  count: number;
  expectedGtins: string[];
  dryRun: boolean;
  confirmWrite: boolean;
  // Gate 6 daily refresh: the source catalog evolves, so the plan's expected
  // GTINs are not re-asserted; admitted products must match fetched instead.
  refresh?: boolean;
};

export type RejectedProduct = { gtin: string; qualityFlags: string[] };

type AcquisitionResult = {
  runId: number | null;
  startedAt: string;
  finishedAt: string;
  fetchedGtins: string[];
  admittedGtins: string[];
  rejectedCount: number;
  rejectedProducts: RejectedProduct[];
  error: string | null;
  promoReadsFailed?: number;
  promosCaptured?: number;
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
  runs: Array<{ runId: number | null; startedAt: string; finishedAt: string; fetchedCount: number; admittedCount: number; rejectedCount: number; rejectedProducts: RejectedProduct[]; error: string | null; promoReadsFailed?: number; promosCaptured?: number }>;
};

export type CmvpCatalogBatchDependencies = {
  loadArtifact: (batchId: string) => Promise<CmvpCatalogBatchArtifact | null>;
  saveArtifact: (artifact: Readonly<CmvpCatalogBatchArtifact>) => Promise<void>;
  acquire: (request: Readonly<CmvpCatalogBatchRequest>) => Promise<AcquisitionResult>;
  finalizeAcquisition: (runId: number, outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null }) => Promise<void>;
  reconcile: (request: Readonly<CmvpCatalogBatchRequest>, runId?: number | null) => Promise<{ runId: number | null; promotedCount: number; error: string | null }>;
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

// A frozen-plan batch pins its exact 25-result contract; a discovered refresh
// batch searches a live category and may take up to 50 results, with no known
// expected GTINs (the plan is built from the category tree at run time).
const MAX_PLAN_COUNT = 25;
const MAX_REFRESH_COUNT = 50;

export function validateContractCountAndGtins(input: CmvpCatalogBatchRequest) {
  const max = input.refresh ? MAX_REFRESH_COUNT : MAX_PLAN_COUNT;
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > max) throw new Error(`count must be an integer from 1 through ${max}`);
  if (input.expectedGtins.length === 0) {
    // Only a discovered refresh batch may leave the expected set open.
    if (!input.refresh) throw new Error("expected GTIN count must match count");
    return [];
  }
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

// A daily refresh batch tolerates isolated rejects so one bad product cannot
// block the whole publish: it only fails when the rejects exceed
// max(1, 10% of the fetched products) or when it admits nothing at all.
export const REJECTION_TOLERANCE_RATIO = 0.1;

export function rejectionTolerance(fetchedCount: number): number {
  return Math.max(1, Math.floor(fetchedCount * REJECTION_TOLERANCE_RATIO));
}

export function exceedsRejectionTolerance(rejectedCount: number, fetchedCount: number): boolean {
  return rejectedCount > rejectionTolerance(fetchedCount);
}

function canonicalRejectedProducts(products: RejectedProduct[]): RejectedProduct[] {
  return products.map((product) => ({ gtin: normalizeGtin(product.gtin) ?? product.gtin, qualityFlags: [...product.qualityFlags] }));
}

// Refresh batches re-assert that the admitted plus rejected identities are
// exactly the fetched products, instead of requiring fetched == admitted.
function refreshAdmissionMatches(fetchedGtins: string[], admittedGtins: string[], rejectedProducts: RejectedProduct[]): boolean {
  try {
    const rejectedGtins = normalizeGtins(rejectedProducts.map((product) => product.gtin), "rejected");
    return sameSet(normalizeGtins([...admittedGtins, ...rejectedGtins], "admitted"), normalizeGtins(fetchedGtins, "fetched"));
  } catch {
    return false;
  }
}

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
  // Refresh batches re-assert only their own self-consistency: the source
  // catalog evolves, so the plan's expected GTINs do not bound the replay, and
  // a tolerated reject is part of the fetched set.
  if (request.refresh) {
    return refreshAdmissionMatches(artifact.fetchedGtins, artifact.admittedGtins, artifact.runs[0]?.rejectedProducts ?? []);
  }
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
  // Refresh batches report what the source actually returned today: the plan
  // count bounds the search, not the catalog, and isolated rejects are within
  // the tolerance.
  if (request.refresh) {
    return run.fetchedCount === run.admittedCount + run.rejectedCount
      && !exceedsRejectionTolerance(run.rejectedCount, run.fetchedCount)
      && run.admittedCount > 0
      && run.error === null;
  }
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
    runs: acquisition ? [{ runId: acquisition.runId, startedAt: acquisition.startedAt, finishedAt: acquisition.finishedAt, fetchedCount: fetchedGtins.length, admittedCount: admittedGtins.length, rejectedCount: acquisition.rejectedCount, rejectedProducts: canonicalRejectedProducts(acquisition.rejectedProducts ?? []), error, promoReadsFailed: acquisition.promoReadsFailed, promosCaptured: acquisition.promosCaptured }] : [],
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
  try { reconciliation = await dependencies.reconcile(request, runId(artifact)); }
  catch (error) { return failReconciliation(request, artifact, rejectedReconciliationError(error), dependencies); }
  const reportedError = normalizedError(reconciliation.error, "reconciliation");
  // In refresh mode duplicate EANs collapse into one canonical candidate, so
  // the expected promotion count is the number of distinct admitted EANs.
  const expectedPromoted = request.refresh ? new Set(artifact.admittedGtins).size : request.count;
  const reconciliationError = reportedError ?? (!isNonNegativeInteger(reconciliation.promotedCount)
    ? "invalid_reconciliation_promoted_count"
    : reconciliation.promotedCount === expectedPromoted ? null
      : `reconciliation promoted count mismatch: expected ${expectedPromoted}, got ${reconciliation.promotedCount}`);
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

// A refresh search that returns no product at all is its own outcome: the
// category exists in the store tree but its name matched nothing searchable
// today. The batch still blocks, and the refresh run decides whether an empty
// discovered category is tolerable (a frozen-plan term must always return).
export const ACQUISITION_NO_RESULTS = "acquisition_no_results";

function acquisitionOutcome(acquisition: AcquisitionResult, refresh: boolean) {
  let fetchedGtins: string[] = [];
  let admittedGtins: string[] = [];
  let error = normalizedError(acquisition.error, "acquisition");
  if (!isNonNegativeInteger(acquisition.rejectedCount)) error = "invalid_acquisition_rejected_count";
  try { fetchedGtins = normalizeGtins(acquisition.fetchedGtins, "fetched"); admittedGtins = normalizeGtins(acquisition.admittedGtins, "admitted"); } catch { error = "invalid_acquisition_gtins"; }
  if (error === null && exceedsRejectionTolerance(acquisition.rejectedCount, fetchedGtins.length)) error = "acquisition_rejected_products";
  if (error === null && refresh && fetchedGtins.length === 0) error = ACQUISITION_NO_RESULTS;
  if (error === null && admittedGtins.length === 0) error = "acquisition_no_admitted_products";
  return { fetchedGtins, admittedGtins, error };
}

async function handleAcquisitionOutcome(request: NormalizedRequest, contract: string, acquisition: AcquisitionResult, dependencies: CmvpCatalogBatchDependencies): Promise<CmvpCatalogBatchResult | CmvpCatalogBatchArtifact> {
  const { fetchedGtins, admittedGtins, error } = acquisitionOutcome(acquisition, request.refresh === true);
  const artifact = createArtifact(request, contract, error ? "blocked" : "acquired", acquisition, fetchedGtins, admittedGtins, error);
  await persistArtifact(request, artifact, dependencies);
  if (error) {
    await finalizeAcquisition(request, acquisition.runId, { status: "FAILED", errorSummary: error }, dependencies);
    return { artifact, replayed: false };
  }
  const expectedMismatch = request.refresh
    ? !refreshAdmissionMatches(fetchedGtins, admittedGtins, acquisition.rejectedProducts ?? [])
    : !sameSet(fetchedGtins, request.expectedGtins) || !sameSet(admittedGtins, request.expectedGtins);
  if (expectedMismatch) {
    const mismatch = request.refresh ? "admitted GTINs diverge from the fetched products" : "fetched/admitted GTIN mismatch before reconciliation";
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
