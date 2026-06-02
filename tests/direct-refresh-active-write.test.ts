import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	CARREFOUR_ACTIVE_WRITE_CONFIRMATION,
	CARREFOUR_ACTIVE_WRITE_LOCK_KEY,
	DISCO_ACTIVE_WRITE_CONFIRMATION,
	DISCO_ACTIVE_WRITE_LOCK_KEY,
	VEA_ACTIVE_WRITE_CONFIRMATION,
	VEA_ACTIVE_WRITE_LOCK_KEY,
	assertFreshPrewriteRerunMatches,
	executeCarrefourActiveWrite,
	executeDiscoActiveWrite,
	executeVeaActiveWrite,
	parseCarrefourActiveWriteCliOptions,
	parseDiscoActiveWriteCliOptions,
	parseVeaActiveWriteCliOptions,
	validatePrewriteReportForActiveWrite,
	type ActiveWriteRepository,
	type ActiveWriteTransaction,
} from "../scripts/pipeline/direct-refresh-active-write";
import {
	buildCarrefourDirectRefreshPrewriteGate,
	buildDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteExistingRow,
} from "../scripts/pipeline/direct-refresh-prewrite-gate";

function rows(): DirectRefreshPrewriteExistingRow[] {
	return Array.from({ length: 10 }, (_, index) => {
		const n = index + 1;
		return {
			id: String(n),
			sourceSlug: "carrefour",
			supermarketId: 4,
			ean: `77900000000${n.toString().padStart(2, "0")}`,
			skuId: `sku-${n}`,
			sellerId: "1",
			productUrl: `https://www.carrefour.com.ar/p-${n}/p`,
			lastCheckedAt: "2026-05-01T00:00:00.000Z",
			price: 1000,
			listPrice: 1000,
			referencePrice: null,
			referenceUnit: null,
			isAvailable: true,
			product: {
				ean: `77900000000${n.toString().padStart(2, "0")}`,
				name: `Producto ${n}`,
				brand: "Vieja",
				description: null,
				imageUrl: null,
				images: [],
				category: "Test",
			},
			latestPriceHistory: {
				id: n,
				supermarketProductId: n,
				price: 1000,
				listPrice: 1000,
				scrapedAt: "2026-05-01T00:00:00.000Z",
			},
		};
	});
}
function repository(existingRows = rows()) {
	return {
		async getSource() {
			return {
				id: 4,
				slug: "carrefour",
				baseUrl: "https://www.carrefour.com.ar",
			};
		},
		async listOldestPublicRankableRows() {
			return existingRows;
		},
		async findRowsBySourceSku(_sourceSlug: string, skuId: string) {
			return existingRows.filter((row) => row.skuId === skuId);
		},
		async getMaxPriceHistoryId() {
			return 99;
		},
	};
}
async function prewrite(now = "2026-06-01T00:00:00.000Z") {
	return buildCarrefourDirectRefreshPrewriteGate({
		repository: repository(),
		now: new Date(now),
		fetchDirectProducts: async (_sourceSlug, lookup) => {
			const row = rows().find((entry) => entry.skuId === lookup.value);
			return [
				{
					ean: row?.ean ?? "",
					name: `${row?.product?.name} Nuevo`,
					brand: "Nueva",
					description: "Nueva",
					imageUrl: "https://www.carrefour.com.ar/new.jpg",
					images: ["https://www.carrefour.com.ar/new.jpg"],
					category: "Test",
					skuId: lookup.value,
					sellerId: "1",
					productUrl: row?.productUrl ?? null,
					price: 1100,
					listPrice: 1100,
					referencePrice: null,
					referenceUnit: null,
					isAvailable: true,
				},
			];
		},
	});
}
function argv(
	report: Awaited<ReturnType<typeof prewrite>>,
	extra: string[] = [],
) {
	return [
		"node",
		"script",
		"--source=carrefour",
		"--count=10",
		"--prewrite-report=prewrite.json",
		`--prewrite-report-hash=${report.futureConfirmation.shape.reportHash}`,
		`--row-ids=${report.futureConfirmation.shape.rowIds.join(",")}`,
		`--product-eans=${report.futureConfirmation.shape.productEans.join(",")}`,
		`--sku-ids=${report.futureConfirmation.shape.skuIds.join(",")}`,
		`--confirm-write=${CARREFOUR_ACTIVE_WRITE_CONFIRMATION}`,
		"--output=write.json",
		...extra,
	];
}
function veaRows(): DirectRefreshPrewriteExistingRow[] {
	return rows().map((row) => ({
		...row,
		sourceSlug: "vea",
		supermarketId: 3,
		productUrl: row.productUrl?.replace("carrefour.com.ar", "vea.com.ar") ?? null,
	}));
}
function veaRepository(existingRows = veaRows()) {
	return {
		async getSource() {
			return {
				id: 3,
				slug: "vea",
				baseUrl: "https://www.vea.com.ar",
			};
		},
		async listOldestPublicRankableRows() {
			return existingRows;
		},
		async findRowsBySourceSku(_sourceSlug: string, skuId: string) {
			return existingRows.filter((row) => row.skuId === skuId);
		},
		async getMaxPriceHistoryId() {
			return 99;
		},
	};
}
async function veaPrewrite(now = "2026-06-01T00:00:00.000Z") {
	return buildDirectRefreshPrewriteGate({
		repository: veaRepository(),
		sourceSlug: "vea",
		now: new Date(now),
		fetchDirectProducts: async (_sourceSlug, lookup) => {
			const row = veaRows().find((entry) => entry.skuId === lookup.value);
			return [
				{
					ean: row?.ean ?? "",
					name: `${row?.product?.name} Nuevo`,
					brand: "Nueva",
					description: "Nueva",
					imageUrl: "https://www.vea.com.ar/new.jpg",
					images: ["https://www.vea.com.ar/new.jpg"],
					category: "Test",
					skuId: lookup.value,
					sellerId: "1",
					productUrl: row?.productUrl ?? null,
					price: 1100,
					listPrice: 1100,
					referencePrice: null,
					referenceUnit: null,
					isAvailable: true,
				},
			];
		},
	});
}
function veaArgv(
	report: Awaited<ReturnType<typeof veaPrewrite>>,
	extra: string[] = [],
) {
	return [
		"node",
		"script",
		"--source=vea",
		"--count=10",
		"--prewrite-report=vea-prewrite.json",
		`--prewrite-report-hash=${report.futureConfirmation.shape.reportHash}`,
		`--row-ids=${report.futureConfirmation.shape.rowIds.join(",")}`,
		`--product-eans=${report.futureConfirmation.shape.productEans.join(",")}`,
		`--sku-ids=${report.futureConfirmation.shape.skuIds.join(",")}`,
		`--confirm-write=${VEA_ACTIVE_WRITE_CONFIRMATION}`,
		"--output=vea-write.json",
		...extra,
	];
}
function discoRows(): DirectRefreshPrewriteExistingRow[] {
	return rows().map((row) => ({
		...row,
		sourceSlug: "disco",
		supermarketId: 1,
		productUrl: row.productUrl?.replace("carrefour.com.ar", "disco.com.ar") ?? null,
	}));
}
function discoRepository(existingRows = discoRows()) {
	return {
		async getSource() {
			return {
				id: 1,
				slug: "disco",
				baseUrl: "https://www.disco.com.ar",
			};
		},
		async listOldestPublicRankableRows() {
			return existingRows;
		},
		async findRowsBySourceSku(_sourceSlug: string, skuId: string) {
			return existingRows.filter((row) => row.skuId === skuId);
		},
		async getMaxPriceHistoryId() {
			return 99;
		},
	};
}
async function discoPrewrite(now = "2026-06-01T00:00:00.000Z") {
	return buildDirectRefreshPrewriteGate({
		repository: discoRepository(),
		sourceSlug: "disco",
		now: new Date(now),
		fetchDirectProducts: async (_sourceSlug, lookup) => {
			const row = discoRows().find((entry) => entry.skuId === lookup.value);
			return [
				{
					ean: row?.ean ?? "",
					name: `${row?.product?.name} Nuevo`,
					brand: "Nueva",
					description: "Nueva",
					imageUrl: "https://www.disco.com.ar/new.jpg",
					images: ["https://www.disco.com.ar/new.jpg"],
					category: "Test",
					skuId: lookup.value,
					sellerId: "1",
					productUrl: row?.productUrl ?? null,
					price: 1100,
					listPrice: 1100,
					referencePrice: null,
					referenceUnit: null,
					isAvailable: true,
				},
			];
		},
	});
}
function discoArgv(
	report: Awaited<ReturnType<typeof discoPrewrite>>,
	extra: string[] = [],
) {
	return [
		"node",
		"script",
		"--source=disco",
		"--count=10",
		"--prewrite-report=disco-prewrite.json",
		`--prewrite-report-hash=${report.futureConfirmation.shape.reportHash}`,
		`--row-ids=${report.futureConfirmation.shape.rowIds.join(",")}`,
		`--product-eans=${report.futureConfirmation.shape.productEans.join(",")}`,
		`--sku-ids=${report.futureConfirmation.shape.skuIds.join(",")}`,
		`--confirm-write=${DISCO_ACTIVE_WRITE_CONFIRMATION}`,
		"--output=disco-write.json",
		...extra,
	];
}

