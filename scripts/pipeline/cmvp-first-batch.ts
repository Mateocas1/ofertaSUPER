import { createHash } from "node:crypto";

import { normalizeGtin } from "../../src/lib/identity/gtin";

const SOURCES = new Set(["disco", "jumbo", "carrefour"]);

export type CmvpFirstBatchRequest = {
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

export type CmvpFirstBatchArtifact = {
  schemaVersion: 1;
  batchId: string;
  source: string;
  term: string;
  count: 5;
  dryRun: boolean;
  contractDigest: string;
  state: "acquiring" | "acquired" | "completed" | "blocked";
  fetchedGtins: string[];
  admittedGtins: string[];
  reconciliationError: string | null;
  runs: Array<{
    runId: number | null;
    startedAt: string;
    finishedAt: string;
    fetchedCount: number;
    admittedCount: number;
    rejectedCount: number;
    error: string | null;
  }>;
};

export type CmvpFirstBatchDependencies = {
  loadArtifact: (batchId: string) => Promise<CmvpFirstBatchArtifact | null>;
  saveArtifact: (artifact: CmvpFirstBatchArtifact) => Promise<void>;
  acquire: (request: Readonly<CmvpFirstBatchRequest>) => Promise<AcquisitionResult>;
  finalizeAcquisition: (runId: number, outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null }) => Promise<void>;
  reconcile: (request: Readonly<CmvpFirstBatchRequest>) => Promise<{ runId: number | null; promotedCount: number; error: string | null }>;
};

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeExpectedGtins(values: string[]) {
  const normalized = values.map(normalizeGtin);
  if (normalized.some((value) => value === null)) {
    throw new Error("expected GTINs must be valid normalized GTINs");
  }
  const gtins = normalized as string[];
  if (new Set(gtins).size !== 5) {
    throw new Error("expected GTINs must be exactly five distinct normalized values");
  }
  return gtins.toSorted();
}

function normalizeActualGtins(values: string[], label: string) {
  const gtins = values.map(normalizeGtin);
  if (gtins.some((value) => value === null)) {
    throw new Error(`${label} GTINs must all be valid`);
  }
  return (gtins as string[]).toSorted();
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeContract(request: CmvpFirstBatchRequest) {
  if (!SOURCES.has(request.source)) {
    throw new Error("source must be exactly one of disco, jumbo, carrefour");
  }
  if (!request.batchId.trim()) throw new Error("batchId must be nonblank");
  const term = request.term.trim();
  if (!term) throw new Error("term must be exactly one nonblank value");
  if (request.count !== 5) throw new Error("first-batch count must be exactly 5");
  const expectedGtins = normalizeExpectedGtins(request.expectedGtins);
  if (request.expectedGtins.length !== 5) {
    throw new Error("expected GTINs must contain exactly five values");
  }
  if (!request.dryRun && !request.confirmWrite) {
    throw new Error("write requires explicit confirmation");
  }
  return { ...request, batchId: request.batchId.trim(), term, expectedGtins };
}

type NormalizedRequest = ReturnType<typeof normalizeContract>;
type CmvpFirstBatchResult = { artifact: CmvpFirstBatchArtifact; replayed: boolean };

function acquisitionRunId(artifact: CmvpFirstBatchArtifact) {
  return artifact.runs[0]?.runId ?? null;
}

function runsWithError(artifact: CmvpFirstBatchArtifact, error: string) {
  return artifact.runs.map((run) => ({ ...run, error }));
}

function contractDigest(request: NormalizedRequest) {
  return digest({
    executionMode: request.dryRun ? "dry-run" : "confirmed-write",
    source: request.source,
    term: request.term,
    count: request.count,
    batchId: request.batchId,
    expectedGtins: request.expectedGtins,
  });
}

function createAcquiringCheckpoint(request: NormalizedRequest, contract: string): CmvpFirstBatchArtifact {
  return {
    schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: 5,
    dryRun: false, contractDigest: contract, state: "acquiring",
    fetchedGtins: [], admittedGtins: [], reconciliationError: null, runs: [],
  };
}

async function persistArtifact(
  request: NormalizedRequest,
  artifact: CmvpFirstBatchArtifact,
  dependencies: CmvpFirstBatchDependencies,
) {
  if (!request.dryRun) await dependencies.saveArtifact(artifact);
}

async function replayCheckpoint(
  request: NormalizedRequest,
  contract: string,
  dependencies: CmvpFirstBatchDependencies,
): Promise<CmvpFirstBatchArtifact | CmvpFirstBatchResult | null> {
  const existing = await dependencies.loadArtifact(request.batchId);
  if (!existing) return null;
  if (existing.contractDigest !== contract) throw new Error("checkpoint contract conflict");
  return existing.state === "acquired" ? existing : { artifact: existing, replayed: true };
}

function validateFetchedAndAdmitted(acquisition: AcquisitionResult) {
  let fetchedGtins: string[] = [];
  let admittedGtins: string[] = [];
  let error = acquisition.error;
  try {
    fetchedGtins = normalizeActualGtins(acquisition.fetchedGtins, "fetched");
    admittedGtins = normalizeActualGtins(acquisition.admittedGtins, "admitted");
  } catch {
    error = "invalid_acquisition_gtins";
  }
  return { fetchedGtins, admittedGtins, error };
}

function createAcquisitionArtifact(
  request: NormalizedRequest,
  contract: string,
  acquisition: AcquisitionResult,
) {
  const { fetchedGtins, admittedGtins, error } = validateFetchedAndAdmitted(acquisition);
  return {
    artifact: {
      schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: 5,
      dryRun: request.dryRun, contractDigest: contract, state: error ? "blocked" : "acquired",
      fetchedGtins, admittedGtins, reconciliationError: null,
      runs: [{ runId: acquisition.runId, startedAt: acquisition.startedAt, finishedAt: acquisition.finishedAt,
        fetchedCount: fetchedGtins.length, admittedCount: admittedGtins.length, rejectedCount: acquisition.rejectedCount, error }],
    } satisfies CmvpFirstBatchArtifact,
    error,
  };
}

async function finalizeRun(
  request: NormalizedRequest,
  runId: number | null,
  outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null },
  dependencies: CmvpFirstBatchDependencies,
) {
  if (!request.dryRun && runId !== null) await dependencies.finalizeAcquisition(runId, outcome);
}

