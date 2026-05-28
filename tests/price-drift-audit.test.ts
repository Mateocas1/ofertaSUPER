import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parsePriceDriftCliOptions } from "../scripts/audit-price-drift";
import {
	buildPriceDriftReport,
	type PriceDriftDbRow,
	type PriceDriftHealth,
	type PriceDriftRepository,
} from "../scripts/pipeline/price-drift";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const fixedNow = new Date("2026-05-28T00:00:00.000Z");
const healthyProbe: PriceDriftHealth = {
	isHealthy: true,
	hashValid: true,
	errorType: null,
	responseTimeMs: 120,
	productsReturned: 2,
};

function product(
	overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
	return {
		ean: "1111111111111",
		name: "Leche entera 1L",
		brand: "Marca",
		description: "Leche entera",
		imageUrl: null,
		images: [],
		category: "Lacteos",
		skuId: "sku-1",
		sellerId: "1",
		productUrl: "https://example.com/leche/p",
		price: 1200,
		listPrice: 1200,
		referencePrice: null,
		referenceUnit: null,
		isAvailable: true,
		...overrides,
	};
}

function createRepository(
	rows: PriceDriftDbRow[] = [
		{
			ean: "1111111111111",
			productName: "Leche entera 1L",
			supermarketProductId: 1,
			price: 1000,
			listPrice: 1000,
			lastCheckedAt: "2026-05-27T00:00:00.000Z",
		},
	],
): PriceDriftRepository {
	return {
		async getSource(slug) {
			return slug === "disco"
				? {
						slug,
						name: "Disco",
						baseUrl: "https://www.disco.com.ar",
						isActive: true,
					}
				: null;
		},
		async getRows(_sourceSlug, eans) {
			return rows.filter((row) => eans.includes(row.ean));
		},
	};
}

describe("price drift audit", () => {
	it("builds WARN for medium drift and PASS for unchanged live/db prices", async () => {
		const warn = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product({ price: 1600 })],
			warnDeltaPercent: 50,
			stopDeltaPercent: 200,
			now: fixedNow,
		});

		assert.equal(warn.status, "WARN");
		assert.equal(warn.summary.warnRows, 1);
		assert.equal(warn.summary.maxAbsDeltaPercent, 60);

		const pass = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product({ price: 1000, listPrice: 1000 })],
			now: fixedNow,
		});

		assert.equal(pass.status, "PASS");
		assert.equal(pass.rows[0]?.drift.classification, "unchanged");
	});

	it("omits probe secret fields from the builder report", async () => {
		const report = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () =>
				({ ...healthyProbe, hash: "SECRET_HASH" }) as PriceDriftHealth & {
					hash: string;
				},
			fetchProducts: async () => [product({ price: 1000, listPrice: 1000 })],
			now: fixedNow,
		});

		assert.equal("hash" in report.health, false);
		assert.deepEqual(Object.keys(report.health).sort(), [
			"errorType",
			"hashValid",
			"isHealthy",
			"productsReturned",
			"responseTimeMs",
		]);
	});

	it("fails for stop deltas, unhealthy probes, invalid prices, or expected EAN mismatch", async () => {
		const stop = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product({ price: 4000 })],
			now: fixedNow,
		});
		assert.equal(stop.status, "FAIL");
		assert.equal(stop.summary.stopRows, 1);

		const unhealthy = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => ({
				...healthyProbe,
				isHealthy: false,
				hashValid: false,
				errorType: "hash_invalid",
			}),
			fetchProducts: async () => [product({ price: 1000 })],
			now: fixedNow,
		});
		assert.equal(unhealthy.status, "FAIL");

		const invalid = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product({ price: 0 })],
			now: fixedNow,
		});
		assert.equal(invalid.status, "FAIL");
		assert.equal(invalid.summary.invalidLivePrices, 1);

		const mismatch = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product({ price: 1000 })],
			expectedEans: ["2222222222222"],
			now: fixedNow,
		});
		assert.equal(mismatch.status, "FAIL");
		assert.deepEqual(mismatch.expectedEans?.missing, ["2222222222222"]);

		const duplicateExpected = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository(),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product({ price: 1000 })],
			expectedEans: ["1111111111111", "1111111111111"],
			now: fixedNow,
		});
		assert.equal(duplicateExpected.status, "FAIL");
		assert.deepEqual(duplicateExpected.expectedEans?.duplicateExpected, [
			"1111111111111",
		]);
	});

	it("reports missing products/source rows without writing", async () => {
		const missingProduct = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository([]),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product()],
			now: fixedNow,
		});

		assert.equal(missingProduct.status, "WARN");
		assert.equal(missingProduct.summary.missingProducts, 1);

		const missingSourceRow = await buildPriceDriftReport({
			source: "disco",
			terms: ["leche"],
			count: 1,
			repository: createRepository([
				{
					ean: "1111111111111",
					productName: "Leche entera 1L",
					supermarketProductId: null,
					price: null,
					listPrice: null,
					lastCheckedAt: null,
				},
			]),
			probeHealth: async () => healthyProbe,
			fetchProducts: async () => [product()],
			now: fixedNow,
		});

		assert.equal(missingSourceRow.status, "WARN");
		assert.equal(missingSourceRow.summary.missingSourceRows, 1);
	});

	it("parses CLI safety flags and refuses broad or write-shaped usage", () => {
		assert.deepEqual(
			parsePriceDriftCliOptions([
				"node",
				"script",
				"--source=disco",
				"--terms=leche,yerba",
				"--count=2",
				"--expected-eans=111,222",
				"--output=audit/drift.json",
			]),
			{
				source: "disco",
				terms: ["leche", "yerba"],
				count: 2,
				expectedEans: ["111", "222"],
				warnDeltaPercent: 50,
				stopDeltaPercent: 200,
				output: "audit/drift.json",
			},
		);

		assert.throws(
			() =>
				parsePriceDriftCliOptions([
					"node",
					"script",
					"--source=disco,dia",
					"--terms=leche",
				]),
			/exactly one/,
		);
		assert.throws(
			() =>
				parsePriceDriftCliOptions([
					"node",
					"script",
					"--source=disco",
					"--terms=leche",
					"--count=51",
				]),
			/refuses/,
		);
		assert.throws(
			() =>
				parsePriceDriftCliOptions([
					"node",
					"script",
					"--source=disco",
					"--terms=leche",
					"--confirm-write",
				]),
			/read-only/,
		);
	});

	it("has package scripts wired and no DB-write primitives in audit files", () => {
		const packageJson = readFileSync("package.json", "utf8");
		assert.match(
			packageJson,
			/"audit:price-drift": "tsx scripts\/audit-price-drift\.ts"/,
		);

		for (const filePath of [
			"scripts/audit-price-drift.ts",
			"scripts/pipeline/price-drift.ts",
		]) {
			const source = readFileSync(filePath, "utf8");
			assert.doesNotMatch(
				source,
				/\b(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/,
			);
			assert.doesNotMatch(
				source,
				/\$executeRaw|stageSourceProducts\(|from ["'].*reconcile|setCachedJson\(|\bredis\b/i,
			);
		}
	});
});
