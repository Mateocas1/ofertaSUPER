import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildDirectRefreshDiscoveryCreatePostwriteAudit,
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

describe("direct-refresh discovery create postwrite audit contract", () => {
	it("fails closed when prewrite and apply artifacts describe different attempts", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport({
				issue: 999,
				prewriteGeneratedAt: "2026-06-06T09:59:00.000Z",
			}),
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

	it("keeps clean artifacts fail-closed until row verification is present", async () => {
		const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
			prewrite: sourceRowPrewrite(),
			apply: applyReport(),
			now: auditNow,
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/postwrite row verification requires source and history checks/,
		);
		assert.deepEqual(report.rollbackPlan, {
			deletePriceHistoryIds: [],
			deleteSupermarketProductIds: [],
			deleteProductEans: [],
		});
	});
});
