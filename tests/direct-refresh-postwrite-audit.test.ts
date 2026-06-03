import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshPostwriteCliOptions } from "../scripts/audit-direct-refresh-postwrite";
import type { ActiveWriteReport } from "../scripts/pipeline/direct-refresh-active-write";
import {
	buildCarrefourDirectRefreshPostwriteAudit,
	buildDirectRefreshPostwriteAudit,
	type DirectRefreshPostwriteRepository,
} from "../scripts/pipeline/direct-refresh-postwrite-audit";

const product = {
	ean: "7790001000011",
	name: "Leche nueva",
	brand: "Marca",
	description: "Nueva",
	imageUrl: "https://img/new.jpg",
	images: ["https://img/new.jpg"],
	category: "Lacteos",
};
const supermarketProduct = {
	id: 1,
	productEan: "7790001000011",
	supermarketId: 4,
	price: 1100,
	listPrice: 1300,
	referencePrice: null,
	referenceUnit: null,
	isAvailable: true,
	skuId: "sku-1",
	sellerId: "1",
	productUrl: "https://www.carrefour.com.ar/leche/p",
	productUrlHost: "carrefour.com.ar",
	lastCheckedAt: "2026-06-01T00:00:00.000Z",
};

function writeReport(
	overrides: Partial<ActiveWriteReport> = {},
	count = 10,
): ActiveWriteReport {
	const rows = Array.from({ length: count }, (_, index) => {
		const id = String(index + 1);
		const ean = `77900010000${String(index + 1).padStart(2, "0")}`;
		const sku = `sku-${index + 1}`;
		return {
			rowId: id,
			productEan: ean,
			skuId: sku,
			before: {
				product: { ...product, ean, name: "Leche vieja" },
				supermarketProduct: {
					...supermarketProduct,
					id: index + 1,
					productEan: ean,
					skuId: sku,
					price: 1000,
				},
				latestPriceHistory: {
					id: index + 1,
					supermarketProductId: index + 1,
					price: 1000,
					listPrice: 1200,
					scrapedAt: "2026-05-01T00:00:00.000Z",
				},
			},
			live: {
				...product,
				ean,
				skuId: sku,
				sellerId: "1",
				productUrl: "https://www.carrefour.com.ar/leche/p",
				price: 1100,
				listPrice: 1300,
				referencePrice: null,
				referenceUnit: null,
				isAvailable: true,
				lookupResultCount: 1,
				productUrlHost: "carrefour.com.ar",
			},
			appliedChanges: {
				product: [
					{ field: "name", before: "Leche vieja", after: product.name },
				],
				supermarketProduct: [
					{ field: "price", before: 1000, after: 1100 },
					{
						field: "lastCheckedAt",
						before: "2026-05-01T00:00:00.000Z",
						after: "2026-06-01T00:00:00.000Z",
					},
				],
			},
			insertedPriceHistoryId: index < 8 ? 101 + index : null,
		};
	});
	return {
		schemaVersion: 1,
		report: "carrefour-direct-refresh-active-write",
		status: "PASS",
		issue: 45,
		umbrellaIssue: 44,
		source: {
			slug: "carrefour",
			supermarketId: 4,
			expectedHost: "carrefour.com.ar",
		},
		count: count as ActiveWriteReport["count"],
		startedAt: "2026-06-01T00:00:00.000Z",
		committedAt: "2026-06-01T00:00:00.000Z",
		confirmation: {
			prewriteReportPath: "prewrite.json",
			prewriteGeneratedAt: "2026-06-01T00:00:00.000Z",
			prewriteReportHash: "a".repeat(64),
			rowIds: rows.map((row) => row.rowId),
			productEans: rows.map((row) => row.productEan),
			skuIds: rows.map((row) => row.skuId),
		},
		transaction: { advisoryLockKey: 44204510, acquired: true },
		noCreate: {
			before: {
				productCount: 100,
				supermarketProductCount: 200,
				priceHistoryMaxId: 100,
			},
			after: {
				productCount: 100,
				supermarketProductCount: 200,
				priceHistoryMaxId: 108,
			},
			productDelta: 0,
			supermarketProductDelta: 0,
		},
		summary: {
			rows: count as ActiveWriteReport["summary"]["rows"],
			productUpdates: count,
			supermarketProductUpdates: count,
			priceHistoryPredicted: 8,
			priceHistoryInserted: 8,
		},
		rollbackSnapshot: {
			requiresConfirmation: true,
			touchedProductEans: rows.map((row) => row.productEan),
			touchedSupermarketProductIds: rows.map((row) => Number(row.rowId)),
			priceHistory: { deleteRowsWithIdGreaterThan: 100, restoreLatestRows: [] },
		},
		rows,
		...overrides,
	};
}

