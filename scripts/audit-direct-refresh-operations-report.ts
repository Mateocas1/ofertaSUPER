import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getOptionalSingleFlag } from "./pipeline/audit-utils";
import {
	buildDirectRefreshOperationsReport,
	type DirectRefreshOperationsArtifactPaths,
	type DirectRefreshOperationsArtifacts,
} from "./pipeline/direct-refresh-operations-report";

export type DirectRefreshOperationsReportCliOptions = {
	source: string | null;
	paths: DirectRefreshOperationsArtifactPaths;
	requireOperationArtifacts: boolean;
	requirePostwrite: boolean;
	requireNoPartialForIncident: boolean;
	output: string;
};

const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--reconcile",
	"--all-source",
	"--all-sources",
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--retry",
	"--retries",
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
];

const ALLOWED_FLAGS = new Set([
	"--source",
	"--source-health",
	"--alerts",
	"--kill-switch",
	"--freshness-baseline",
	"--manifest",
	"--prewrite",
	"--active-write",
	"--postwrite",
	"--no-partial",
	"--error-artifact",
	"--scheduler-planner",
	"--require-operation-artifacts",
	"--require-postwrite",
	"--require-no-partial-for-incident",
	"--output",
]);

export function defaultDirectRefreshOperationsReportOutput(now = new Date()) {
	return `audit/direct-refresh-operations-report/${now.toISOString().replaceAll(":", "-")}/operations-report.json`;
}

export function parseDirectRefreshOperationsReportCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshOperationsReportCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(
			`direct-refresh operations report rejects ${foundForbidden}`,
		);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(
			`unknown direct-refresh operations report flag ${unknownFlag}`,
		);
	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(
			`direct-refresh operations report requires ${bareAllowedFlag}=...`,
		);
	return {
		source: getOptionalSingleFlag(argv, "--source"),
		paths: {
			sourceHealth: getOptionalSingleFlag(argv, "--source-health"),
			alerts: getOptionalSingleFlag(argv, "--alerts"),
			killSwitch: getOptionalSingleFlag(argv, "--kill-switch"),
			freshnessBaseline: getOptionalSingleFlag(argv, "--freshness-baseline"),
			manifest: getOptionalSingleFlag(argv, "--manifest"),
			prewrite: getOptionalSingleFlag(argv, "--prewrite"),
			activeWrite: getOptionalSingleFlag(argv, "--active-write"),
			postwrite: getOptionalSingleFlag(argv, "--postwrite"),
			noPartial: getOptionalSingleFlag(argv, "--no-partial"),
			errorArtifact: getOptionalSingleFlag(argv, "--error-artifact"),
			schedulerPlanner: getOptionalSingleFlag(argv, "--scheduler-planner"),
		},
		requireOperationArtifacts: parseBooleanFlag(
			argv,
			"--require-operation-artifacts",
			false,
		),
		requirePostwrite: parseBooleanFlag(argv, "--require-postwrite", false),
		requireNoPartialForIncident: parseBooleanFlag(
			argv,
			"--require-no-partial-for-incident",
			Boolean(getOptionalSingleFlag(argv, "--error-artifact")),
		),
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshOperationsReportOutput(now),
	};
}

function parseBooleanFlag(argv: string[], flagName: string, fallback: boolean) {
	const raw = getOptionalSingleFlag(argv, flagName);
	if (raw === null) return fallback;
	if (raw === "true") return true;
	if (raw === "false") return false;
	throw new Error(`requires ${flagName}=true or ${flagName}=false`);
}

async function readJson(path: string | null) {
	if (!path) return undefined;
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readArtifacts(
	paths: DirectRefreshOperationsArtifactPaths,
): Promise<DirectRefreshOperationsArtifacts> {
	return {
		sourceHealth: await readJson(paths.sourceHealth),
		alerts: await readJson(paths.alerts),
		killSwitch: await readJson(paths.killSwitch),
		freshnessBaseline: await readJson(paths.freshnessBaseline),
		manifest: await readJson(paths.manifest),
		prewrite: await readJson(paths.prewrite),
		activeWrite: await readJson(paths.activeWrite),
		postwrite: await readJson(paths.postwrite),
		noPartial: await readJson(paths.noPartial),
		errorArtifact: await readJson(paths.errorArtifact),
		schedulerPlanner: await readJson(paths.schedulerPlanner),
	};
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(`Wrote direct-refresh operations report to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshOperationsReportCliOptions();
	const artifacts = await readArtifacts(options.paths);
	const report = buildDirectRefreshOperationsReport({
		source: options.source,
		paths: options.paths,
		artifacts,
		requireOperationArtifacts: options.requireOperationArtifacts,
		requirePostwrite: options.requirePostwrite,
		requireNoPartialForIncident: options.requireNoPartialForIncident,
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
