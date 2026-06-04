import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshOperationsReportCliOptions } from "../scripts/audit-direct-refresh-operations-report";
import { buildDirectRefreshOperationsReport } from "../scripts/pipeline/direct-refresh-operations-report";

const now = new Date("2026-06-04T12:00:00.000Z");

const passSchedulerPlanner = {
	audit: "direct-refresh-scheduler-planner",
	status: "PASS",
	dryRun: true,
	workUnit: { source: "vea", count: 50, writerSupported: true },
	issue: {
		url: "https://github.com/Mateocas1/ofertaSUPER/issues/136",
		number: 136,
		title: "feat(data): add disabled direct-refresh scheduler planner",
		typeLabel: "type:feature",
		approvalLabel: "status:approved",
	},
	summary: {
		plannerMode: "read-only-disabled-scheduler-planning",
		schedulerExecution: "blocked",
		productionWrites: "blocked",
		allSource: "blocked",
		repeatedBatch: "blocked",
		diaWriter: "blocked",
		failClosedReasons: [],
	},
	nextManualAction: "Use this read-only plan as operator guidance only.",
};

const passArtifacts = {
	sourceHealth: {
		audit: "direct-refresh-source-health",
		status: "PASS",
		summary: { writerSupportedStatus: "PASS" },
		sources: [
			{
				slug: "vea",
				directRefreshSupport: "writer-supported",
				status: "PASS",
				reasons: [],
				freshness: { freshnessPercent: 99 },
				capacity: { blockedRows: 0 },
				recommendation: "controlled manual only",
			},
		],
	},
	alerts: {
		audit: "direct-refresh-alerts",
		status: "PASS",
		summary: {
			criticalCount: 0,
			highCount: 0,
			mediumCount: 0,
			lowCount: 0,
			highestSeverity: null,
		},
		alerts: [],
	},
	killSwitch: {
		audit: "direct-refresh-kill-switch",
		status: "PASS",
		summary: {
			activeStopCount: 0,
			expiredStopCount: 0,
			invalidControlCount: 0,
		},
		activeControls: [],
		invalidControls: [],
	},
	freshnessBaseline: {
		audit: "freshness-baseline",
		status: "PASS",
		summary: { overallFreshnessPercent: 96, staleRows: 10, unknownRows: 0 },
		denominatorDeltas: { status: "PASS", blockers: [] },
	},
	manifest: {
		audit: "vea-direct-refresh-manifest-dry-run",
		status: "PASS",
		source: { slug: "vea" },
		selection: { selectedRows: 10, skippedBlockedRows: 0 },
		summary: { failClosedReasons: [], skippedBlockedReasons: {} },
	},
	prewrite: {
		audit: "vea-direct-refresh-prewrite-gate",
		status: "PASS",
		source: { slug: "vea" },
		summary: { failClosedReasons: [], skippedBlockedReasons: {} },
	},
	activeWrite: {
		report: "vea-direct-refresh-active-write",
		status: "PASS",
		source: { slug: "vea" },
		noCreate: { productDelta: 0, supermarketProductDelta: 0 },
	},
	postwrite: {
		audit: "vea-direct-refresh-postwrite-audit",
		status: "PASS",
		writeReport: { source: "vea" },
		noCreate: { productDelta: 0, supermarketProductDelta: 0 },
		summary: { failClosedReasons: [] },
	},
};

