import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import {
	getOptionalSingleFlag,
	getRequiredSingleFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";
import {
	buildDirectRefreshCadenceControllerReport,
	type DirectRefreshCadenceControllerLedgerEntry,
	type DirectRefreshCadenceControllerOptions,
	type DirectRefreshCadenceControllerReport,
} from "./pipeline/direct-refresh-cadence-controller";
import type { DirectRefreshFreshnessDebtPlannerReport } from "./pipeline/direct-refresh-freshness-debt-planner";

export type DirectRefreshCadenceControllerCliOptions = Omit<
	DirectRefreshCadenceControllerOptions,
	"freshnessDebtPlan" | "freshnessDebtPlanRaw" | "ledgerEntries"
> & {
	freshnessDebtPlanPath: string | null;
	ledgerPath: string | null;
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
	"--cadence-enabled",
	"--source",
	"--count",
	"--issue-url",
	"--issue-number",
	"--issue-title",
	"--issue-type-label",
	"--issue-approval-label",
	"--attempt-id",
	"--output-dir",
	"--freshness-debt-plan",
	"--ledger",
	"--source-health",
	"--capacity-report",
	"--operations-report",
	"--kill-switch",
	"--output",
]);

export function defaultDirectRefreshCadenceControllerOutput(now = new Date()) {
	return `audit/direct-refresh-cadence-controller/${now.toISOString().replaceAll(":", "-")}/cadence-controller-plan.json`;
}

export function parseDirectRefreshCadenceControllerCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshCadenceControllerCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh cadence controller rejects ${foundForbidden}`,
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
			`unknown direct-refresh cadence controller flag ${unknownFlag}`,
		);
	}

	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) {
		throw new Error(
			`direct-refresh cadence controller requires ${bareAllowedFlag}=...`,
		);
	}

	const output =
		getOptionalSingleFlag(argv, "--output") ??
		defaultDirectRefreshCadenceControllerOutput(now);
	const outputDir =
		getOptionalSingleFlag(argv, "--output-dir") ?? dirname(output);
	const freshnessDebtPlanPath = getOptionalNonBlankFlag(
		argv,
		"--freshness-debt-plan",
	);
	const ledgerPath = getOptionalNonBlankFlag(argv, "--ledger");

	return {
		now,
		cadenceEnabled: parseRequiredBooleanFlag(argv, "--cadence-enabled"),
		source: getRequiredSingleFlag(argv, "--source"),
		count: parsePositiveIntegerFlag(argv, "--count", 0),
		attemptId:
			getOptionalSingleFlag(argv, "--attempt-id") ??
			now.toISOString().replaceAll(":", "-"),
		outputDir,
		issue: {
			url: getRequiredSingleFlag(argv, "--issue-url"),
			number: parsePositiveIntegerFlag(argv, "--issue-number", 0),
			title: getRequiredSingleFlag(argv, "--issue-title"),
			typeLabel: getRequiredSingleFlag(argv, "--issue-type-label"),
			approvalLabel: getRequiredSingleFlag(argv, "--issue-approval-label"),
		},
		paths: {
			freshnessDebtPlan: freshnessDebtPlanPath,
			ledger: ledgerPath,
			sourceHealth: getOptionalNonBlankFlag(argv, "--source-health"),
			capacityReport: getOptionalNonBlankFlag(argv, "--capacity-report"),
			operationsReport: getOptionalNonBlankFlag(argv, "--operations-report"),
			killSwitch: getOptionalNonBlankFlag(argv, "--kill-switch"),
		},
		freshnessDebtPlanPath,
		ledgerPath,
		output,
	};
}

async function buildReportFromCliOptions(
	options: DirectRefreshCadenceControllerCliOptions,
) {
	const freshnessDebtPlan =
		await readOptionalJsonWithRaw<DirectRefreshFreshnessDebtPlannerReport>(
			options.freshnessDebtPlanPath,
		);
	const ledgerEntries = await readLedgerEntries(options.ledgerPath);

	return buildDirectRefreshCadenceControllerReport({
		...options,
		freshnessDebtPlan: freshnessDebtPlan.value,
		freshnessDebtPlanRaw: freshnessDebtPlan.raw,
		ledgerEntries,
	});
}

async function readOptionalJsonWithRaw<T>(path: string | null) {
	if (!path) return { raw: null, value: null };
	const raw = await readFile(path, "utf8");
	return { raw, value: JSON.parse(raw) as T };
}

async function readLedgerEntries(path: string | null) {
	if (!path) return [];
	const raw = await readFile(path, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	return normalizeLedgerEntries(parsed);
}

export function normalizeLedgerEntries(
	parsed: unknown,
): DirectRefreshCadenceControllerLedgerEntry[] {
	const entries = Array.isArray(parsed)
		? parsed
		: isRecord(parsed) && Array.isArray(parsed.entries)
			? parsed.entries
			: isRecord(parsed) && Array.isArray(parsed.runs)
				? parsed.runs
				: [];
	return entries.flatMap((entry) => {
		if (!isRecord(entry)) return [];
		const source = stringValue(
			entry.source ?? entry.sourceSlug ?? entry.source_slug,
		);
		const status = stringValue(entry.status);
		const runKey = stringValue(entry.runKey ?? entry.run_key);
		const attemptId = stringValue(entry.attemptId ?? entry.attempt_id);
		if (!source || !status || !runKey || !attemptId) return [];
		return [
			{
				source,
				status,
				runKey,
				attemptId,
			} as DirectRefreshCadenceControllerLedgerEntry,
		];
	});
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
		`Wrote direct-refresh cadence controller audit to ${output}\n`,
	);
}

function parseOutputFallback(argv = process.argv) {
	const outputs = argv
		.filter((entry) => entry.startsWith("--output="))
		.map((entry) => entry.slice("--output=".length).trim())
		.filter(Boolean);
	return outputs.length === 1 ? outputs[0] : null;
}

function failureReport(now = new Date()): DirectRefreshCadenceControllerReport {
	return buildDirectRefreshCadenceControllerReport({
		now,
		cadenceEnabled: false,
		source: "",
		count: 0,
		attemptId: "",
		outputDir: "",
		issue: {
			url: "",
			number: 0,
			title: "",
			typeLabel: "",
			approvalLabel: "",
		},
		freshnessDebtPlan: null,
		ledgerEntries: [],
	});
}

async function main() {
	try {
		const options = parseDirectRefreshCadenceControllerCliOptions();
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main();
}
