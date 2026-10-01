import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import { buildDirectRefreshPrewriteGate } from "./pipeline/direct-refresh-prewrite-gate";
import { createDirectRefreshPrewriteRepository } from "./pipeline/direct-refresh-prewrite-repository";
import { assertDirectRefreshAllowedBatchCount } from "./pipeline/direct-refresh-batch-size";
import {
	getOptionalSingleFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

type SupportedPrewriteSource = "carrefour" | "vea" | "disco" | "jumbo" | "mas";

const DEFAULT_SOURCE = "carrefour" as const;
const SUPPORTED_SOURCES = new Set<SupportedPrewriteSource>([
	"carrefour",
	"vea",
	"disco",
	"jumbo",
	"mas",
]);
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
	"--purge-cache",
	"--cache-purge",
	"--cleanup",
	"--deploy",
	"--stage",
	"--staging",
	"--ingest",
	"--refresh",
];

type CliOptions = {
	source: SupportedPrewriteSource;
	sampleSize: number;
	candidateScanSize: number;
	output: string | null;
	capacityReport: string | null;
	issueNumber: number | null;
};

function rejectWriteFlags(argv: string[]) {
	const found = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (found) {
		throw new Error(
			`direct-refresh pre-write gate is read-only and rejects ${found}`,
		);
	}
}

export function parseDirectRefreshPrewriteGateCliOptions(
	argv = process.argv,
): CliOptions {
	rejectWriteFlags(argv);
	const rawSource = getOptionalSingleFlag(argv, "--source") ?? DEFAULT_SOURCE;
	const sources = rawSource
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (
		sources.length !== 1 ||
		!SUPPORTED_SOURCES.has(sources[0] as SupportedPrewriteSource)
	) {
		throw new Error(
			"direct-refresh pre-write gate only accepts --source=carrefour, --source=vea, --source=disco, --source=jumbo, or --source=mas",
		);
	}
	const sampleSize = assertDirectRefreshAllowedBatchCount(
		parsePositiveIntegerFlag(argv, "--sample-size", 10),
		"direct-refresh pre-write gate --sample-size",
	);
	const candidateScanSize = parsePositiveIntegerFlag(
		argv,
		"--candidate-scan-size",
		sampleSize,
	);
	if (candidateScanSize < sampleSize)
		throw new Error("--candidate-scan-size must be >= --sample-size");
	const capacityReport = getOptionalSingleFlag(argv, "--capacity-report");
	const issueNumber = capacityReport
		? parsePositiveIntegerFlag(argv, "--issue-number", 0)
		: null;
	if (capacityReport && issueNumber === 0) {
		throw new Error("--capacity-report requires --issue-number=...");
	}
	return {
		source: sources[0] as SupportedPrewriteSource,
		sampleSize,
		candidateScanSize,
		output: getOptionalSingleFlag(argv, "--output"),
		capacityReport,
		issueNumber,
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) return process.stdout.write(serialized);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh pre-write gate to ${output}\n`);
}

async function readCapacityEvidence(
	path: string | null,
	issueNumber: number | null,
) {
	if (!path) return null;
	const raw = await readFile(path, "utf8");
	return {
		path,
		raw,
		report: JSON.parse(raw) as unknown,
		expectedIssueNumber: issueNumber,
	};
}

async function main() {
	const options = parseDirectRefreshPrewriteGateCliOptions();
	const report = await buildDirectRefreshPrewriteGate({
		repository: createDirectRefreshPrewriteRepository(),
		sourceSlug: options.source,
		sampleSize: options.sampleSize,
		candidateScanSize: options.candidateScanSize,
		capacityEvidence: await readCapacityEvidence(
			options.capacityReport,
			options.issueNumber,
		),
		fetchDirectProducts: async (sourceSlug, lookup) =>
			getSourceAdapter(sourceSlug).fetchDirectProducts(lookup),
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
