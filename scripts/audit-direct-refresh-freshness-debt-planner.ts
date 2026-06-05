import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	getOptionalSingleFlag,
	getRequiredSingleFlag,
	parseListFlagValue,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";
import {
	buildDirectRefreshFreshnessDebtPlannerReport,
	type DirectRefreshFreshnessDebtPlannerOptions,
	type DirectRefreshFreshnessDebtPlannerReport,
} from "./pipeline/direct-refresh-freshness-debt-planner";
import {
	WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES,
	buildDirectRefreshSourceHealthReport,
	type DirectRefreshHealthSourceSlug,
	type DirectRefreshSourceHealthCapacityReport,
	type DirectRefreshSourceHealthReport,
} from "./pipeline/direct-refresh-source-health";
import { createDirectRefreshSourceHealthRepository } from "./audit-direct-refresh-source-health";

export type DirectRefreshFreshnessDebtPlannerCliOptions = Omit<
	DirectRefreshFreshnessDebtPlannerOptions,
	| "sourceHealthReport"
	| "sourceHealthRaw"
	| "capacityReport"
	| "capacityReportRaw"
> & {
	output: string;
};

const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--active-write",
	"--reconcile",
	"--manifest",
	"--prewrite",
	"--postwrite",
	"--vtex-scan",
	"--scan",
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
	"--source",
	"--source-health",
	"--capacity-report",
	"--issue-url",
	"--issue-number",
	"--issue-title",
	"--issue-type-label",
	"--issue-approval-label",
	"--attempt-id",
	"--output-dir",
	"--batch-counts",
	"--max-runs-per-24h",
	"--max-runs-per-12h",
	"--output",
]);

export function defaultDirectRefreshFreshnessDebtPlannerOutput(
	now = new Date(),
) {
	return `audit/direct-refresh-freshness-debt-planner/${now.toISOString().replaceAll(":", "-")}/freshness-debt-plan.json`;
}

export function parseDirectRefreshFreshnessDebtPlannerCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshFreshnessDebtPlannerCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh freshness debt planner rejects ${foundForbidden}`,
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
			`unknown direct-refresh freshness debt planner flag ${unknownFlag}`,
		);
	}

	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) {
		throw new Error(
			`direct-refresh freshness debt planner requires ${bareAllowedFlag}=...`,
		);
	}

	const output =
		getOptionalSingleFlag(argv, "--output") ??
		defaultDirectRefreshFreshnessDebtPlannerOutput(now);
	const outputDir =
		getOptionalSingleFlag(argv, "--output-dir") ?? dirname(output);
	const attemptId =
		getOptionalSingleFlag(argv, "--attempt-id") ??
		now.toISOString().replaceAll(":", "-");
	const sources = parseListFlagValue(getOptionalSingleFlag(argv, "--source"));
	const batchCounts = parseListFlagValue(
		getOptionalSingleFlag(argv, "--batch-counts"),
	).map((value) => Number(value));

	return {
		now,
		issue: {
			url: getRequiredSingleFlag(argv, "--issue-url"),
			number: parsePositiveIntegerFlag(argv, "--issue-number", 0),
			title: getRequiredSingleFlag(argv, "--issue-title"),
			typeLabel: getRequiredSingleFlag(argv, "--issue-type-label"),
			approvalLabel: getRequiredSingleFlag(argv, "--issue-approval-label"),
		},
		attemptId,
		outputDir,
		sources: sources.length > 0 ? sources : undefined,
		batchCounts: batchCounts.length > 0 ? batchCounts : undefined,
		maxRunsPer24h: optionalPositiveInteger(argv, "--max-runs-per-24h"),
		maxRunsPer12h: optionalPositiveInteger(argv, "--max-runs-per-12h"),
		sourceHealthPath: getOptionalNonBlankFlag(argv, "--source-health"),
		capacityReportPath: getOptionalNonBlankFlag(argv, "--capacity-report"),
		output,
	};
}

function optionalPositiveInteger(argv: string[], flagName: string) {
	const raw = getOptionalSingleFlag(argv, flagName);
	if (raw === null) return null;
	return parsePositiveIntegerFlag(argv, flagName, 0);
}

function getOptionalNonBlankFlag(argv: string[], flagName: string) {
	const value = getOptionalSingleFlag(argv, flagName);
	if (value !== null && !value.trim()) {
		throw new Error(`requires ${flagName}=... to be non-empty when supplied`);
	}
	return value?.trim() ?? null;
}

async function readJsonWithRaw<T>(path: string | null) {
	if (!path) return { raw: null, value: null };
	const raw = await readFile(path, "utf8");
	return { raw, value: JSON.parse(raw) as T };
}

async function buildReportFromCliOptions(
	options: DirectRefreshFreshnessDebtPlannerCliOptions,
) {
	const capacity =
		await readJsonWithRaw<DirectRefreshSourceHealthCapacityReport>(
			options.capacityReportPath ?? null,
		);
	const suppliedSourceHealth =
		await readJsonWithRaw<DirectRefreshSourceHealthReport>(
			options.sourceHealthPath ?? null,
		);
	const requestedSources = normalizeSourcesForSourceHealth(options.sources);
	const sourceHealthReport =
		suppliedSourceHealth.value ??
		(await buildDirectRefreshSourceHealthReport({
			repository: createDirectRefreshSourceHealthRepository(),
			sources: requestedSources,
			capacityReport: capacity.value,
			capacityReportPath: options.capacityReportPath ?? null,
			now: options.now,
		}));
	const sourceHealthRaw =
		suppliedSourceHealth.raw ?? JSON.stringify(sourceHealthReport, null, 2);

	return buildDirectRefreshFreshnessDebtPlannerReport({
		...options,
		sourceHealthReport,
		sourceHealthRaw,
		capacityReport: capacity.value,
		capacityReportRaw: capacity.raw,
	});
}

function normalizeSourcesForSourceHealth(sources: string[] | undefined) {
	const requested = sources?.length
		? sources
		: [...WRITER_SUPPORTED_DIRECT_REFRESH_SOURCES];
	return requested as DirectRefreshHealthSourceSlug[];
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh freshness debt planner audit to ${output}\n`,
	);
}

function parseOutputFallback(argv = process.argv) {
	const outputs = argv
		.filter((entry) => entry.startsWith("--output="))
		.map((entry) => entry.slice("--output=".length).trim())
		.filter(Boolean);
	return outputs.length === 1 ? outputs[0] : null;
}

function failureReport(
	now = new Date(),
): DirectRefreshFreshnessDebtPlannerReport {
	return buildDirectRefreshFreshnessDebtPlannerReport({
		now,
		issue: {
			url: "",
			number: 0,
			title: "",
			typeLabel: "",
			approvalLabel: "",
		},
		attemptId: "failure",
		outputDir: "failure",
		directSources: [],
	});
}

async function main() {
	try {
		const options = parseDirectRefreshFreshnessDebtPlannerCliOptions();
		const report = await buildReportFromCliOptions(options);
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
