import { db } from "../../src/lib/db";

import { dateToIso, decimalToNumber } from "./audit-utils";
import type { DirectRefreshPrewriteRepository } from "./direct-refresh-prewrite-gate";

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