async function handleAcquisitionFailure(
  request: NormalizedRequest,
  artifact: CmvpFirstBatchArtifact,
  error: string | null,
  dependencies: CmvpFirstBatchDependencies,
): Promise<CmvpFirstBatchResult | null> {
  if (!error) return null;
  await finalizeRun(request, acquisitionRunId(artifact), { status: "FAILED", errorSummary: error }, dependencies);
  return { artifact, replayed: false };
}

function reconciliationFailureMessage(cause: unknown) {
  return cause instanceof Error && cause.message ? cause.message : "unknown_reconciliation_error";
}

async function reconcileArtifact(
  request: NormalizedRequest,
  artifact: CmvpFirstBatchArtifact,
  dependencies: CmvpFirstBatchDependencies,
): Promise<CmvpFirstBatchResult> {
  const runId = acquisitionRunId(artifact);
  const reconciliation = await dependencies.reconcile(request).catch((cause) => ({
    runId: null,
    promotedCount: 0,
    error: reconciliationFailureMessage(cause),
  }));
  const error = reconciliation.error ?? (reconciliation.promotedCount === request.count
    ? null
    : `reconciliation promoted count mismatch: expected ${request.count}, got ${reconciliation.promotedCount}`);
  if (error) {
    await finalizeRun(request, runId, { status: "FAILED", errorSummary: error }, dependencies);
    const blocked = { ...artifact, state: "blocked" as const, reconciliationError: error, runs: runsWithError(artifact, error) };
    await persistArtifact(request, blocked, dependencies);
    throw new Error(`reconciliation failed: ${error}`);
  }
  await finalizeRun(request, runId, { status: "SUCCESS", errorSummary: null }, dependencies);
  const completed = { ...artifact, state: "completed" as const, reconciliationError: null };
  await persistArtifact(request, completed, dependencies);
  return { artifact: completed, replayed: false };
}

export async function runCmvpFirstBatch(
  input: CmvpFirstBatchRequest,
  dependencies: CmvpFirstBatchDependencies,
): Promise<CmvpFirstBatchResult> {
  const request = normalizeContract(input);
  const contract = contractDigest(request);
  const checkpoint = await replayCheckpoint(request, contract, dependencies);
  if (checkpoint && "replayed" in checkpoint) return checkpoint;

  let artifact = checkpoint;
  if (!artifact) {
    await persistArtifact(request, createAcquiringCheckpoint(request, contract), dependencies);
    const acquisition = await dependencies.acquire(request);
    const acquired = createAcquisitionArtifact(request, contract, acquisition);
    artifact = acquired.artifact;
    await persistArtifact(request, artifact, dependencies);
    const failure = await handleAcquisitionFailure(request, artifact, acquired.error, dependencies);
    if (failure) return failure;
  }

  const runId = acquisitionRunId(artifact);
  if (!sameSet(artifact.fetchedGtins, request.expectedGtins) || !sameSet(artifact.admittedGtins, request.expectedGtins)) {
    const error = "fetched/admitted GTIN mismatch before reconciliation";
    await finalizeRun(request, runId, { status: "FAILED", errorSummary: error }, dependencies);
    const blocked = { ...artifact, state: "blocked" as const, runs: runsWithError(artifact, error) };
    await persistArtifact(request, blocked, dependencies);
    return { artifact: blocked, replayed: false };
  }
  if (request.dryRun) return { artifact: { ...artifact, state: "completed" }, replayed: false };
  return reconcileArtifact(request, artifact, dependencies);
}
