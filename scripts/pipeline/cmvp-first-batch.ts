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

function acquisitionRunId(artifact: CmvpFirstBatchArtifact) {
  return artifact.runs[0]?.runId ?? null;
}

function runsWithError(artifact: CmvpFirstBatchArtifact, error: string) {
  return artifact.runs.map((run) => ({ ...run, error }));
}

function contractDigest(request: ReturnType<typeof normalizeContract>) {
  return digest({
    executionMode: request.dryRun ? "dry-run" : "confirmed-write",
    source: request.source,
    term: request.term,
    count: request.count,
    batchId: request.batchId,
    expectedGtins: request.expectedGtins,
  });
}

export async function runCmvpFirstBatch(
  input: CmvpFirstBatchRequest,
  dependencies: CmvpFirstBatchDependencies,
): Promise<{ artifact: CmvpFirstBatchArtifact; replayed: boolean }> {
  const request = normalizeContract(input);
  const contract = contractDigest(request);
  const existing = await dependencies.loadArtifact(request.batchId);
  if (existing) {
    if (existing.contractDigest !== contract) throw new Error("checkpoint contract conflict");
    if (existing.state !== "acquired") return { artifact: existing, replayed: true };
  }

  let artifact: CmvpFirstBatchArtifact;
  if (existing) {
    artifact = existing;
  } else {
    if (!request.dryRun) {
      artifact = {
        schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: 5,
        dryRun: false, contractDigest: contract, state: "acquiring",
        fetchedGtins: [], admittedGtins: [], reconciliationError: null, runs: [],
      };
      await dependencies.saveArtifact(artifact);
    }
    const acquisition = await dependencies.acquire(request);
    let fetchedGtins: string[] = [];
    let admittedGtins: string[] = [];
    let error = acquisition.error;
    try {
      fetchedGtins = normalizeActualGtins(acquisition.fetchedGtins, "fetched");
      admittedGtins = normalizeActualGtins(acquisition.admittedGtins, "admitted");
    } catch {
      error = "invalid_acquisition_gtins";
    }
    artifact = {
      schemaVersion: 1, batchId: request.batchId, source: request.source, term: request.term, count: 5,
      dryRun: request.dryRun, contractDigest: contract, state: error ? "blocked" : "acquired",
      fetchedGtins, admittedGtins, reconciliationError: null,
      runs: [{ runId: acquisition.runId, startedAt: acquisition.startedAt, finishedAt: acquisition.finishedAt,
        fetchedCount: fetchedGtins.length, admittedCount: admittedGtins.length, rejectedCount: acquisition.rejectedCount, error }],
    };
    if (!request.dryRun) await dependencies.saveArtifact(artifact);
    if (error) {
      if (!request.dryRun && acquisition.runId !== null) {
        await dependencies.finalizeAcquisition(acquisition.runId, { status: "FAILED", errorSummary: error });
      }
      return { artifact, replayed: false };
    }
  }

  const runId = acquisitionRunId(artifact);
  if (!sameSet(artifact.fetchedGtins, request.expectedGtins) || !sameSet(artifact.admittedGtins, request.expectedGtins)) {
    const error = "fetched/admitted GTIN mismatch before reconciliation";
    if (!request.dryRun && runId !== null) {
      await dependencies.finalizeAcquisition(runId, { status: "FAILED", errorSummary: error });
    }
    artifact = { ...artifact, state: "blocked", runs: runsWithError(artifact, error) };
    if (!request.dryRun) await dependencies.saveArtifact(artifact);
    return { artifact, replayed: false };
  }
  if (request.dryRun) return { artifact: { ...artifact, state: "completed" }, replayed: false };
  const reconciliation = await dependencies.reconcile(request);
  const error = reconciliation.error ?? (reconciliation.promotedCount === request.count
    ? null
    : `reconciliation promoted count mismatch: expected ${request.count}, got ${reconciliation.promotedCount}`);
  if (error) {
    if (runId !== null) {
      await dependencies.finalizeAcquisition(runId, { status: "FAILED", errorSummary: error });
    }
    artifact = {
      ...artifact,
      state: "blocked",
      reconciliationError: error,
      runs: runsWithError(artifact, error),
    };
    await dependencies.saveArtifact(artifact);
    throw new Error(`reconciliation failed: ${error}`);
  }
  if (runId !== null) {
    await dependencies.finalizeAcquisition(runId, { status: "SUCCESS", errorSummary: null });
  }
  artifact = { ...artifact, state: "completed", reconciliationError: null };
  await dependencies.saveArtifact(artifact);
  return { artifact, replayed: false };
}