describe("direct-refresh operations report", () => {
	it("builds a PASS controlled-manual posture from PASS artifacts", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: passArtifacts,
			requireOperationArtifacts: true,
			requirePostwrite: true,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.posture, "ready-for-controlled-manual-review");
		assert.equal(report.summary.schedulerPlannerStatus, null);
		assert.equal(report.summary.schedulerGate, "blocked");
		assert.equal(report.readiness.scheduler, "blocked");
		assert.equal(report.readiness.allSource, "blocked");
		assert.equal(report.readiness.repeatedBatch, "blocked");
		assert.equal(report.readiness.productionWrites, "not-performed");
		assert.equal(report.readiness.notifications, "not-sent");
		assert.equal(report.readiness.diaWriter, "not-supported");
		assert.match(report.writeBoundary, /no production writes/);
		assert.match(report.writeBoundary, /no scheduler/);
		assert.equal(
			report.inputs.find((input) => input.kind === "schedulerPlanner")?.present,
			false,
		);
	});

	it("summarizes PASS scheduler planner evidence without enabling scheduler", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: { schedulerPlanner: passSchedulerPlanner },
			paths: { schedulerPlanner: "scheduler-plan.json" },
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.schedulerPlannerStatus, "PASS");
		assert.equal(report.schedulerPlanner?.workUnit?.source, "vea");
		assert.equal(report.schedulerPlanner?.workUnit?.count, 50);
		assert.equal(report.schedulerPlanner?.issue?.number, 136);
		assert.equal(report.schedulerPlanner?.issue?.typeLabel, "type:feature");
		assert.deepEqual(report.schedulerPlanner?.failClosedReasons, []);
		assert.match(
			report.schedulerPlanner?.nextManualAction ?? "",
			/operator guidance/,
		);
		assert.equal(report.readiness.scheduler, "blocked");
		assert.match(report.readiness.nextAction, /scheduler remains blocked/);
		assert.equal(
			report.inputs.find((input) => input.kind === "schedulerPlanner")?.path,
			"scheduler-plan.json",
		);
	});

	it("preserves non-PASS scheduler planner evidence as blockers", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				schedulerPlanner: {
					...passSchedulerPlanner,
					status: "FAIL",
					summary: {
						...passSchedulerPlanner.summary,
						failClosedReasons: [
							"planning is disabled; requires --planning-enabled=true",
						],
					},
				},
			},
			paths: { schedulerPlanner: "scheduler-plan-fail.json" },
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.summary.schedulerPlannerStatus, "FAIL");
		assert.equal(report.summary.posture, "blocked");
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/scheduler planner artifact status is FAIL/,
		);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/planning is disabled/,
		);
	});

	it("fails closed for malformed supplied scheduler planner artifacts", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: { schedulerPlanner: { artifact: "not-the-planner" } },
			paths: { schedulerPlanner: "malformed-scheduler-plan.json" },
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.summary.schedulerPlannerStatus, null);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/scheduler planner artifact audit must be direct-refresh-scheduler-planner/,
		);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/scheduler planner artifact status must be PASS, WARN, or FAIL/,
		);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/scheduler planner artifact nextManualAction is required/,
		);
	});

	it("preserves top-level source health WARN when individual sources pass", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				sourceHealth: {
					audit: "direct-refresh-source-health",
					status: "WARN",
					summary: { writerSupportedStatus: "PASS" },
					sources: [
						{
							slug: "vea",
							directRefreshSupport: "writer-supported",
							status: "PASS",
							reasons: [],
						},
					],
				},
			},
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.summary.posture, "incomplete");
		assert.equal(report.summary.sourceHealthStatus, "WARN");
		assert.match(
			report.blockedSources[0].reason,
			/source health report status is WARN/,
		);
	});

	it("preserves top-level alert and kill-switch failures when child arrays are empty", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				alerts: {
					audit: "direct-refresh-alerts",
					status: "FAIL",
					summary: {
						criticalCount: 0,
						highCount: 0,
						mediumCount: 0,
						lowCount: 0,
						highestSeverity: null,
					},
					alerts: [],
				},
				killSwitch: {
					audit: "direct-refresh-kill-switch",
					status: "FAIL",
					summary: { expiredStopCount: 0 },
					activeControls: [],
					invalidControls: [],
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/alerts report status is FAIL/,
		);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/kill switch report status is FAIL/,
		);
	});

	it("summarizes source health blockers and DIA posture", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				sourceHealth: {
					audit: "direct-refresh-source-health",
					status: "WARN",
					summary: { writerSupportedStatus: "PASS" },
					sources: [
						{
							slug: "mas",
							directRefreshSupport: "writer-supported",
							status: "WARN",
							reasons: ["freshness below target"],
							freshness: { freshnessPercent: 80 },
							capacity: { blockedRows: 5 },
						},
						{
							slug: "dia",
							directRefreshSupport: "audit-only-no-writer",
							status: "WARN",
							reasons: ["source is audit-only/no-writer"],
						},
					],
				},
			},
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.summary.diaPosture, "audit-only-no-writer");
		assert.equal(report.summary.blockedSourceCount, 2);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/freshness below target/,
		);
	});

	it("fails for HIGH alerts and active kill switch controls", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				alerts: {
					audit: "direct-refresh-alerts",
					status: "FAIL",
					summary: {
						criticalCount: 0,
						highCount: 1,
						mediumCount: 0,
						lowCount: 0,
						highestSeverity: "HIGH",
					},
					alerts: [
						{
							condition: "source_health_fail",
							severity: "HIGH",
							source: "vea",
							message: "Source health FAIL",
							nextAction: "Fix source",
						},
					],
				},
				killSwitch: {
					audit: "direct-refresh-kill-switch",
					status: "FAIL",
					summary: { expiredStopCount: 0 },
					activeControls: [
						{
							scope: "source",
							source: "vea",
							reason: "incident",
							owner: "Maintainer",
						},
					],
					invalidControls: [],
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.summary.posture, "blocked");
		assert.equal(report.summary.alertStatus, "FAIL");
		assert.equal(report.summary.killSwitchStatus, "FAIL");
		assert.equal(report.blockedSources.length, 2);
	});

	it("maps baseline and operation failures into blockers", () => {
		const report = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				freshnessBaseline: {
					audit: "freshness-baseline",
					status: "FAIL",
					summary: { overallFreshnessPercent: 50 },
					denominatorDeltas: {
						status: "FAIL",
						blockers: ["denominator shrank"],
					},
				},
				manifest: {
					audit: "vea-direct-refresh-manifest-dry-run",
					status: "FAIL",
					source: { slug: "vea" },
					summary: {
						failClosedReasons: ["no rows selected"],
						skippedBlockedReasons: { "live product unavailable": 5 },
					},
				},
				postwrite: {
					audit: "vea-direct-refresh-postwrite-audit",
					status: "FAIL",
					writeReport: { source: "vea" },
					noCreate: { productDelta: 1, supermarketProductDelta: 0 },
					summary: { failClosedReasons: ["row failed"] },
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.operation.noCreateDeltas?.productDelta, 1);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/denominator shrank/,
		);
		assert.match(
			report.blockedSources.map((entry) => entry.reason).join("\n"),
			/no-create delta/,
		);
	});

	it("handles missing optional and required artifacts", () => {
		const optional = buildDirectRefreshOperationsReport({ now });
		assert.equal(optional.status, "PASS");
		assert.equal(optional.summary.operationStatus, "NOT_PROVIDED");

		const required = buildDirectRefreshOperationsReport({
			now,
			requireOperationArtifacts: true,
			requirePostwrite: true,
		});
		assert.equal(required.status, "FAIL");
		assert.match(
			required.blockedSources.map((entry) => entry.reason).join("\n"),
			/manifest artifact is required/,
		);
		assert.match(
			required.blockedSources.map((entry) => entry.reason).join("\n"),
			/postwrite artifact is required/,
		);
	});

	it("requires no-partial verification for incident artifacts by default", () => {
		const missing = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				errorArtifact: {
					artifact: "direct-refresh-error",
					source: "mas",
					error: "timeout",
				},
			},
		});
		assert.equal(missing.status, "FAIL");
		assert.equal(missing.summary.incidentStatus, "FAIL");

		const warnOnly = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				errorArtifact: {
					artifact: "direct-refresh-error",
					source: "mas",
					error: "timeout",
				},
			},
			requireNoPartialForIncident: false,
		});
		assert.equal(warnOnly.status, "WARN");
		assert.equal(warnOnly.summary.incidentStatus, "WARN");

		const verified = buildDirectRefreshOperationsReport({
			now,
			artifacts: {
				errorArtifact: {
					artifact: "direct-refresh-error",
					source: "mas",
					error: "timeout",
				},
				noPartial: {
					audit: "direct-refresh-no-partial-verification",
					source: "mas",
					conclusion: "PASS",
				},
			},
		});
		assert.equal(verified.summary.incidentStatus, "PASS");
	});

	it("parses CLI allowed inputs and rejects unsafe flags", () => {
		const options = parseDirectRefreshOperationsReportCliOptions(
			[
				"node",
				"script",
				"--source=vea",
				"--source-health=source-health.json",
				"--alerts=alerts.json",
				"--kill-switch=kill-switch.json",
				"--freshness-baseline=baseline.json",
				"--manifest=manifest.json",
				"--prewrite=prewrite.json",
				"--active-write=write.json",
				"--postwrite=postwrite.json",
				"--no-partial=no-partial.json",
				"--error-artifact=error.json",
				"--scheduler-planner=scheduler-plan.json",
				"--require-operation-artifacts=true",
				"--require-postwrite=true",
				"--require-no-partial-for-incident=false",
			],
			now,
		);

		assert.equal(options.source, "vea");
		assert.equal(options.paths.killSwitch, "kill-switch.json");
		assert.equal(options.paths.schedulerPlanner, "scheduler-plan.json");
		assert.equal(options.requireOperationArtifacts, true);
		assert.equal(options.requireNoPartialForIncident, false);
		assert.match(options.output, /audit\/direct-refresh-operations-report/);

		for (const flag of [
			"--write",
			"--confirm-write=1",
			"--all-source",
			"--scheduler=true",
			"--notify",
			"--notifications=true",
			"--deploy",
			"--refresh",
		]) {
			assert.throws(
				() =>
					parseDirectRefreshOperationsReportCliOptions([
						"node",
						"script",
						flag,
					]),
				/direct-refresh operations report rejects/,
			);
		}
	});

	it("rejects unknown, bare, and invalid boolean flags", () => {
		assert.throws(
			() =>
				parseDirectRefreshOperationsReportCliOptions([
					"node",
					"script",
					"--dry-run",
				]),
			/unknown direct-refresh operations report flag/,
		);
		assert.throws(
			() =>
				parseDirectRefreshOperationsReportCliOptions([
					"node",
					"script",
					"--source",
				]),
			/requires --source=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshOperationsReportCliOptions([
					"node",
					"script",
					"--scheduler-planner",
				]),
			/requires --scheduler-planner=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshOperationsReportCliOptions([
					"node",
					"script",
					"--require-postwrite=yes",
				]),
			/requires --require-postwrite=true or --require-postwrite=false/,
		);
	});
});
