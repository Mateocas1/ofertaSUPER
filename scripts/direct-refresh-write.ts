import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Prisma } from "@prisma/client";

import { db } from "../src/lib/db";
import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import {
	DIRECT_REFRESH_ACTIVE_WRITE_TRANSACTION_OPTIONS,
	activeWriteSourceDisplayName,
	activeWriteSourceFromArgv,
	assertFreshPrewriteRerunMatches,
	executeActiveWrite,
	parseActiveWriteCliOptions,
	readActiveWriteCapacityEvidence,
	readPrewriteReport,
	type ActiveWriteCliOptions,
	type ActiveWriteRepository,
	type ActiveWriteSource,
	type ActiveWriteTransaction,
} from "./pipeline/direct-refresh-active-write";
import { createDirectRefreshPrewriteRepository } from "./pipeline/direct-refresh-prewrite-repository";
import {
	buildDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteChange,
} from "./pipeline/direct-refresh-prewrite-gate";

// Active direct-refresh writer: the single parameterized entry for the five
// supermarkets (--source carrefour|vea|disco|jumbo|mas). It re-runs the
// pre-write gate against live source data, refuses to write when the fresh
// rerun drifts from the supplied report, and commits one row-at-a-time update
// per selected offer inside a single advisory-locked transaction.

type ProductFieldApplier = (
	data: Prisma.ProductUpdateInput,
	after: unknown,
) => void;

const PRODUCT_FIELD_APPLIERS: Record<string, ProductFieldApplier> = {
	name: (data, after) => {
		data.name = String(after);
	},
	brand: (data, after) => {
		data.brand = after === null ? null : String(after);
	},
	description: (data, after) => {
		data.description = after === null ? null : String(after);
	},
	imageUrl: (data, after) => {
		data.image_url = after === null ? null : String(after);
	},
	images: (data, after) => {
		data.images = Array.isArray(after) ? after : [];
	},
	category: (data, after) => {
		data.category = after === null ? null : String(after);
	},
};

type SupermarketProductFieldApplier = (
	data: Prisma.SupermarketProductUpdateInput,
	after: unknown,
) => void;

function optionalDecimal(after: unknown) {
	return after === null ? null : new Prisma.Decimal(String(after));
}

const SUPERMARKET_PRODUCT_FIELD_APPLIERS: Record<
	string,
	SupermarketProductFieldApplier
> = {
	price: (data, after) => {
		data.price = optionalDecimal(after);
	},
	listPrice: (data, after) => {
		data.list_price = optionalDecimal(after);
	},
	referencePrice: (data, after) => {
		data.reference_price = optionalDecimal(after);
	},
	referenceUnit: (data, after) => {
		data.reference_unit = after === null ? null : String(after);
	},
	isAvailable: (data, after) => {
		data.is_available = Boolean(after);
	},
	skuId: (data, after) => {
		data.sku_id = after === null ? null : String(after);
	},
	sellerId: (data, after) => {
		data.seller_id = after === null ? null : String(after);
	},
	productUrl: (data, after) => {
		data.product_url = after === null ? null : String(after);
	},
	lastCheckedAt: (data, after) => {
		data.last_checked_at = new Date(String(after));
	},
};

function productUpdateData(
	changes: DirectRefreshPrewriteChange[],
): Prisma.ProductUpdateInput {
	const data: Prisma.ProductUpdateInput = {};
	for (const change of changes) PRODUCT_FIELD_APPLIERS[change.field]?.(data, change.after);
	return data;
}

function supermarketProductUpdateData(
	changes: DirectRefreshPrewriteChange[],
): Prisma.SupermarketProductUpdateInput {
	const data: Prisma.SupermarketProductUpdateInput = {};
	for (const change of changes)
		SUPERMARKET_PRODUCT_FIELD_APPLIERS[change.field]?.(data, change.after);
	return data;
}