function veaWriteReport(
	overrides: Partial<ActiveWriteReport> = {},
): ActiveWriteReport {
	const base = writeReport();
	const rows = base.rows.map((row) => ({
		...row,
		live: row.live
			? {
					...row.live,
					productUrl: "https://www.vea.com.ar/leche/p",
					productUrlHost: "vea.com.ar",
				}
			: row.live,
	}));
	return {
		...base,
		report: "vea-direct-refresh-active-write",
		issue: 54,
		umbrellaIssue: undefined,
		source: {
			slug: "vea",
			supermarketId: 5,
			expectedHost: "vea.com.ar",
		},
		transaction: { advisoryLockKey: 54205410, acquired: true },
		rows,
		...overrides,
	};
}

function discoWriteReport(
	overrides: Partial<ActiveWriteReport> = {},
): ActiveWriteReport {
	const base = writeReport();
	const rows = base.rows.map((row) => ({
		...row,
		live: row.live
			? {
					...row.live,
					productUrl: "https://www.disco.com.ar/leche/p",
					productUrlHost: "disco.com.ar",
				}
			: row.live,
	}));
	return {
		...base,
		report: "disco-direct-refresh-active-write",
		issue: 61,
		umbrellaIssue: undefined,
		source: {
			slug: "disco",
			supermarketId: 1,
			expectedHost: "disco.com.ar",
		},
		transaction: { advisoryLockKey: 61204510, acquired: true },
		rows,
		...overrides,
	};
}

function jumboWriteReport(
	overrides: Partial<ActiveWriteReport> = {},
): ActiveWriteReport {
	const base = writeReport();
	const rows = base.rows.map((row) => ({
		...row,
		live: row.live
			? {
					...row.live,
					productUrl: "https://www.jumbo.com.ar/leche/p",
					productUrlHost: "jumbo.com.ar",
				}
			: row.live,
	}));
	return {
		...base,
		report: "jumbo-direct-refresh-active-write",
		issue: 68,
		umbrellaIssue: undefined,
		source: {
			slug: "jumbo",
			supermarketId: 2,
			expectedHost: "jumbo.com.ar",
		},
		transaction: { advisoryLockKey: 68204510, acquired: true },
		rows,
		...overrides,
	};
}

function masWriteReport(
	overrides: Partial<ActiveWriteReport> = {},
): ActiveWriteReport {
	const base = writeReport();
	const rows = base.rows.map((row) => ({
		...row,
		live: row.live
			? {
					...row.live,
					productUrl: "https://www.masonline.com.ar/leche/p",
					productUrlHost: "masonline.com.ar",
				}
			: row.live,
	}));
	return {
		...base,
		report: "mas-direct-refresh-active-write",
		issue: 75,
		umbrellaIssue: 73,
		source: {
			slug: "mas",
			supermarketId: 6,
			expectedHost: "masonline.com.ar",
		},
		transaction: { advisoryLockKey: 75204510, acquired: true },
		rows,
		...overrides,
	};
}

function repository(
	report = writeReport(),
	overrides: Partial<DirectRefreshPostwriteRepository> = {},
): DirectRefreshPostwriteRepository {
	return {
		async readNoCreateCounts() {
			return report.noCreate.after;
		},
		async readSelectedRowsByExactIdentity(rows) {
			return rows.map((identity) => ({
				rowId: identity.rowId,
				productEan: identity.productEan,
				skuId: identity.skuId,
				product: { ...product, ean: identity.productEan },
				supermarketProduct: {
					...supermarketProduct,
					id: Number(identity.rowId),
					productEan: identity.productEan,
					skuId: identity.skuId,
				},
			}));
		},
		async readPriceHistoryRowsAboveId() {
			return report.rows
				.filter((row) => row.insertedPriceHistoryId !== null)
				.map((row) => ({
					id: row.insertedPriceHistoryId ?? 0,
					supermarketProductId: Number(row.rowId),
					price: row.live?.price ?? null,
					listPrice: row.live?.listPrice ?? null,
					scrapedAt: report.committedAt,
				}));
		},
		...overrides,
	};
}

