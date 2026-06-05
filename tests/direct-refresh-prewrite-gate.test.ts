import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshPrewriteGateCliOptions } from "../scripts/audit-direct-refresh-prewrite-gate";
import {
	buildCarrefourDirectRefreshPrewriteGate,
	buildDirectRefreshPrewriteGate,
	buildPrewriteReportHash,
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

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function masLikeRows(count: number): DirectRefreshPrewriteExistingRow[] {
	return Array.from({ length: count }, (_, index) => ({
		...passRow,
		id: String(index + 1),
		sourceSlug: "mas",
		supermarketId: 50,
		ean: `77910000000${String(index + 1).padStart(2, "0")}`,
		skuId: `mas-sku-${index + 1}`,
		productUrl: "https://www.masonline.com.ar/leche-1/p",
		product: passRow.product
			? {
					...passRow.product,
					ean: `77910000000${String(index + 1).padStart(2, "0")}`,
				}
			: null,
		latestPriceHistory: passRow.latestPriceHistory
			? {
					...passRow.latestPriceHistory,
					supermarketProductId: index + 1,
				}
			: null,
	}));
}

function capacityEvidence({
	source = "vea",
	targetBatchSize = 10,
	viableRows = 10,
	recommendedBatchSize = 10,
	issue = 169,
	expectedIssueNumber = issue,
	filtersSources,
	summarySourceCount = 1,
	extraSources = [],
	writeBoundary = "read-only operating capacity audit; no production writes, no staging/ingestion runs, no scheduler/cron/workflow side effects",
	rows,
}: {
	source?: string;
	targetBatchSize?: number;
	viableRows?: number;
	recommendedBatchSize?: number;
	issue?: number;
	expectedIssueNumber?: number;
	filtersSources?: string[];
	summarySourceCount?: number;
	extraSources?: Array<{ slug: string }>;
	writeBoundary?: string;
	rows: Array<{ rowId: string; status: "PASS" | "FAIL" }>;
}) {
	const report = {
		schemaVersion: 1,
		audit: "direct-refresh-operating-capacity",
		issue,
		status: "WARN",
		generatedAt: "2026-06-05T00:00:00.000Z",
		basis: "production",
		dryRun: true,
		writeBoundary,
		filters: {
			sources: filtersSources ?? [source],
			candidateScanSize: rows.length,
			targetBatchSize,
			freshnessTargetsPercent: [80, 95],
			slaHours: 24,
			maxPriceDeltaPercent: 200,
		},
		summary: {
			sourceCount: summarySourceCount,
			publicRankableRows: rows.length,
			freshRows: 0,
			staleRows: rows.length,
			viableRowsInScan: viableRows,
			blockedRowsInScan: rows.length - viableRows,
			excludedSources: [],
			warnSources: [source],
			failSources: [],
			recommendedNextPhase: "phase-2-batch-size-generalization",
		},
		sources: [
			{
				slug: source,
				displayName: source,
				directRefreshSupport: "writer-supported",
				classification: "mixed",
				status: "WARN",
				sourceHealth: null,
				denominator: {
					totalRows: rows.length,
					publicRankableRows: rows.length,
					excludedRows: 0,
					freshRows: 0,
					staleRows: rows.length,
					unknownRows: 0,
					freshnessPercent: 0,
				},
				candidateScan: {
					requestedRows: rows.length,
					evaluatedRows: rows.length,
					viableRows,
					blockedRows: rows.length - viableRows,
					passFillRatePercent: 0,
					scanRowsNeededForBatch: null,
				},
				blockers: [
					{
						reason: "live product is unavailable",
						count: rows.length - viableRows,
					},
				],
				capacity: {
					recommendedBatchSize,
					recommendedCandidateScanSize: rows.length,
					estimatedChunks: { "80": 1 },
					estimatedRowsToRefresh: { "80": targetBatchSize },
					estimatedDurationMinutesPerChunk: null,
				},
				rows,
				evidenceGaps: [],
				recommendation:
					"eligible for manual-review planning; not approval to write",
			},
			...extraSources.map((extraSource) => ({
				slug: extraSource.slug,
				displayName: extraSource.slug,
				directRefreshSupport: "writer-supported",
				classification: "mixed",
				status: "WARN",
				sourceHealth: null,
				denominator: {
					totalRows: 0,
					publicRankableRows: 0,
					excludedRows: 0,
					freshRows: 0,
					staleRows: 0,
					unknownRows: 0,
					freshnessPercent: 0,
				},
				candidateScan: {
					requestedRows: 0,
					evaluatedRows: 0,
					viableRows: 0,
					blockedRows: 0,
					passFillRatePercent: 0,
					scanRowsNeededForBatch: null,
				},
				blockers: [],
				capacity: {
					recommendedBatchSize: 0,
					recommendedCandidateScanSize: 0,
					estimatedChunks: {},
					estimatedRowsToRefresh: {},
					estimatedDurationMinutesPerChunk: null,
				},
				rows: [],
				evidenceGaps: [],
				recommendation: "not selected",
			})),
		],
		stopConditions: [],
	};
	return {
		path: "capacity-report.json",
		raw: JSON.stringify(report),
		report,
		expectedIssueNumber,
	};
}

function repository(rows: DirectRefreshPrewriteExistingRow[]) {
	return {
		async getSource(sourceSlug: string) {
			if (sourceSlug === "carrefour") {
				return {
					id: 10,
					slug: "carrefour",
					baseUrl: "https://www.carrefour.com.ar",
				};
			}
			if (sourceSlug === "vea") {
				return {
					id: 20,
					slug: "vea",
					baseUrl: "https://www.vea.com.ar",
				};
			}
			if (sourceSlug === "disco") {
				return {
					id: 30,
					slug: "disco",
					baseUrl: "https://www.disco.com.ar",
				};
			}
			if (sourceSlug === "jumbo") {
				return {
					id: 40,
					slug: "jumbo",
					baseUrl: "https://www.jumbo.com.ar",
				};
			}
			if (sourceSlug === "mas") {
				return {
					id: 50,
					slug: "mas",
					baseUrl: "https://www.masonline.com.ar",
				};
			}
			return null;
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
		assert.match(
			report.futureConfirmation.hashSemantics,
			/timestamped evidence hash/,
		);
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

	it("hashes the timestamped report payload without self-referential confirmation", async () => {
		const buildReport = (now: string) =>
			buildCarrefourDirectRefreshPrewriteGate({
				repository: repository([passRow]),
				now: new Date(now),
				fetchDirectProducts: async () => [live()],
			});
		const first = await buildReport("2026-06-01T00:00:00.000Z");
		const second = await buildReport("2026-06-01T00:01:00.000Z");
		const firstHashPayload: Record<string, unknown> = { ...first };
		delete firstHashPayload.futureConfirmation;

		assert.notEqual(
			first.futureConfirmation.shape.reportHash,
			second.futureConfirmation.shape.reportHash,
		);
		assert.equal(
			first.futureConfirmation.shape.reportHash,
			buildPrewriteReportHash(firstHashPayload),
		);
	});

	it("supports Vea allowlisted source with source-specific host and confirmation guards", async () => {
		const veaRow: DirectRefreshPrewriteExistingRow = {
			...passRow,
			id: "2",
			sourceSlug: "vea",
			supermarketId: 20,
			productUrl: "https://www.vea.com.ar/leche-1/p",
			product: passRow.product
				? {
						...passRow.product,
						imageUrl: "https://www.vea.com.ar/old.jpg",
						images: ["https://www.vea.com.ar/old.jpg"],
					}
				: null,
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "vea",
			repository: repository([veaRow]),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					live({
						productUrl: "https://www.vea.com.ar/leche-1/p",
						imageUrl: "https://www.vea.com.ar/new.jpg",
						images: ["https://www.vea.com.ar/new.jpg"],
					}),
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "vea-direct-refresh-prewrite-gate");
		assert.equal(report.source.slug, "vea");
		assert.equal(report.source.expectedHost, "vea.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing Vea row/);
		assert.match(report.identity.guards.join("\n"), /vea\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "vea", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.futureConfirmation.shape.source, "vea");
		assert.deepEqual(report.futureConfirmation.shape.rowIds, ["2"]);
		assert.deepEqual(report.futureConfirmation.shape.skuIds, ["sku-1"]);
		assert.equal(report.rows[0].sourceSlug, "vea");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("passes with mixed capacity evidence when selected prewrite rows passed capacity", async () => {
		const veaRows: DirectRefreshPrewriteExistingRow[] = Array.from(
			{ length: 11 },
			(_, index) => ({
				...passRow,
				id: String(index + 1),
				sourceSlug: "vea",
				supermarketId: 20,
				ean: `77920000000${String(index + 1).padStart(2, "0")}`,
				skuId: `vea-sku-${index + 1}`,
				productUrl: "https://www.vea.com.ar/leche-1/p",
				product: passRow.product
					? {
							...passRow.product,
							ean: `77920000000${String(index + 1).padStart(2, "0")}`,
							imageUrl: "https://www.vea.com.ar/old.jpg",
							images: ["https://www.vea.com.ar/old.jpg"],
						}
					: null,
				latestPriceHistory: passRow.latestPriceHistory
					? {
							...passRow.latestPriceHistory,
							supermarketProductId: index + 1,
						}
					: null,
			}),
		);
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "vea",
			sampleSize: 10,
			repository: repository(veaRows),
			now: new Date("2026-06-01T00:00:00.000Z"),
			candidateScanSize: 11,
			capacityEvidence: capacityEvidence({
				viableRows: 10,
				rows: veaRows.map((row, index) => ({
					rowId: row.id,
					status: index === 0 ? "FAIL" : "PASS",
				})),
			}),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const row = veaRows.find((entry) => entry.skuId === lookup.value);
				return [
					live({
						ean: row?.ean ?? "missing",
						skuId: lookup.value,
						productUrl: "https://www.vea.com.ar/leche-1/p",
						imageUrl: "https://www.vea.com.ar/new.jpg",
						images: ["https://www.vea.com.ar/new.jpg"],
					}),
				];
			},
		});
		const hashPayload: Record<string, unknown> = { ...report };
		delete hashPayload.futureConfirmation;

		assert.equal(report.status, "PASS");
		assert.deepEqual(
			report.rows.map((row) => row.rowId),
			["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
		);
		assert.equal(report.selection.capacityEvidence.applied, true);
		assert.equal(report.selection.capacityEvidence.passCandidateRows, 10);
		assert.equal(report.selection.capacityEvidence.excludedCandidateRows, 1);
		assert.equal(report.lineage.parentArtifacts[0].present, true);
		assert.equal(report.lineage.parentArtifacts[0].status, "WARN");
		assert.equal(
			report.lineage.parentArtifacts[0].source?.classification,
			"mixed",
		);
		assert.deepEqual(report.lineage.parentArtifacts[0].guardReasons, []);
		assert.equal(
			report.futureConfirmation.shape.reportHash,
			buildPrewriteReportHash(hashPayload),
		);
	});

	it("fails when capacity-PASS prewrite rows cannot fill the request", async () => {
		const veaRows: DirectRefreshPrewriteExistingRow[] = Array.from(
			{ length: 10 },
			(_, index) => ({
				...passRow,
				id: String(index + 1),
				sourceSlug: "vea",
				supermarketId: 20,
				ean: `77920000000${String(index + 1).padStart(2, "0")}`,
				skuId: `vea-sku-${index + 1}`,
				productUrl: "https://www.vea.com.ar/leche-1/p",
				product: passRow.product
					? {
							...passRow.product,
							ean: `77920000000${String(index + 1).padStart(2, "0")}`,
							imageUrl: "https://www.vea.com.ar/old.jpg",
							images: ["https://www.vea.com.ar/old.jpg"],
						}
					: null,
			}),
		);
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "vea",
			sampleSize: 10,
			repository: repository(veaRows),
			capacityEvidence: capacityEvidence({
				rows: veaRows.map((row, index) => ({
					rowId: row.id,
					status: index === 0 ? "FAIL" : "PASS",
				})),
			}),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const row = veaRows.find((entry) => entry.skuId === lookup.value);
				return [
					live({
						ean: row?.ean ?? "missing",
						skuId: lookup.value,
						productUrl: "https://www.vea.com.ar/leche-1/p",
					}),
				];
			},
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/insufficient capacity-PASS rows: selected 9 of 10/,
		);
		assert.deepEqual(
			report.rows.map((row) => row.rowId),
			["2", "3", "4", "5", "6", "7", "8", "9", "10"],
		);
		assert.equal(report.selection.capacityEvidence.passCandidateRows, 9);
		assert.equal(report.selection.capacityEvidence.excludedCandidateRows, 1);
	});

	it("fails on capacity source, count, viable row, and recommended batch mismatches", async () => {
		const veaRows: DirectRefreshPrewriteExistingRow[] = Array.from(
			{ length: 10 },
			(_, index) => ({
				...passRow,
				id: String(index + 1),
				sourceSlug: "vea",
				supermarketId: 20,
				ean: `77920000000${String(index + 1).padStart(2, "0")}`,
				skuId: `vea-sku-${index + 1}`,
				productUrl: "https://www.vea.com.ar/leche-1/p",
				product: passRow.product
					? {
							...passRow.product,
							ean: `77920000000${String(index + 1).padStart(2, "0")}`,
							imageUrl: "https://www.vea.com.ar/old.jpg",
							images: ["https://www.vea.com.ar/old.jpg"],
						}
					: null,
			}),
		);
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "vea",
			sampleSize: 10,
			repository: repository(veaRows),
			capacityEvidence: capacityEvidence({
				targetBatchSize: 25,
				viableRows: 9,
				recommendedBatchSize: 9,
				rows: veaRows.map((row) => ({ rowId: row.id, status: "PASS" })),
			}),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const row = veaRows.find((entry) => entry.skuId === lookup.value);
				return [
					live({
						ean: row?.ean ?? "missing",
						skuId: lookup.value,
						productUrl: "https://www.vea.com.ar/leche-1/p",
					}),
				];
			},
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/targetBatchSize must equal requested sample size 10/,
		);
		assert.match(reasons, /viable rows must be >= requested sample size 10/);
		assert.match(
			reasons,
			/recommended batch size must be >= requested sample size 10/,
		);
	});

	it("fails on multi-source, issue mismatch, missing row, and weak capacity boundary", async () => {
		const veaRows: DirectRefreshPrewriteExistingRow[] = Array.from(
			{ length: 10 },
			(_, index) => ({
				...passRow,
				id: String(index + 1),
				sourceSlug: "vea",
				supermarketId: 20,
				ean: `77920000000${String(index + 1).padStart(2, "0")}`,
				skuId: `vea-sku-${index + 1}`,
				productUrl: "https://www.vea.com.ar/leche-1/p",
				product: passRow.product
					? {
							...passRow.product,
							ean: `77920000000${String(index + 1).padStart(2, "0")}`,
							imageUrl: "https://www.vea.com.ar/old.jpg",
							images: ["https://www.vea.com.ar/old.jpg"],
						}
					: null,
			}),
		);
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "vea",
			sampleSize: 10,
			repository: repository(veaRows),
			capacityEvidence: capacityEvidence({
				issue: 82,
				expectedIssueNumber: 169,
				filtersSources: ["vea", "mas"],
				summarySourceCount: 2,
				extraSources: [{ slug: "mas" }],
				writeBoundary:
					"read-only operating capacity audit; no production writes",
				rows: veaRows
					.slice(1)
					.map((row) => ({ rowId: row.id, status: "PASS" })),
			}),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const row = veaRows.find((entry) => entry.skuId === lookup.value);
				return [
					live({
						ean: row?.ean ?? "missing",
						skuId: lookup.value,
						productUrl: "https://www.vea.com.ar/leche-1/p",
					}),
				];
			},
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /filters\.sources must be exactly vea/);
		assert.match(reasons, /source-scoped to exactly one source/);
		assert.match(reasons, /summary\.sourceCount must be 1/);
		assert.match(reasons, /issue must equal expected issue 169/);
		assert.match(reasons, /write boundary must be read-only/);
		assert.match(reasons, /insufficient capacity-PASS rows: selected 9 of 10/);
	});

	it("preserves existing prewrite behavior with absent capacity lineage", async () => {
		const report = await buildCarrefourDirectRefreshPrewriteGate({
			repository: repository([passRow]),
			fetchDirectProducts: async () => [live()],
		});

		assert.equal(report.status, "PASS");
		assert.deepEqual(report.summary.failClosedReasons, []);
		assert.equal(report.lineage.parentArtifacts[0].present, false);
		assert.deepEqual(report.lineage.parentArtifacts[0].guardReasons, []);
	});

	it("supports Disco allowlisted source with source-specific host and confirmation guards", async () => {
		const discoRow: DirectRefreshPrewriteExistingRow = {
			...passRow,
			id: "3",
			sourceSlug: "disco",
			supermarketId: 30,
			productUrl: "https://www.disco.com.ar/leche-1/p",
			product: passRow.product
				? {
						...passRow.product,
						imageUrl: "https://www.disco.com.ar/old.jpg",
						images: ["https://www.disco.com.ar/old.jpg"],
					}
				: null,
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "disco",
			repository: repository([discoRow]),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					live({
						productUrl: "https://www.disco.com.ar/leche-1/p",
						imageUrl: "https://www.disco.com.ar/new.jpg",
						images: ["https://www.disco.com.ar/new.jpg"],
					}),
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "disco-direct-refresh-prewrite-gate");
		assert.equal(report.source.slug, "disco");
		assert.equal(report.source.expectedHost, "disco.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing Disco row/);
		assert.match(report.identity.guards.join("\n"), /disco\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "disco", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.futureConfirmation.shape.source, "disco");
		assert.deepEqual(report.futureConfirmation.shape.rowIds, ["3"]);
		assert.deepEqual(report.futureConfirmation.shape.skuIds, ["sku-1"]);
		assert.deepEqual(report.futureConfirmation.shape.productEans, [
			"7790001000011",
		]);
		assert.equal(report.rows[0].sourceSlug, "disco");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("supports Jumbo allowlisted source with source-specific host and confirmation guards", async () => {
		const jumboRow: DirectRefreshPrewriteExistingRow = {
			...passRow,
			id: "4",
			sourceSlug: "jumbo",
			supermarketId: 40,
			productUrl: "https://www.jumbo.com.ar/leche-1/p",
			product: passRow.product
				? {
						...passRow.product,
						imageUrl: "https://www.jumbo.com.ar/old.jpg",
						images: ["https://www.jumbo.com.ar/old.jpg"],
					}
				: null,
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "jumbo",
			repository: repository([jumboRow]),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					live({
						productUrl: "https://www.jumbo.com.ar/leche-1/p",
						imageUrl: "https://www.jumbo.com.ar/new.jpg",
						images: ["https://www.jumbo.com.ar/new.jpg"],
					}),
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "jumbo-direct-refresh-prewrite-gate");
		assert.equal(report.source.slug, "jumbo");
		assert.equal(report.source.expectedHost, "jumbo.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing Jumbo row/);
		assert.match(report.identity.guards.join("\n"), /jumbo\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "jumbo", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.futureConfirmation.shape.source, "jumbo");
		assert.deepEqual(report.futureConfirmation.shape.rowIds, ["4"]);
		assert.deepEqual(report.futureConfirmation.shape.skuIds, ["sku-1"]);
		assert.deepEqual(report.futureConfirmation.shape.productEans, [
			"7790001000011",
		]);
		assert.equal(report.rows[0].sourceSlug, "jumbo");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("supports MAS allowlisted source with source-specific host and confirmation guards", async () => {
		const masRow: DirectRefreshPrewriteExistingRow = {
			...passRow,
			id: "5",
			sourceSlug: "mas",
			supermarketId: 50,
			productUrl: "https://www.masonline.com.ar/leche-1/p",
			product: passRow.product
				? {
						...passRow.product,
						imageUrl: "https://www.masonline.com.ar/old.jpg",
						images: ["https://www.masonline.com.ar/old.jpg"],
					}
				: null,
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "mas",
			repository: repository([masRow]),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					live({
						productUrl: "https://www.masonline.com.ar/leche-1/p",
						imageUrl: "https://www.masonline.com.ar/new.jpg",
						images: ["https://www.masonline.com.ar/new.jpg"],
					}),
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "mas-direct-refresh-prewrite-gate");
		assert.equal(report.source.slug, "mas");
		assert.equal(report.source.expectedHost, "masonline.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing MAS row/);
		assert.match(report.identity.guards.join("\n"), /masonline\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "mas", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.futureConfirmation.shape.source, "mas");
		assert.deepEqual(report.futureConfirmation.shape.rowIds, ["5"]);
		assert.deepEqual(report.futureConfirmation.shape.skuIds, ["sku-1"]);
		assert.deepEqual(report.futureConfirmation.shape.productEans, [
			"7790001000011",
		]);
		assert.equal(report.rows[0].sourceSlug, "mas");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("selects 10 viable MAS prewrite rows from a bounded candidate scan", async () => {
		const candidateRows = masLikeRows(12);
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "mas",
			sampleSize: 10,
			candidateScanSize: 12,
			repository: repository(candidateRows),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const row = candidateRows.find((entry) => entry.skuId === lookup.value);
				return [
					live({
						ean: row?.ean ?? "missing",
						skuId: lookup.value,
						productUrl: "https://www.masonline.com.ar/leche-1/p",
						price:
							lookup.value === "mas-sku-1" || lookup.value === "mas-sku-2"
								? 0
								: 1100,
					}),
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.selection.candidateScanSize, 12);
		assert.equal(report.selection.selectedRows, 10);
		assert.equal(report.summary.passRows, 10);
		assert.equal(report.summary.failRows, 0);
		assert.equal(report.summary.skippedBlockedRows, 2);
		assert.match(
			report.summary.skippedBlockedReasons.join("\n"),
			/price is not positive/,
		);
		const selectedIds = candidateRows
			.slice(2)
			.map((row) => row.id)
			.sort();
		assert.deepEqual(report.futureConfirmation.shape.rowIds, selectedIds);
		assert.deepEqual(
			report.rollbackSnapshot.touchedSupermarketProductIds,
			selectedIds.map(Number),
		);
	});

	it("evaluates candidate repository lookups serially to avoid pool exhaustion", async () => {
		const rows = masLikeRows(12);
		const repo = repository(rows);
		const originalFindRowsBySourceSku = repo.findRowsBySourceSku;
		let activeSourceSkuLookups = 0;
		let maxActiveSourceSkuLookups = 0;
		repo.findRowsBySourceSku = async (sourceSlug, skuId) => {
			activeSourceSkuLookups += 1;
			maxActiveSourceSkuLookups = Math.max(
				maxActiveSourceSkuLookups,
				activeSourceSkuLookups,
			);
			await delay(1);
			try {
				return await originalFindRowsBySourceSku(sourceSlug, skuId);
			} finally {
				activeSourceSkuLookups -= 1;
			}
		};
		const report = await buildDirectRefreshPrewriteGate({
			repository: repo,
			sourceSlug: "mas",
			sampleSize: 10,
			candidateScanSize: 12,
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const id = lookup.value.replace("mas-sku-", "");
				return [
					live({
						ean: `77910000000${id.padStart(2, "0")}`,
						skuId: lookup.value,
						productUrl: "https://www.masonline.com.ar/leche-1/p",
					}),
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(maxActiveSourceSkuLookups, 1);
	});

	it("fails closed when bounded MAS scan cannot find enough viable rows", async () => {
		const candidateRows = masLikeRows(12);
		const report = await buildDirectRefreshPrewriteGate({
			sourceSlug: "mas",
			sampleSize: 10,
			candidateScanSize: 12,
			repository: repository(candidateRows),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const row = candidateRows.find((entry) => entry.skuId === lookup.value);
				return [
					live({
						ean: row?.ean ?? "missing",
						skuId: lookup.value,
						productUrl: "https://www.masonline.com.ar/leche-1/p",
						price: [
							"mas-sku-1",
							"mas-sku-2",
							"mas-sku-3",
							"mas-sku-4",
						].includes(lookup.value ?? "")
							? 0
							: 1100,
					}),
				];
			},
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.equal(report.selection.candidateScanSize, 12);
		assert.equal(report.selection.selectedRows, 8);
		assert.match(reasons, /insufficient viable rows/);
		assert.match(reasons, /price is not positive/);
	});

	it("rejects unsupported scope before repository or network work", async () => {
		await assert.rejects(
			() =>
				buildDirectRefreshPrewriteGate({
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
			/restricted to allowlisted source/,
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

	it("parses only allowlisted read-only CLI options", () => {
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=carrefour",
				"--sample-size=25",
				"--output=prewrite.json",
			]),
			{
				source: "carrefour",
				sampleSize: 25,
				candidateScanSize: 25,
				output: "prewrite.json",
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=vea",
			]),
			{
				source: "vea",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=disco",
			]),
			{
				source: "disco",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=jumbo",
			]),
			{
				source: "jumbo",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=mas",
			]),
			{
				source: "mas",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions(["node", "script"]),
			{
				source: "carrefour",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=mas",
				"--sample-size=50",
				"--candidate-scan-size=60",
			]),
			{
				source: "mas",
				sampleSize: 50,
				candidateScanSize: 60,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshPrewriteGateCliOptions([
				"node",
				"script",
				"--source=vea",
				"--sample-size=10",
				"--capacity-report=audit/capacity-report.json",
				"--issue-number=169",
			]),
			{
				source: "vea",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: "audit/capacity-report.json",
				issueNumber: 169,
			},
		);
		for (const argv of [
			["node", "script", "--source=dia"],
			["node", "script", "--source=carrefour,dia"],
			["node", "script", "--source=mas,jumbo"],
			["node", "script", "--sample-size=9"],
			["node", "script", "--sample-size=100"],
			["node", "script", "--sample-size=10", "--candidate-scan-size=9"],
			["node", "script", "--capacity-report=audit/capacity-report.json"],
			["node", "script", "--all-source"],
			["node", "script", "--all-sources=true"],
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
				/carrefour|read-only|candidate-scan-size|sample-size|issue-number/,
			);
		}
	});
});
