import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runCmvpFirstBatch,
  type CmvpFirstBatchDependencies,
  type CmvpFirstBatchRequest,
} from "../scripts/pipeline/cmvp-first-batch";

const expectedGtins = [
  "7790000000003",
  "7790000000010",
  "7790000000027",
  "7790000000034",
  "7790000000041",
];

function request(overrides: Partial<CmvpFirstBatchRequest> = {}): CmvpFirstBatchRequest {
  return {
    batchId: "cycle-001",
    source: "disco",
    term: "leche",
    count: 5,
    expectedGtins,
    dryRun: true,
    confirmWrite: false,
    ...overrides,
  };
}

function dependencies(overrides: Partial<CmvpFirstBatchDependencies> = {}): CmvpFirstBatchDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    loadArtifact: async () => null,
    saveArtifact: async () => {
      calls.push("save");
    },
    acquire: async () => {
      calls.push("acquire");
      return {
        runId: 7,
        startedAt: "2026-03-10T00:00:00.000Z",
        finishedAt: "2026-03-10T00:00:01.000Z",
        fetchedGtins: ["779 000-000 0003", ...expectedGtins.slice(1)],
        admittedGtins: [...expectedGtins].reverse(),
        rejectedCount: 0,
        error: null,
      };
    },
    finalizeAcquisition: async (_runId, outcome) => {
      calls.push(`finalize:${outcome.status}`);
    },
    reconcile: async () => {
      calls.push("reconcile");
      return { runId: 7, promotedCount: 5, error: null };
    },
    ...overrides,
  };
}