describe("Carrefour active refresh post-write audit", () => {
	it("passes with selected rows, no-create counts, and expected history rows", async () => {
		const report = writeReport();
		const audit = await buildCarrefourDirectRefreshPostwriteAudit({
			repository: repository(report),
			writeReport: report,
			now: new Date("2026-06-01T00:05:00.000Z"),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.writeBoundary.includes("read-only"), true);
		assert.equal(audit.writeReport.source, "carrefour");
		assert.equal(audit.summary.passRows, 10);
		assert.equal(audit.summary.failRows, 0);
		assert.equal(audit.summary.priceHistoryRowsExpected, 8);
		assert.equal(audit.summary.priceHistoryRowsFound, 8);
		assert.equal(audit.noCreate.productDelta, 0);
		assert.equal(audit.noCreate.supermarketProductDelta, 0);
	});

	it("passes with count=25 and validates variable row counts", async () => {
		const report = writeReport({}, 25);
		const audit = await buildCarrefourDirectRefreshPostwriteAudit({
			repository: repository(report),
			writeReport: report,
			now: new Date("2026-06-01T00:05:00.000Z"),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.writeReport.count, 25);
		assert.equal(audit.summary.passRows, 25);
		assert.equal(audit.rows.length, 25);

		const invalidCount = await buildCarrefourDirectRefreshPostwriteAudit({
			repository: repository(writeReport({}, 25)),
			writeReport: writeReport(
				{ count: 100 as ActiveWriteReport["count"] },
				25,
			),
		});
		assert.equal(invalidCount.status, "FAIL");
		assert.match(
			invalidCount.summary.failClosedReasons.join("\n"),
			/count is not allowlisted/,
		);

		const mismatchedRows = await buildCarrefourDirectRefreshPostwriteAudit({
			repository: repository(report),
			writeReport: { ...report, summary: { ...report.summary, rows: 10 } },
		});
		assert.equal(mismatchedRows.status, "FAIL");
		assert.match(
			mismatchedRows.summary.failClosedReasons.join("\n"),
			/summary rows do not match count/,
		);
	});

	it("passes Vea audits with source-specific report metadata", async () => {
		const report = veaWriteReport();
		let historyScope: number[] = [];
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "vea",
			repository: repository(report, {
				async readPriceHistoryRowsAboveId(_maxId, supermarketProductIds) {
					historyScope = supermarketProductIds;
					return report.rows
						.filter((row) => row.insertedPriceHistoryId !== null)
						.map((row) => ({
							id: row.insertedPriceHistoryId ?? 0,
							supermarketProductId: Number(row.rowId),
							price: row.live?.price ?? null,
							listPrice: row.live?.listPrice ?? null,
							scrapedAt: report.committedAt,
						}));
				},
			}),
			writeReport: report,
			now: new Date("2026-06-01T00:05:00.000Z"),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.audit, "vea-direct-refresh-postwrite-audit");
		assert.equal(audit.writeReport.source, "vea");
		assert.equal(audit.writeReport.issue, 54);
		assert.equal(audit.writeReport.umbrellaIssue, undefined);
		assert.deepEqual(
			historyScope,
			report.rows.map((row) => Number(row.rowId)),
		);
		assert.equal(audit.summary.passRows, 10);
		assert.equal(audit.summary.failRows, 0);
	});

	it("fails closed when Vea audit receives mismatched report source metadata", async () => {
		const report = veaWriteReport({
			report: "carrefour-direct-refresh-active-write",
			issue: 45,
			umbrellaIssue: 44,
			source: {
				slug: "carrefour",
				supermarketId: 4,
				expectedHost: "carrefour.com.ar",
			},
		});
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "vea",
			repository: repository(report),
			writeReport: report,
		});

		const reasons = audit.summary.failClosedReasons.join("\n");
		assert.equal(audit.status, "FAIL");
		assert.match(reasons, /type is not Vea active write/);
		assert.match(reasons, /issue linkage mismatch/);
		assert.match(reasons, /source is not vea/);
		assert.match(reasons, /expected host is not vea\.com\.ar/);
	});

	it("passes Disco audits with source-specific report metadata", async () => {
		const report = discoWriteReport();
		let historyScope: number[] = [];
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "disco",
			repository: repository(report, {
				async readPriceHistoryRowsAboveId(_maxId, supermarketProductIds) {
					historyScope = supermarketProductIds;
					return report.rows
						.filter((row) => row.insertedPriceHistoryId !== null)
						.map((row) => ({
							id: row.insertedPriceHistoryId ?? 0,
							supermarketProductId: Number(row.rowId),
							price: row.live?.price ?? null,
							listPrice: row.live?.listPrice ?? null,
							scrapedAt: report.committedAt,
						}));
				},
			}),
			writeReport: report,
			now: new Date("2026-06-01T00:05:00.000Z"),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.audit, "disco-direct-refresh-postwrite-audit");
		assert.equal(audit.writeReport.source, "disco");
		assert.equal(audit.writeReport.issue, 61);
		assert.equal(audit.writeReport.umbrellaIssue, undefined);
		assert.deepEqual(
			historyScope,
			report.rows.map((row) => Number(row.rowId)),
		);
		assert.equal(audit.summary.passRows, 10);
		assert.equal(audit.summary.failRows, 0);
	});

	it("fails closed when Disco audit receives mismatched report source metadata", async () => {
		const report = discoWriteReport({
			report: "vea-direct-refresh-active-write",
			issue: 54,
			source: {
				slug: "vea",
				supermarketId: 5,
				expectedHost: "vea.com.ar",
			},
		});
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "disco",
			repository: repository(report),
			writeReport: report,
		});

		const reasons = audit.summary.failClosedReasons.join("\n");
		assert.equal(audit.status, "FAIL");
		assert.match(reasons, /type is not Disco active write/);
		assert.match(reasons, /issue linkage mismatch/);
		assert.match(reasons, /source is not disco/);
		assert.match(reasons, /expected host is not disco\.com\.ar/);
	});

	it("passes Jumbo audits with source-specific report metadata", async () => {
		const report = jumboWriteReport();
		let historyScope: number[] = [];
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "jumbo",
			repository: repository(report, {
				async readPriceHistoryRowsAboveId(_maxId, supermarketProductIds) {
					historyScope = supermarketProductIds;
					return report.rows
						.filter((row) => row.insertedPriceHistoryId !== null)
						.map((row) => ({
							id: row.insertedPriceHistoryId ?? 0,
							supermarketProductId: Number(row.rowId),
							price: row.live?.price ?? null,
							listPrice: row.live?.listPrice ?? null,
							scrapedAt: report.committedAt,
						}));
				},
			}),
			writeReport: report,
			now: new Date("2026-06-01T00:05:00.000Z"),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.audit, "jumbo-direct-refresh-postwrite-audit");
		assert.equal(audit.writeReport.source, "jumbo");
		assert.equal(audit.writeReport.issue, 68);
		assert.equal(audit.writeReport.umbrellaIssue, undefined);
		assert.deepEqual(
			historyScope,
			report.rows.map((row) => Number(row.rowId)),
		);
		assert.equal(audit.summary.passRows, 10);
		assert.equal(audit.summary.failRows, 0);
	});

	it("fails closed when Jumbo audit receives mismatched report source metadata", async () => {
		const report = jumboWriteReport({
			report: "disco-direct-refresh-active-write",
			issue: 61,
			source: {
				slug: "disco",
				supermarketId: 1,
				expectedHost: "disco.com.ar",
			},
		});
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "jumbo",
			repository: repository(report),
			writeReport: report,
		});

		const reasons = audit.summary.failClosedReasons.join("\n");
		assert.equal(audit.status, "FAIL");
		assert.match(reasons, /type is not Jumbo active write/);
		assert.match(reasons, /issue linkage mismatch/);
		assert.match(reasons, /source is not jumbo/);
		assert.match(reasons, /expected host is not jumbo\.com\.ar/);
	});

	it("passes MAS audits with source-specific report metadata", async () => {
		const report = masWriteReport();
		let historyScope: number[] = [];
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "mas",
			repository: repository(report, {
				async readPriceHistoryRowsAboveId(_maxId, supermarketProductIds) {
					historyScope = supermarketProductIds;
					return report.rows
						.filter((row) => row.insertedPriceHistoryId !== null)
						.map((row) => ({
							id: row.insertedPriceHistoryId ?? 0,
							supermarketProductId: Number(row.rowId),
							price: row.live?.price ?? null,
							listPrice: row.live?.listPrice ?? null,
							scrapedAt: report.committedAt,
						}));
				},
			}),
			writeReport: report,
			now: new Date("2026-06-01T00:05:00.000Z"),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.audit, "mas-direct-refresh-postwrite-audit");
		assert.equal(audit.writeReport.source, "mas");
		assert.equal(audit.writeReport.issue, 75);
		assert.equal(audit.writeReport.umbrellaIssue, 73);
		assert.deepEqual(
			historyScope,
			report.rows.map((row) => Number(row.rowId)),
		);
		assert.equal(audit.summary.passRows, 10);
		assert.equal(audit.summary.failRows, 0);
	});

	it("fails closed when MAS audit receives mismatched report source metadata", async () => {
		const report = masWriteReport({
			report: "jumbo-direct-refresh-active-write",
			issue: 68,
			umbrellaIssue: undefined,
			source: {
				slug: "jumbo",
				supermarketId: 2,
				expectedHost: "jumbo.com.ar",
			},
		});
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "mas",
			repository: repository(report),
			writeReport: report,
		});

		const reasons = audit.summary.failClosedReasons.join("\n");
		assert.equal(audit.status, "FAIL");
		assert.match(reasons, /type is not MAS active write/);
		assert.match(reasons, /issue linkage mismatch/);
		assert.match(reasons, /source is not mas/);
		assert.match(reasons, /expected host is not masonline\.com\.ar/);
	});

	it("fails closed when Jumbo confirmation or rollback references do not match rows", async () => {
		const report = jumboWriteReport({
			confirmation: {
				prewriteReportPath: "prewrite.json",
				prewriteGeneratedAt: "2026-06-01T00:00:00.000Z",
				prewriteReportHash: "not-a-hash",
				rowIds: Array.from({ length: 10 }, (_, index) => `bad-row-${index}`),
				productEans: Array.from(
					{ length: 10 },
					(_, index) => `bad-ean-${index}`,
				),
				skuIds: Array.from({ length: 10 }, (_, index) => `bad-sku-${index}`),
			},
			rollbackSnapshot: {
				requiresConfirmation: true,
				touchedProductEans: Array.from(
					{ length: 10 },
					(_, index) => `rollback-ean-${index}`,
				),
				touchedSupermarketProductIds: Array.from(
					{ length: 10 },
					(_, index) => 9000 + index,
				),
				priceHistory: {
					deleteRowsWithIdGreaterThan: 100,
					restoreLatestRows: [],
				},
			},
		});
		const audit = await buildDirectRefreshPostwriteAudit({
			source: "jumbo",
			repository: repository(report),
			writeReport: report,
		});

		const reasons = audit.summary.failClosedReasons.join("\n");
		assert.equal(audit.status, "FAIL");
		assert.match(reasons, /confirmation hash is invalid/);
		assert.match(reasons, /confirmation row ids mismatch/);
		assert.match(reasons, /confirmation product EANs mismatch/);
		assert.match(reasons, /confirmation SKU ids mismatch/);
		assert.match(reasons, /rollback snapshot product references mismatch/);
		assert.match(
			reasons,
			/rollback snapshot supermarketProduct references mismatch/,
		);
	});

	it("rejects invalid write report schema, status, source, count, and no-create deltas", async () => {
		const report = writeReport({
			schemaVersion: 2 as 1,
			status: "FAIL" as "PASS",
			source: {
				slug: "dia" as "carrefour",
				supermarketId: 4,
				expectedHost: "carrefour.com.ar",
			},
			count: 9 as 10,
			noCreate: {
				before: {
					productCount: 100,
					supermarketProductCount: 200,
					priceHistoryMaxId: 100,
				},
				after: {
					productCount: 101,
					supermarketProductCount: 201,
					priceHistoryMaxId: 108,
				},
				productDelta: 1 as 0,
				supermarketProductDelta: 1 as 0,
			},
			transaction: { advisoryLockKey: 44204510, acquired: false as true },
			rollbackSnapshot: {
				requiresConfirmation: false as true,
				touchedProductEans: [],
				touchedSupermarketProductIds: [],
				priceHistory: {
					deleteRowsWithIdGreaterThan: 100,
					restoreLatestRows: [],
				},
			},
		});
		const audit = await buildCarrefourDirectRefreshPostwriteAudit({
			repository: repository(report),
			writeReport: report,
		});

		assert.equal(audit.status, "FAIL");
		assert.match(audit.summary.failClosedReasons.join("\n"), /schema/);
		assert.match(audit.summary.failClosedReasons.join("\n"), /status/);
		assert.match(audit.summary.failClosedReasons.join("\n"), /source/);
		assert.match(audit.summary.failClosedReasons.join("\n"), /count/);
		assert.match(audit.summary.failClosedReasons.join("\n"), /deltas/);
		assert.match(audit.summary.failClosedReasons.join("\n"), /rollback/);
	});

	it("fails on DB mismatch, missing row, extra history, and inserted history value mismatch", async () => {
		const report = writeReport();
		const audit = await buildCarrefourDirectRefreshPostwriteAudit({
			repository: repository(report, {
				async readNoCreateCounts() {
					return {
						productCount: 101,
						supermarketProductCount: 200,
						priceHistoryMaxId: 109,
					};
				},
				async readSelectedRowsByExactIdentity(rows) {
					const [first, ...rest] = rows;
					return rest.map((identity) => ({
						rowId: identity.rowId,
						productEan: identity.productEan,
						skuId: identity.skuId,
						product: {
							...product,
							ean: identity.productEan,
							name: first ? "wrong" : product.name,
						},
						supermarketProduct: {
							...supermarketProduct,
							id: Number(identity.rowId),
							productEan: identity.productEan,
							skuId: identity.skuId,
							price: 999,
						},
					}));
				},
				async readPriceHistoryRowsAboveId() {
					return [
						{
							id: 101,
							supermarketProductId: 1,
							price: 999,
							listPrice: 1300,
							scrapedAt: null,
						},
						{
							id: 999,
							supermarketProductId: 999,
							price: 1,
							listPrice: 1,
							scrapedAt: null,
						},
					];
				},
			}),
			writeReport: report,
		});

		const reasons = audit.summary.failClosedReasons.join("\n");
		assert.equal(audit.status, "FAIL");
		assert.match(reasons, /selected row is missing/);
		assert.match(reasons, /product\.name/);
		assert.match(reasons, /supermarketProduct\.price/);
		assert.match(reasons, /product count/);
		assert.match(reasons, /price history row 101 price mismatch/);
		assert.match(reasons, /unexpected price history row 999/);
	});

	it("parses required read-only CLI options and rejects unsafe flags", () => {
		assert.deepEqual(
			parseDirectRefreshPostwriteCliOptions([
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
			]),
			{ source: "carrefour", writeReport: "write.json", output: "audit.json" },
		);
		assert.deepEqual(
			parseDirectRefreshPostwriteCliOptions([
				"node",
				"script",
				"--source=vea",
				"--write-report=write.json",
				"--output=audit.json",
			]),
			{ source: "vea", writeReport: "write.json", output: "audit.json" },
		);
		assert.deepEqual(
			parseDirectRefreshPostwriteCliOptions([
				"node",
				"script",
				"--source=disco",
				"--write-report=write.json",
				"--output=audit.json",
			]),
			{ source: "disco", writeReport: "write.json", output: "audit.json" },
		);
		assert.deepEqual(
			parseDirectRefreshPostwriteCliOptions([
				"node",
				"script",
				"--source=jumbo",
				"--write-report=write.json",
				"--output=audit.json",
			]),
			{ source: "jumbo", writeReport: "write.json", output: "audit.json" },
		);
		assert.deepEqual(
			parseDirectRefreshPostwriteCliOptions([
				"node",
				"script",
				"--source=mas",
				"--write-report=write.json",
				"--output=audit.json",
			]),
			{ source: "mas", writeReport: "write.json", output: "audit.json" },
		);
		for (const argv of [
			["node", "script", "--write-report=write.json"],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--source=carrefour,vea",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--source=dia",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--all-source",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--active",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--write",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--reconcile",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--stage",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--ingest",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--refresh",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--cron=true",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--workflow",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--cleanup",
			],
			[
				"node",
				"script",
				"--write-report=write.json",
				"--output=audit.json",
				"--deploy",
			],
		]) {
			assert.throws(
				() => parseDirectRefreshPostwriteCliOptions(argv),
				/post-write|expected|rejects/,
			);
		}
	});
});
