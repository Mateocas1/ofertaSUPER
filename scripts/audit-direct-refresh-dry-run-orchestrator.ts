import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	getOptionalSingleFlag,
	getRequiredSingleFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";
import {
	buildDirectRefreshDryRunOrchestratorReport,
	type DirectRefreshDryRunOrchestratorArtifactPaths,
	type DirectRefreshDryRunOrchestratorArtifacts,
	type DirectRefreshDryRunOrchestratorOptions,
} from "./pipeline/direct-refresh-dry-run-orchestrator";

export type DirectRefreshDryRunOrchestratorCliOptions =
	DirectRefreshDryRunOrchestratorOptions & { output: string };

const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--active-write",
	"--reconcile",
	"--manifest",
	"--prewrite",
	"--generate-manifest",
	"--generate-prewrite",
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
	"--dry-run",
	"--source",
	"--count",
	"--issue-url",
	"--issue-number",
	"--issue-title",
	"--issue-type-label",
	"--issue-approval-label",
	"--scheduler-planner",
	"--source-health",
	"--alerts",
	"--kill-switch",
	"--operations-report",
	"--output",
]);

export function defaultDirectRefreshDryRunOrchestratorOutput(now = new Date()) {
	return `audit/direct-refresh-dry-run-orchestrator/${now.toISOString().replaceAll(":", "-")}/dry-run-orchestrator.json`;
}

export function parseDirectRefreshDryRunOrchestratorCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshDryRunOrchestratorCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh dry-run orchestrator rejects ${foundForbidden}`,
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
			`unknown direct-refresh dry-run orchestrator flag ${unknownFlag}`,
		);
	}
	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) {
		throw new Error(
			`direct-refresh dry-run orchestrator requires ${bareAllowedFlag}=...`,
		);
	}
	const count = parsePositiveIntegerFlag(argv, "--count", 0);
	if (count === 0) throw new Error("requires --count=...");
	const paths: DirectRefreshDryRunOrchestratorArtifactPaths = {
		schedulerPlanner: getOptionalNonBlankFlag(argv, "--scheduler-planner"),
		sourceHealth: getOptionalNonBlankFlag(argv, "--source-health"),
		alerts: getOptionalNonBlankFlag(argv, "--alerts"),
		killSwitch: getOptionalNonBlankFlag(argv, "--kill-switch"),
		operationsReport: getOptionalNonBlankFlag(argv, "--operations-report"),
	};
	return {
		now,
		dryRun: parseRequiredBooleanFlag(argv, "--dry-run"),
		source: getRequiredSingleFlag(argv, "--source"),
		count,
		issue: {
			url: getRequiredSingleFlag(argv, "--issue-url"),
			number: parsePositiveIntegerFlag(argv, "--issue-number", 0),
			title: getRequiredSingleFlag(argv, "--issue-title"),
			typeLabel: getRequiredSingleFlag(argv, "--issue-type-label"),
			approvalLabel: getRequiredSingleFlag(argv, "--issue-approval-label"),
		},
		paths,
		artifacts: {},
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshDryRunOrchestratorOutput(now),
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

async function readJson(path: string | null | undefined) {
	if (!path) return undefined;
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readArtifacts(
	paths: DirectRefreshDryRunOrchestratorArtifactPaths,
): Promise<DirectRefreshDryRunOrchestratorArtifacts> {
	return {
		schedulerPlanner: await readJson(paths.schedulerPlanner),
		sourceHealth: await readJson(paths.sourceHealth),
		alerts: await readJson(paths.alerts),
		killSwitch: await readJson(paths.killSwitch),
		operationsReport: await readJson(paths.operationsReport),
	};
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh dry-run orchestrator report to ${output}\n`,
	);
}

async function main() {
	const options = parseDirectRefreshDryRunOrchestratorCliOptions();
	const artifacts = await readArtifacts(options.paths ?? {});
	const report = buildDirectRefreshDryRunOrchestratorReport({
		...options,
		artifacts,
	});
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
