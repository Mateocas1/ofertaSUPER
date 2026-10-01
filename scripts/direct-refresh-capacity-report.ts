import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import {
	buildDirectRefreshCapacityReport,
	type DirectRefreshCapacityRepository,
} from "./pipeline/direct-refresh-capacity";
import {
	dateToIso,
	decimalToNumber,
	getOptionalSingleFlag,
	parseListFlagValue,
	parseNumberFlag,
	parseOptionalListFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

const DEFAULT_SOURCES = ["carrefour", "vea", "disco", "jumbo", "mas", "dia"];
const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--reconcile",
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
	sources: string[];
	candidateScanSize: number;
	targetBatchSize: number;
	slaHours: number;
	freshnessTargetsPercent: number[];
	maxPriceDeltaPercent: number;
	issue: number;
	output: string;
};

function rejectWriteFlags(argv: string[]) {
	const found = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (found) {
		throw new Error(
			`direct-refresh capacity audit is read-only and rejects ${found}`,
		);
	}
}

export function defaultDirectRefreshCapacityOutput(now = new Date()) {
	const timestamp = now.toISOString().replace(/[:.]/g, "-");
	return `audit/operations-capacity/${timestamp}/capacity-report.json`;
}

export function parseDirectRefreshCapacityCliOptions(
	argv = process.argv,
	now = new Date(),
): CliOptions {
	rejectWriteFlags(argv);
	const sources = parseOptionalListFlag(argv, "--source");
	const candidateScanSize = parsePositiveIntegerFlag(
		argv,
		"--candidate-scan-size",
		50,
	);
	const targetBatchSize = parsePositiveIntegerFlag(
		argv,
		"--target-batch-size",
		25,
	);
	const slaHours = parseNumberFlag(argv, "--sla-hours", 24);
	if (slaHours <= 0) throw new Error("requires --sla-hours=... to be positive");
	const freshnessTargetsPercent = parseFreshnessTargets(
		getOptionalSingleFlag(argv, "--freshness-targets"),
	);
	const maxPriceDeltaPercent = parseNumberFlag(
		argv,
		"--max-price-delta-percent",
		200,
	);
	if (maxPriceDeltaPercent < 0) {
		throw new Error(
			"requires --max-price-delta-percent=... to be non-negative",
		);
	}
	const issue = parsePositiveIntegerFlag(argv, "--issue-number", 82);
	return {
		sources: sources.length > 0 ? sources : DEFAULT_SOURCES,
		candidateScanSize,
		targetBatchSize,
		slaHours,
		freshnessTargetsPercent,
		maxPriceDeltaPercent,
		issue,
		output:
			getOptionalSingleFlag(argv, "--output") ??
			defaultDirectRefreshCapacityOutput(now),
	};
}

function parseFreshnessTargets(raw: string | null) {
	const values = parseListFlagValue(raw ?? "80,95,100").map((value) =>
		Number(value),
	);
	if (
		values.length === 0 ||
		values.some((value) => !Number.isFinite(value) || value <= 0 || value > 100)
	) {
		throw new Error(
			"requires --freshness-targets=... to contain percentages between 0 and 100",
		);
	}
	return values;
}

export function createDirectRefreshCapacityRepository(): DirectRefreshCapacityRepository {
	const mapRows = (
		rows: Array<{
			id: number;
			product_ean: string;
			sku_id: string | null;
			product_url: string | null;
			last_checked_at: Date | string | null;
			price: { toString(): string } | number | null;
			list_price: { toString(): string } | number | null;
			is_available: boolean;
			supermarket_id: number;
			supermarket: { slug: string };
			product: { ean: string; name: string } | null;
		}>,
	) =>
		rows.map((row) => ({
			id: String(row.id),
			sourceSlug: row.supermarket.slug,
			supermarketId: row.supermarket_id,
			ean: row.product_ean,
			skuId: row.sku_id,
			productUrl: row.product_url,
			lastCheckedAt: dateToIso(row.last_checked_at),
			price: decimalToNumber(row.price),
			listPrice: decimalToNumber(row.list_price),
			isAvailable: row.is_available,
			product: row.product
				? { ean: row.product.ean, name: row.product.name }
				: null,
		}));

	const rowSelect = {
		id: true,
		product_ean: true,
		sku_id: true,
		product_url: true,
		last_checked_at: true,
		price: true,
		list_price: true,
		is_available: true,
		supermarket_id: true,
		supermarket: { select: { slug: true } },
		product: { select: { ean: true, name: true } },
	};

	return {
		async listSources(sourceSlugs) {
			const rows = await db.supermarket.findMany({
				where: {
					is_active: true,
					is_vtex: true,
					slug:
						sourceSlugs && sourceSlugs.length > 0
							? { in: sourceSlugs }
							: undefined,
				},
				orderBy: { slug: "asc" },
				select: {
					id: true,
					slug: true,
					name: true,
					base_url: true,
					freshness_sla_hours: true,
				},
			});
			return rows.map((row) => ({
				id: row.id,
				slug: row.slug,
				displayName: row.name,
				baseUrl: row.base_url,
				freshnessSlaHours: row.freshness_sla_hours,
			}));
		},
		async listRowsForDenominator(sourceSlug) {
			const rows = await db.supermarketProduct.findMany({
				where: { supermarket: { slug: sourceSlug } },
				select: rowSelect,
			});
			return mapRows(rows);
		},
		async listOldestPublicRankableRows(sourceSlug, limit) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					supermarket: { slug: sourceSlug },
					is_available: true,
					price: { gt: 0 },
					product_ean: { not: "" },
					product: { name: { not: "" } },
				},
				orderBy: [{ last_checked_at: "asc" }, { id: "asc" }],
				take: limit,
				select: rowSelect,
			});
			return mapRows(rows);
		},
		async findRowsBySourceSku(sourceSlug, skuId) {
			const rows = await db.supermarketProduct.findMany({
				where: { supermarket: { slug: sourceSlug }, sku_id: skuId },
				select: rowSelect,
			});
			return mapRows(rows);
		},
	};
}

async function writeJson(output: string, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh capacity audit to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshCapacityCliOptions();
	const report = await buildDirectRefreshCapacityReport({
		repository: createDirectRefreshCapacityRepository(),
		fetchDirectProducts: async (sourceSlug, lookup) => {
			const adapter = getSourceAdapter(sourceSlug);
			return adapter.fetchDirectProducts(lookup);
		},
		sourceSlugs: options.sources,
		candidateScanSize: options.candidateScanSize,
		targetBatchSize: options.targetBatchSize,
		freshnessTargetsPercent: options.freshnessTargetsPercent,
		slaHours: options.slaHours,
		maxPriceDeltaPercent: options.maxPriceDeltaPercent,
		issue: options.issue,
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
