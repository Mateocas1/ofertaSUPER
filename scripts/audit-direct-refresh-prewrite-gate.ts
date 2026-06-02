import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import {
	buildDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteRepository,
} from "./pipeline/direct-refresh-prewrite-gate";
import {
	dateToIso,
	decimalToNumber,
	getOptionalSingleFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

type SupportedPrewriteSource = "carrefour" | "vea";

const DEFAULT_SOURCE = "carrefour" as const;
const SUPPORTED_SOURCES = new Set<SupportedPrewriteSource>([
	"carrefour",
	"vea",
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
	output: string | null;
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
			"direct-refresh pre-write gate only accepts --source=carrefour or --source=vea",
		);
	}
	return {
		source: sources[0] as SupportedPrewriteSource,
		sampleSize: parsePositiveIntegerFlag(argv, "--sample-size", 10),
		output: getOptionalSingleFlag(argv, "--output"),
	};
}

export function createDirectRefreshPrewriteRepository(): DirectRefreshPrewriteRepository {
	const mapRows = (
		rows: Array<{
			id: number;
			product_ean: string;
			sku_id: string | null;
			seller_id: string | null;
			product_url: string | null;
			last_checked_at: Date | string | null;
			price: { toString(): string } | number | null;
			list_price: { toString(): string } | number | null;
			reference_price: { toString(): string } | number | null;
			reference_unit: string | null;
			is_available: boolean;
			supermarket_id: number;
			supermarket: { slug: string };
			product: {
				ean: string;
				name: string;
				brand: string | null;
				description: string | null;
				image_url: string | null;
				images: string[];
				category: string | null;
			} | null;
			price_history: Array<{
				id: number;
				supermarket_product_id: number;
				price: { toString(): string } | number | null;
				list_price: { toString(): string } | number | null;
				scraped_at: Date | string | null;
			}>;
		}>,
	) =>
		rows.map((row) => ({
			id: String(row.id),
			sourceSlug: row.supermarket.slug,
			supermarketId: row.supermarket_id,
			ean: row.product_ean,
			skuId: row.sku_id,
			sellerId: row.seller_id,
			productUrl: row.product_url,
			lastCheckedAt: dateToIso(row.last_checked_at),
			price: decimalToNumber(row.price),
			listPrice: decimalToNumber(row.list_price),
			referencePrice: decimalToNumber(row.reference_price),
			referenceUnit: row.reference_unit,
			isAvailable: row.is_available,
			product: row.product
				? {
						ean: row.product.ean,
						name: row.product.name,
						brand: row.product.brand,
						description: row.product.description,
						imageUrl: row.product.image_url,
						images: row.product.images,
						category: row.product.category,
					}
				: null,
			latestPriceHistory: row.price_history[0]
				? {
						id: row.price_history[0].id,
						supermarketProductId: row.price_history[0].supermarket_product_id,
						price: decimalToNumber(row.price_history[0].price),
						listPrice: decimalToNumber(row.price_history[0].list_price),
						scrapedAt: dateToIso(row.price_history[0].scraped_at),
					}
				: null,
		}));

	const rowSelect = {
		id: true,
		product_ean: true,
		sku_id: true,
		seller_id: true,
		product_url: true,
		last_checked_at: true,
		price: true,
		list_price: true,
		reference_price: true,
		reference_unit: true,
		is_available: true,
		supermarket_id: true,
		supermarket: { select: { slug: true } },
		product: {
			select: {
				ean: true,
				name: true,
				brand: true,
				description: true,
				image_url: true,
				images: true,
				category: true,
			},
		},
		price_history: {
			orderBy: { scraped_at: "desc" as const },
			take: 1,
			select: {
				id: true,
				supermarket_product_id: true,
				price: true,
				list_price: true,
				scraped_at: true,
			},
		},
	};

	return {
		async getSource(sourceSlug) {
			const source = await db.supermarket.findFirst({
				where: { slug: sourceSlug, is_active: true, is_vtex: true },
				select: { id: true, slug: true, base_url: true },
			});
			return source
				? { id: source.id, slug: source.slug, baseUrl: source.base_url }
				: null;
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
				orderBy: [{ last_checked_at: "asc" }, { id: "asc" }],
				take: sampleSize,
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
		async getMaxPriceHistoryId() {
			const aggregate = await db.priceHistory.aggregate({
				_max: { id: true },
			});
			return aggregate._max.id;
		},
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) return process.stdout.write(serialized);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh pre-write gate to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshPrewriteGateCliOptions();
	const report = await buildDirectRefreshPrewriteGate({
		repository: createDirectRefreshPrewriteRepository(),
		sourceSlug: options.source,
		sampleSize: options.sampleSize,
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
