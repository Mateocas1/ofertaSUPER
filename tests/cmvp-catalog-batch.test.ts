import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runCmvpCatalogBatch,
  type CmvpCatalogBatchDependencies,
  type CmvpCatalogBatchRequest,
} from "../scripts/pipeline/cmvp-catalog-batch";
import { replaceCheckpointAtomically } from "../scripts/acquire-cmvp-catalog-batch";

const expectedGtins = ["7790000000003", "7790000000010"];

function request(overrides: Partial<CmvpCatalogBatchRequest> = {}): CmvpCatalogBatchRequest {
  return {
    batchId: "cycle-002",
    source: "jumbo",
    term: "leche",
    count: 2,
    expectedGtins,
    dryRun: true,
    confirmWrite: false,
    ...overrides,
  };
}

function dependencies(overrides: Partial<CmvpCatalogBatchDependencies> = {}) {
  const calls: string[] = [];
  return {
    calls,
    loadArtifact: async () => null,
    saveArtifact: async () => { calls.push("save"); },
    acquire: async () => {
      calls.push("acquire");
      return {
        runId: 12,
        startedAt: "2026-03-11T00:00:00.000Z",
        finishedAt: "2026-03-11T00:00:01.000Z",
        fetchedGtins: [...expectedGtins].reverse(),
        admittedGtins: [...expectedGtins],
        rejectedCount: 0,
        error: null,
      };
    },
    finalizeAcquisition: async (_runId: number, outcome: { status: "SUCCESS" | "FAILED"; errorSummary: string | null }) => {
      calls.push(`finalize:${outcome.status}`);
    },
    reconcile: async () => { calls.push("reconcile"); return { runId: 12, promotedCount: 2, error: null }; },
    ...overrides,
  } satisfies CmvpCatalogBatchDependencies & { calls: string[] };
}

