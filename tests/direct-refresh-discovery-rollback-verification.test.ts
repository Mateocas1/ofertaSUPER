import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildDirectRefreshDiscoveryRollbackVerification,
	parseDirectRefreshDiscoveryRollbackVerificationCliOptions,
	parseDirectRefreshDiscoveryRollbackVerificationPostwriteJson,
	type DirectRefreshDiscoveryRollbackVerificationRepository,
} from "../scripts/pipeline/direct-refresh-discovery-rollback-verification";
import type { DirectRefreshDiscoveryCreatePostwriteReport } from "../scripts/pipeline/direct-refresh-discovery-postwrite-audit";

const postwrite: DirectRefreshDiscoveryCreatePostwriteReport = {
	schemaVersion: 1,
	audit: "direct-refresh-discovery-create-postwrite",
	status: "PASS",
	issue: 185,
	generatedAt: "2026-06-06T10:03:00.000Z",
	source: "vea",
	count: 1,
	selectedKeys: ["discovery:vea:111:sku-111"],
	applyGeneratedAt: "2026-06-06T10:02:00.000Z",
	prewriteGeneratedAt: "2026-06-06T10:00:00.000Z",
	summary: {
		productsExpected: 0,
		productsFound: 0,
		supermarketProductsExpected: 1,
		supermarketProductsFound: 1,
		priceHistoryExpected: 1,
		priceHistoryFound: 1,
		failClosedReasons: [],
	},
	createdRows: {
		products: [],
		supermarketProducts: [
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
				lastCheckedAt: "2026-06-06T10:00:00.000Z",
			},
		],
		priceHistory: [
			{
				id: 1001,
				supermarketProductId: 901,
				price: 100,
				listPrice: 120,
				scrapedAt: "2026-06-06T10:00:00.000Z",
			},
		],
	},
	noExtraRows: { products: true, supermarketProducts: true, priceHistory: true },
	rollbackPlan: {
		deletePriceHistoryIds: [1001],
		deleteSupermarketProductIds: [901],
		deleteProductEans: [],
	},
};

function repository(
	overrides: Partial<DirectRefreshDiscoveryRollbackVerificationRepository> = {},
): DirectRefreshDiscoveryRollbackVerificationRepository {
	return {
		getProductsByEan: async () => [],
		getSupermarketProductsByIds: async () => [],
		getPriceHistoryRowsByIds: async () => [],
		...overrides,
	};
}

describe("direct-refresh discovery rollback verification", () => {
	it("passes only when exact rollback IDs from a PASS postwrite are absent", async () => {
		const report = await buildDirectRefreshDiscoveryRollbackVerification({
			postwrite,
			repository: repository(),
			now: new Date("2026-06-06T10:10:00.000Z"),
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "direct-refresh-discovery-rollback-verification");
		assert.deepEqual(report.rollbackIds, [
			"price_history:1001",
			"supermarket_products:901",
		]);
		assert.deepEqual(report.summary.failClosedReasons, []);
	});

	it("fails closed when any exact rollback target still exists", async () => {
		const report = await buildDirectRefreshDiscoveryRollbackVerification({
			postwrite: {
				...postwrite,
				rollbackPlan: {
					...postwrite.rollbackPlan,
					deleteProductEans: ["222"],
				},
			},
			repository: repository({
				getProductsByEan: async () => [{ ean: "222" }],
				getSupermarketProductsByIds: async () => [{ id: 901 }],
				getPriceHistoryRowsByIds: async () => [{ id: 1001 }],
			}),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/product rollback target still exists: 222/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/supermarket_products rollback target still exists: 901/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/price_history rollback target still exists: 1001/,
		);
	});

	it("rejects non-PASS postwrite artifacts and empty rollback plans", async () => {
		const report = await buildDirectRefreshDiscoveryRollbackVerification({
			postwrite: {
				...postwrite,
				status: "FAIL",
				rollbackPlan: {
					deletePriceHistoryIds: [],
					deleteSupermarketProductIds: [],
					deleteProductEans: [],
				},
			},
			repository: repository(),
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.summary.failClosedReasons.join("\n"), /postwrite status must be PASS/);
		assert.match(report.summary.failClosedReasons.join("\n"), /rollback plan must include exact IDs or EANs/);
	});

	it("parses read-only CLI options and rejects write-shaped flags", () => {
		const options = parseDirectRefreshDiscoveryRollbackVerificationCliOptions([
			"node",
			"script",
			"--postwrite=postwrite.json",
			"--output=rollback-verification.json",
		]);

		assert.equal(options.postwrite, "postwrite.json");
		assert.equal(options.output, "rollback-verification.json");
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackVerificationCliOptions([
					"node",
					"script",
					"--postwrite=postwrite.json",
					"--delete",
				]),
			/rejects --delete/,
		);
	});

	it("parses postwrite JSON with an optional UTF-8 BOM", () => {
		const parsed = parseDirectRefreshDiscoveryRollbackVerificationPostwriteJson(
			`\uFEFF${JSON.stringify(postwrite)}`,
		);

		assert.equal(parsed.audit, "direct-refresh-discovery-create-postwrite");
		assert.equal(parsed.rollbackPlan.deletePriceHistoryIds[0], 1001);
	});
});
