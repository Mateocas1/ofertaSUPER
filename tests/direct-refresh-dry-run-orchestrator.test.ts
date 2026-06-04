import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshDryRunOrchestratorCliOptions } from "../scripts/audit-direct-refresh-dry-run-orchestrator";
import { buildDirectRefreshDryRunOrchestratorReport } from "../scripts/pipeline/direct-refresh-dry-run-orchestrator";

const now = new Date("2026-06-04T12:00:00.000Z");

const validIssue = {
	url: "https://github.com/Mateocas1/ofertaSUPER/issues/140",
	number: 140,
	title: "feat(data): add direct-refresh dry-run orchestrator report",
	typeLabel: "type:feature",
	approvalLabel: "status:approved",
};

const passArtifacts = {
	schedulerPlanner: {
		audit: "direct-refresh-scheduler-planner",
		status: "PASS",
		dryRun: true,
		workUnit: { source: "vea", count: 50, writerSupported: true },
		issue: validIssue,
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
	},
	sourceHealth: {
		audit: "direct-refresh-source-health",
		status: "PASS",
		dryRun: true,
	},
	alerts: {
		audit: "direct-refresh-alerts",
		status: "PASS",
		dryRun: true,
	},
	killSwitch: {
		audit: "direct-refresh-kill-switch",
		status: "PASS",
		dryRun: true,
	},
	operationsReport: {
		audit: "direct-refresh-operations-report",
		status: "PASS",
		dryRun: true,
		summary: { schedulerGate: "blocked" },
		readiness: {
			scheduler: "blocked",
			allSource: "blocked",
			repeatedBatch: "blocked",
			productionWrites: "not-performed",
		},
	},
};

function validArgv(...extra: string[]) {
	return [
		"node",
		"script.ts",
		"--dry-run=true",
		"--source=vea",
		"--count=50",
		"--issue-url=https://github.com/Mateocas1/ofertaSUPER/issues/140",
		"--issue-number=140",
		"--issue-title=feat(data): add direct-refresh dry-run orchestrator report",
		"--issue-type-label=type:feature",
		"--issue-approval-label=status:approved",
		...extra,
	];
}

