import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	normalizeLedgerEntries,
	parseDirectRefreshCadenceControllerCliOptions,
} from "../scripts/audit-direct-refresh-cadence-controller";
import {
	buildDirectRefreshCadenceControllerReport,
	type DirectRefreshCadenceControllerOptions,
} from "../scripts/pipeline/direct-refresh-cadence-controller";
import {
	buildDirectRefreshFreshnessDebtPlannerReport,
	type DirectRefreshFreshnessDebtPlannerSourceInput,
} from "../scripts/pipeline/direct-refresh-freshness-debt-planner";

const now = new Date("2026-06-05T13:00:00.000Z");

const issue = {
	url: "https://github.com/Mateocas1/ofertaSUPER/issues/160",
	number: 160,
	title: "feat(data): add direct-refresh cadence controller foundation",
	typeLabel: "type:feature",
	approvalLabel: "status:approved",
};

function source(
	overrides: Partial<DirectRefreshFreshnessDebtPlannerSourceInput> = {},
): DirectRefreshFreshnessDebtPlannerSourceInput {
	return {
		slug: "vea",
		directRefreshSupport: "writer-supported",
		freshness: {
			publicRankableRows: 100,
			freshRows: 0,
			staleRows: 100,
			unknownRows: 0,
			freshnessPercent: 0,
		},
		capacity: {
			status: "PASS",
			classification: "viable",
			viableRows: 50,
			blockedRows: 0,
			recommendedBatchSize: 50,
			recommendedCandidateScanSize: 50,
			blockers: [],
		},
		safetyReasons: [],
		...overrides,
	};
}

function freshnessPlan(
	overrides: Partial<
		Parameters<typeof buildDirectRefreshFreshnessDebtPlannerReport>[0]
	> = {},
) {
	return buildDirectRefreshFreshnessDebtPlannerReport({
		now,
		issue,
		attemptId: "20260605T130000Z",
		outputDir: "audit/direct-refresh-freshness-debt-planner/20260605T130000Z",
		sources: ["vea"],
		batchCounts: [50],
		directSources: [source()],
		...overrides,
	});
}

function report(
	overrides: Partial<DirectRefreshCadenceControllerOptions> = {},
) {
	return buildDirectRefreshCadenceControllerReport({
		now,
		cadenceEnabled: true,
		source: "vea",
		count: 50,
		attemptId: "20260605T130000Z",
		outputDir: "audit/direct-refresh-cadence-controller/20260605T130000Z",
		issue,
		freshnessDebtPlan: freshnessPlan(),
		freshnessDebtPlanRaw: JSON.stringify(freshnessPlan()),
		ledgerEntries: [],
		paths: {
			freshnessDebtPlan:
				"audit/direct-refresh-freshness-debt-planner/plan.json",
			ledger: "audit/direct-refresh-run-ledger/ledger.json",
		},
		...overrides,
	});
}

function validArgv(...extra: string[]) {
	return [
		"node",
		"script.ts",
		"--cadence-enabled=true",
		"--source=vea",
		"--count=50",
		"--issue-url=https://github.com/Mateocas1/ofertaSUPER/issues/160",
		"--issue-number=160",
		"--issue-title=feat(data): add direct-refresh cadence controller foundation",
		"--issue-type-label=type:feature",
		"--issue-approval-label=status:approved",
		...extra,
	];
}

