import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshSchedulerPlannerCliOptions } from "../scripts/audit-direct-refresh-scheduler-planner";
import { buildDirectRefreshSchedulerPlannerReport } from "../scripts/pipeline/direct-refresh-scheduler-planner";

const now = new Date("2026-06-04T12:00:00.000Z");

const validIssue = {
	url: "https://github.com/Mateocas1/ofertaSUPER/issues/136",
	number: 136,
	title: "feat(data): add disabled direct-refresh scheduler planner",
	typeLabel: "type:feature",
	approvalLabel: "status:approved",
};

function validArgv(...extra: string[]) {
	return [
		"node",
		"script.ts",
		"--planning-enabled=true",
		"--source=vea",
		"--count=50",
		"--issue-url=https://github.com/Mateocas1/ofertaSUPER/issues/136",
		"--issue-number=136",
		"--issue-title=feat(data): add disabled direct-refresh scheduler planner",
		"--issue-type-label=type:feature",
		"--issue-approval-label=status:approved",
		...extra,
	];
}

describe("direct-refresh scheduler planner", () => {
	it("passes for one writer-supported source/count with valid issue metadata", () => {
		const report = buildDirectRefreshSchedulerPlannerReport({
			now,
			planningEnabled: true,
			source: "vea",
			count: 50,
			issue: validIssue,
			artifacts: {
				sourceHealth: "source-health.json",
				alerts: "alerts.json",
				killSwitch: "kill-switch.json",
				manifest: "manifest.json",
				prewrite: "prewrite.json",
			},
		});

		assert.equal(report.schemaVersion, 1);
		assert.equal(report.audit, "direct-refresh-scheduler-planner");
		assert.equal(report.status, "PASS");
		assert.equal(report.dryRun, true);
		assert.equal(report.workUnit.source, "vea");
		assert.equal(report.workUnit.count, 50);
		assert.equal(report.summary.schedulerExecution, "blocked");
		assert.equal(report.summary.productionWrites, "blocked");
		assert.equal(report.summary.allSource, "blocked");
		assert.equal(report.summary.repeatedBatch, "blocked");
		assert.equal(report.summary.diaWriter, "blocked");
		assert.deepEqual(report.summary.failClosedReasons, []);
		assert.match(report.writeBoundary, /no production writes/);
		assert.match(report.writeBoundary, /no active writer invocation/);
		assert.match(
			report.writeBoundary,
			/no scheduler\/cron\/workflow execution/,
		);
		assert.match(report.nextManualAction, /operator guidance only/);
	});

	it("normalizes whitespace-padded direct builder source", () => {
		const report = buildDirectRefreshSchedulerPlannerReport({
			now,
			planningEnabled: true,
			source: " vea ",
			count: 50,
			issue: validIssue,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.workUnit.source, "vea");
		assert.equal(report.workUnit.writerSupported, true);
	});

	it("normalizes whitespace-padded approval label", () => {
		const report = buildDirectRefreshSchedulerPlannerReport({
			now,
			planningEnabled: true,
			source: "vea",
			count: 50,
			issue: {
				...validIssue,
				approvalLabel: " status:approved ",
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.issue.approvalLabel, "status:approved");
	});

	it("fails closed when planning is not explicitly enabled", () => {
		const report = buildDirectRefreshSchedulerPlannerReport({
			now,
			planningEnabled: false,
			source: "vea",
			count: 50,
			issue: validIssue,
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/planning is disabled/,
		);
	});

	it("rejects DIA, unknown sources, and multiple sources", () => {
		for (const source of ["dia", "unknown", "vea,mas"]) {
			const report = buildDirectRefreshSchedulerPlannerReport({
				now,
				planningEnabled: true,
				source,
				count: 50,
				issue: validIssue,
			});
			assert.equal(report.status, "FAIL");
		}
	});

	it("rejects unsupported counts and malformed issue metadata", () => {
		const report = buildDirectRefreshSchedulerPlannerReport({
			now,
			planningEnabled: true,
			source: "vea",
			count: 75,
			issue: {
				url: "https://github.com/Mateocas1/ofertaSUPER/pull/136",
				number: 0,
				title: "",
				typeLabel: "type:feature,type:docs",
				approvalLabel: "status:triage",
			},
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/must be one of 10, 25, 50/,
		);
		assert.match(report.summary.failClosedReasons.join("\n"), /issue number/);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/GitHub issue URL/,
		);
		assert.match(report.summary.failClosedReasons.join("\n"), /issue title/);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/exactly one type:\*/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/status:approved/,
		);
	});

	it("parses a valid CLI invocation", () => {
		const options = parseDirectRefreshSchedulerPlannerCliOptions(
			validArgv("--source-health=source-health.json", "--output=out.json"),
			now,
		);

		assert.equal(options.planningEnabled, true);
		assert.equal(options.source, "vea");
		assert.equal(options.count, 50);
		assert.equal(options.issue.number, 136);
		assert.equal(options.issue.typeLabel, "type:feature");
		assert.equal(options.issue.approvalLabel, "status:approved");
		assert.equal(options.artifacts?.sourceHealth, "source-health.json");
		assert.equal(options.output, "out.json");
	});

	it("rejects missing, false, non-boolean, and bare planning enable flags", () => {
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv().filter((arg) => !arg.startsWith("--planning-enabled")),
				),
			/requires --planning-enabled=/,
		);
		const falseOptions = parseDirectRefreshSchedulerPlannerCliOptions(
			validArgv().map((arg) =>
				arg === "--planning-enabled=true" ? "--planning-enabled=false" : arg,
			),
			now,
		);
		assert.equal(
			buildDirectRefreshSchedulerPlannerReport(falseOptions).status,
			"FAIL",
		);
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv().map((arg) =>
						arg === "--planning-enabled=true" ? "--planning-enabled=yes" : arg,
					),
				),
			/requires --planning-enabled=true or --planning-enabled=false/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv().filter(
						(arg) => !arg.startsWith("--issue-approval-label"),
					),
				),
			/requires --issue-approval-label=/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv().map((arg) =>
						arg === "--planning-enabled=true" ? "--planning-enabled" : arg,
					),
				),
			/requires --planning-enabled=\.\.\./,
		);
	});

	it("rejects forbidden mode flags", () => {
		for (const flag of [
			"--write=true",
			"--active-write=write-report.json",
			"--all-source=true",
			"--scheduler=true",
			"--cron=true",
			"--workflow=true",
			"--retry=true",
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
					parseDirectRefreshSchedulerPlannerCliOptions(validArgv(flag), now),
				/direct-refresh scheduler planner rejects/,
				flag,
			);
		}
	});

	it("rejects unknown flags and bare allowed flags", () => {
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv("--unexpected=value"),
					now,
				),
			/unknown direct-refresh scheduler planner flag/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv("--source-health"),
					now,
				),
			/requires --source-health=\.\.\./,
		);
	});

	it("rejects malformed source and count from CLI", () => {
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv("--source=mas"),
					now,
				),
			/accepts at most one --source=/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv().map((arg) => (arg === "--count=50" ? "--count=0" : arg)),
					now,
				),
			/requires --count=\.\.\. to be a positive integer/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSchedulerPlannerCliOptions(
					validArgv().map((arg) =>
						arg === "--count=50" ? "--count=abc" : arg,
					),
					now,
				),
			/requires --count=\.\.\. to be a positive integer/,
		);
	});
});