function createActiveWriteRepository(): ActiveWriteRepository {
	return {
		withTransaction: (fn) =>
			db.$transaction(
				async (tx) => fn(createActiveWriteTransaction(tx)),
				DIRECT_REFRESH_ACTIVE_WRITE_TRANSACTION_OPTIONS,
			),
	};
}
function createActiveWriteTransaction(
	tx: Prisma.TransactionClient,
): ActiveWriteTransaction {
	return {
		async acquireAdvisoryLock(lockKey) {
			const rows = await tx.$queryRaw<
				Array<{ locked: boolean }>
			>`select pg_try_advisory_xact_lock(${lockKey}) as locked`;
			return rows[0]?.locked === true;
		},
		async readNoCreateCounts() {
			const [productCount, supermarketProductCount, maxHistory] =
				await Promise.all([
					tx.product.count(),
					tx.supermarketProduct.count(),
					tx.priceHistory.aggregate({ _max: { id: true } }),
				]);
			return {
				productCount,
				supermarketProductCount,
				priceHistoryMaxId: maxHistory._max.id,
			};
		},
		async readSelectedRowsByExactIdentity(sourceSlug, rows) {
			const found = await tx.supermarketProduct.findMany({
				where: {
					OR: rows.map((row) => ({
						id: Number(row.rowId),
						product_ean: row.productEan,
						sku_id: row.skuId,
						supermarket: { slug: sourceSlug },
					})),
				},
				select: {
					id: true,
					product_ean: true,
					sku_id: true,
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
						orderBy: { scraped_at: "desc" },
						take: 1,
						select: {
							id: true,
							supermarket_product_id: true,
							price: true,
							list_price: true,
							scraped_at: true,
						},
					},
					supermarket_id: true,
					price: true,
					list_price: true,
					reference_price: true,
					reference_unit: true,
					is_available: true,
					seller_id: true,
					product_url: true,
					last_checked_at: true,
				},
			});
			return found.map((row) => ({
				rowId: String(row.id),
				productEan: row.product_ean,
				skuId: row.sku_id ?? "",
				product: {
					ean: row.product.ean,
					name: row.product.name,
					brand: row.product.brand,
					description: row.product.description,
					imageUrl: row.product.image_url,
					images: row.product.images,
					category: row.product.category,
				},
				supermarketProduct: {
					id: row.id,
					productEan: row.product_ean,
					supermarketId: row.supermarket_id,
					price: row.price ? Number(row.price) : null,
					listPrice: row.list_price ? Number(row.list_price) : null,
					referencePrice: row.reference_price
						? Number(row.reference_price)
						: null,
					referenceUnit: row.reference_unit,
					isAvailable: row.is_available,
					skuId: row.sku_id,
					sellerId: row.seller_id,
					productUrl: row.product_url,
					productUrlHost: row.product_url
						? new URL(row.product_url).host.toLowerCase().replace(/^www\./, "")
						: null,
					lastCheckedAt: row.last_checked_at.toISOString(),
				},
				latestPriceHistory: row.price_history[0]
					? {
							id: row.price_history[0].id,
							supermarketProductId: row.price_history[0].supermarket_product_id,
							price: row.price_history[0].price
								? Number(row.price_history[0].price)
								: null,
							listPrice: row.price_history[0].list_price
								? Number(row.price_history[0].list_price)
								: null,
							scrapedAt: row.price_history[0].scraped_at.toISOString(),
						}
					: null,
			}));
		},
		async updateProductByEan(ean, changes) {
			const result = await tx.product.updateMany({
				where: { ean },
				data: productUpdateData(changes),
			});
			return result.count;
		},
		async updateSupermarketProductByExactIdentity(
			sourceSlug,
			rowId,
			productEan,
			skuId,
			changes,
		) {
			const result = await tx.supermarketProduct.updateMany({
				where: {
					id: Number(rowId),
					product_ean: productEan,
					sku_id: skuId,
					supermarket: { slug: sourceSlug },
				},
				data: supermarketProductUpdateData(changes),
			});
			return result.count;
		},
		async insertPriceHistory(rowId, price, listPrice, scrapedAt) {
			const row = await tx.priceHistory.create({
				data: {
					supermarket_product_id: Number(rowId),
					price: price === null ? null : new Prisma.Decimal(String(price)),
					list_price:
						listPrice === null ? null : new Prisma.Decimal(String(listPrice)),
					scraped_at: new Date(scrapedAt),
				},
			});
			return row.id;
		},
	};
}

async function writeJson(
	source: ActiveWriteSource,
	output: string,
	report: unknown,
) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(
		`Wrote ${activeWriteSourceDisplayName(source)} active refresh report to ${output}\n`,
	);
}

async function buildFreshPrewrite(
	options: ActiveWriteCliOptions,
	prewriteReport: Awaited<ReturnType<typeof readPrewriteReport>>,
) {
	const capacityEvidence = await readActiveWriteCapacityEvidence(
		options,
		prewriteReport,
	);
	return buildDirectRefreshPrewriteGate({
		repository: createDirectRefreshPrewriteRepository(),
		sourceSlug: options.source,
		sampleSize: options.count,
		candidateScanSize: prewriteReport.selection.candidateScanSize,
		now: new Date(prewriteReport.generatedAt),
		capacityEvidence,
		fetchDirectProducts: async (_sourceSlug, lookup) =>
			getSourceAdapter(options.source).fetchDirectProducts(lookup),
	});
}

async function main() {
	const options = parseActiveWriteCliOptions(
		process.argv,
		activeWriteSourceFromArgv(),
	);
	const prewriteReport = await readPrewriteReport(options.prewriteReport);
	const freshPrewriteReport = await buildFreshPrewrite(options, prewriteReport);
	assertFreshPrewriteRerunMatches(prewriteReport, freshPrewriteReport, options);
	const report = await executeActiveWrite({
		repository: createActiveWriteRepository(),
		prewriteReport: freshPrewriteReport,
		options,
	});
	await writeJson(options.source, options.output, report);
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