describe("direct-refresh dry-run orchestrator", () => {
	it("builds a PASS read-only dry-run summary from PASS supplied artifacts", () => {
		const report = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "vea",
			count: 50,
			issue: validIssue,
			paths: {
				schedulerPlanner: "scheduler-plan.json",
				sourceHealth: "source-health.json",
				alerts: "alerts.json",
				killSwitch: "kill-switch.json",
				operationsReport: "operations-report.json",
			},
			artifacts: passArtifacts,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.dryRun, true);
		assert.equal(report.workUnit.source, "vea");
		assert.equal(report.workUnit.count, 50);
		assert.equal(report.workUnit.writerSupported, true);
		assert.equal(report.summary.schedulerExecution, "blocked");
		assert.equal(report.summary.manifestGeneration, "blocked");
		assert.equal(report.summary.prewriteGeneration, "blocked");
		assert.equal(report.summary.activeWriter, "blocked");
		assert.equal(report.summary.blockerCount, 0);
		assert.equal(report.phases.length, 5);
		assert.match(report.writeBoundary, /reads supplied artifacts only/);
		assert.match(report.nextManualAction, /operator guidance only/);
	});

	it("allows missing optional artifacts without blocking", () => {
		const report = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "mas",
			count: 25,
			issue: validIssue,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.blockerCount, 0);
		assert.equal(
			report.phases.every((phase) => !phase.present),
			true,
		);
	});

	it("fails closed when dry-run is not explicitly true", () => {
		const report = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: false,
			source: "vea",
			count: 50,
			issue: validIssue,
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.blockers.map((entry) => entry.reason).join("\n"),
			/dry-run/,
		);
	});

	it("rejects DIA, unknown or multiple sources, unsupported counts, and missing approval", () => {
		for (const source of ["dia", "unknown", "vea,mas"]) {
			const report = buildDirectRefreshDryRunOrchestratorReport({
				now,
				dryRun: true,
				source,
				count: 50,
				issue: validIssue,
			});
			assert.equal(report.status, "FAIL");
		}
		const badCount = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "vea",
			count: 75,
			issue: validIssue,
		});
		assert.equal(badCount.status, "FAIL");
		assert.match(
			badCount.blockers.map((entry) => entry.reason).join("\n"),
			/10, 25, 50/,
		);

		const badApproval = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "vea",
			count: 50,
			issue: { ...validIssue, approvalLabel: "status:triage" },
		});
		assert.equal(badApproval.status, "FAIL");
		assert.match(
			badApproval.blockers.map((entry) => entry.reason).join("\n"),
			/status:approved/,
		);
	});

	it("fails closed for planner source/count mismatches", () => {
		const sourceMismatch = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "mas",
			count: 50,
			issue: validIssue,
			paths: { schedulerPlanner: "vea-plan.json" },
			artifacts: { schedulerPlanner: passArtifacts.schedulerPlanner },
		});
		const countMismatch = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "vea",
			count: 25,
			issue: validIssue,
			paths: { schedulerPlanner: "vea-plan.json" },
			artifacts: { schedulerPlanner: passArtifacts.schedulerPlanner },
		});

		assert.equal(sourceMismatch.status, "FAIL");
		assert.match(
			sourceMismatch.blockers.map((entry) => entry.reason).join("\n"),
			/workUnit.source must match request/,
		);
		assert.equal(countMismatch.status, "FAIL");
		assert.match(
			countMismatch.blockers.map((entry) => entry.reason).join("\n"),
			/workUnit.count must match request/,
		);
	});

	it("fails closed for malformed supplied artifacts", () => {
		const report = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "vea",
			count: 50,
			issue: validIssue,
			paths: { schedulerPlanner: "bad-plan.json" },
			artifacts: { schedulerPlanner: { audit: "not-the-planner" } },
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.blockers.map((entry) => entry.reason).join("\n"),
			/schedulerPlanner artifact audit/,
		);
	});

	it("fails closed for non-PASS hard-stop artifacts", () => {
		const report = buildDirectRefreshDryRunOrchestratorReport({
			now,
			dryRun: true,
			source: "vea",
			count: 50,
			issue: validIssue,
			paths: { alerts: "alerts.json", killSwitch: "kill-switch.json" },
			artifacts: {
				alerts: {
					audit: "direct-refresh-alerts",
					status: "WARN",
					dryRun: true,
				},
				killSwitch: {
					audit: "direct-refresh-kill-switch",
					status: "FAIL",
					dryRun: true,
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.blockers.map((entry) => entry.reason).join("\n"),
			/alerts artifact status is WARN/,
		);
		assert.match(
			report.blockers.map((entry) => entry.reason).join("\n"),
			/killSwitch artifact status is FAIL/,
		);
	});

	it("parses a valid CLI invocation", () => {
		const options = parseDirectRefreshDryRunOrchestratorCliOptions(
			validArgv(
				"--scheduler-planner=scheduler-plan.json",
				"--source-health=source-health.json",
				"--alerts=alerts.json",
				"--kill-switch=kill-switch.json",
				"--operations-report=operations-report.json",
				"--output=out.json",
			),
			now,
		);

		assert.equal(options.dryRun, true);
		assert.equal(options.source, "vea");
		assert.equal(options.count, 50);
		assert.equal(options.issue.approvalLabel, "status:approved");
		assert.equal(options.paths?.schedulerPlanner, "scheduler-plan.json");
		assert.equal(options.output, "out.json");
	});

	it("rejects forbidden mode flags", () => {
		for (const flag of [
			"--write=true",
			"--active-write=write.json",
			"--manifest=manifest.json",
			"--prewrite=prewrite.json",
			"--generate-manifest=true",
			"--scheduler=true",
			"--cron=true",
			"--all-source=true",
			"--repeated-batch=true",
			"--retry=true",
			"--notify=true",
			"--deploy=true",
			"--secrets=true",
			"--cache-purge=true",
			"--remote-config=true",
		]) {
			assert.throws(
				() =>
					parseDirectRefreshDryRunOrchestratorCliOptions(validArgv(flag), now),
				/direct-refresh dry-run orchestrator rejects/,
				flag,
			);
		}
	});

	it("rejects unknown, bare, and malformed CLI flags", () => {
		assert.throws(
			() =>
				parseDirectRefreshDryRunOrchestratorCliOptions(
					validArgv("--unexpected=value"),
					now,
				),
			/unknown direct-refresh dry-run orchestrator flag/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDryRunOrchestratorCliOptions(
					validArgv("--source-health"),
					now,
				),
			/requires --source-health=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshDryRunOrchestratorCliOptions(
					validArgv().map((arg) =>
						arg === "--dry-run=true" ? "--dry-run=no" : arg,
					),
					now,
				),
			/requires --dry-run=true or --dry-run=false/,
		);
	});
});
