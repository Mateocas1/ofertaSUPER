import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildDirectRefreshDiscoveryCreatePostwriteAudit,
	type DirectRefreshDiscoveryCreatePostwriteRepository,
} from "../scripts/pipeline/direct-refresh-discovery-postwrite-audit";
import type {
	DirectRefreshDiscoveryCreateApplyReport,
	DirectRefreshDiscoveryCreatePrewriteReport,
} from "../scripts/pipeline/direct-refresh-discovery-create-gate";

const prewriteGeneratedAt = "2026-06-06T10:00:00.000Z";
const applyGeneratedAt = "2026-06-06T10:02:00.000Z";
const auditNow = new Date("2026-06-06T10:03:00.000Z");

function sourceRowPrewrite(
	overrides: Partial<DirectRefreshDiscoveryCreatePrewriteReport> = {},
): DirectRefreshDiscoveryCreatePrewriteReport {
	return {
		schemaVersion: 1,
		gate: "direct-refresh-discovery-create-prewrite",
		status: "PASS",
		issue: 185,
		generatedAt: prewriteGeneratedAt,
		filters: { source: "vea", term: "leche", count: 1, scanCount: 5 },
		exactConfirmation:
			"direct-refresh-discovery-create issue=185 source=vea count=1 keys=discovery:vea:111:sku-111",
		summary: {
			selectedKeys: ["discovery:vea:111:sku-111"],
			productCreatesPlanned: 0,
			supermarketProductCreatesPlanned: 1,
			priceHistoryCreatesPlanned: 1,
			failClosedReasons: [],
		},
		plannedCreates: [
			{
				idempotencyKey: "discovery:vea:111:sku-111",
				classification: "source-row-discovery",
				product: {
					ean: "111",
					name: "Leche 111",
					brand: "Marca",
					description: "Leche entera",
					imageUrl: "https://www.vea.com.ar/111.jpg",
					images: ["https://www.vea.com.ar/111.jpg"],
					category: "Lacteos",
				},
				supermarketProduct: {
					productEan: "111",
					supermarketId: 7,
					price: 100,
					listPrice: 120,
					referencePrice: 100,
					referenceUnit: "lt",
					isAvailable: true,
					skuId: "sku-111",
					sellerId: "seller",
					productUrl: "https://www.vea.com.ar/product/111",
					lastCheckedAt: prewriteGeneratedAt,
				},
				priceHistory: { price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt },
				rollbackPreview: {
					deleteCreatedProduct: false,
					deleteCreatedSupermarketProduct: true,
					deleteCreatedPriceHistory: true,
				},
			},
		],
		...overrides,
	};
}

function applyReport(
	overrides: Partial<DirectRefreshDiscoveryCreateApplyReport> = {},
): DirectRefreshDiscoveryCreateApplyReport {
	return {
		schemaVersion: 1,
		gate: "direct-refresh-discovery-create-apply",
		status: "PASS",
		issue: 185,
		generatedAt: applyGeneratedAt,
		prewriteGeneratedAt,
		summary: {
			productsCreated: 0,
			supermarketProductsCreated: 1,
			priceHistoryCreated: 1,
			failClosedReasons: [],
		},
		appliedCreates: [
			{
				idempotencyKey: "discovery:vea:111:sku-111",
				productEan: "111",
				supermarketProductId: 901,
				priceHistoryId: 1001,
			},
		],
		...overrides,
	};
}

function productAndSourcePrewrite(): DirectRefreshDiscoveryCreatePrewriteReport {
	const base = sourceRowPrewrite();
	return {
		...base,
		exactConfirmation:
			"direct-refresh-discovery-create issue=185 source=vea count=1 keys=discovery:vea:222:sku-222",
		summary: {
			selectedKeys: ["discovery:vea:222:sku-222"],
			productCreatesPlanned: 1,
			supermarketProductCreatesPlanned: 1,
			priceHistoryCreatesPlanned: 1,
			failClosedReasons: [],
		},
		plannedCreates: [
			{
				...base.plannedCreates[0],
				idempotencyKey: "discovery:vea:222:sku-222",
				classification: "product-and-source-discovery",
				product: {
					...base.plannedCreates[0].product,
					ean: "222",
					name: "Leche 222",
					imageUrl: "https://www.vea.com.ar/222.jpg",
					images: ["https://www.vea.com.ar/222.jpg"],
				},
				supermarketProduct: {
					...base.plannedCreates[0].supermarketProduct,
					productEan: "222",
					skuId: "sku-222",
					productUrl: "https://www.vea.com.ar/product/222",
				},
				rollbackPreview: {
					deleteCreatedProduct: true,
					deleteCreatedSupermarketProduct: true,
					deleteCreatedPriceHistory: true,
				},
			},
		],
	};
}

