import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
	buildIngestRunAudit,
	resolveIngestionRun,
	type IngestRunAuditRepository,
	type IngestRunSnapshot,
	type IngestWriteJson,
} from "../scripts/pipeline/ingest-run-audit";

const source = "carrefour";
const candidateEans = ["111", "222", "333", "444", "555"];
const snapshotCreatedAt = "2026-05-26T12:00:00.000Z";

function snapshot(): IngestRunSnapshot {
	return {
		schemaVersion: 1,
		createdAt: snapshotCreatedAt,
		writeMode: "phase4-count5",
		source,
		term: "leche",
		count: 5,
		queryLimit: 1,
		candidateHash: "candidate-hash",
		candidateEans,
		selection: {
			mode: "strict",
			scanCount: candidateEans.length,
			selectedCount: candidateEans.length,
			skippedCandidates: [],
		},
		candidates: candidateEans.map((ean, index) => ({
			ean,
			name: `Leche ${ean}`,
			brand: "Marca",
			description: "Leche entera",
			imageUrl: null,
			images: [],
			category: "Lácteos",
			skuId: `sku-${ean}`,
			sellerId: "seller",
			productUrl: `https://example.test/${ean}`,
			price: 100 + index,
			listPrice: 120 + index,
			referencePrice: 100 + index,
			referenceUnit: "lt",
			isAvailable: true,
		})),
		mojibakeWaivers: [],
		allowMissingSupermarketProductEans: [],
		rollbackPlan: null,
		snapshots: {
			source: {
				id: 7,
				slug: source,
				name: "Carrefour",
				isActive: true,
				isVtex: true,
			},
			products: candidateEans.map((ean) => ({
				ean,
				name: `Stored ${ean}`,
				brand: null,
				description: null,
				imageUrl: null,
				images: [],
				category: null,
			})),
			supermarketProducts: candidateEans.map((ean, index) => ({
				id: index + 100,
				productEan: ean,
				supermarketId: 7,
				price: 90 + index,
				listPrice: 100 + index,
				referencePrice: 90 + index,
				referenceUnit: "lt",
				isAvailable: true,
				skuId: `old-sku-${ean}`,
				sellerId: "old-seller",
				productUrl: `https://old.example.test/${ean}`,
				lastCheckedAt: "2026-05-25T12:00:00.000Z",
			})),
			priceHistory: {
				maxId: 999,
				latest: candidateEans.map((_ean, index) => ({
					id: index + 200,
					supermarketProductId: index + 100,
					price: 90 + index,
					listPrice: 100 + index,
					scrapedAt: "2026-05-25T12:00:00.000Z",
				})),
			},
		},
	};
}

function refreshExistingSnapshot(): IngestRunSnapshot {
	const base = snapshot();
	const selected = new Set(candidateEans.slice(0, 3));
	base.writeMode = "refresh-existing";
	base.count = 3;
	base.candidateHash = "refresh-hash";
	base.candidateEans = candidateEans.slice(0, 3);
	base.candidates = base.candidates.filter((candidate) =>
		selected.has(candidate.ean),
	);
	base.snapshots.products = base.snapshots.products.filter((row) =>
		selected.has(row.ean),
	);
	base.snapshots.supermarketProducts =
		base.snapshots.supermarketProducts.filter((row) =>
			selected.has(row.productEan),
		);
	const selectedSpIds = new Set(
		base.snapshots.supermarketProducts.map((row) => row.id),
	);
	base.snapshots.priceHistory.latest =
		base.snapshots.priceHistory.latest.filter((row) =>
			selectedSpIds.has(row.supermarketProductId),
		);
	return base;
}

function snapshotWithAllowlistedMissingSourceRow(): IngestRunSnapshot {
	const base = snapshot();
	base.allowMissingSupermarketProductEans = ["555"];
	base.snapshots.supermarketProducts =
		base.snapshots.supermarketProducts.filter(
			(row) => row.productEan !== "555",
		);
	const existingIds = new Set(
		base.snapshots.supermarketProducts.map((row) => row.id),
	);
	base.snapshots.priceHistory.latest =
		base.snapshots.priceHistory.latest.filter((row) =>
			existingIds.has(row.supermarketProductId),
		);
	return base;
}