describe("CMVP first-batch acquisition", () => {
  it("imports and parses without loading or changing explicitly supplied environment", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const suppliedDatabaseUrl = "postgresql://local-user:local-pass@localhost:5432/local-db";
    process.env.DATABASE_URL = suppliedDatabaseUrl;

    try {
      const cli = await import(`../scripts/acquire-cmvp-first-batch.ts?isolation=${Date.now()}`);

      assert.equal(process.env.DATABASE_URL, suppliedDatabaseUrl);
      assert.deepEqual(
        cli.parseCmvpFirstBatchCliOptions([
          "node",
          "acquire-cmvp-first-batch.ts",
          "--batch-id=cycle-001",
          "--source=disco",
          "--term=leche",
          "--count=5",
          "--expected-gtins=7790000000003,7790000000010,7790000000027,7790000000034,7790000000041",
          "--dry-run",
          "--output=artifacts/cycle-001.json",
        ]),
        {
          batchId: "cycle-001",
          source: "disco",
          term: "leche",
          count: 5,
          expectedGtins,
          dryRun: true,
          confirmWrite: false,
          output: "artifacts/cycle-001.json",
        },
      );
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("enforces the bounded single-source contract before any dependency call", async () => {
    const deps = dependencies();
    for (const invalid of [
      request({ source: "vea" }),
      request({ source: "disco,jumbo" }),
      request({ term: "   " }),
      request({ count: 4 }),
      request({ expectedGtins: expectedGtins.slice(0, 4) }),
      request({ expectedGtins: [...expectedGtins.slice(0, 4), "779 000-000 0003"] }),
      request({ expectedGtins: [...expectedGtins.slice(0, 4), "7790001000012"] }),
    ]) {
      await assert.rejects(() => runCmvpFirstBatch(invalid, deps));
    }
    assert.deepEqual(deps.calls, []);
  });

  it("keeps dry runs write-free while emitting a deterministic sorted artifact", async () => {
    const deps = dependencies();
    const result = await runCmvpFirstBatch(request(), deps);

    assert.deepEqual(deps.calls, ["acquire"]);
    assert.deepEqual(result.artifact.fetchedGtins, expectedGtins);
    assert.deepEqual(result.artifact.admittedGtins, expectedGtins);
    assert.equal(result.artifact.dryRun, true);
    assert.equal(result.artifact.contractDigest.length, 64);
    assert.deepEqual(result.artifact.runs, [{
      runId: 7,
      startedAt: "2026-03-10T00:00:00.000Z",
      finishedAt: "2026-03-10T00:00:01.000Z",
      fetchedCount: 5,
      admittedCount: 5,
      rejectedCount: 0,
      error: null,
    }]);
  });

  it("checkpoints confirmed acquisition before it starts and replays a crash as recovery-required", async () => {
    const checkpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
    let acquisitionSideEffect = false;
    const crash = dependencies({
      saveArtifact: async (artifact) => { checkpoint.value = artifact; crash.calls.push("save"); },
      acquire: async () => {
        acquisitionSideEffect = true;
        crash.calls.push("acquire");
        throw new Error("acquisition_crashed_after_side_effect");
      },
    });

    await assert.rejects(
      () => runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), crash),
      /acquisition_crashed_after_side_effect/,
    );
    assert.equal(acquisitionSideEffect, true);
    assert.equal(checkpoint.value?.state, "acquiring");
    assert.deepEqual(crash.calls, ["save", "acquire"]);

    const retry = dependencies({ loadArtifact: async () => checkpoint.value });
    const replayed = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), retry);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.artifact.state, "acquiring");
    assert.deepEqual(retry.calls, []);
  });

  it("requires confirmation, exact fetched/admitted expected GTINs, and reconciles only after admission", async () => {
    const noConfirmation = dependencies();
    await assert.rejects(() => runCmvpFirstBatch(request({ dryRun: false }), noConfirmation), /confirmation/);
    assert.deepEqual(noConfirmation.calls, []);

    const mismatchCheckpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
    const mismatch = dependencies({
      saveArtifact: async (artifact) => { mismatch.calls.push("save"); mismatchCheckpoint.value = artifact; },
      acquire: async () => ({
        runId: 7, startedAt: "2026-03-10T00:00:00.000Z", finishedAt: "2026-03-10T00:00:01.000Z",
        fetchedGtins: expectedGtins, admittedGtins: [...expectedGtins.slice(0, 4), "7790000000058"], rejectedCount: 0, error: null,
      }),
    });
    const mismatched = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), mismatch);
    assert.equal(mismatched.artifact.state, "blocked");
    assert.deepEqual(mismatch.calls, ["save", "save", "finalize:FAILED", "save"]);
    assert.equal(mismatchCheckpoint.value?.state, "blocked");
    assert.deepEqual(mismatchCheckpoint.value?.fetchedGtins, expectedGtins);
    const mismatchReplay = dependencies({ loadArtifact: async () => mismatchCheckpoint.value });
    await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), mismatchReplay);
    assert.deepEqual(mismatchReplay.calls, []);

    const writeCheckpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
    const write = dependencies({
      saveArtifact: async (artifact) => { writeCheckpoint.value = artifact; write.calls.push("save"); },
    });
    const written = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), write);
    assert.deepEqual(write.calls, ["save", "acquire", "save", "reconcile", "finalize:SUCCESS", "save"]);
    assert.equal(written.artifact.state, "completed");
    assert.equal(writeCheckpoint.value?.state, "completed");
  });

  it("checkpoints malformed confirmed acquisitions without retaining raw GTINs", async () => {
    const checkpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
    const malformed = dependencies({
      saveArtifact: async (artifact) => { checkpoint.value = artifact; malformed.calls.push("save"); },
      acquire: async () => ({
        runId: 8, startedAt: "2026-03-10T00:00:00.000Z", finishedAt: "2026-03-10T00:00:01.000Z",
        fetchedGtins: ["secret-like malformed value"], admittedGtins: expectedGtins, rejectedCount: 1, error: null,
      }),
    });
    const result = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), malformed);
    assert.equal(result.artifact.state, "blocked");
    assert.deepEqual(result.artifact.fetchedGtins, []);
    assert.deepEqual(result.artifact.admittedGtins, []);
    assert.deepEqual(result.artifact.runs, [{
      runId: 8, startedAt: "2026-03-10T00:00:00.000Z", finishedAt: "2026-03-10T00:00:01.000Z",
      fetchedCount: 0, admittedCount: 0, rejectedCount: 1, error: "invalid_acquisition_gtins",
    }]);
    assert.deepEqual(malformed.calls, ["save", "save", "finalize:FAILED"]);

    const replay = dependencies({ loadArtifact: async () => checkpoint.value });
    assert.equal((await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), replay)).replayed, true);
    assert.deepEqual(replay.calls, []);
  });

  it("fails the persisted run before checkpointing mismatched GTINs and skips reconciliation", async () => {
    const finalized: Array<{ runId: number; status: string; errorSummary: string | null }> = [];
    const mismatch = dependencies({
      acquire: async () => ({
        runId: 9, startedAt: "2026-03-10T00:00:00.000Z", finishedAt: "2026-03-10T00:00:01.000Z",
        fetchedGtins: expectedGtins, admittedGtins: [...expectedGtins.slice(0, 4), "7790000000058"], rejectedCount: 0, error: null,
      }),
    });
    (mismatch as typeof mismatch & {
      finalizeAcquisition?: (runId: number, outcome: { status: string; errorSummary: string | null }) => Promise<void>;
    }).finalizeAcquisition = async (runId, outcome) => {
      finalized.push({ runId, ...outcome });
      mismatch.calls.push(`finalize:${outcome.status}`);
    };

    const result = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), mismatch);

    assert.equal(result.artifact.state, "blocked");
    assert.deepEqual(finalized, [{ runId: 9, status: "FAILED", errorSummary: "fetched/admitted GTIN mismatch before reconciliation" }]);
    assert.deepEqual(mismatch.calls, ["save", "save", "finalize:FAILED", "save"]);
  });

  it("fails reconciliation before terminal success and checkpoints a blocked recovery artifact", async () => {
    for (const reconciliation of [
      { runId: 7, promotedCount: 0, error: "temporary_failure" },
      { runId: 7, promotedCount: 4, error: null },
    ]) {
      const checkpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
      const failed = dependencies({
        saveArtifact: async (artifact) => { checkpoint.value = artifact; failed.calls.push("save"); },
        reconcile: async () => { failed.calls.push("reconcile"); return reconciliation; },
      });

      await assert.rejects(() => runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), failed));
      const error = reconciliation.error ?? "reconciliation promoted count mismatch: expected 5, got 4";
      assert.deepEqual(failed.calls, ["save", "acquire", "save", "reconcile", "finalize:FAILED", "save"]);
      assert.equal(checkpoint.value?.state, "blocked");
      assert.equal(checkpoint.value?.reconciliationError, error);
      assert.equal(checkpoint.value?.runs[0]?.error, error);
    }
  });

  it("fails a rejected reconciliation before checkpointing a deterministic recovery artifact", async () => {
    const checkpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
    const rejected = dependencies({
      saveArtifact: async (artifact) => { checkpoint.value = artifact; rejected.calls.push("save"); },
      reconcile: async () => {
        rejected.calls.push("reconcile");
        throw new Error("injected_reconciliation_failure");
      },
    });

    await assert.rejects(
      () => runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), rejected),
      /reconciliation failed: injected_reconciliation_failure/,
    );
    assert.deepEqual(rejected.calls, ["save", "acquire", "save", "reconcile", "finalize:FAILED", "save"]);
    assert.equal(checkpoint.value?.state, "blocked");
    assert.equal(checkpoint.value?.reconciliationError, "injected_reconciliation_failure");
    assert.equal(checkpoint.value?.runs[0]?.error, "injected_reconciliation_failure");
  });

  it("replays identical checkpoints, rejects changed contracts, and retains blocked state for resume", async () => {
    const prior = await runCmvpFirstBatch(request(), dependencies());
    const replay = dependencies({ loadArtifact: async () => prior.artifact });
    const replayed = await runCmvpFirstBatch(request(), replay);
    assert.equal(replayed.replayed, true);
    assert.deepEqual(replay.calls, []);

    const modeConflict = dependencies({ loadArtifact: async () => prior.artifact });
    await assert.rejects(
      () => runCmvpFirstBatch(request({ batchId: "cycle-002" }), modeConflict),
      /conflict/,
    );
    await assert.rejects(
      () => runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), modeConflict),
      /conflict/,
    );
    assert.deepEqual(modeConflict.calls, []);

    await assert.rejects(
      () => runCmvpFirstBatch(request({ term: "yogur" }), replay),
      /conflict/,
    );

    const blocked = dependencies({ acquire: async () => ({
      runId: 8,
      startedAt: "2026-03-10T00:00:00.000Z",
      finishedAt: "2026-03-10T00:00:01.000Z",
      fetchedGtins: [],
      admittedGtins: [],
      rejectedCount: 0,
      error: "dependency_blocked",
    }) });
    const failed = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), blocked);
    assert.equal(failed.artifact.state, "blocked");
    assert.deepEqual(blocked.calls, ["save", "save", "finalize:FAILED"]);

    const resumed = dependencies({ loadArtifact: async () => failed.artifact });
    const resumedResult = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), resumed);
    assert.equal(resumedResult.replayed, true);
    assert.deepEqual(resumed.calls, []);

    const blockedCheckpoint: { value: Awaited<ReturnType<typeof runCmvpFirstBatch>>["artifact"] | null } = { value: null };
    const reconcileFailure = dependencies({
      saveArtifact: async (artifact) => { blockedCheckpoint.value = artifact; reconcileFailure.calls.push("save"); },
      reconcile: async () => { reconcileFailure.calls.push("reconcile"); return { runId: 7, promotedCount: 0, error: "temporary_failure" }; },
    });
    await assert.rejects(() => runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), reconcileFailure), /reconciliation failed/);
    assert.equal(blockedCheckpoint.value?.state, "blocked");
    assert.deepEqual(reconcileFailure.calls, ["save", "acquire", "save", "reconcile", "finalize:FAILED", "save"]);

    const reconciliationResume = dependencies({ loadArtifact: async () => blockedCheckpoint.value });
    const reconciliationResumed = await runCmvpFirstBatch(request({ dryRun: false, confirmWrite: true }), reconciliationResume);
    assert.equal(reconciliationResumed.replayed, true);
    assert.deepEqual(reconciliationResume.calls, []);
  });
});
