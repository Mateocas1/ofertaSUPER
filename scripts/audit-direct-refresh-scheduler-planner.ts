import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	getOptionalSingleFlag,
	getRequiredSingleFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";
import {
	buildDirectRefreshSchedulerPlannerReport,
	type DirectRefreshSchedulerPlannerArtifactPaths,
	type DirectRefreshSchedulerPlannerOptions,
	type DirectRefreshSchedulerPlannerReport,
} from "./pipeline/direct-refresh-scheduler-planner";

export type DirectRefreshSchedulerPlannerCliOptions =
	DirectRefreshSchedulerPlannerOptions & {
		output: string;
	};

const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--active-write",
	"--reconcile",
	"--all-source",
	"--all-sources",
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--retry",
	"--retries",
	"--repeat",
	"--repeated-batch",
	"--batch-count",
	"--cadence",
	"--send",
	"--notify",
	"--notification",
	"--notifications",
	"--webhook",
	"--slack",
	"--purge-cache",
	"--cache-purge",
	"--cleanup",
	"--deploy",
	"--stage",
	"--staging",
	"--ingest",
	"--refresh",
	"--dia-write",
	"--secrets",
	"--remote-config",
];

const ALLOWED_FLAGS = new Set([
	"--planning-enabled",
	"--source",
	"--count",
	"--issue-url",
	"--issue-number",
	"--issue-title",
	"--issue-type-label",
	"--issue-approval-label",
	"--source-health",
	"--alerts",
	"--kill-switch",
	"--manifest",
	"--prewrite",
	"--freshness-baseline",
	"--operations-report",
	"--output",
]);

export function defaultDirectRefreshSchedulerPlannerOutput(now = new Date()) {
	return `audit/direct-refresh-scheduler-planner/${now.toISOString().replaceAll(":", "-")}/scheduler-plan.json`;
}

export function parseDirectRefreshSchedulerPlannerCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshSchedulerPlannerCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh scheduler planner rejects ${foundForbidden}`,
		);
	}

	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag) {
		throw new Error(
			`unknown direct-refresh scheduler planner flag ${unknownFlag}`,
		);
	}

	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) {
		throw new Error(
			`direct-refresh scheduler planner requires ${bareAllowedFlag}=...`,
		);
	}

	const planningEnabled = parseRequiredBooleanFlag(argv, "--planning-enabled");
	const count = parsePositiveIntegerFlag(argv, "--count", 0);
	if (count === 0) throw new Error("requires --count=...");

	const artifacts: DirectRefreshSchedulerPlannerArtifactPaths = {
		sourceHealth: getOptionalNonBlankFlag(argv, "--source-health"),
		alerts: getOptionalNonBlankFlag(argv, "--alerts"),
		killSwitch: getOptionalNonBlankFlag(argv, "--kill-switch"),
		manifest: getOptionalNonBlankFlag(argv, "--manifest"),
		prewrite: getOptionalNonBlankFlag(argv, "--prewrite"),
		freshnessBaseline: getOptionalNonBlankFlag(argv, "--freshness-baseline"),
		operationsReport: getOptionalNonBlankFlag(argv, "--operations-report"),
	};

	return {
		now,
		planningEnabled,
		source: getRequiredSingleFlag(argv, "--source"),
		count,
		issue: {
			url: getRequiredSingleFlag(argv, "--issue-url"),
			number: parsePositiveIntegerFlag(argv, "--issue-number", 0),
			title: getRequiredSingleFlag(argv, "--issue-title"),
			typeLabel: getRequiredSingleFlag(argv, "--issue-type-label"),
			approvalLabel: getRequiredSingleFlag(argv, "--issue-approval-label"),
		},
		artifacts,
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshSchedulerPlannerOutput(now),
	};
}

function parseRequiredBooleanFlag(argv: string[], flagName: string) {
	const raw = getRequiredSingleFlag(argv, flagName);
	if (raw === "true") return true;
	if (raw === "false") return false;
	throw new Error(`requires ${flagName}=true or ${flagName}=false`);
}

function getOptionalNonBlankFlag(argv: string[], flagName: string) {
	const value = getOptionalSingleFlag(argv, flagName);
	if (value !== null && !value.trim()) {
		throw new Error(`requires ${flagName}=... to be non-empty when supplied`);
	}
	return value?.trim() ?? null;
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh scheduler planner audit to ${output}\n`,
	);
}

function parseOutputFallback(argv = process.argv) {
	const outputs = argv
		.filter((entry) => entry.startsWith("--output="))
		.map((entry) => entry.slice("--output=".length).trim())
		.filter(Boolean);
	return outputs.length === 1 ? outputs[0] : null;
}

function failureReport(now = new Date()): DirectRefreshSchedulerPlannerReport {
	return buildDirectRefreshSchedulerPlannerReport({
		now,
		planningEnabled: false,
		source: "",
		count: 0,
		issue: {
			url: "",
			number: 0,
			title: "",
			typeLabel: "",
			approvalLabel: "",
		},
		artifacts: {},
	});
}

async function main() {
	try {
		const options = parseDirectRefreshSchedulerPlannerCliOptions();
		const report = buildDirectRefreshSchedulerPlannerReport(options);
		await writeJson(options.output, report);
		if (report.status === "FAIL") process.exitCode = 1;
	} catch (error) {
		const output = parseOutputFallback();
		if (output) {
			const report = failureReport();
			report.summary.failClosedReasons.unshift(
				error instanceof Error ? error.message : String(error),
			);
			await writeJson(output, report);
		}
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main();
}
