import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshFreshnessDebtPlannerCliOptions } from "../scripts/audit-direct-refresh-freshness-debt-planner";
import {
	buildDirectRefreshFreshnessDebtPlannerReport,
	type DirectRefreshFreshnessDebtPlannerIssue,
	type DirectRefreshFreshnessDebtPlannerSourceInput,
} from "../scripts/pipeline/direct-refresh-freshness-debt-planner";

const now = new Date("2026-06-05T12:00:00.000Z");

const issue: DirectRefreshFreshnessDebtPlannerIssue = {
	url: "https://github.com/Mateocas1/ofertaSUPER/issues/156",
	number: 156,
	title: "feat(data): add direct-refresh freshness debt planner",
	typeLabel: "type:feature",
	approvalLabel: "status:approved",
};

function writerSource(
	overrides: Partial<DirectRefreshFreshnessDebtPlannerSourceInput> = {},
): DirectRefreshFreshnessDebtPlannerSourceInput {
	return {
		slug: "vea",
		directRefreshSupport: "writer-supported",
		freshness: {
			publicRankableRows: 666,
			freshRows: 0,
			staleRows: 666,
			unknownRows: 0,
			freshnessPercent: 0,
		},
		capacity: {
			status: "PASS",
			classification: "viable",
			viableRows: 25,
			blockedRows: 0,
			recommendedBatchSize: 50,
			recommendedCandidateScanSize: 50,
			blockers: [],
		},
		safetyReasons: [],
		...overrides,
	};
}

function buildReport(
	overrides: Partial<
		Parameters<typeof buildDirectRefreshFreshnessDebtPlannerReport>[0]
	> = {},
) {
	return buildDirectRefreshFreshnessDebtPlannerReport({
		now,
		issue,
		attemptId: "20260605T120000Z",
		outputDir: "audit/direct-refresh-freshness-debt-planner/20260605T120000Z",
		sources: ["vea"],
		directSources: [writerSource()],
		...overrides,
	});
}

function validArgv(...extra: string[]) {
	return [
		"node",
		"script.ts",
		"--issue-url=https://github.com/Mateocas1/ofertaSUPER/issues/156",
		"--issue-number=156",
		"--issue-title=feat(data): add direct-refresh freshness debt planner",
		"--issue-type-label=type:feature",
		"--issue-approval-label=status:approved",
		...extra,
	];
}

