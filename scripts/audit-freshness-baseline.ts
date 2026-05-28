import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import {
	buildFreshnessBaselineReport,
	type FreshnessBaselineRepository,
} from "./pipeline/freshness-baseline";
import {
	dateToIso,
	decimalToNumber,
	getOptionalSingleFlag,
	parseNumberFlag,
	parseOptionalListFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

type CliOptions = {
	sources: string[];
	sampleSize: number;
	targetPercent: number;
	failUnderPercent: number | null;
	output: string | null;
};

function rejectWriteFlags(argv: string[]) {
	const forbidden = [
		"--confirm-write",
		"--active",
		"--write",
		"--reconcile",
		"--purge-cache",
	];
	const found = argv.find((entry) =>
		forbidden.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);

	if (found) {
		throw new Error(
			`freshness baseline audit is read-only and rejects ${found}`,
		);
	}
}

export function parseFreshnessBaselineCliOptions(
	argv = process.argv,
): CliOptions {
	rejectWriteFlags(argv);

	return {
		sources: parseOptionalListFlag(argv, "--source"),
		sampleSize: parsePositiveIntegerFlag(argv, "--sample-size", 10),
		targetPercent: parseNumberFlag(argv, "--target-percent", 95),
		failUnderPercent:
			getOptionalSingleFlag(argv, "--fail-under") === null
				? null
				: parseNumberFlag(argv, "--fail-under", 0),
		output: getOptionalSingleFlag(argv, "--output"),
	};
}

function createPrismaFreshnessBaselineRepository(): FreshnessBaselineRepository {
	return {
		async listSources(slugs) {
			const rows = await db.supermarket.findMany({
				where: {
					is_active: true,
					is_vtex: true,
					slug: slugs && slugs.length > 0 ? { in: slugs } : undefined,
				},
				orderBy: { slug: "asc" },
				select: {
					id: true,
					slug: true,
					name: true,
					freshness_sla_hours: true,
				},
			});

			return rows.map((row) => ({
				id: row.id,
				slug: row.slug,
				name: row.name,
				freshnessSlaHours: row.freshness_sla_hours,
			}));
		},
		async listRows(sourceSlugs) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					supermarket: {
						slug: { in: sourceSlugs },
					},
				},
				select: {
					product_ean: true,
					price: true,
					is_available: true,
					last_checked_at: true,
					supermarket: {
						select: { slug: true },
					},
					product: {
						select: { name: true },
					},
				},
			});

			return rows.map((row) => ({
				productEan: row.product_ean,
				productName: row.product.name,
				sourceSlug: row.supermarket.slug,
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

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;

	if (!output) {
		process.stdout.write(serialized);
		return;
	}

	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote freshness baseline audit to ${output}\n`);
}

async function main() {
	const options = parseFreshnessBaselineCliOptions();
	const report = await buildFreshnessBaselineReport({
		repository: createPrismaFreshnessBaselineRepository(),
		sourceSlugs: options.sources,
		sampleSize: options.sampleSize,
		targetPercent: options.targetPercent,
		failUnderPercent: options.failUnderPercent,
	});

	await writeJson(options.output, report);

	if (report.status === "FAIL") {
		process.exitCode = 1;
	}
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