function repository(
	overrides: Partial<DirectRefreshDiscoveryCreatePostwriteRepository> = {},
): DirectRefreshDiscoveryCreatePostwriteRepository {
	return {
		getProductsByEan: async () => [
			{
				ean: "222",
				name: "Leche 222",
				brand: "Marca",
				description: "Leche entera",
				category: "Lacteos",
				imageUrl: "https://www.vea.com.ar/222.jpg",
				images: ["https://www.vea.com.ar/222.jpg"],
			},
		],
		getSupermarketProductsByIds: async () => [
			{
				id: 901,
				productEan: "111",
				supermarketId: 7,
				skuId: "sku-111",
				price: 100,
				listPrice: 120,
				referencePrice: 100,
				referenceUnit: "lt",
				isAvailable: true,
				sellerId: "seller",
				productUrl: "https://www.vea.com.ar/product/111",
				lastCheckedAt: prewriteGeneratedAt,
			},
		],
		getSupermarketProductsBySourceEanPairs: async () => [
			{
				id: 901,
				productEan: "111",
				supermarketId: 7,
				skuId: "sku-111",
				price: 100,
				listPrice: 120,
				referencePrice: 100,
				referenceUnit: "lt",
				isAvailable: true,
				sellerId: "seller",
				productUrl: "https://www.vea.com.ar/product/111",
				lastCheckedAt: prewriteGeneratedAt,
			},
		],
		getPriceHistoryRowsByIds: async () => [
			{
				id: 1001,
				supermarketProductId: 901,
				price: 100,
				listPrice: 120,
				scrapedAt: prewriteGeneratedAt,
			},
		],
		getPriceHistoryRowsForSupermarketProductsSince: async () => [
			{
				id: 1001,
				supermarketProductId: 901,
				price: 100,
				listPrice: 120,
				scrapedAt: prewriteGeneratedAt,
			},
		],
		...overrides,
	};
}