function tx(overrides: Partial<ActiveWriteTransaction> = {}) {
	const base: ActiveWriteTransaction = {
		async acquireAdvisoryLock() {
			return true;
		},
		async readNoCreateCounts() {
			return {
				productCount: 100,
				supermarketProductCount: 200,
				priceHistoryMaxId: 99,
			};
		},
		async readSelectedRowsByExactIdentity(_sourceSlug, identities) {
			return identities.map((identity) => ({
				rowId: identity.rowId,
				productEan: identity.productEan,
				skuId: identity.skuId,
				product: {
					ean: identity.productEan,
					name: "Producto",
					brand: "Vieja",
					description: null,
					imageUrl: null,
					images: [],
					category: "Test",
				},
				supermarketProduct: {
					id: Number(identity.rowId),
					productEan: identity.productEan,
					supermarketId: 4,
					price: 1000,
					listPrice: 1000,
					referencePrice: null,
					referenceUnit: null,
					isAvailable: true,
					skuId: identity.skuId,
					sellerId: "1",
					productUrl: "https://www.carrefour.com.ar/p/p",
					productUrlHost: "carrefour.com.ar",
					lastCheckedAt: "2026-05-01T00:00:00.000Z",
				},
				latestPriceHistory: null,
			}));
		},
		async updateProductByEan() {
			return 1;
		},
		async updateSupermarketProductByExactIdentity() {
			return 1;
		},
		async insertPriceHistory(rowId) {
			return Number(rowId) + 1000;
		},
	};
	return { ...base, ...overrides };
}
function repo(transaction: ActiveWriteTransaction): ActiveWriteRepository {
	return {
		async withTransaction(fn) {
			return fn(transaction);
		},
	};
}

