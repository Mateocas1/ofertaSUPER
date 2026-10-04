import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyBatchTolerance, evaluateRefreshGates, findSourceReadFailure, worstFreshnessPercent } from "../scripts/lib/refresh-gates";

const healthyFreshness = [
  { slug: "carrefour", under24hPercent: 97.2 },
  { slug: "disco", under24hPercent: 95.1 },
  { slug: "jumbo", under24hPercent: 96.4 },
];

const healthySources = [
  { slug: "carrefour", readsOk: 120, readsFailed: 3 },
  { slug: "disco", readsOk: 90, readsFailed: 4 },
  { slug: "jumbo", readsOk: 88, readsFailed: 5 },
];

describe("refresh gates", () => {
  it("tolerates a few empty discovered categories: max(2, 10% of the plan)", () => {
    assert.equal(emptyBatchTolerance(0), 2);
    assert.equal(emptyBatchTolerance(19), 2);
    assert.equal(emptyBatchTolerance(60), 6);

    const tolerated = evaluateRefreshGates({ failedBatches: 0, emptyBatches: 2, plannedBatches: 60, freshness: healthyFreshness, sourceReads: healthySources });
    assert.equal(tolerated.ok, true);
    assert.equal(tolerated.message, null);

    const atLimit = evaluateRefreshGates({ failedBatches: 0, emptyBatches: 6, plannedBatches: 60, freshness: healthyFreshness, sourceReads: healthySources });
    assert.equal(atLimit.ok, true);
  });

  it("fails when too many discovered categories come back empty", () => {
    const verdict = evaluateRefreshGates({ failedBatches: 0, emptyBatches: 7, plannedBatches: 60, freshness: healthyFreshness, sourceReads: healthySources });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.exitCode, 1);
    assert.equal(verdict.message, "failedBatches=0, worstFreshness=95.1%, emptyBatches=7>6");
  });

  it("publishes only when every gate is satisfied", () => {
    const verdict = evaluateRefreshGates({ failedBatches: 0, freshness: healthyFreshness, sourceReads: healthySources });

    assert.equal(verdict.ok, true);
    assert.equal(verdict.exitCode, 0);
    assert.equal(verdict.message, null);
    assert.equal(verdict.worstFreshnessPercent, 95.1);
    assert.equal(verdict.offendingSource, null);
  });

  it("maps a failed batch to exit code 1 and a greppable reason", () => {
    const verdict = evaluateRefreshGates({ failedBatches: 2, freshness: healthyFreshness, sourceReads: healthySources });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.exitCode, 1);
    assert.equal(verdict.message, "failedBatches=2, worstFreshness=95.1%");
  });

  it("fails the freshness gate below 90% and reports the worst supermarket", () => {
    const verdict = evaluateRefreshGates({
      failedBatches: 0,
      freshness: [healthyFreshness[0], { slug: "disco", under24hPercent: 79.6 }, healthyFreshness[2]],
      sourceReads: healthySources,
    });

    assert.equal(verdict.exitCode, 1);
    assert.equal(verdict.worstFreshnessPercent, 79.6);
    assert.match(verdict.message ?? "", /worstFreshness=79\.6%/);
  });

  it("treats exactly 90% freshness as publishable", () => {
    const verdict = evaluateRefreshGates({
      failedBatches: 0,
      freshness: [{ slug: "carrefour", under24hPercent: 90 }],
      sourceReads: [],
    });

    assert.equal(verdict.ok, true);
  });

  it("fails closed when there is no freshness data at all", () => {
    const verdict = evaluateRefreshGates({ failedBatches: 0, freshness: [], sourceReads: [] });

    assert.equal(verdict.exitCode, 1);
    assert.equal(verdict.worstFreshnessPercent, 0);
    assert.equal(verdict.message, "failedBatches=0, worstFreshness=0%");
  });

  it("fails a source whose reads fail more than 20% of the time", () => {
    const verdict = evaluateRefreshGates({
      failedBatches: 0,
      freshness: healthyFreshness,
      sourceReads: [...healthySources, { slug: "carrefour", readsOk: 8, readsFailed: 3 }],
    });

    assert.equal(verdict.exitCode, 1);
    assert.equal(verdict.offendingSource, "carrefour");
    assert.equal(verdict.message, "failedBatches=0, worstFreshness=95.1%, sourceReadFailures=carrefour");
  });

  it("keeps exactly 20% failed reads below the brake", () => {
    const verdict = evaluateRefreshGates({
      failedBatches: 0,
      freshness: healthyFreshness,
      sourceReads: [{ slug: "jumbo", readsOk: 8, readsFailed: 2 }],
    });

    assert.equal(verdict.ok, true);
  });

  it("ignores sources with no reads", () => {
    assert.equal(findSourceReadFailure([{ slug: "disco", readsOk: 0, readsFailed: 0 }]), null);
    assert.equal(worstFreshnessPercent(healthyFreshness), 95.1);
  });
});