function writeJson(overrides: Partial<IngestWriteJson> = {}): IngestWriteJson {
	return {
		batchId: "batch-1",
		mode: "active",
		writeMode: "phase4-count5",
		dryRun: false,
		sourceCount: 1,
		totals: {
			fetched: 5,
			staged: 5,
			promoted: 5,
			rejected: 0,
			failedSources: 0,
		},
		reconciliation: {
			totalCandidates: 5,
			distinctEans: 5,
			newProducts: 0,
			mergedProducts: 5,
			supermarketProductsCreated: 0,
			supermarketProductsUpdated: 5,
			priceHistoryInserted: 5,
			promoted: 5,
			promotedByRunId: { "42": 5 },
			promotedBySource: { [source]: 5 },
		},
		metrics: { sentAlerts: [] },
		sources: [
			{
				runId: 42,
				slug: source,
				candidateHash: "candidate-hash",
				queriesSent: 1,
			},
		],
		...overrides,
	};
}

function repository(
	overrides: Partial<IngestRunAuditRepository> = {},
): IngestRunAuditRepository {
	return {
		findRunById: async (id) => ({
			id,
			batchId: "batch-1",
			sourceSlug: source,
			startedAt: "2026-05-26T12:01:00.000Z",
			status: "SUCCESS",
			queriesSent: 1,
			productsFetched: 5,
			productsStaged: 5,
			productsPromoted: 5,
			productsRejected: 0,
			errorSummary: null,
		}),
		findRunsByBatchSourceSince: async () => [],
		getStagingRowsForRun: async () =>
			candidateEans.map((ean) => ({ runId: 42, ean, status: "PROMOTED" })),
		getCurrentProductsByEan: async () =>
			candidateEans.map((ean) => ({
				ean,
				name: `Stored ${ean}`,
				brand: "Marca",
				description: "Leche entera",
				imageUrl: null,
				images: [],
				category: "Lácteos",
			})),
		getCurrentSupermarketProducts: async () =>
			candidateEans.map((ean, index) => ({
				id: index + 100,
				productEan: ean,
				supermarketId: 7,
				price: 100 + index,
				listPrice: 120 + index,
				referencePrice: 100 + index,
				referenceUnit: "lt",
				isAvailable: true,
				skuId: `sku-${ean}`,
				sellerId: "seller",
				productUrl: `https://example.test/${ean}`,
				lastCheckedAt: "2026-05-26T12:02:00.000Z",
			})),
		getLatestPriceHistory: async () =>
			candidateEans.map((_ean, index) => ({
				id: index + 1000,
				supermarketProductId: index + 100,
				price: 100 + index,
				listPrice: 120 + index,
				scrapedAt: "2026-05-26T12:02:00.000Z",
			})),
		getGlobalOrphans: async () => ({ runningRuns: 0, pendingStagingRows: 0 }),
		getPostSnapshotPriceHistoryRows: async () => [],
		...overrides,
	};
}

