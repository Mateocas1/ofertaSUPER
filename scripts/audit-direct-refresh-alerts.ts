import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	getOptionalSingleFlag,
	parseNumberFlag,
} from "./pipeline/audit-utils";
import {
	evaluateDirectRefreshAlerts,
	type DirectRefreshAlertArtifactPaths,
	type DirectRefreshAlertArtifacts,
} from "./pipeline/direct-refresh-alerts";

export type DirectRefreshAlertsCliOptions = {
	source: string | null;
	paths: DirectRefreshAlertArtifactPaths;
	requirePostwrite: boolean;
	requireBaseline: boolean;
	maxPrewriteAgeMinutes: number;
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
	"--freshness-baseline",
	"--manifest",
	"--prewrite",
	"--postwrite",
	"--no-partial",
	"--error-artifact",
	"--active-write",
	"--require-postwrite",
	"--require-baseline",
	"--max-prewrite-age-minutes",
	"--output",
]);

export function defaultDirectRefreshAlertsOutput(now = new Date()) {
	return `audit/direct-refresh-alerts/${now.toISOString().replaceAll(":", "-")}/alerts-report.json`;
}

export function parseDirectRefreshAlertsCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshAlertsCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(`direct-refresh alerts rejects ${foundForbidden}`);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag) throw new Error(`unknown direct-refresh alerts flag ${unknownFlag}`);
	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(`direct-refresh alerts requires ${bareAllowedFlag}=...`);
	const maxPrewriteAgeMinutes = parseNumberFlag(
		argv,
		"--max-prewrite-age-minutes",
		15,
	);
	if (maxPrewriteAgeMinutes <= 0) {
		throw new Error("requires --max-prewrite-age-minutes=... to be positive");
	}
	return {
		source: getOptionalSingleFlag(argv, "--source"),
		paths: {
			sourceHealth: getOptionalSingleFlag(argv, "--source-health"),
			freshnessBaseline: getOptionalSingleFlag(argv, "--freshness-baseline"),
			manifest: getOptionalSingleFlag(argv, "--manifest"),
			prewrite: getOptionalSingleFlag(argv, "--prewrite"),
			postwrite: getOptionalSingleFlag(argv, "--postwrite"),
			noPartial: getOptionalSingleFlag(argv, "--no-partial"),
			errorArtifact: getOptionalSingleFlag(argv, "--error-artifact"),
			activeWrite: getOptionalSingleFlag(argv, "--active-write"),
		},
		requirePostwrite: parseBooleanFlag(argv, "--require-postwrite", false),
		requireBaseline: parseBooleanFlag(argv, "--require-baseline", false),
		maxPrewriteAgeMinutes,
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshAlertsOutput(now),
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

async function readArtifacts(paths: DirectRefreshAlertArtifactPaths): Promise<DirectRefreshAlertArtifacts> {
	return {
		sourceHealth: await readJson(paths.sourceHealth),
		freshnessBaseline: await readJson(paths.freshnessBaseline),
		manifest: await readJson(paths.manifest),
		prewrite: await readJson(paths.prewrite),
		postwrite: await readJson(paths.postwrite),
		noPartial: await readJson(paths.noPartial),
		errorArtifact: await readJson(paths.errorArtifact),
		activeWrite: await readJson(paths.activeWrite),
	};
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(`Wrote direct-refresh alerts audit to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshAlertsCliOptions();
	const artifacts = await readArtifacts(options.paths);
	const report = evaluateDirectRefreshAlerts({
		source: options.source,
		paths: options.paths,
		requirePostwrite: options.requirePostwrite,
		requireBaseline: options.requireBaseline,
		maxPrewriteAgeMinutes: options.maxPrewriteAgeMinutes,
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