describe("direct-refresh freshness debt planner", () => {
	it("calculates recovery and final debt for a stale writer-supported source", () => {
		const report = buildReport();
		const source = report.sources[0];

		assert.equal(report.schemaVersion, 1);
		assert.equal(report.audit, "direct-refresh-freshness-debt-planner");
		assert.equal(report.status, "WARN");
		assert.equal(report.dryRun, true);
		assert.match(report.writeBoundary, /no VTEX scans/);
		assert.match(report.writeBoundary, /no production writes/);
		assert.equal(report.summary.planningPosture, "normal");
		assert.equal(source.freshnessStatus, "DEBT");
		assert.equal(source.safetyStatus, "PASS");
		assert.equal(source.runEligibility, "planning-normal");
		assert.equal(
			source.debtTargets.find((target) => target.name === "recovery")
				?.rowsNeeded,
			533,
		);
		assert.equal(
			source.debtTargets.find((target) => target.name === "final")?.rowsNeeded,
			633,
		);
		assert.equal(
			source.debtTargets.find((target) => target.name === "recovery")
				?.minBatchesByAllowedCount["50"],
			11,
		);
		assert.equal(report.summary.totalRowsNeededByTarget.recovery, 533);
		assert.equal(report.summary.minBatchesByTargetAndCount.recovery["50"], 11);
	});

	it("passes with no debt when the recovery target is already met", () => {
		const report = buildReport({
			directSources: [
				writerSource({
					freshness: {
						publicRankableRows: 10,
						freshRows: 10,
						staleRows: 0,
						unknownRows: 0,
						freshnessPercent: 100,
					},
				}),
			],
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.planningPosture, "no-debt");
		assert.equal(report.sources[0].freshnessStatus, "PASS");
		assert.equal(report.summary.totalRowsNeededByTarget.recovery, 0);
	});

	it("blocks empty denominators", () => {
		const report = buildReport({
			directSources: [
				writerSource({
					freshness: {
						publicRankableRows: 0,
						freshRows: 0,
						staleRows: 0,
						unknownRows: 0,
						freshnessPercent: 0,
					},
				}),
			],
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.summary.planningPosture, "blocked");
		assert.equal(report.sources[0].freshnessStatus, "EMPTY_DENOMINATOR");
		assert.equal(report.sources[0].runEligibility, "blocked");
	});

	it("rejects DIA as a writer-supported planning source", () => {
		const report = buildReport({
			sources: ["dia"],
			directSources: [
				writerSource({
					slug: "dia",
					directRefreshSupport: "audit-only-no-writer",
				}),
			],
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/audit-only\/no-writer/,
		);
		assert.equal(report.sources[0].runEligibility, "audit-only-no-writer");
	});

	it("keeps capacity WARN in reduced/manual-review planning", () => {
		const report = buildReport({
			directSources: [
				writerSource({
					capacity: {
						status: "WARN",
						classification: "mixed",
						viableRows: 19,
						blockedRows: 6,
						recommendedBatchSize: 25,
						recommendedCandidateScanSize: 33,
						blockers: [{ reason: "live product is unavailable", count: 6 }],
					},
				}),
			],
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.summary.planningPosture, "reduced-manual-review");
		assert.equal(report.sources[0].capacityStatus, "WARN");
		assert.equal(report.sources[0].runEligibility, "planning-reduced");
		assert.match(report.sources[0].recommendation, /reduced/);
	});

	it("blocks capacity FAIL", () => {
		const report = buildReport({
			directSources: [
				writerSource({
					capacity: {
						status: "FAIL",
						classification: "blocked",
						viableRows: 0,
						blockedRows: 3,
						recommendedBatchSize: 0,
						recommendedCandidateScanSize: 3,
						blockers: [{ reason: "no viable rows", count: 3 }],
					},
				}),
			],
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.sources[0].capacityStatus, "FAIL");
		assert.equal(report.sources[0].runEligibility, "blocked");
	});

	it("marks missing capacity as manual review instead of PASS", () => {
		const report = buildReport({
			directSources: [writerSource({ capacity: null })],
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.summary.planningPosture, "reduced-manual-review");
		assert.equal(report.sources[0].capacityStatus, "UNKNOWN");
		assert.equal(report.sources[0].runEligibility, "manual-review");
	});

	it("maps source-health not-provided capacity to UNKNOWN manual review", () => {
		const report = buildReport({
			directSources: undefined,
			sourceHealthReport: {
				schemaVersion: 1,
				audit: "direct-refresh-source-health",
				status: "WARN",
				generatedAt: now.toISOString(),
				basis: "production",
				dryRun: true,
				writeBoundary:
					"read-only direct-refresh source health audit; no production writes, no staging/ingestion runs, no scheduler/cron/workflow/all-source side effects",
				filters: {
					sources: ["vea"],
					freshnessTargetPercent: 95,
					failUnderFreshnessPercent: null,
					capacityReportPath: null,
				},
				summary: {
					sourceCount: 1,
					writerSupportedSources: 1,
					auditOnlyNoWriterSources: 0,
					passSources: 0,
					warnSources: 1,
					failSources: 0,
					writerSupportedStatus: "WARN",
					schedulerGate: "blocked",
				},
				stagingState: { runningRuns: 0, pendingStagingRows: 0, status: "PASS" },
				sources: [
					{
						slug: "vea",
						displayName: "Vea",
						directRefreshSupport: "writer-supported",
						status: "WARN",
						reasons: ["capacity/readiness report not provided"],
						recommendation: "Resolve WARN reasons.",
						sourceRecord: {
							exists: true,
							isActive: true,
							isVtex: true,
							baseUrl: "https://www.vea.com.ar",
							baseUrlValid: true,
							baseUrlHost: "vea.com.ar",
							expectedHost: "vea.com.ar",
							expectedHostMatch: true,
						},
						freshness: {
							status: "WARN",
							freshnessPercent: 0,
							totalRows: 666,
							publicRankableRows: 666,
							freshRows: 0,
							staleRows: 666,
							unknownRows: 0,
							oldestCheckAt: null,
							latestCheckAt: null,
						},
						capacity: {
							source: "not-provided",
							status: "WARN",
							classification: null,
							viableRows: null,
							blockedRows: null,
							recommendedBatchSize: null,
							recommendedCandidateScanSize: null,
							blockers: [],
						},
					},
				],
			},
		});

		assert.equal(report.sources[0].capacityStatus, "UNKNOWN");
		assert.equal(report.sources[0].runEligibility, "manual-review");
	});

	it("models max source-scoped runs per window", () => {
		const report = buildReport({ maxRunsPer24h: 3, maxRunsPer12h: 2 });

		assert.equal(report.summary.windowCapacity.sourceScoped, true);
		assert.equal(
			report.summary.windowCapacity.maxSourceScopedBatches.recoveryWindow24h,
			3,
		);
		assert.equal(
			report.summary.windowCapacity.canCoverTargetWithinWindowByCount.recovery[
				"50"
			],
			false,
		);
		assert.equal(
			report.summary.windowCapacity.canCoverTargetWithinWindowByCount.final[
				"50"
			],
			false,
		);
	});

	it("does not hide an overloaded source behind aggregate window capacity", () => {
		const report = buildReport({
			sources: ["vea", "jumbo"],
			maxRunsPer24h: 10,
			directSources: [
				writerSource({
					slug: "vea",
					freshness: {
						publicRankableRows: 1000,
						freshRows: 0,
						staleRows: 1000,
						unknownRows: 0,
						freshnessPercent: 0,
					},
				}),
				writerSource({
					slug: "jumbo",
					freshness: {
						publicRankableRows: 100,
						freshRows: 80,
						staleRows: 20,
						unknownRows: 0,
						freshnessPercent: 80,
					},
				}),
			],
		});

		assert.equal(report.summary.minBatchesByTargetAndCount.recovery["50"], 16);
		assert.equal(
			report.summary.windowCapacity.maxSourceScopedBatches.recoveryWindow24h,
			20,
		);
		assert.equal(
			report.summary.windowCapacity.canCoverTargetWithinWindowByCount.recovery[
				"50"
			],
			false,
		);
	});

	it("surfaces MAS rapid-confirmation risk", () => {
		const report = buildReport({
			sources: ["mas"],
			directSources: [
				writerSource({
					slug: "mas",
					capacity: {
						status: "WARN",
						classification: "mixed",
						viableRows: 50,
						blockedRows: 5,
						recommendedBatchSize: 50,
						recommendedCandidateScanSize: 160,
						blockers: [],
					},
				}),
			],
		});

		assert.match(
			report.sources[0].reasons.join("\n"),
			/MAS rapid-confirmation/,
		);
		assert.match(report.sources[0].recommendation, /reduced|MAS/i);
	});

	it("records lineage fields and supplied artifact hash", () => {
		const report = buildReport({
			sourceHealthPath: "source-health.json",
			sourceHealthRaw: '{"audit":"direct-refresh-source-health"}',
		});

		assert.equal(report.lineage.issue.number, 156);
		assert.equal(report.lineage.attemptId, "20260605T120000Z");
		const sourceHealth = report.lineage.parentArtifacts.find(
			(artifact) => artifact.kind === "source-health",
		);
		assert.equal(sourceHealth?.path, "source-health.json");
		assert.equal(sourceHealth?.present, false);
		assert.match(sourceHealth?.hash ?? "", /^[a-f0-9]{64}$/);
	});

	it("parses a valid CLI invocation", () => {
		const options = parseDirectRefreshFreshnessDebtPlannerCliOptions(
			validArgv(
				"--source=vea,mas",
				"--source-health=source-health.json",
				"--capacity-report=capacity.json",
				"--batch-counts=25,50",
				"--max-runs-per-24h=4",
				"--attempt-id=attempt1",
				"--output-dir=audit/out",
				"--output=audit/out/freshness-debt-plan.json",
			),
			now,
		);

		assert.deepEqual(options.sources, ["vea", "mas"]);
		assert.deepEqual(options.batchCounts, [25, 50]);
		assert.equal(options.maxRunsPer24h, 4);
		assert.equal(options.attemptId, "attempt1");
		assert.equal(options.outputDir, "audit/out");
		assert.equal(options.sourceHealthPath, "source-health.json");
	});

	it("rejects forbidden, unknown, bare, and unsupported batch flags", () => {
		for (const flag of [
			"--write=true",
			"--active-write=write.json",
			"--manifest=manifest.json",
			"--prewrite=prewrite.json",
			"--vtex-scan=true",
			"--scheduler=true",
			"--all-source=true",
			"--repeated-batch=true",
			"--notify=true",
			"--deploy=true",
			"--secrets=true",
			"--cache-purge=true",
			"--remote-config=true",
			"--dia-write=true",
		]) {
			assert.throws(
				() =>
					parseDirectRefreshFreshnessDebtPlannerCliOptions(
						validArgv(flag),
						now,
					),
				/direct-refresh freshness debt planner rejects/,
				flag,
			);
		}
		assert.throws(
			() =>
				parseDirectRefreshFreshnessDebtPlannerCliOptions(
					validArgv("--unexpected=value"),
					now,
				),
			/unknown direct-refresh freshness debt planner flag/,
		);
		assert.throws(
			() =>
				parseDirectRefreshFreshnessDebtPlannerCliOptions(
					validArgv("--source"),
					now,
				),
			/requires --source=\.\.\./,
		);
		assert.throws(
			() => buildReport({ batchCounts: [100] }),
			/must be one of 10, 25, 50/,
		);
	});
});
