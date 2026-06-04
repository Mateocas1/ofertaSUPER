import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getOptionalSingleFlag } from "./pipeline/audit-utils";
import {
	DIRECT_REFRESH_HEALTH_SOURCES,
	type DirectRefreshHealthSourceSlug,
} from "./pipeline/direct-refresh-source-health";
import { evaluateDirectRefreshKillSwitch } from "./pipeline/direct-refresh-kill-switch";

export type DirectRefreshKillSwitchCliOptions = {
	source: DirectRefreshHealthSourceSlug | null;
	control: string;
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
const ALLOWED_FLAGS = new Set(["--source", "--control", "--output"]);

export function defaultDirectRefreshKillSwitchOutput(now = new Date()) {
	return `audit/direct-refresh-kill-switch/${now.toISOString().replaceAll(":", "-")}/kill-switch-report.json`;
}

export function parseDirectRefreshKillSwitchCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshKillSwitchCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(`direct-refresh kill switch rejects ${foundForbidden}`);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(`unknown direct-refresh kill switch flag ${unknownFlag}`);
	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(`direct-refresh kill switch requires ${bareAllowedFlag}=...`);
	const control = getOptionalSingleFlag(argv, "--control");
	if (!control) throw new Error("direct-refresh kill switch requires --control=...");
	const source = getOptionalSingleFlag(argv, "--source");
	if (source !== null && !DIRECT_REFRESH_HEALTH_SOURCES.includes(source as never)) {
		throw new Error(`direct-refresh kill switch rejects source ${source}`);
	}
	return {
		source: source as DirectRefreshHealthSourceSlug | null,
		control,
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshKillSwitchOutput(now),
	};
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(`Wrote direct-refresh kill switch audit to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshKillSwitchCliOptions();
	const control = JSON.parse(await readFile(options.control, "utf8")) as unknown;
	const report = evaluateDirectRefreshKillSwitch({
		control,
		source: options.source,
		controlPath: options.control,
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