describe("Carrefour active refresh writer contract", () => {
	it("parses exact confirmation flags and rejects unsafe shapes", async () => {
		const report = await prewrite();
		const parsed = parseCarrefourActiveWriteCliOptions(argv(report));
		assert.equal(parsed.source, "carrefour");
		assert.equal(parsed.count, 10);
		assert.deepEqual(parsed.rowIds, report.futureConfirmation.shape.rowIds);
		for (const bad of [
			["--source=dia"],
			["--count=9"],
			["--dry-run"],
			["--cron=true"],
			["--stage"],
			["--unknown=true"],
			["--confirm-write=nope"],
		]) {
			assert.throws(
				() => parseCarrefourActiveWriteCliOptions(argv(report, bad)),
				/carrefour|count|rejects|confirmation|exactly one|unknown/,
			);
		}
	});

	it("validates PASS/fresh/exact 10 prewrite reports and confirmation", async () => {
		const report = await prewrite();
		const options = parseCarrefourActiveWriteCliOptions(argv(report));
		assert.doesNotThrow(() =>
			validatePrewriteReportForActiveWrite(
				report,
				options,
				new Date("2026-06-01T00:10:00.000Z"),
			),
		);
		assert.throws(
			() =>
				validatePrewriteReportForActiveWrite(
					{ ...report, status: "FAIL" },
					options,
					new Date("2026-06-01T00:10:00.000Z"),
				),
			/PASS/,
		);
		assert.throws(
			() =>
				validatePrewriteReportForActiveWrite(
					report,
					options,
					new Date("2026-06-01T00:16:00.000Z"),
				),
			/stale/,
		);
		assert.throws(
			() =>
				validatePrewriteReportForActiveWrite(
					report,
					{ ...options, rowIds: [...options.rowIds].reverse() },
					new Date("2026-06-01T00:10:00.000Z"),
				),
			/row ids/,
		);
	});

	it("blocks transaction when fresh prewrite rerun drifts", async () => {
		const report = await prewrite();
		const drift = await prewrite("2026-06-01T00:01:00.000Z");
		const options = parseCarrefourActiveWriteCliOptions(argv(report));
		assert.throws(
			() => assertFreshPrewriteRerunMatches(report, drift, options),
			/hash drift|hash mismatch/,
		);
	});

	it("executes selected-row-only transaction and emits write report schema", async () => {
		const report = await prewrite();
		const options = parseCarrefourActiveWriteCliOptions(argv(report));
		let lockKey = 0;
		let historyInserts = 0;
		const writeReport = await executeCarrefourActiveWrite({
			repository: repo(
				tx({
					async acquireAdvisoryLock(key) {
						lockKey = key;
						return true;
					},
					async insertPriceHistory(rowId) {
						historyInserts += 1;
						return Number(rowId) + 1000;
					},
				}),
			),
			prewriteReport: report,
			options,
			startedAt: new Date(report.generatedAt),
		});
		assert.equal(lockKey, CARREFOUR_ACTIVE_WRITE_LOCK_KEY);
		assert.equal(writeReport.report, "carrefour-direct-refresh-active-write");
		assert.equal(writeReport.issue, 45);
		assert.equal(writeReport.umbrellaIssue, 44);
		assert.equal(writeReport.summary.rows, 10);
		assert.equal(writeReport.summary.priceHistoryInserted, historyInserts);
		assert.equal(writeReport.noCreate.productDelta, 0);
		assert.equal(writeReport.rows.length, 10);
	});

	it("fails closed when lock, selected rows, update counts, or no-create assertions fail", async () => {
		const report = await prewrite();
		const options = parseCarrefourActiveWriteCliOptions(argv(report));
		const startedAt = new Date(report.generatedAt);
		await assert.rejects(
			() =>
				executeCarrefourActiveWrite({
					repository: repo(
						tx({
							async acquireAdvisoryLock() {
								return false;
							},
						}),
					),
					prewriteReport: report,
					options,
					startedAt,
				}),
			/lock/,
		);
		await assert.rejects(
			() =>
				executeCarrefourActiveWrite({
					repository: repo(
						tx({
							async readSelectedRowsByExactIdentity() {
								return [];
							},
						}),
					),
					prewriteReport: report,
					options,
					startedAt,
				}),
			/missing/,
		);
		await assert.rejects(
			() =>
				executeCarrefourActiveWrite({
					repository: repo(
						tx({
							async updateProductByEan() {
								return 0;
							},
						}),
					),
					prewriteReport: report,
					options,
					startedAt,
				}),
			/product update count/,
		);
		let countCalls = 0;
		await assert.rejects(
			() =>
				executeCarrefourActiveWrite({
					repository: repo(
						tx({
							async readNoCreateCounts() {
								countCalls += 1;
								return countCalls === 1
									? {
											productCount: 100,
											supermarketProductCount: 200,
											priceHistoryMaxId: 99,
										}
									: {
											productCount: 101,
											supermarketProductCount: 200,
											priceHistoryMaxId: 99,
										};
							},
						}),
					),
					prewriteReport: report,
					options,
					startedAt,
				}),
			/no-create/,
		);
	});

	it("parses exact Vea confirmation flags and rejects other sources", async () => {
		const report = await veaPrewrite();
		const parsed = parseVeaActiveWriteCliOptions(veaArgv(report));
		assert.equal(parsed.source, "vea");
		assert.equal(parsed.confirmWrite, VEA_ACTIVE_WRITE_CONFIRMATION);
		assert.deepEqual(parsed.rowIds, report.futureConfirmation.shape.rowIds);
		for (const bad of [
			["--source=carrefour"],
			["--count=9"],
			["--dry-run"],
			["--all-source"],
			["--cron=true"],
			["--confirm-write=carrefour-direct-refresh-count10"],
		]) {
			assert.throws(
				() => parseVeaActiveWriteCliOptions(veaArgv(report, bad)),
				/vea|count|rejects|confirmation|unknown|exactly one/,
			);
		}
	});

	it("executes Vea selected-row-only transaction and emits source report schema", async () => {
		const report = await veaPrewrite();
		const options = parseVeaActiveWriteCliOptions(veaArgv(report));
		let lockKey = 0;
		let selectedSource = "";
		let updatedSource = "";
		const writeReport = await executeVeaActiveWrite({
			repository: repo(
				tx({
					async acquireAdvisoryLock(key) {
						lockKey = key;
						return true;
					},
					async readSelectedRowsByExactIdentity(sourceSlug, identities) {
						selectedSource = sourceSlug;
						return tx().readSelectedRowsByExactIdentity(sourceSlug, identities);
					},
					async updateSupermarketProductByExactIdentity(
						sourceSlug,
						rowId,
						productEan,
						skuId,
						changes,
					) {
						updatedSource = sourceSlug;
						return tx().updateSupermarketProductByExactIdentity(
							sourceSlug,
							rowId,
							productEan,
							skuId,
							changes,
						);
					},
				}),
			),
			prewriteReport: report,
			options,
			startedAt: new Date(report.generatedAt),
		});
		assert.equal(lockKey, VEA_ACTIVE_WRITE_LOCK_KEY);
		assert.equal(selectedSource, "vea");
		assert.equal(updatedSource, "vea");
		assert.equal(writeReport.report, "vea-direct-refresh-active-write");
		assert.equal(writeReport.issue, 54);
		assert.equal(writeReport.umbrellaIssue, undefined);
		assert.equal(writeReport.source.slug, "vea");
		assert.equal(writeReport.source.expectedHost, "vea.com.ar");
		assert.equal(writeReport.summary.rows, 10);
		assert.equal(writeReport.noCreate.productDelta, 0);
	});

	it("parses exact Disco confirmation flags and rejects other sources", async () => {
		const report = await discoPrewrite();
		const parsed = parseDiscoActiveWriteCliOptions(discoArgv(report));
		assert.equal(parsed.source, "disco");
		assert.equal(parsed.confirmWrite, DISCO_ACTIVE_WRITE_CONFIRMATION);
		assert.deepEqual(parsed.rowIds, report.futureConfirmation.shape.rowIds);
		for (const bad of [
			["--source=carrefour"],
			["--source=vea"],
			["--count=9"],
			["--dry-run"],
			["--all-source"],
			["--cron=true"],
			["--confirm-write=vea-direct-refresh-count10"],
		]) {
			assert.throws(
				() => parseDiscoActiveWriteCliOptions(discoArgv(report, bad)),
				/disco|count|rejects|confirmation|unknown|exactly one/,
			);
		}
	});

	it("executes Disco selected-row-only transaction and emits source report schema", async () => {
		const report = await discoPrewrite();
		const options = parseDiscoActiveWriteCliOptions(discoArgv(report));
		let lockKey = 0;
		let selectedSource = "";
		let updatedSource = "";
		const writeReport = await executeDiscoActiveWrite({
			repository: repo(
				tx({
					async acquireAdvisoryLock(key) {
						lockKey = key;
						return true;
					},
					async readSelectedRowsByExactIdentity(sourceSlug, identities) {
						selectedSource = sourceSlug;
						return tx().readSelectedRowsByExactIdentity(sourceSlug, identities);
					},
					async updateSupermarketProductByExactIdentity(
						sourceSlug,
						rowId,
						productEan,
						skuId,
						changes,
					) {
						updatedSource = sourceSlug;
						return tx().updateSupermarketProductByExactIdentity(
							sourceSlug,
							rowId,
							productEan,
							skuId,
							changes,
						);
					},
				}),
			),
			prewriteReport: report,
			options,
			startedAt: new Date(report.generatedAt),
		});
		assert.equal(lockKey, DISCO_ACTIVE_WRITE_LOCK_KEY);
		assert.equal(selectedSource, "disco");
		assert.equal(updatedSource, "disco");
		assert.equal(writeReport.report, "disco-direct-refresh-active-write");
		assert.equal(writeReport.issue, 61);
		assert.equal(writeReport.umbrellaIssue, undefined);
		assert.equal(writeReport.source.slug, "disco");
		assert.equal(writeReport.source.expectedHost, "disco.com.ar");
		assert.equal(writeReport.summary.rows, 10);
		assert.equal(writeReport.noCreate.productDelta, 0);
	});
});