describe("direct-refresh discovery create postwrite audit contract", () => {
	it("fails closed when prewrite and apply artifacts describe different attempts", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport({
				issue: 999,
				prewriteGeneratedAt: "2026-06-06T09:59:00.000Z",
			}),
			repository: repository(),
			now: auditNow,
		});

		assert.equal(report.schemaVersion, 1);
		assert.equal(report.audit, "direct-refresh-discovery-create-postwrite");
		assert.equal(report.status, "FAIL");
		assert.equal(report.issue, 185);
		assert.equal(report.source, "vea");
		assert.equal(report.count, 1);
		assert.deepEqual(report.selectedKeys, ["discovery:vea:111:sku-111"]);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/apply issue must match prewrite issue/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/apply prewriteGeneratedAt must match prewrite generatedAt/,
		);
		assert.deepEqual(report.rollbackPlan, {
			deletePriceHistoryIds: [],
			deleteSupermarketProductIds: [],
			deleteProductEans: [],
		});
	});

	it("passes when source and history rows match the apply artifact exactly", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport(),
			repository: repository(),
			now: auditNow,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.supermarketProductsFound, 1);
		assert.equal(report.summary.priceHistoryFound, 1);
		assert.deepEqual(report.createdRows.supermarketProducts.map((row) => row.id), [901]);
		assert.deepEqual(report.createdRows.priceHistory.map((row) => row.id), [1001]);
		assert.deepEqual(report.noExtraRows, {
			products: true,
			supermarketProducts: true,
			priceHistory: true,
		});
		assert.deepEqual(report.rollbackPlan, {
			deletePriceHistoryIds: [1001],
			deleteSupermarketProductIds: [901],
			deleteProductEans: [],
		});
	});

	it("fails closed when the created source row is missing", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport(),
			repository: repository({ getSupermarketProductsByIds: async () => [] }),
			now: auditNow,
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/missing created supermarket_products id 901/,
		);
		assert.deepEqual(report.rollbackPlan.deleteSupermarketProductIds, []);
	});

	it("fails closed when extra source or price history rows exist", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport(),
			repository: repository({
				getSupermarketProductsBySourceEanPairs: async () => [
					...(await repository().getSupermarketProductsBySourceEanPairs([])),
					{
						id: 902,
						productEan: "111",
						supermarketId: 7,
						skuId: "sku-duplicate",
						price: 101,
						listPrice: 121,
						referencePrice: 101,
						referenceUnit: "lt",
						isAvailable: true,
						sellerId: "seller",
						productUrl: "https://www.vea.com.ar/product/111-duplicate",
						lastCheckedAt: applyGeneratedAt,
					},
				],
				getPriceHistoryRowsForSupermarketProductsSince: async () => [
					...(await repository().getPriceHistoryRowsForSupermarketProductsSince([], "")),
					{
						id: 1002,
						supermarketProductId: 901,
						price: 101,
						listPrice: 121,
						scrapedAt: applyGeneratedAt,
					},
				],
			}),
			now: auditNow,
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.noExtraRows.supermarketProducts, false);
		assert.equal(report.noExtraRows.priceHistory, false);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/extra supermarket_products rows for selected source\/EAN: 902/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/extra price_history rows for created source rows: 1002/,
		);
	});

	it("includes product rollback only for product-and-source discovery", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: productAndSourcePrewrite(),
			apply: applyReport({
				summary: {
					productsCreated: 1,
					supermarketProductsCreated: 1,
					priceHistoryCreated: 1,
					failClosedReasons: [],
				},
				appliedCreates: [
					{
						idempotencyKey: "discovery:vea:222:sku-222",
						productEan: "222",
						supermarketProductId: 901,
						priceHistoryId: 1001,
					},
				],
			}),
			repository: repository({
				getSupermarketProductsByIds: async () => [
					{
						...(await repository().getSupermarketProductsByIds([]))[0],
						productEan: "222",
						skuId: "sku-222",
						productUrl: "https://www.vea.com.ar/product/222",
					},
				],
				getSupermarketProductsBySourceEanPairs: async () => [
					{
						...(await repository().getSupermarketProductsBySourceEanPairs([]))[0],
						productEan: "222",
						skuId: "sku-222",
						productUrl: "https://www.vea.com.ar/product/222",
					},
				],
			}),
			now: auditNow,
		});

		assert.equal(report.status, "PASS");
		assert.deepEqual(report.createdRows.products.map((row) => row.ean), ["222"]);
		assert.deepEqual(report.rollbackPlan.deleteProductEans, ["222"]);
	});

	it("fails closed when persisted product fields differ from the prewrite plan", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: productAndSourcePrewrite(),
			apply: applyReport({
				appliedCreates: [
					{
						idempotencyKey: "discovery:vea:222:sku-222",
						productEan: "222",
						supermarketProductId: 901,
						priceHistoryId: 1001,
					},
				],
			}),
			repository: repository({
				getProductsByEan: async () => [
					{
						ean: "222",
						name: "Leche 222",
						brand: "Marca",
						description: "Descripcion distinta",
						category: "Lacteos",
						imageUrl: "https://www.vea.com.ar/222.jpg",
						images: ["https://www.vea.com.ar/222-alt.jpg"],
					},
				],
			}),
			now: auditNow,
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/product ean 222 description mismatch/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/product ean 222 images mismatch/,
		);
		assert.deepEqual(report.rollbackPlan.deleteProductEans, []);
	});

	it("fails closed when persisted source fields differ from the prewrite plan", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport(),
			repository: repository({
				getSupermarketProductsByIds: async () => [
					{
						...(await repository().getSupermarketProductsByIds([]))[0],
						referencePrice: 101,
						referenceUnit: "kg",
						isAvailable: false,
						sellerId: "other-seller",
					},
				],
			}),
			now: auditNow,
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/supermarket_products id 901 referencePrice mismatch/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/supermarket_products id 901 referenceUnit mismatch/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/supermarket_products id 901 isAvailable mismatch/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/supermarket_products id 901 sellerId mismatch/,
		);
	});
});
