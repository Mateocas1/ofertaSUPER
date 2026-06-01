import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshPrewriteGateCliOptions } from "../scripts/audit-direct-refresh-prewrite-gate";
import {
	buildCarrefourDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteExistingRow,
} from "../scripts/pipeline/direct-refresh-prewrite-gate";

const passRow: DirectRefreshPrewriteExistingRow = {
	id: "1",
	sourceSlug: "carrefour",
	supermarketId: 10,
	ean: "7790001000011",
	skuId: "sku-1",
	sellerId: "1",
	productUrl: "https://www.carrefour.com.ar/leche-1/p",
	lastCheckedAt: "2026-05-01T00:00:00.000Z",
	price: 1000,
	listPrice: 1200,
	referencePrice: null,
	referenceUnit: null,
	isAvailable: true,
	product: {
		ean: "7790001000011",
		name: "Leche 1",
		brand: "Marca vieja",
		description: "Vieja",
		imageUrl: "https://www.carrefour.com.ar/old.jpg",
		images: ["https://www.carrefour.com.ar/old.jpg"],
		category: "Lacteos",
	},
	latestPriceHistory: {
		id: 99,
		supermarketProductId: 1,
		price: 1000,
		listPrice: 1200,
		scrapedAt: "2026-05-01T00:00:00.000Z",
	},
};

function live(
	overrides: Partial<Awaited<ReturnType<typeof liveProduct>>> = {},
) {
	return liveProduct(overrides);
}
function liveProduct(
	overrides: Partial<{
		ean: string;
		name: string;
		brand: string | null;
		description: string | null;
		imageUrl: string | null;
		images: string[];
		category: string | null;
		skuId: string | null;
		sellerId: string | null;
		productUrl: string | null;
		price: number | null;
		listPrice: number | null;
		referencePrice: number | null;
		referenceUnit: string | null;
		isAvailable: boolean;
	}> = {},
) {
	return {
		ean: "7790001000011",
		name: "Leche 1 actualizada",
		brand: "Marca nueva",
		description: "Nueva",
		imageUrl: "https://www.carrefour.com.ar/new.jpg",
		images: ["https://www.carrefour.com.ar/new.jpg"],
		category: "Lacteos",
		skuId: "sku-1",
		sellerId: "1",
		productUrl: "https://www.carrefour.com.ar/leche-1/p",
		price: 1100,
		listPrice: 1300,
		referencePrice: null,
		referenceUnit: null,
		isAvailable: true,
		...overrides,
	};
}

function repository(rows: DirectRefreshPrewriteExistingRow[]) {
	return {
		async getSource(sourceSlug: string) {
			return sourceSlug === "carrefour"
				? {
						id: 10,
						slug: "carrefour",
						baseUrl: "https://www.carrefour.com.ar",
					}
				: null;
		},
		async listOldestPublicRankableRows(sourceSlug: string, sampleSize: number) {
			return rows
				.filter((row) => row.sourceSlug === sourceSlug)
				.slice(0, sampleSize);
		},
		async findRowsBySourceSku(sourceSlug: string, skuId: string) {
			return rows.filter(
				(row) => row.sourceSlug === sourceSlug && row.skuId === skuId,
			);
		},
		async getMaxPriceHistoryId() {
			return 123;
		},
	};
}

