import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildRefreshThroughputReport, inputFromFreshnessBaselineReport, type RefreshThroughputAssumptions } from "./pipeline/refresh-throughput";
import { getOptionalSingleFlag, getRequiredSingleFlag, parseNumberFlag, parsePositiveIntegerFlag } from "./pipeline/audit-utils";

type CliOptions = RefreshThroughputAssumptions & { input: string; output: string | null; targetPercent: number };

function rejectWriteFlags(argv: string[]) {
	const forbidden = ["--confirm-write", "--active", "--write", "--reconcile", "--schedule", "--cron"];
	const found = argv.find((entry) => forbidden.some((flag) => entry === flag || entry.startsWith(`${flag}=`)));
	if (found) throw new Error(`refresh throughput audit is read-only and rejects ${found}`);
}

export function parseRefreshThroughputCliOptions(argv = process.argv): CliOptions {
	rejectWriteFlags(argv);
	return {
		input: getRequiredSingleFlag(argv, "--input"), output: getOptionalSingleFlag(argv, "--output"), targetPercent: parseNumberFlag(argv, "--target-percent", 95),
		rowsPerChunk: parsePositiveIntegerFlag(argv, "--rows-per-chunk", 18), chunksPerRun: parsePositiveIntegerFlag(argv, "--chunks-per-run", 1),
		cadenceHours: parsePositiveIntegerFlag(argv, "--cadence-hours", 6), slaHours: parsePositiveIntegerFlag(argv, "--sla-hours", 12), skipMarginRuns: parseNumberFlag(argv, "--skip-margin-runs", 0),
		p50RuntimeMinutes: parseNumberFlag(argv, "--p50-runtime-minutes", 0), p95RuntimeMinutes: parseNumberFlag(argv, "--p95-runtime-minutes", 0), maxRuntimeMinutes: parseNumberFlag(argv, "--max-runtime-minutes", 0),
		githubTimeoutMinutes: parseNumberFlag(argv, "--github-timeout-minutes", 360), rateLimitRequestsPerMinute: parseNumberFlag(argv, "--rate-limit-rpm", 0),
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) return process.stdout.write(serialized);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote refresh throughput audit to ${output}\n`);
}

async function main() {
	const options = parseRefreshThroughputCliOptions();
	const baseline = JSON.parse(await readFile(options.input, "utf8"));
	const report = buildRefreshThroughputReport({ input: { ...inputFromFreshnessBaselineReport(baseline), targetPercent: options.targetPercent }, assumptions: options });
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