describe("Phase 4 ingest run audit", () => {
	it("has a package script wired to the canonical ingest run audit CLI", () => {
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		const cliScript = readFileSync("scripts/audit-ingest-run.ts", "utf8");

		assert.equal(
			packageJson.scripts["audit:ingest-run"],
			"tsx scripts/audit-ingest-run.ts",
		);
		assert.match(cliScript, /buildIngestRunAudit/);
		assert.match(cliScript, /--snapshot/);
		assert.match(cliScript, /--write-json/);
	});

	it("resolves the run from write JSON runId and rejects ambiguous fallback runs", async () => {
		assert.equal(
			await resolveIngestionRun({
				snapshot: snapshot(),
				writeJson: writeJson(),
				repository: repository(),
			}),
			42,
		);

		await assert.rejects(
			resolveIngestionRun({
				snapshot: snapshot(),
				writeJson: writeJson({ sources: [{ slug: source, queriesSent: 1 }] }),
				repository: repository({
					findRunsByBatchSourceSince: async () => [
						{
							id: 41,
							batchId: "batch-1",
							sourceSlug: source,
							startedAt: snapshotCreatedAt,
							status: "SUCCESS",
							queriesSent: 1,
							productsFetched: 5,
							productsStaged: 5,
							productsPromoted: 5,
							productsRejected: 0,
							errorSummary: null,
						},
						{
							id: 42,
							batchId: "batch-1",
							sourceSlug: source,
							startedAt: snapshotCreatedAt,
							status: "SUCCESS",
							queriesSent: 1,
							productsFetched: 5,
							productsStaged: 5,
							productsPromoted: 5,
							productsRejected: 0,
							errorSummary: null,
						},
					],
				}),
			}),
			/exactly one ingestion_run/,
		);
	});

	it("builds a passing post-write audit for exact five promoted rows", async () => {
		const audit = await buildIngestRunAudit({
			mode: "post-write",
			snapshot: snapshot(),
			writeJson: writeJson(),
			repository: repository(),
		});

		assert.equal(audit.status, "PASS");
		assert.equal(audit.runId, 42);
		assert.equal(audit.mode, "post-write");
		assert.deepEqual(audit.touchedEans, candidateEans);
		assert.deepEqual(audit.warnings, []);
	});

	it("audits refresh-existing chunks with variable count and zero created rows", async () => {
		const refreshSnapshot = refreshExistingSnapshot();
		const refreshWriteJson = writeJson({
			writeMode: "refresh-existing",
			totals: {
				fetched: 3,
				staged: 3,
				promoted: 3,
				rejected: 0,
				failedSources: 0,
			},
			reconciliation: {
				totalCandidates: 3,
				distinctEans: 3,
				newProducts: 0,
				mergedProducts: 3,
				supermarketProductsCreated: 0,
				supermarketProductsUpdated: 3,
				priceHistoryInserted: 3,
				promoted: 3,
				promotedByRunId: { "42": 3 },
				promotedBySource: { [source]: 3 },
			},
			sources: [
				{
					runId: 42,
					slug: source,
					candidateHash: "refresh-hash",
					queriesSent: 1,
				},
			],
		});
		const selected = new Set(refreshSnapshot.candidateEans);
		const audit = await buildIngestRunAudit({
			mode: "post-write",
			snapshot: refreshSnapshot,
			writeJson: refreshWriteJson,
			repository: repository({
				findRunById: async (id) => ({
					id,
					batchId: "batch-1",
					sourceSlug: source,
					startedAt: "2026-05-26T12:01:00.000Z",
					status: "SUCCESS",
					queriesSent: 1,
					productsFetched: 3,
					productsStaged: 3,
					productsPromoted: 3,
					productsRejected: 0,
					errorSummary: null,
				}),
				getStagingRowsForRun: async () =>
					refreshSnapshot.candidateEans.map((ean) => ({
						runId: 42,
						ean,
						status: "PROMOTED",
					})),
				getCurrentProductsByEan: async () =>
					refreshSnapshot.snapshots.products.map((row) => ({
						...row,
						brand: "Marca",
						description: "Leche entera",
						category: "Lácteos",
					})),
				getCurrentSupermarketProducts: async () =>
					refreshSnapshot.snapshots.supermarketProducts.map((row, index) => ({
						...row,
						price: 100 + index,
						listPrice: 120 + index,
						referencePrice: 100 + index,
						skuId: `sku-${row.productEan}`,
						sellerId: "seller",
						productUrl: `https://example.test/${row.productEan}`,
						lastCheckedAt: "2026-05-26T12:02:00.000Z",
					})),
				getLatestPriceHistory: async () =>
					candidateEans
						.filter((ean) => selected.has(ean))
						.map((_ean, index) => ({
							id: index + 1000,
							supermarketProductId: index + 100,
							price: 100 + index,
							listPrice: 120 + index,
							scrapedAt: "2026-05-26T12:02:00.000Z",
						})),
			}),
		});

		assert.equal(audit.status, "PASS");
		assert.deepEqual(audit.touchedEans, ["111", "222", "333"]);

		assert.ok(refreshWriteJson.reconciliation);
		refreshWriteJson.reconciliation.supermarketProductsCreated = 1;
		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: refreshSnapshot,
				writeJson: refreshWriteJson,
				repository: repository(),
			}),
			/reconciliation.supermarketProductsCreated must be 0/,
		);
	});

	it("allows existing-only refresh audits to fetch a larger scan window", async () => {
		const refreshSnapshot = refreshExistingSnapshot();
		refreshSnapshot.selection = {
			mode: "existing-only",
			scanCount: 5,
			selectedCount: 3,
			skippedCandidates: [
				{ ean: "444", name: "Leche 444", reasons: ["missing_supermarket_product"] },
				{ ean: "555", name: "Leche 555", reasons: ["missing_product"] },
			],
		};
		const refreshWriteJson = writeJson({
			writeMode: "refresh-existing",
			totals: {
				fetched: 5,
				staged: 3,
				promoted: 3,
				rejected: 0,
				failedSources: 0,
			},
			reconciliation: {
				totalCandidates: 3,
				distinctEans: 3,
				newProducts: 0,
				mergedProducts: 3,
				supermarketProductsCreated: 0,
				supermarketProductsUpdated: 3,
				priceHistoryInserted: 3,
				promoted: 3,
				promotedByRunId: { "42": 3 },
				promotedBySource: { [source]: 3 },
			},
			sources: [
				{
					runId: 42,
					slug: source,
					candidateHash: "refresh-hash",
					queriesSent: 1,
				},
			],
		});
		const selected = new Set(refreshSnapshot.candidateEans);
		const audit = await buildIngestRunAudit({
			mode: "post-write",
			snapshot: refreshSnapshot,
			writeJson: refreshWriteJson,
			repository: repository({
				findRunById: async (id) => ({
					id,
					batchId: "batch-1",
					sourceSlug: source,
					startedAt: "2026-05-26T12:01:00.000Z",
					status: "SUCCESS",
					queriesSent: 1,
					productsFetched: 5,
					productsStaged: 3,
					productsPromoted: 3,
					productsRejected: 0,
					errorSummary: null,
				}),
				getStagingRowsForRun: async () =>
					refreshSnapshot.candidateEans.map((ean) => ({
						runId: 42,
						ean,
						status: "PROMOTED",
					})),
				getCurrentProductsByEan: async () =>
					refreshSnapshot.snapshots.products.map((row) => ({
						...row,
						brand: "Marca",
						description: "Leche entera",
						category: "Lácteos",
					})),
				getCurrentSupermarketProducts: async () =>
					refreshSnapshot.snapshots.supermarketProducts.map((row, index) => ({
						...row,
						price: 100 + index,
						listPrice: 120 + index,
						referencePrice: 100 + index,
						skuId: `sku-${row.productEan}`,
						sellerId: "seller",
						productUrl: `https://example.test/${row.productEan}`,
						lastCheckedAt: "2026-05-26T12:02:00.000Z",
					})),
				getLatestPriceHistory: async () =>
					candidateEans
						.filter((ean) => selected.has(ean))
						.map((_ean, index) => ({
							id: index + 1000,
							supermarketProductId: index + 100,
							price: 100 + index,
							listPrice: 120 + index,
							scrapedAt: "2026-05-26T12:02:00.000Z",
						})),
				getPostSnapshotPriceHistoryRows: async () =>
					candidateEans
						.filter((ean) => selected.has(ean))
						.map((_ean, index) => ({
							id: index + 1000,
							supermarketProductId: index + 100,
							price: 100 + index,
							listPrice: 120 + index,
							scrapedAt: "2026-05-26T12:02:00.000Z",
						})),
			}),
		});

		assert.equal(audit.status, "PASS");
		assert.deepEqual(audit.createdRows, {
			newProducts: 0,
			supermarketProductsCreated: 0,
		});
	});

	it("allows one explicitly allowlisted created source row", async () => {
		const createdSourceRowSnapshot = snapshotWithAllowlistedMissingSourceRow();
		const createdSourceRowWriteJson = writeJson();
		assert.ok(createdSourceRowWriteJson.reconciliation);
		createdSourceRowWriteJson.reconciliation.supermarketProductsCreated = 1;
		createdSourceRowWriteJson.reconciliation.supermarketProductsUpdated = 4;

		const audit = await buildIngestRunAudit({
			mode: "post-write",
			snapshot: createdSourceRowSnapshot,
			writeJson: createdSourceRowWriteJson,
			repository: repository(),
		});

		assert.equal(audit.status, "PASS");
		assert.deepEqual(audit.touchedEans, candidateEans);
		assert.deepEqual(audit.warnings, []);
	});

	it("fails post-write audit on created rows, missing history, stale staging, or bad field values", async () => {
		const createdRowsWriteJson = writeJson();
		assert.ok(createdRowsWriteJson.reconciliation);
		createdRowsWriteJson.reconciliation.newProducts = 1;

		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: createdRowsWriteJson,
				repository: repository(),
			}),
			/reconciliation.newProducts must be 0/,
		);
		const unallowlistedSourceRowWriteJson = writeJson();
		assert.ok(unallowlistedSourceRowWriteJson.reconciliation);
		unallowlistedSourceRowWriteJson.reconciliation.supermarketProductsCreated = 1;
		unallowlistedSourceRowWriteJson.reconciliation.supermarketProductsUpdated = 4;

		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: unallowlistedSourceRowWriteJson,
				repository: repository(),
			}),
			/reconciliation.supermarketProductsCreated must be 0/,
		);
		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: writeJson(),
				repository: repository({ getLatestPriceHistory: async () => [] }),
			}),
			/latest price_history missing or mismatched/,
		);
		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: writeJson(),
				repository: repository({
					getStagingRowsForRun: async () =>
						candidateEans.map((ean) => ({
							runId: 42,
							ean,
							status: ean === "111" ? "PENDING" : "PROMOTED",
						})),
				}),
			}),
			/all staging rows must be PROMOTED/,
		);
		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: writeJson(),
				repository: repository({
					getCurrentProductsByEan: async () =>
						candidateEans.map((ean) => ({
							ean,
							name: ean === "111" ? "Corrupted name" : `Stored ${ean}`,
							brand: "Marca",
							description: "Leche entera",
							imageUrl: null,
							images: [],
							category: "Lácteos",
						})),
				}),
			}),
			/product name mismatch for 111/,
		);
		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: writeJson(),
				repository: repository({
					getCurrentSupermarketProducts: async () =>
						candidateEans.map((ean, index) => ({
							id: index + 100,
							productEan: ean,
							supermarketId: 7,
							price: ean === "111" ? null : 100 + index,
							listPrice: 120 + index,
							referencePrice: 100 + index,
							referenceUnit: "lt",
							isAvailable: true,
							skuId: `sku-${ean}`,
							sellerId: "seller",
							productUrl: `https://example.test/${ean}`,
							lastCheckedAt: "2026-05-26T12:02:00.000Z",
						})),
				}),
			}),
			/current price must be positive for 111/,
		);
		await assert.rejects(
			buildIngestRunAudit({
				mode: "post-write",
				snapshot: snapshot(),
				writeJson: writeJson(),
				repository: repository({
					getCurrentSupermarketProducts: async () =>
						candidateEans.map((ean, index) => ({
							id: index + 100,
							productEan: ean,
							supermarketId: 7,
							price: 100 + index,
							listPrice: 120 + index,
							referencePrice: 100 + index,
							referenceUnit: "lt",
							isAvailable: true,
							skuId: `sku-${ean}`,
							sellerId: "seller",
							productUrl: `https://example.test/${ean}`,
							lastCheckedAt:
								ean === "111"
									? "2026-05-25T12:00:00.000Z"
									: "2026-05-26T12:02:00.000Z",
						})),
				}),
			}),
			/current last_checked_at must be at or after snapshot for 111/,
		);
	});

	it("returns manual verification warnings for medium price deltas", async () => {
		const mediumDeltaSnapshot = snapshot();
		mediumDeltaSnapshot.candidates[0].price = 160;
		const mediumDeltaWriteJson = writeJson();
		assert.ok(mediumDeltaWriteJson.reconciliation);
		mediumDeltaWriteJson.reconciliation.priceHistoryInserted = 5;
		const audit = await buildIngestRunAudit({
			mode: "post-write",
			snapshot: mediumDeltaSnapshot,
			writeJson: mediumDeltaWriteJson,
			repository: repository({
				getCurrentSupermarketProducts: async () =>
					candidateEans.map((ean, index) => ({
						id: index + 100,
						productEan: ean,
						supermarketId: 7,
						price: ean === "111" ? 160 : 100 + index,
						listPrice: 120 + index,
						referencePrice: 100 + index,
						referenceUnit: "lt",
						isAvailable: true,
						skuId: `sku-${ean}`,
						sellerId: "seller",
						productUrl: `https://example.test/${ean}`,
						lastCheckedAt: "2026-05-26T12:02:00.000Z",
					})),
				getLatestPriceHistory: async () =>
					candidateEans.map((_ean, index) => ({
						id: index + 1000,
						supermarketProductId: index + 100,
						price: index === 0 ? 160 : 100 + index,
						listPrice: 120 + index,
						scrapedAt: "2026-05-26T12:02:00.000Z",
					})),
			}),
		});

		assert.match(
			audit.warnings[0],
			/manual price verification required for 111/,
		);
	});

	it("verifies rollback by snapshot equality without requiring freshness or successful write JSON", async () => {
		const uncertainWriteJson = writeJson({
			totals: {
				fetched: 0,
				staged: 0,
				promoted: 0,
				rejected: 0,
				failedSources: 1,
			},
			reconciliation: null,
		});
		const rollbackSnapshot = snapshot();
		const rollbackAudit = await buildIngestRunAudit({
			mode: "rollback",
			snapshot: rollbackSnapshot,
			writeJson: uncertainWriteJson,
			repository: repository({
				getCurrentProductsByEan: async () =>
					[...rollbackSnapshot.snapshots.products].reverse(),
				getCurrentSupermarketProducts: async () =>
					[...rollbackSnapshot.snapshots.supermarketProducts].reverse(),
				getLatestPriceHistory: async () =>
					[...rollbackSnapshot.snapshots.priceHistory.latest].reverse(),
			}),
		});

		assert.equal(rollbackAudit.status, "PASS");
		assert.equal(rollbackAudit.mode, "rollback");
		assert.deepEqual(rollbackAudit.warnings, []);

		const createdSourceRowSnapshot = snapshotWithAllowlistedMissingSourceRow();
		await assert.rejects(
			buildIngestRunAudit({
				mode: "rollback",
				snapshot: createdSourceRowSnapshot,
				writeJson: uncertainWriteJson,
				repository: repository({
					getCurrentProductsByEan: async () =>
						[...createdSourceRowSnapshot.snapshots.products].reverse(),
				}),
			}),
			/rollback supermarket_products must equal snapshot/,
		);
		const createdSourceRowRollbackAudit = await buildIngestRunAudit({
			mode: "rollback",
			snapshot: createdSourceRowSnapshot,
			writeJson: uncertainWriteJson,
			repository: repository({
				getCurrentProductsByEan: async () =>
					[...createdSourceRowSnapshot.snapshots.products].reverse(),
				getCurrentSupermarketProducts: async () =>
					[...createdSourceRowSnapshot.snapshots.supermarketProducts].reverse(),
				getLatestPriceHistory: async () =>
					[...createdSourceRowSnapshot.snapshots.priceHistory.latest].reverse(),
			}),
		});

		assert.equal(createdSourceRowRollbackAudit.status, "PASS");
	});
});
