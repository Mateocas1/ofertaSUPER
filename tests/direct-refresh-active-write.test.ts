import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	CARREFOUR_ACTIVE_WRITE_CONFIRMATION,
	CARREFOUR_ACTIVE_WRITE_LOCK_KEY,
	DISCO_ACTIVE_WRITE_CONFIRMATION,
	DISCO_ACTIVE_WRITE_LOCK_KEY,
	JUMBO_ACTIVE_WRITE_CONFIRMATION,
	JUMBO_ACTIVE_WRITE_LOCK_KEY,
	MAS_ACTIVE_WRITE_CONFIRMATION,
	MAS_ACTIVE_WRITE_LOCK_KEY,
	VEA_ACTIVE_WRITE_CONFIRMATION,
	VEA_ACTIVE_WRITE_LOCK_KEY,
	assertFreshPrewriteRerunMatches,
	executeCarrefourActiveWrite,
	executeDiscoActiveWrite,
	executeJumboActiveWrite,
	executeMasActiveWrite,
	executeVeaActiveWrite,
	parseCarrefourActiveWriteCliOptions,
	parseDiscoActiveWriteCliOptions,
	parseJumboActiveWriteCliOptions,
	parseMasActiveWriteCliOptions,
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

function rows(count = 10): DirectRefreshPrewriteExistingRow[] {
	return Array.from({ length: count }, (_, index) => {
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
async function prewrite(
	now = "2026-06-01T00:00:00.000Z",
	count = 10,
	candidateScanSize = count,
) {
	const existingRows = rows(candidateScanSize);
	return buildCarrefourDirectRefreshPrewriteGate({
		repository: repository(existingRows),
		sampleSize: count,
		candidateScanSize,
		now: new Date(now),
		fetchDirectProducts: async (_sourceSlug, lookup) => {
			const row = existingRows.find((entry) => entry.skuId === lookup.value);
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
	count = report.selection.requestedSampleSize,
) {
	return [
		"node",
		"script",
		"--source=carrefour",
		`--count=${count}`,
		"--prewrite-report=prewrite.json",
		`--prewrite-report-hash=${report.futureConfirmation.shape.reportHash}`,
		`--row-ids=${report.futureConfirmation.shape.rowIds.join(",")}`,
		`--product-eans=${report.futureConfirmation.shape.productEans.join(",")}`,
		`--sku-ids=${report.futureConfirmation.shape.skuIds.join(",")}`,
		`--confirm-write=carrefour-direct-refresh-count${count}`,
		"--output=write.json",
		...extra,
	];
}
function veaRows(): DirectRefreshPrewriteExistingRow[] {
	return rows().map((row) => ({
		...row,
		sourceSlug: "vea",
		supermarketId: 3,
		productUrl:
			row.productUrl?.replace("carrefour.com.ar", "vea.com.ar") ?? null,
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
		productUrl:
			row.productUrl?.replace("carrefour.com.ar", "disco.com.ar") ?? null,
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
function jumboRows(): DirectRefreshPrewriteExistingRow[] {
	return rows().map((row) => ({
		...row,
		sourceSlug: "jumbo",
		supermarketId: 2,
		productUrl:
			row.productUrl?.replace("carrefour.com.ar", "jumbo.com.ar") ?? null,
	}));
}
function jumboRepository(existingRows = jumboRows()) {
	return {
		async getSource() {
			return {
				id: 2,
				slug: "jumbo",
				baseUrl: "https://www.jumbo.com.ar",
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
async function jumboPrewrite(now = "2026-06-01T00:00:00.000Z") {
	return buildDirectRefreshPrewriteGate({
		repository: jumboRepository(),
		sourceSlug: "jumbo",
		now: new Date(now),
		fetchDirectProducts: async (_sourceSlug, lookup) => {
			const row = jumboRows().find((entry) => entry.skuId === lookup.value);
			return [
				{
					ean: row?.ean ?? "",
					name: `${row?.product?.name} Nuevo`,
					brand: "Nueva",
					description: "Nueva",
					imageUrl: "https://www.jumbo.com.ar/new.jpg",
					images: ["https://www.jumbo.com.ar/new.jpg"],
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
function jumboArgv(
	report: Awaited<ReturnType<typeof jumboPrewrite>>,
	extra: string[] = [],
) {
	return [
		"node",
		"script",
		"--source=jumbo",
		"--count=10",
		"--prewrite-report=jumbo-prewrite.json",
		`--prewrite-report-hash=${report.futureConfirmation.shape.reportHash}`,
		`--row-ids=${report.futureConfirmation.shape.rowIds.join(",")}`,
		`--product-eans=${report.futureConfirmation.shape.productEans.join(",")}`,
		`--sku-ids=${report.futureConfirmation.shape.skuIds.join(",")}`,
		`--confirm-write=${JUMBO_ACTIVE_WRITE_CONFIRMATION}`,
		"--output=jumbo-write.json",
		...extra,
	];
}
function masRows(): DirectRefreshPrewriteExistingRow[] {
	return rows().map((row) => ({
		...row,
		sourceSlug: "mas",
		supermarketId: 6,
		productUrl:
			row.productUrl?.replace("carrefour.com.ar", "masonline.com.ar") ?? null,
	}));
}
function masRepository(existingRows = masRows()) {
	return {
		async getSource() {
			return {
				id: 6,
				slug: "mas",
				baseUrl: "https://www.masonline.com.ar",
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
async function masPrewrite(now = "2026-06-01T00:00:00.000Z") {
	return buildDirectRefreshPrewriteGate({
		repository: masRepository(),
		sourceSlug: "mas",
		now: new Date(now),
		fetchDirectProducts: async (_sourceSlug, lookup) => {
			const row = masRows().find((entry) => entry.skuId === lookup.value);
			return [
				{
					ean: row?.ean ?? "",
					name: `${row?.product?.name} Nuevo`,
					brand: "Nueva",
					description: "Nueva",
					imageUrl: "https://www.masonline.com.ar/new.jpg",
					images: ["https://www.masonline.com.ar/new.jpg"],
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
function masArgv(
	report: Awaited<ReturnType<typeof masPrewrite>>,
	extra: string[] = [],
) {
	return [
		"node",
		"script",
		"--source=mas",
		"--count=10",
		"--prewrite-report=mas-prewrite.json",
		`--prewrite-report-hash=${report.futureConfirmation.shape.reportHash}`,
		`--row-ids=${report.futureConfirmation.shape.rowIds.join(",")}`,
		`--product-eans=${report.futureConfirmation.shape.productEans.join(",")}`,
		`--sku-ids=${report.futureConfirmation.shape.skuIds.join(",")}`,
		`--confirm-write=${MAS_ACTIVE_WRITE_CONFIRMATION}`,
		"--output=mas-write.json",
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
		assert.equal(parsed.confirmWrite, CARREFOUR_ACTIVE_WRITE_CONFIRMATION);
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

	it("parses count=25 with count-specific confirmation and rejects invalid counts", async () => {
		const report = await prewrite("2026-06-01T00:00:00.000Z", 25);
		const parsed = parseCarrefourActiveWriteCliOptions(argv(report));
		assert.equal(parsed.count, 25);
		assert.equal(parsed.confirmWrite, "carrefour-direct-refresh-count25");
		assert.equal(parsed.rowIds.length, 25);
		const wrongConfirmation = argv(report).map((entry) =>
			entry.startsWith("--confirm-write=")
				? "--confirm-write=carrefour-direct-refresh-count10"
				: entry,
		);
		assert.throws(
			() => parseCarrefourActiveWriteCliOptions(wrongConfirmation),
			/confirmation/,
		);
		for (const count of [9, 100]) {
			const invalidArgv = argv(report).map((entry) =>
				entry.startsWith("--count=") ? `--count=${count}` : entry,
			);
			assert.throws(
				() => parseCarrefourActiveWriteCliOptions(invalidArgv),
				/count/,
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

	it("executes count=25 selected-row-only transaction and emits variable count report", async () => {
		const report = await prewrite("2026-06-01T00:00:00.000Z", 25);
		const options = parseCarrefourActiveWriteCliOptions(argv(report));
		let selectedIdentityCount = 0;
		const writeReport = await executeCarrefourActiveWrite({
			repository: repo(
				tx({
					async readSelectedRowsByExactIdentity(sourceSlug, identities) {
						selectedIdentityCount = identities.length;
						return tx().readSelectedRowsByExactIdentity(sourceSlug, identities);
					},
				}),
			),
			prewriteReport: report,
			options,
			startedAt: new Date(report.generatedAt),
		});

		assert.equal(selectedIdentityCount, 25);
		assert.equal(writeReport.count, 25);
		assert.equal(writeReport.summary.rows, 25);
		assert.equal(writeReport.rows.length, 25);
		assert.equal(writeReport.confirmation.rowIds.length, 25);
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

	it("parses exact Jumbo confirmation flags and rejects other sources", async () => {
		const report = await jumboPrewrite();
		const parsed = parseJumboActiveWriteCliOptions(jumboArgv(report));
		assert.equal(parsed.source, "jumbo");
		assert.equal(parsed.confirmWrite, JUMBO_ACTIVE_WRITE_CONFIRMATION);
		assert.deepEqual(parsed.rowIds, report.futureConfirmation.shape.rowIds);
		for (const bad of [
			["--source=carrefour"],
			["--source=vea"],
			["--source=disco"],
			["--count=9"],
			["--dry-run"],
			["--all-source"],
			["--cron=true"],
			["--confirm-write=disco-direct-refresh-count10"],
		]) {
			assert.throws(
				() => parseJumboActiveWriteCliOptions(jumboArgv(report, bad)),
				/jumbo|count|rejects|confirmation|unknown|exactly one/,
			);
		}
	});

	it("executes Jumbo selected-row-only transaction and emits source report schema", async () => {
		const report = await jumboPrewrite();
		const options = parseJumboActiveWriteCliOptions(jumboArgv(report));
		let lockKey = 0;
		let selectedSource = "";
		let updatedSource = "";
		const writeReport = await executeJumboActiveWrite({
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
		assert.equal(lockKey, JUMBO_ACTIVE_WRITE_LOCK_KEY);
		assert.equal(selectedSource, "jumbo");
		assert.equal(updatedSource, "jumbo");
		assert.equal(writeReport.report, "jumbo-direct-refresh-active-write");
		assert.equal(writeReport.issue, 68);
		assert.equal(writeReport.umbrellaIssue, undefined);
		assert.equal(writeReport.source.slug, "jumbo");
		assert.equal(writeReport.source.expectedHost, "jumbo.com.ar");
		assert.equal(writeReport.summary.rows, 10);
		assert.equal(writeReport.noCreate.productDelta, 0);
	});

	it("parses exact MAS confirmation flags and rejects other sources", async () => {
		const report = await masPrewrite();
		const parsed = parseMasActiveWriteCliOptions(masArgv(report));
		assert.equal(parsed.source, "mas");
		assert.equal(parsed.confirmWrite, MAS_ACTIVE_WRITE_CONFIRMATION);
		assert.deepEqual(parsed.rowIds, report.futureConfirmation.shape.rowIds);
		for (const bad of [
			["--source=carrefour"],
			["--source=vea"],
			["--source=disco"],
			["--source=jumbo"],
			["--count=9"],
			["--dry-run"],
			["--all-source"],
			["--cron=true"],
			["--confirm-write=jumbo-direct-refresh-count10"],
		]) {
			assert.throws(
				() => parseMasActiveWriteCliOptions(masArgv(report, bad)),
				/mas|MAS|count|rejects|confirmation|unknown|exactly one/,
			);
		}
	});

	it("validates MAS prewrite reports fail closed until fresh PASS evidence exists", async () => {
		const report = await masPrewrite();
		const options = parseMasActiveWriteCliOptions(masArgv(report));
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
					{ ...options, productEans: [...options.productEans].reverse() },
					new Date("2026-06-01T00:10:00.000Z"),
				),
			/product EANs/,
		);
	});

	it("executes MAS selected-row-only transaction and emits source report schema", async () => {
		const report = await masPrewrite();
		const options = parseMasActiveWriteCliOptions(masArgv(report));
		let lockKey = 0;
		let selectedSource = "";
		let updatedSource = "";
		const writeReport = await executeMasActiveWrite({
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
		assert.equal(lockKey, MAS_ACTIVE_WRITE_LOCK_KEY);
		assert.equal(selectedSource, "mas");
		assert.equal(updatedSource, "mas");
		assert.equal(writeReport.report, "mas-direct-refresh-active-write");
		assert.equal(writeReport.issue, 75);
		assert.equal(writeReport.umbrellaIssue, 73);
		assert.equal(writeReport.source.slug, "mas");
		assert.equal(writeReport.source.expectedHost, "masonline.com.ar");
		assert.equal(writeReport.summary.rows, 10);
		assert.equal(writeReport.noCreate.productDelta, 0);
	});
});