describe("CMVP catalog batch", () => {
  it("replaces checkpoints atomically and fails closed while cleaning temporary files", async () => {
    const output = "/checkpoints/catalog.json";
    const canonical = { value: "prior checkpoint" };
    const calls: string[] = [];
    await replaceCheckpointAtomically(output, "next checkpoint", {
      writeFile: async (path, contents, options) => {
        assert.equal(path.startsWith("/checkpoints/"), true);
        assert.equal(path.endsWith(".tmp"), true);
        assert.equal(contents, "next checkpoint");
        assert.deepEqual(options, { encoding: "utf8", flag: "wx", flush: true });
        calls.push("write");
      },
      rename: async (from, to) => { assert.equal(to, output); assert.notEqual(from, output); canonical.value = "next checkpoint"; calls.push("rename"); },
      rm: async () => { calls.push("cleanup"); },
    });
    assert.equal(canonical.value, "next checkpoint");
    assert.deepEqual(calls, ["write", "rename"]);

    for (const failedOperation of ["write", "rename"] as const) {
      canonical.value = "prior checkpoint";
      const failedCalls: string[] = [];
      await assert.rejects(() => replaceCheckpointAtomically(output, "next checkpoint", {
        writeFile: async () => { failedCalls.push("write"); if (failedOperation === "write") throw new Error("write failed"); },
        rename: async () => { failedCalls.push("rename"); throw new Error("rename failed"); },
        rm: async () => { failedCalls.push("cleanup"); },
      }), /failed/);
      assert.equal(canonical.value, "prior checkpoint");
      assert.deepEqual(failedCalls, failedOperation === "write" ? ["write", "cleanup"] : ["write", "rename", "cleanup"]);
    }
  });

  it("enforces one source, one nonblank term, and 1..25 distinct normalized expected GTINs before effects", async () => {
    const deps = dependencies();
    for (const invalid of [
      request({ source: "disco,jumbo" }),
      request({ term: "  " }),
      request({ count: 0 }),
      request({ count: 26 }),
      request({ expectedGtins: [expectedGtins[0], "779 000-000 0003"], count: 2 }),
      request({ expectedGtins: [expectedGtins[0]], count: 2 }),
    ]) await assert.rejects(() => runCmvpCatalogBatch(invalid, deps));
    assert.deepEqual(deps.calls, []);
  });

  it("creates deterministic dry-run artifacts without persistence", async () => {
    const result = await runCmvpCatalogBatch(request(), dependencies());
    assert.equal(result.artifact.state, "completed");
    assert.equal(result.artifact.contractDigest.length, 64);
    assert.deepEqual(result.artifact.expectedGtins, expectedGtins);
    assert.deepEqual(result.artifact.fetchedGtins, expectedGtins);
  });

  it("persists a durable pre-acquisition checkpoint and resumes reconciliation without reacquiring", async () => {
    const checkpoint: { value: Awaited<ReturnType<typeof runCmvpCatalogBatch>>["artifact"] | null } = { value: null };
    const failed = dependencies({
      saveArtifact: async (artifact) => { checkpoint.value = artifact; failed.calls.push(`save:${artifact.state}`); },
      reconcile: async () => { failed.calls.push("reconcile"); return { runId: 12, promotedCount: 0, error: "temporary_failure" }; },
    });
    await assert.rejects(() => runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), failed), /reconciliation failed/);
    assert.deepEqual(failed.calls, ["save:acquiring", "acquire", "save:acquired", "reconcile", "finalize:FAILED", "save:blocked"]);

    const resumed = dependencies({
      loadArtifact: async () => checkpoint.value,
      reconcile: async () => { resumed.calls.push("reconcile"); return { runId: 12, promotedCount: 2, error: null }; },
    });
    const result = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), resumed);
    assert.equal(result.artifact.state, "completed");
    assert.deepEqual(resumed.calls, ["reconcile", "finalize:SUCCESS", "save"]);
  });

  it("fails closed when an acquiring checkpoint has no durable acquisition outcome", async () => {
    const checkpoint: { value: Awaited<ReturnType<typeof runCmvpCatalogBatch>>["artifact"] | null } = { value: null };
    const interrupted = dependencies({
      saveArtifact: async (artifact) => { checkpoint.value ??= artifact; if (artifact.state !== "acquiring") throw new Error("artifact write failed"); },
    });
    await assert.rejects(() => runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), interrupted));

    const resumed = dependencies({ loadArtifact: async () => checkpoint.value, saveArtifact: async (artifact) => { checkpoint.value = artifact; resumed.calls.push("save"); } });
    const result = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), resumed);
    assert.equal(result.artifact.state, "blocked");
    assert.equal(result.artifact.reconciliationError, "acquisition checkpoint lacks durable outcome");
    assert.deepEqual(resumed.calls, ["save"]);

    const replay = dependencies({ loadArtifact: async () => checkpoint.value });
    assert.equal((await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), replay)).replayed, true);
    assert.deepEqual(replay.calls, []);
  });

  it("fails closed for malformed or mismatched acquisition, replays completion, and rejects changed contracts", async () => {
    const malformed = dependencies({ acquire: async () => ({
      runId: 12, startedAt: "2026-03-11T00:00:00.000Z", finishedAt: "2026-03-11T00:00:01.000Z",
      fetchedGtins: ["malformed"], admittedGtins: expectedGtins, rejectedCount: 0, error: null,
    }) });
    const blocked = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), malformed);
    assert.equal(blocked.artifact.state, "blocked");
    assert.deepEqual(blocked.artifact.fetchedGtins, []);

    const completed = await runCmvpCatalogBatch(request(), dependencies());
    const replay = dependencies({ loadArtifact: async () => completed.artifact });
    assert.equal((await runCmvpCatalogBatch(request(), replay)).replayed, true);
    await assert.rejects(() => runCmvpCatalogBatch(request({ term: "yogur" }), replay), /conflict/);
    assert.deepEqual(replay.calls, []);
  });

  it("rejects structurally corrupted completed checkpoints instead of replaying them", async () => {
    const completed = await runCmvpCatalogBatch(request(), dependencies());
    const corrupted = { ...completed.artifact, count: 3, runs: [] };
    const replay = dependencies({ loadArtifact: async () => corrupted });
    await assert.rejects(() => runCmvpCatalogBatch(request(), replay), /invalid completed checkpoint/);
    assert.deepEqual(replay.calls, []);
  });

  it("requires a positive persisted runId for confirmed-write completion while preserving dry-run replay", async () => {
    const confirmed = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), dependencies());
    for (const runId of [null, 0]) {
      const corrupted = { ...confirmed.artifact, runs: [{ ...confirmed.artifact.runs[0]!, runId }] };
      await assert.rejects(
        () => runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), dependencies({ loadArtifact: async () => corrupted })),
        /invalid completed checkpoint/,
      );
    }
    const validReplay = dependencies({ loadArtifact: async () => confirmed.artifact });
    assert.equal((await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), validReplay)).replayed, true);

    const dryRun = await runCmvpCatalogBatch(request(), dependencies());
    assert.equal((await runCmvpCatalogBatch(request(), dependencies({ loadArtifact: async () => dryRun.artifact }))).replayed, true);
  });

  it("fails closed on empty or malformed acquisition and reconciliation result fields", async () => {
    for (const acquisition of [
      { rejectedCount: 1, error: "" },
      { rejectedCount: Number.NaN, error: null },
      { rejectedCount: 0, error: undefined as unknown as null },
    ]) {
      const result = await runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), dependencies({ acquire: async () => ({
        runId: 12, startedAt: "2026-03-11T00:00:00.000Z", finishedAt: "2026-03-11T00:00:01.000Z",
        fetchedGtins: expectedGtins, admittedGtins: expectedGtins, ...acquisition,
      }) }));
      assert.equal(result.artifact.state, "blocked");
    }

    await assert.rejects(() => runCmvpCatalogBatch(request({ dryRun: false, confirmWrite: true }), dependencies({
      reconcile: async () => ({ runId: 12, promotedCount: 2, error: "" }),
    })), /reconciliation failed/);
  });
});