describe("Carrefour direct refresh pre-write gate", () => {
	it("passes with expected changes, rollback snapshot, confirmation shape, and direct SKU lookup only", async () => {
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildCarrefourDirectRefreshPrewriteGate({
			repository: repository([passRow]),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [live()];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.dryRun, true);
		assert.match(report.writeBoundary, /no production writes/);
		assert.equal(report.source.slug, "carrefour");
		assert.equal(report.primitive.lookupKind, "sku-id");
		assert.equal(report.identity.model, "sourceSlug+skuId");
		assert.deepEqual(lookups, [
			{ sourceSlug: "carrefour", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.summary.passRows, 1);
		assert.equal(report.summary.failRows, 0);
		assert.equal(report.summary.expectedSupermarketProductUpdates, 1);
		assert.equal(report.summary.expectedProductUpdates, 1);
		assert.equal(report.summary.expectedPriceHistoryInserts, 1);
		assert.deepEqual(report.rollbackSnapshot.touchedProductEans, [
			"7790001000011",
		]);
		assert.deepEqual(report.rollbackSnapshot.touchedSupermarketProductIds, [1]);
		assert.equal(
			report.rollbackSnapshot.priceHistory.deleteRowsWithIdGreaterThan,
			123,
		);
		assert.equal(
			report.rollbackSnapshot.priceHistory.restoreLatestRows[0].id,
			99,
		);
		assert.equal(report.futureConfirmation.required, true);
		assert.match(report.futureConfirmation.hashSemantics, /timestamped evidence hash/);
		assert.equal(report.futureConfirmation.shape.source, "carrefour");
		assert.match(report.futureConfirmation.shape.reportHash, /^[a-f0-9]{64}$/);
		assert.deepEqual(report.futureConfirmation.shape.rowIds, ["1"]);
		assert.deepEqual(report.futureConfirmation.shape.skuIds, ["sku-1"]);
		assert.deepEqual(report.futureConfirmation.shape.productEans, [
			"7790001000011",
		]);
		assert.equal(report.rows[0].guards.status, "PASS");
		assert.equal(report.rows[0].guards.positiveLivePrice, true);
		assert.equal(report.rows[0].guards.priceDeltaWithinLimit, true);
		assert.equal(report.rows[0].action, "would-refresh-existing-row");
		assert.match(
			report.rows[0].rollbackSnapshotFields.join("\n"),
			/supermarketProduct.price/,
		);
		assert.match(
			report.rows[0].expectedChanges.product
				.map((change) => change.field)
				.join(","),
			/name/,
		);
		assert.match(
			report.rows[0].expectedChanges.supermarketProduct
				.map((change) => change.field)
				.join(","),
			/price/,
		);
	});

	it("rejects non-Carrefour scope before repository or network work", async () => {
		await assert.rejects(
			() =>
				buildCarrefourDirectRefreshPrewriteGate({
					sourceSlug: "dia",
					repository: {
						async getSource() {
							throw new Error("repository should not be called");
						},
						async listOldestPublicRankableRows() {
							throw new Error("repository should not be called");
						},
						async findRowsBySourceSku() {
							throw new Error("repository should not be called");
						},
						async getMaxPriceHistoryId() {
							throw new Error("repository should not be called");
						},
					},
					fetchDirectProducts: async () => {
						throw new Error("network should not be called");
					},
				}),
			/restricted to source=carrefour/,
		);
	});

	it("fails closed when no rows are selected", async () => {
		const report = await buildCarrefourDirectRefreshPrewriteGate({
			repository: repository([]),
			fetchDirectProducts: async () => [],
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.selection.selectedRows, 0);
		assert.deepEqual(report.summary.failClosedReasons, ["no rows selected"]);
	});

	it("fails closed for identity, lookup, host, price, and snapshot violations", async () => {
		const duplicateA = { ...passRow, id: "duplicate-a", skuId: "dup" };
		const duplicateB = { ...passRow, id: "duplicate-b", skuId: "dup" };
		const rows: DirectRefreshPrewriteExistingRow[] = [
			{ ...passRow, id: "missing-ean", ean: "" },
			{ ...passRow, id: "missing-sku", skuId: null },
			{
				...passRow,
				id: "missing-product",
				skuId: "missing-product",
				product: null,
			},
			duplicateA,
			duplicateB,
			{ ...passRow, id: "zero", skuId: "zero" },
			{ ...passRow, id: "many", skuId: "many" },
			{ ...passRow, id: "ean-mismatch", skuId: "ean-mismatch" },
			{ ...passRow, id: "sku-mismatch", skuId: "sku-mismatch" },
			{ ...passRow, id: "outside-host", skuId: "outside-host" },
			{
				...passRow,
				id: "host-drift",
				skuId: "host-drift",
				productUrl: "https://carrefour.com.ar/old/p",
			},
			{ ...passRow, id: "invalid-price", skuId: "invalid-price" },
			{ ...passRow, id: "excessive-delta", skuId: "excessive-delta" },
		];
		const report = await buildCarrefourDirectRefreshPrewriteGate({
			repository: repository(rows),
			sampleSize: rows.length,
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const base = live({ skuId: lookup.value });
				if (lookup.value === "zero") return [];
				if (lookup.value === "many")
					return [base, live({ skuId: lookup.value })];
				if (lookup.value === "ean-mismatch")
					return [live({ skuId: lookup.value, ean: "7799999999999" })];
				if (lookup.value === "sku-mismatch")
					return [live({ skuId: "changed" })];
				if (lookup.value === "outside-host")
					return [
						live({ skuId: lookup.value, productUrl: "https://example.com/p" }),
					];
				if (lookup.value === "host-drift")
					return [
						live({
							skuId: lookup.value,
							productUrl: "https://mercado.carrefour.com.ar/live/p",
						}),
					];
				if (lookup.value === "invalid-price")
					return [live({ skuId: lookup.value, price: 0 })];
				if (lookup.value === "excessive-delta")
					return [live({ skuId: lookup.value, price: 4000, listPrice: 4000 })];
				return [base];
			},
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.equal(report.summary.passRows, 0);
		assert.equal(report.summary.failRows, rows.length);
		assert.match(reasons, /lacks EAN/);
		assert.match(reasons, /lacks SKU/);
		assert.match(reasons, /product snapshot missing/);
		assert.match(reasons, /not unique/);
		assert.match(reasons, /returned 0 live products/);
		assert.match(reasons, /returned 2 live products/);
		assert.match(reasons, /EAN does not match/);
		assert.match(reasons, /SKU does not match/);
		assert.match(reasons, /host is not carrefour\.com\.ar/);
		assert.match(reasons, /host drift/);
		assert.match(reasons, /price is not positive/);
		assert.match(reasons, /price delta exceeds 200%/);
		assert.equal(
			report.rows.find((row) => row.rowId === "missing-sku")?.guards
				.directLookupCount,
			0,
		);
	});

	it("parses only Carrefour read-only CLI options", () => {
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=carrefour",
				"--sample-size=7",
				"--output=prewrite.json",
			]),
			{ source: "carrefour", sampleSize: 7, output: "prewrite.json" },
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions(["node", "script"]),
			{ source: "carrefour", sampleSize: 10, output: null },
		);
		for (const argv of [
			["node", "script", "--source=dia"],
			["node", "script", "--source=carrefour,dia"],
			["node", "script", "--confirm-write"],
			["node", "script", "--active"],
			["node", "script", "--write=true"],
			["node", "script", "--reconcile"],
			["node", "script", "--stage"],
			["node", "script", "--ingest"],
			["node", "script", "--refresh"],
			["node", "script", "--cron=true"],
			["node", "script", "--workflow"],
			["node", "script", "--cleanup"],
			["node", "script", "--deploy"],
		]) {
			assert.throws(
				() => parseDirectRefreshPrewriteGateCliOptions(argv),
				/carrefour|read-only/,
			);
		}
	});
});
