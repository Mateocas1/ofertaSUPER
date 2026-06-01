import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import { db } from "../src/lib/db";
import {
	buildDirectRefreshFeasibilityReport,
	type DirectRefreshRepository,
} from "./pipeline/direct-refresh-feasibility";
import {
	getOptionalSingleFlag,
	parseOptionalListFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

type CliOptions = {
	sources: string[];
	sampleSize: number;
	count: number;
	output: string | null;
};

function rejectWriteFlags(argv: string[]) {
	const forbidden = [
		"--confirm-write",
		"--active",
		"--write",
		"--reconcile",
		"--schedule",
		"--cron",
		"--purge-cache",
		"--cleanup",
		"--deploy",
	];
	const found = argv.find((entry) =>
		forbidden.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);
	if (found)
		throw new Error(
			`direct-refresh feasibility audit is read-only and rejects ${found}`,
		);
}
export function parseDirectRefreshFeasibilityCliOptions(
	argv = process.argv,
): CliOptions {
	rejectWriteFlags(argv);
	return {
		sources: parseOptionalListFlag(argv, "--source"),
		sampleSize: parsePositiveIntegerFlag(argv, "--sample-size", 10),
		count: parsePositiveIntegerFlag(argv, "--count", 5),
		output: getOptionalSingleFlag(argv, "--output"),
	};
}

function createRepository(): DirectRefreshRepository {
	const mapRows = (
		rows: Array<{
			id: number;
			product_ean: string;
			sku_id: string | null;
			product_url: string | null;
			supermarket: { slug: string };
		}>,
	) =>
		rows.map((row) => ({
			id: String(row.id),
			sourceSlug: row.supermarket.slug,
			ean: row.product_ean,
			skuId: row.sku_id,
			productUrl: row.product_url,
		}));
	return {
		async listSources(slugs) {
			return db.supermarket.findMany({
				where: {
					is_active: true,
					is_vtex: true,
					slug: slugs?.length ? { in: slugs } : undefined,
				},
				orderBy: { slug: "asc" },
				select: { slug: true },
			});
		},
		async listOldestPublicRankableRows(sourceSlug, sampleSize) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					supermarket: { slug: sourceSlug },
					is_available: true,
					price: { gt: 0 },
					product_ean: { not: "" },
					product: { name: { not: "" } },
				},
				orderBy: { last_checked_at: "asc" },
				take: sampleSize,
				select: {
					id: true,
					product_ean: true,
					sku_id: true,
					product_url: true,
					supermarket: { select: { slug: true } },
				},
			});
			return mapRows(rows);
		},
		async findRowsBySourceEan(sourceSlug, ean) {
			const rows = await db.supermarketProduct.findMany({
				where: { supermarket: { slug: sourceSlug }, product_ean: ean },
				select: {
					id: true,
					product_ean: true,
					sku_id: true,
					product_url: true,
					supermarket: { select: { slug: true } },
				},
			});
			return mapRows(rows);
		},
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) return process.stdout.write(serialized);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh feasibility audit to ${output}\n`);
}
async function main() {
	const options = parseDirectRefreshFeasibilityCliOptions();
	const report = await buildDirectRefreshFeasibilityReport({
		repository: createRepository(),
		sourceSlugs: options.sources,
		sampleSize: options.sampleSize,
		fetchProducts: async (sourceSlug, lookup) => {
			if (lookup.kind !== "sku-id" && lookup.kind !== "ean") return [];
			return getSourceAdapter(sourceSlug).fetchDirectProducts(
				{ kind: lookup.kind, value: lookup.value },
				{ count: options.count },
			);
		},
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