describe("direct-refresh cadence controller", () => {
	it("passes as ready for human confirmation with clean evidence", () => {
		const result = report();

		assert.equal(result.schemaVersion, 1);
		assert.equal(result.audit, "direct-refresh-cadence-controller");
		assert.equal(result.status, "PASS");
		assert.equal(result.dryRun, true);
		assert.equal(result.workUnit.source, "vea");
		assert.equal(result.workUnit.count, 50);
		assert.equal(result.summary.posture, "ready-for-human-confirmation");
		assert.equal(result.summary.freshnessDebtIsAuthorization, false);
		assert.match(
			result.writeBoundary,
			/no scheduler\/cron\/workflow execution/,
		);
		assert.match(result.writeBoundary, /no manifest\/prewrite generation/);
		assert.match(result.writeBoundary, /no production writes/);
		assert.match(
			result.nextManualAction,
			/separate approved issue or operation/,
		);
	});

	it("keeps no-debt plans read-only", () => {
		const result = report({
			freshnessDebtPlan: freshnessPlan({
				directSources: [
					source({
						freshness: {
							publicRankableRows: 100,
							freshRows: 100,
							staleRows: 0,
							unknownRows: 0,
							freshnessPercent: 100,
						},
					}),
				],
			}),
		});

		assert.equal(result.status, "PASS");
		assert.equal(result.summary.posture, "no-debt");
		assert.match(result.nextManualAction, /No recovery operation/);
	});

	it("maps capacity WARN to manual review instead of automatic readiness", () => {
		const result = report({
			freshnessDebtPlan: freshnessPlan({
				directSources: [
					source({
						capacity: {
							status: "WARN",
							classification: "mixed",
							viableRows: 20,
							blockedRows: 30,
							recommendedBatchSize: 25,
							recommendedCandidateScanSize: 75,
							blockers: [{ reason: "manual review", count: 30 }],
						},
					}),
				],
			}),
		});

		assert.equal(result.status, "WARN");
		assert.equal(result.summary.posture, "manual-review");
		assert.match(result.summary.warnings.join("\n"), /capacity WARN/);
	});

	it("blocks capacity FAIL and failed freshness plans", () => {
		const capacityFail = report({
			freshnessDebtPlan: freshnessPlan({
				directSources: [
					source({
						capacity: {
							status: "FAIL",
							classification: "blocked",
							viableRows: 0,
							blockedRows: 100,
							recommendedBatchSize: null,
							recommendedCandidateScanSize: null,
							blockers: [{ reason: "no viable rows", count: 100 }],
						},
					}),
				],
			}),
		});
		const failedPlan = report({
			freshnessDebtPlan: freshnessPlan({
				directSources: [
					source({
						freshness: {
							publicRankableRows: 0,
							freshRows: 0,
							staleRows: 0,
							unknownRows: 0,
							freshnessPercent: 0,
						},
					}),
				],
			}),
		});

		assert.equal(capacityFail.status, "FAIL");
		assert.match(
			capacityFail.summary.failClosedReasons.join("\n"),
			/capacity FAIL/,
		);
		assert.equal(failedPlan.status, "FAIL");
		assert.match(
			failedPlan.summary.failClosedReasons.join("\n"),
			/freshness debt plan is FAIL/,
		);
	});

	it("blocks active run ledger conflicts", () => {
		const result = report({
			ledgerEntries: [
				{
					source: "vea",
					status: "RUNNING",
					runKey: "vea:count50:active",
					attemptId: "active",
				},
			],
		});

		assert.equal(result.status, "FAIL");
		assert.equal(result.workUnit.ledgerConflict?.runKey, "vea:count50:active");
		assert.match(
			result.summary.failClosedReasons.join("\n"),
			/active direct-refresh run/,
		);
	});

	it("rejects DIA, multi-source, unsupported counts, and disabled cadence", () => {
		const disabled = report({ cadenceEnabled: false });
		const dia = report({ source: "dia" });
		const multi = report({ source: "vea,mas" });
		const badCount = report({ count: 75 });

		for (const result of [disabled, dia, multi, badCount]) {
			assert.equal(result.status, "FAIL");
		}
		assert.match(disabled.summary.failClosedReasons.join("\n"), /disabled/);
		assert.match(
			dia.summary.failClosedReasons.join("\n"),
			/audit-only\/no-writer/,
		);
		assert.match(
			multi.summary.failClosedReasons.join("\n"),
			/exactly one source/,
		);
		assert.match(badCount.summary.failClosedReasons.join("\n"), /10, 25, 50/);
	});

	it("blocks missing, stale, or foreign evidence lineage", () => {
		const missing = report({ freshnessDebtPlan: null });
		const foreignSource = report({
			freshnessDebtPlan: freshnessPlan({ sources: ["mas"] }),
		});
		const foreignCount = report({
			freshnessDebtPlan: freshnessPlan({ batchCounts: [25] }),
		});

		assert.equal(missing.status, "FAIL");
		assert.match(missing.summary.failClosedReasons.join("\n"), /required/);
		assert.equal(foreignSource.status, "FAIL");
		assert.match(
			foreignSource.summary.failClosedReasons.join("\n"),
			/source must match/,
		);
		assert.equal(foreignCount.status, "FAIL");
		assert.match(
			foreignCount.summary.failClosedReasons.join("\n"),
			/batch count/,
		);
	});

	it("parses valid CLI options and ledger shapes", () => {
		const options = parseDirectRefreshCadenceControllerCliOptions(
			validArgv(
				"--freshness-debt-plan=audit/plan.json",
				"--ledger=audit/ledger.json",
				"--source-health=audit/source-health.json",
				"--output=out.json",
			),
			now,
		);
		const ledger = normalizeLedgerEntries({
			entries: [
				{
					source_slug: "vea",
					status: "PLANNED",
					run_key: "vea:count50:planned",
					attempt_id: "planned",
				},
			],
		});

		assert.equal(options.cadenceEnabled, true);
		assert.equal(options.source, "vea");
		assert.equal(options.count, 50);
		assert.equal(options.paths?.freshnessDebtPlan, "audit/plan.json");
		assert.equal(options.output, "out.json");
		assert.equal(ledger[0].runKey, "vea:count50:planned");
	});

	it("rejects forbidden execution-shaped and malformed CLI flags", () => {
		for (const flag of [
			"--write=true",
			"--manifest=manifest.json",
			"--prewrite=prewrite.json",
			"--vtex-scan=true",
			"--all-source=true",
			"--schedule=true",
			"--notify=true",
		]) {
			assert.throws(
				() =>
					parseDirectRefreshCadenceControllerCliOptions(validArgv(flag), now),
				/rejects/,
			);
		}
		assert.throws(
			() =>
				parseDirectRefreshCadenceControllerCliOptions(
					validArgv("--unknown=x"),
					now,
				),
			/unknown direct-refresh cadence controller flag/,
		);
		assert.throws(
			() =>
				parseDirectRefreshCadenceControllerCliOptions(
					validArgv("--output"),
					now,
				),
			/requires --output=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshCadenceControllerCliOptions(
					validArgv("--cadence-enabled=false"),
					now,
				),
			/accepts at most one --cadence-enabled/,
		);
	});

	it("has a package script wired to the read-only CLI", async () => {
		const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
			scripts: Record<string, string>;
		};

		assert.equal(
			packageJson.scripts["audit:direct-refresh-cadence-controller"],
			"tsx scripts/audit-direct-refresh-cadence-controller.ts",
		);
	});

	it("does not import execution-shaped direct-refresh paths", async () => {
		const sourceText = await readFile(
			"scripts/pipeline/direct-refresh-cadence-controller.ts",
			"utf8",
		);
		const cliText = await readFile(
			"scripts/audit-direct-refresh-cadence-controller.ts",
			"utf8",
		);
		const combined = `${sourceText}\n${cliText}`;

		assert.doesNotMatch(combined, /direct-refresh-active-write/);
		assert.doesNotMatch(combined, /direct-refresh-manifest/);
		assert.doesNotMatch(combined, /direct-refresh-prewrite/);
		assert.doesNotMatch(combined, /direct-refresh-.*-write/);
	});
});
