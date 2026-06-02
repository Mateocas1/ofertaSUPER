import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Prisma } from "@prisma/client";

import { db } from "../src/lib/db";
import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import {
	assertFreshPrewriteRerunMatches,
	executeVeaActiveWrite,
	parseVeaActiveWriteCliOptions,
	readPrewriteReport,
	type ActiveWriteRepository,
	type ActiveWriteTransaction,
	type VeaActiveWriteCliOptions,
} from "./pipeline/direct-refresh-active-write";
import { createDirectRefreshPrewriteRepository } from "./audit-direct-refresh-prewrite-gate";
import {
	buildDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteChange,
} from "./pipeline/direct-refresh-prewrite-gate";

function productUpdateData(
	changes: DirectRefreshPrewriteChange[],
): Prisma.ProductUpdateInput {
	const data: Prisma.ProductUpdateInput = {};
	for (const change of changes) {
		if (change.field === "name") data.name = String(change.after);
		if (change.field === "brand")
			data.brand = change.after === null ? null : String(change.after);
		if (change.field === "description")
			data.description = change.after === null ? null : String(change.after);
		if (change.field === "imageUrl")
			data.image_url = change.after === null ? null : String(change.after);
		if (change.field === "images")
			data.images = Array.isArray(change.after) ? change.after : [];
		if (change.field === "category")
			data.category = change.after === null ? null : String(change.after);
	}
	return data;
}
function supermarketProductUpdateData(
	changes: DirectRefreshPrewriteChange[],
): Prisma.SupermarketProductUpdateInput {
	const data: Prisma.SupermarketProductUpdateInput = {};
	for (const change of changes) {
		if (change.field === "price")
			data.price =
				change.after === null ? null : new Prisma.Decimal(String(change.after));
		if (change.field === "listPrice")
			data.list_price =
				change.after === null ? null : new Prisma.Decimal(String(change.after));
		if (change.field === "referencePrice")
			data.reference_price =
				change.after === null ? null : new Prisma.Decimal(String(change.after));
		if (change.field === "referenceUnit")
			data.reference_unit = change.after === null ? null : String(change.after);
		if (change.field === "isAvailable")
			data.is_available = Boolean(change.after);
		if (change.field === "skuId")
			data.sku_id = change.after === null ? null : String(change.after);
		if (change.field === "sellerId")
			data.seller_id = change.after === null ? null : String(change.after);
		if (change.field === "productUrl")
			data.product_url = change.after === null ? null : String(change.after);
		if (change.field === "lastCheckedAt")
			data.last_checked_at = new Date(String(change.after));
	}
	return data;
}

function createActiveWriteRepository(): ActiveWriteRepository {
	return {
		withTransaction: (fn) =>
			db.$transaction(async (tx) => fn(createActiveWriteTransaction(tx))),
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

async function writeJson(output: string, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote Vea active refresh report to ${output}\n`);
}

async function buildFreshPrewrite(
	options: VeaActiveWriteCliOptions,
	generatedAt: string,
) {
	return buildDirectRefreshPrewriteGate({
		repository: createDirectRefreshPrewriteRepository(),
		sourceSlug: options.source,
		sampleSize: options.count,
		now: new Date(generatedAt),
		fetchDirectProducts: async (_sourceSlug, lookup) =>
			getSourceAdapter("vea").fetchDirectProducts(lookup),
	});
}

async function main() {
	const options = parseVeaActiveWriteCliOptions();
	const prewriteReport = await readPrewriteReport(options.prewriteReport);
	const freshPrewriteReport = await buildFreshPrewrite(
		options,
		prewriteReport.generatedAt,
	);
	assertFreshPrewriteRerunMatches(prewriteReport, freshPrewriteReport, options);
	const report = await executeVeaActiveWrite({
		repository: createActiveWriteRepository(),
		prewriteReport: freshPrewriteReport,
		options,
	});
	await writeJson(options.output, report);
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
