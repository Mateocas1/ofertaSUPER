import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import {
	decimalToNumber,
	dateToIso,
	getOptionalSingleFlag,
	parseListFlagValue,
	parseNumberFlag,
} from "./pipeline/audit-utils";
import {
	DIRECT_REFRESH_HEALTH_SOURCES,
	buildDirectRefreshSourceHealthReport,
	type DirectRefreshHealthSourceSlug,
	type DirectRefreshSourceHealthCapacityReport,
	type DirectRefreshSourceHealthRepository,
} from "./pipeline/direct-refresh-source-health";

export type DirectRefreshSourceHealthCliOptions = {
	sources: DirectRefreshHealthSourceSlug[];
	freshnessTargetPercent: number;
	failUnderFreshnessPercent: number | null;
	capacityReport: string | null;
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
	"--freshness-target-percent",
	"--fail-under-freshness-percent",
	"--capacity-report",
	"--output",
]);

export function defaultDirectRefreshSourceHealthOutput(now = new Date()) {
	return `audit/direct-refresh-source-health/${now.toISOString().replaceAll(":", "-")}/source-health-report.json`;
}

export function parseDirectRefreshSourceHealthCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshSourceHealthCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(`direct-refresh source health rejects ${foundForbidden}`);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(`unknown direct-refresh source health flag ${unknownFlag}`);
	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(
			`direct-refresh source health requires ${bareAllowedFlag}=...`,
		);
	const sourceValues = parseListFlagValue(
		getOptionalSingleFlag(argv, "--source"),
	);
	const sources =
		sourceValues.length > 0 ? sourceValues : DIRECT_REFRESH_HEALTH_SOURCES;
	const validSources = new Set(DIRECT_REFRESH_HEALTH_SOURCES);
	const invalidSource = sources.find(
		(source) => !validSources.has(source as never),
	);
	if (invalidSource)
		throw new Error(
			`direct-refresh source health rejects source ${invalidSource}`,
		);
	const freshnessTargetPercent = parsePercentFlag(
		argv,
		"--freshness-target-percent",
		95,
	);
	const failUnderRaw = getOptionalSingleFlag(
		argv,
		"--fail-under-freshness-percent",
	);
	const failUnderFreshnessPercent =
		failUnderRaw === null
			? null
			: parsePercentFlag(argv, "--fail-under-freshness-percent", 0);
	return {
		sources: sources as DirectRefreshHealthSourceSlug[],
		freshnessTargetPercent,
		failUnderFreshnessPercent,
		capacityReport: getOptionalSingleFlag(argv, "--capacity-report"),
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshSourceHealthOutput(now),
	};
}

function parsePercentFlag(argv: string[], flagName: string, fallback: number) {
	const parsed = parseNumberFlag(argv, flagName, fallback);
	if (parsed < 0 || parsed > 100) {
		throw new Error(`requires ${flagName}=... to be between 0 and 100`);
	}
	return parsed;
}

export function createDirectRefreshSourceHealthRepository(): DirectRefreshSourceHealthRepository {
	return {
		async listSources(sourceSlugs) {
			const rows = await db.supermarket.findMany({
				where: { slug: { in: sourceSlugs } },
				select: {
					id: true,
					slug: true,
					name: true,
					base_url: true,
					is_active: true,
					is_vtex: true,
					freshness_sla_hours: true,
				},
			});
			return rows.map((row) => ({
				id: row.id,
				slug: row.slug,
				displayName: row.name,
				baseUrl: row.base_url,
				isActive: row.is_active,
				isVtex: row.is_vtex,
				freshnessSlaHours: row.freshness_sla_hours,
			}));
		},
		async listRows(sourceSlugs) {
			const rows = await db.supermarketProduct.findMany({
				where: { supermarket: { slug: { in: sourceSlugs } } },
				select: {
					product_ean: true,
					price: true,
					is_available: true,
					last_checked_at: true,
					product: { select: { name: true } },
					supermarket: { select: { slug: true } },
				},
			});
			return rows.map((row) => ({
				sourceSlug: row.supermarket.slug,
				productEan: row.product_ean,
				productName: row.product.name,
				price: decimalToNumber(row.price),
				isAvailable: row.is_available,
				lastCheckedAt: dateToIso(row.last_checked_at),
			}));
		},
		async getStagingState() {
			const [runningRuns, pendingStagingRows] = await Promise.all([
				db.ingestionRun.count({ where: { status: "RUNNING" } }),
				db.stagingProduct.count({ where: { status: "PENDING" } }),
			]);
			return { runningRuns, pendingStagingRows };
		},
	};
}

async function readCapacityReport(
	path: string | null,
): Promise<DirectRefreshSourceHealthCapacityReport | null> {
	if (!path) return null;
	return JSON.parse(
		await readFile(path, "utf8"),
	) as DirectRefreshSourceHealthCapacityReport;
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh source health audit to ${output}\n`,
	);
}

async function main() {
	const options = parseDirectRefreshSourceHealthCliOptions();
	const capacityReport = await readCapacityReport(options.capacityReport);
	const report = await buildDirectRefreshSourceHealthReport({
		repository: createDirectRefreshSourceHealthRepository(),
		sources: options.sources,
		freshnessTargetPercent: options.freshnessTargetPercent,
		failUnderFreshnessPercent: options.failUnderFreshnessPercent,
		capacityReport,
		capacityReportPath: options.capacityReport,
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
