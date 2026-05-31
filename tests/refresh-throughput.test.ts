import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRefreshThroughputCliOptions } from "../scripts/audit-refresh-throughput";
import { buildRefreshThroughputReport, inputFromFreshnessBaselineReport } from "../scripts/pipeline/refresh-throughput";

const input = { basis: "production" as const, targetPercent: 95, primaryDenominatorRows: 180, sourceDenominators: [{ slug: "vea", publicRankableRows: 80 }, { slug: "disco", publicRankableRows: 100 }] };
const assumptions = { rowsPerChunk: 18, chunksPerRun: 5, cadenceHours: 6, slaHours: 12, skipMarginRuns: 0, p50RuntimeMinutes: 12, p95RuntimeMinutes: 24, maxRuntimeMinutes: 35, githubTimeoutMinutes: 60, rateLimitRequestsPerMinute: 25 };

describe("refresh throughput capacity", () => {
	it("passes when planned chunks can cover 95% of the 12h production denominator", () => {
		const report = buildRefreshThroughputReport({ input, assumptions });
		assert.equal(report.status, "PASS");
		assert.equal(report.capacity.successfulRunsPerSla, 2);
		assert.equal(report.capacity.coverableRowsPerSla, 180);
		assert.equal(report.capacity.requiredRows, 171);
		assert.deepEqual(report.sourceOrder.map((source) => source.slug), ["disco", "vea"]);
		assert.equal(report.recommendation, "continue-to-pr2b-direct-refresh-feasibility");
		const baseline = { filters: { basis: "production", targetPercent: 95 }, denominators: { primary: { publicRankableRows: 180, exclusionBuckets: { bySource: input.sourceDenominators } }, secondary: { allExistingRows: 220 } } };
		assert.deepEqual(inputFromFreshnessBaselineReport(baseline), { ...input, secondaryDenominatorRows: 220 });
	});

	it("fails closed with a scheduler stop recommendation when capacity cannot cover the denominator", () => {
		const report = buildRefreshThroughputReport({ input: { ...input, primaryDenominatorRows: 500 }, assumptions: { ...assumptions, chunksPerRun: 4, skipMarginRuns: 1 } });
		assert.equal(report.status, "FAIL");
		assert.equal(report.capacity.successfulRunsPerSla, 1);
		assert.equal(report.capacity.coverableRowsPerSla, 72);
		assert.match(report.stopConditions.join("\n"), /capacity covers 72 of 475 required rows/);
		assert.equal(report.recommendation, "stop-scheduler-work-and-run-pr2b-readonly-feasibility");
	});

	it("rejects non-production, secondary or shadow denominator inputs and targets below 95", () => {
		assert.throws(() => buildRefreshThroughputReport({ input: { ...input, basis: "shadow" }, assumptions }), /basis.*production/);
		assert.throws(() => buildRefreshThroughputReport({ input: { basis: "production", targetPercent: 95, secondaryDenominatorRows: 200 }, assumptions }), /primary denominator/);
		assert.throws(() => buildRefreshThroughputReport({ input: { ...input, targetPercent: 94.9 }, assumptions }), /target percent.*95/);
		assert.throws(() => buildRefreshThroughputReport({ input, assumptions: { ...assumptions, minTimeoutMarginMinutes: -1 } }), /minTimeoutMarginMinutes/);
	});

	it("fails on unsafe runtime margins and parses read-only CLI options", () => {
		const report = buildRefreshThroughputReport({ input, assumptions: { ...assumptions, p95RuntimeMinutes: 58, maxRuntimeMinutes: 65 } });
		assert.equal(report.status, "FAIL");
		assert.match(report.stopConditions.join("\n"), /p95 runtime margin/);
		assert.match(report.stopConditions.join("\n"), /max runtime exceeds/);
		assert.deepEqual(parseRefreshThroughputCliOptions(["node", "script", "--input=a0-denominator.json", "--output=a0-throughput.json", "--rows-per-chunk=18"]), { input: "a0-denominator.json", output: "a0-throughput.json", targetPercent: 95, rowsPerChunk: 18, chunksPerRun: 1, cadenceHours: 6, slaHours: 12, skipMarginRuns: 0, p50RuntimeMinutes: 0, p95RuntimeMinutes: 0, maxRuntimeMinutes: 0, githubTimeoutMinutes: 360, rateLimitRequestsPerMinute: 0 });
		assert.throws(() => parseRefreshThroughputCliOptions(["node", "script", "--input=x", "--confirm-write"]), /read-only/);
	});
});
