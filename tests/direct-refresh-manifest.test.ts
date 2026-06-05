import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshManifestCliOptions } from "../scripts/audit-direct-refresh-manifest";
import {
	buildCarrefourDirectRefreshManifestDryRun,
	buildDirectRefreshManifestDryRun,
	type DirectRefreshManifestExistingRow,
} from "../scripts/pipeline/direct-refresh-manifest";

const passRow: DirectRefreshManifestExistingRow = {
	id: "1",
	sourceSlug: "carrefour",
	supermarketId: 10,
	ean: "7790001000011",
	skuId: "sku-1",
	productUrl: "https://www.carrefour.com.ar/leche-1/p",
	lastCheckedAt: "2026-05-01T00:00:00.000Z",
	price: 1000,
	listPrice: 1200,
};

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function capacityEvidence({
	source = "vea",
	targetBatchSize = 2,
	viableRows = 2,
	recommendedBatchSize = 2,
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

function repository(rows: DirectRefreshManifestExistingRow[]) {
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
	};
}

describe("Carrefour direct refresh manifest dry-run", () => {
	it("passes only existing Carrefour rows with direct SKU lookup and read-only contract", async () => {
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildCarrefourDirectRefreshManifestDryRun({
			repository: repository([passRow]),
			now: new Date("2026-06-01T00:00:00.000Z"),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					{
						ean: "7790001000011",
						skuId: "sku-1",
						productUrl: "https://www.carrefour.com.ar/leche-1/p",
						price: 990,
						listPrice: 1100,
						isAvailable: true,
					},
				];
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
		assert.equal(report.rows[0].guards.status, "PASS");
		assert.equal(report.rows[0].guards.directLookupCount, 1);
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
		assert.equal(report.rows[0].action, "would-refresh-existing-row");
	});

	it("fails closed for missing identity, duplicate SKU, lookup, match, and host violations", async () => {
		const duplicateA = { ...passRow, id: "duplicate-a", skuId: "dup" };
		const duplicateB = { ...passRow, id: "duplicate-b", skuId: "dup" };
		const rows: DirectRefreshManifestExistingRow[] = [
			{ ...passRow, id: "missing-ean", ean: "" },
			{ ...passRow, id: "missing-sku", skuId: null },
			duplicateA,
			duplicateB,
			{ ...passRow, id: "zero", skuId: "zero" },
			{ ...passRow, id: "lookup-error", skuId: "lookup-error" },
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
		];
		const report = await buildCarrefourDirectRefreshManifestDryRun({
			repository: repository(rows),
			sampleSize: rows.length,
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const base = {
					ean: "7790001000011",
					skuId: lookup.value,
					productUrl: "https://www.carrefour.com.ar/live/p",
					price: 100,
					listPrice: 110,
					isAvailable: true,
				};
				if (lookup.value === "zero") return [];
				if (lookup.value === "lookup-error")
					throw new Error("catalog unavailable");
				if (lookup.value === "many")
					return [
						base,
						{ ...base, productUrl: "https://www.carrefour.com.ar/other/p" },
					];
				if (lookup.value === "ean-mismatch")
					return [{ ...base, ean: "7799999999999" }];
				if (lookup.value === "sku-mismatch")
					return [{ ...base, skuId: "changed" }];
				if (lookup.value === "outside-host")
					return [{ ...base, productUrl: "https://example.com/product/p" }];
				if (lookup.value === "host-drift")
					return [
						{ ...base, productUrl: "https://mercado.carrefour.com.ar/live/p" },
					];
				return [base];
			},
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.summary.passRows, 0);
		assert.equal(report.summary.failRows, rows.length);
		assert.match(report.summary.failClosedReasons.join("\n"), /lacks EAN/);
		assert.match(report.summary.failClosedReasons.join("\n"), /lacks SKU/);
		assert.match(report.summary.failClosedReasons.join("\n"), /not unique/);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/returned 0 live products/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/lookup failed: catalog unavailable/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/returned 2 live products/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/EAN does not match/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/SKU does not match/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/host is not carrefour\.com\.ar/,
		);
		assert.match(report.summary.failClosedReasons.join("\n"), /host drift/);
		assert.equal(
			report.rows.find((row) => row.rowId === "missing-sku")?.guards
				.directLookupCount,
			0,
		);
	});

	it("supports Vea allowlisted source with source-specific host guards", async () => {
		const veaRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "2",
			sourceSlug: "vea",
			supermarketId: 20,
			productUrl: "https://www.vea.com.ar/leche-1/p",
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "vea",
			repository: repository([veaRow]),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					{
						ean: "7790001000011",
						skuId: "sku-1",
						productUrl: "https://www.vea.com.ar/leche-1/p",
						price: 990,
						listPrice: 1100,
						isAvailable: true,
					},
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "vea-direct-refresh-manifest-dry-run");
		assert.equal(report.source.slug, "vea");
		assert.equal(report.source.expectedHost, "vea.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing Vea row/);
		assert.match(report.identity.guards.join("\n"), /vea\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "vea", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.rows[0].sourceSlug, "vea");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("passes with mixed capacity evidence when selected rows passed capacity", async () => {
		const veaRows: DirectRefreshManifestExistingRow[] = [
			{
				...passRow,
				id: "1",
				sourceSlug: "vea",
				supermarketId: 20,
				productUrl: "https://www.vea.com.ar/leche-1/p",
			},
			{
				...passRow,
				id: "2",
				sourceSlug: "vea",
				supermarketId: 20,
				skuId: "sku-2",
				productUrl: "https://www.vea.com.ar/leche-2/p",
			},
			{
				...passRow,
				id: "3",
				sourceSlug: "vea",
				supermarketId: 20,
				skuId: "sku-3",
				productUrl: "https://www.vea.com.ar/leche-3/p",
			},
		];
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "vea",
			sampleSize: 2,
			candidateScanSize: 3,
			repository: repository(veaRows),
			capacityEvidence: capacityEvidence({
				rows: [
					{ rowId: "1", status: "FAIL" },
					{ rowId: "2", status: "PASS" },
					{ rowId: "3", status: "PASS" },
				],
			}),
			fetchDirectProducts: async (_sourceSlug, lookup) => [
				{
					ean:
						veaRows.find((row) => row.skuId === lookup.value)?.ean ?? "missing",
					skuId: lookup.value,
					productUrl: "https://www.vea.com.ar/leche/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		assert.equal(report.status, "PASS");
		assert.deepEqual(
			report.rows.map((row) => row.rowId),
			["2", "3"],
		);
		assert.equal(report.selection.capacityEvidence.applied, true);
		assert.equal(report.selection.capacityEvidence.passCandidateRows, 2);
		assert.equal(report.selection.capacityEvidence.excludedCandidateRows, 1);
		assert.equal(report.lineage.parentArtifacts[0].present, true);
		assert.equal(report.lineage.parentArtifacts[0].status, "WARN");
		assert.equal(
			report.lineage.parentArtifacts[0].source?.classification,
			"mixed",
		);
		assert.deepEqual(report.lineage.parentArtifacts[0].guardReasons, []);
	});

	it("fails when capacity-PASS manifest rows cannot fill the request", async () => {
		const veaRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "capacity-blocked",
			sourceSlug: "vea",
			supermarketId: 20,
			productUrl: "https://www.vea.com.ar/leche-1/p",
		};
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "vea",
			repository: repository([veaRow]),
			capacityEvidence: capacityEvidence({
				targetBatchSize: 1,
				viableRows: 1,
				recommendedBatchSize: 1,
				rows: [{ rowId: "capacity-blocked", status: "FAIL" }],
			}),
			fetchDirectProducts: async () => [
				{
					ean: "7790001000011",
					skuId: "sku-1",
					productUrl: "https://www.vea.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/insufficient capacity-PASS rows: selected 0 of 1/,
		);
		assert.deepEqual(report.rows, []);
		assert.equal(report.selection.capacityEvidence.passCandidateRows, 0);
		assert.equal(report.selection.capacityEvidence.excludedCandidateRows, 1);
	});

	it("fails on capacity source, count, viable row, and batch mismatches", async () => {
		const veaRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "1",
			sourceSlug: "vea",
			supermarketId: 20,
			productUrl: "https://www.vea.com.ar/leche-1/p",
		};
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "vea",
			sampleSize: 2,
			repository: repository([veaRow]),
			capacityEvidence: capacityEvidence({
				source: "disco",
				targetBatchSize: 1,
				viableRows: 1,
				recommendedBatchSize: 1,
				rows: [{ rowId: "1", status: "PASS" }],
			}),
			fetchDirectProducts: async () => [
				{
					ean: "7790001000011",
					skuId: "sku-1",
					productUrl: "https://www.vea.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /filters\.sources must be exactly vea/);
		assert.match(reasons, /targetBatchSize must equal requested sample size 2/);
		assert.match(reasons, /exactly one source entry for vea/);
	});

	it("fails on multi-source capacity evidence and issue mismatch", async () => {
		const veaRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "1",
			sourceSlug: "vea",
			supermarketId: 20,
			productUrl: "https://www.vea.com.ar/leche-1/p",
		};
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "vea",
			repository: repository([veaRow]),
			capacityEvidence: capacityEvidence({
				issue: 82,
				expectedIssueNumber: 169,
				targetBatchSize: 1,
				viableRows: 1,
				recommendedBatchSize: 1,
				filtersSources: ["vea", "mas"],
				summarySourceCount: 2,
				extraSources: [{ slug: "mas" }],
				rows: [{ rowId: "1", status: "PASS" }],
			}),
			fetchDirectProducts: async () => [
				{
					ean: "7790001000011",
					skuId: "sku-1",
					productUrl: "https://www.vea.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /filters\.sources must be exactly vea/);
		assert.match(reasons, /source-scoped to exactly one source/);
		assert.match(reasons, /summary\.sourceCount must be 1/);
		assert.match(reasons, /issue must equal expected issue 169/);
	});

	it("fails on missing selected rows and non-exact read-only capacity boundary", async () => {
		const veaRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "missing-from-capacity",
			sourceSlug: "vea",
			supermarketId: 20,
			productUrl: "https://www.vea.com.ar/leche-1/p",
		};
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "vea",
			repository: repository([veaRow]),
			capacityEvidence: capacityEvidence({
				targetBatchSize: 1,
				viableRows: 1,
				recommendedBatchSize: 1,
				writeBoundary:
					"read-only operating capacity audit; no production writes",
				rows: [{ rowId: "different-row", status: "PASS" }],
			}),
			fetchDirectProducts: async () => [
				{
					ean: "7790001000011",
					skuId: "sku-1",
					productUrl: "https://www.vea.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /write boundary must be read-only/);
		assert.match(reasons, /insufficient capacity-PASS rows: selected 0 of 10/);
		assert.deepEqual(report.rows, []);
	});

	it("preserves existing no-capacity behavior with absent capacity lineage", async () => {
		const report = await buildCarrefourDirectRefreshManifestDryRun({
			repository: repository([passRow]),
			fetchDirectProducts: async () => [
				{
					ean: "7790001000011",
					skuId: "sku-1",
					productUrl: "https://www.carrefour.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		assert.equal(report.status, "PASS");
		assert.deepEqual(report.summary.failClosedReasons, []);
		assert.equal(report.lineage.parentArtifacts[0].present, false);
		assert.deepEqual(report.lineage.parentArtifacts[0].guardReasons, []);
	});

	it("supports Disco allowlisted source with source-specific host guards", async () => {
		const discoRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "3",
			sourceSlug: "disco",
			supermarketId: 30,
			productUrl: "https://www.disco.com.ar/leche-1/p",
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "disco",
			repository: repository([discoRow]),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					{
						ean: "7790001000011",
						skuId: "sku-1",
						productUrl: "https://www.disco.com.ar/leche-1/p",
						price: 990,
						listPrice: 1100,
						isAvailable: true,
					},
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "disco-direct-refresh-manifest-dry-run");
		assert.equal(report.source.slug, "disco");
		assert.equal(report.source.expectedHost, "disco.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing Disco row/);
		assert.match(report.identity.guards.join("\n"), /disco\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "disco", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.rows[0].sourceSlug, "disco");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("supports Jumbo allowlisted source with source-specific host guards", async () => {
		const jumboRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "4",
			sourceSlug: "jumbo",
			supermarketId: 40,
			productUrl: "https://www.jumbo.com.ar/leche-1/p",
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "jumbo",
			repository: repository([jumboRow]),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					{
						ean: "7790001000011",
						skuId: "sku-1",
						productUrl: "https://www.jumbo.com.ar/leche-1/p",
						price: 990,
						listPrice: 1100,
						isAvailable: true,
					},
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "jumbo-direct-refresh-manifest-dry-run");
		assert.equal(report.source.slug, "jumbo");
		assert.equal(report.source.expectedHost, "jumbo.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing Jumbo row/);
		assert.match(report.identity.guards.join("\n"), /jumbo\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "jumbo", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.rows[0].sourceSlug, "jumbo");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("supports MAS allowlisted source with source-specific host guards", async () => {
		const masRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "5",
			sourceSlug: "mas",
			supermarketId: 50,
			productUrl: "https://www.masonline.com.ar/leche-1/p",
		};
		const lookups: Array<{ sourceSlug: string; kind: string; value: string }> =
			[];
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "mas",
			repository: repository([masRow]),
			fetchDirectProducts: async (sourceSlug, lookup) => {
				lookups.push({ sourceSlug, kind: lookup.kind, value: lookup.value });
				return [
					{
						ean: "7790001000011",
						skuId: "sku-1",
						productUrl: "https://www.masonline.com.ar/leche-1/p",
						price: 990,
						listPrice: 1100,
						isAvailable: true,
					},
				];
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.audit, "mas-direct-refresh-manifest-dry-run");
		assert.equal(report.source.slug, "mas");
		assert.equal(report.source.expectedHost, "masonline.com.ar");
		assert.match(report.identity.guards.join("\n"), /existing MAS row/);
		assert.match(report.identity.guards.join("\n"), /masonline\.com\.ar/);
		assert.deepEqual(lookups, [
			{ sourceSlug: "mas", kind: "sku-id", value: "sku-1" },
		]);
		assert.equal(report.rows[0].sourceSlug, "mas");
		assert.equal(report.rows[0].guards.carrefourHostOnly, true);
	});

	it("fails closed when MAS live URL drifts outside masonline.com.ar", async () => {
		const masRow: DirectRefreshManifestExistingRow = {
			...passRow,
			id: "mas-host-fail",
			sourceSlug: "mas",
			supermarketId: 50,
			productUrl: "https://www.masonline.com.ar/leche-1/p",
		};
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "mas",
			repository: repository([masRow]),
			fetchDirectProducts: async () => [
				{
					ean: "7790001000011",
					skuId: "sku-1",
					productUrl: "https://example.com/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/host is not masonline\.com\.ar/,
		);
	});

	it("selects 10 viable MAS rows from a bounded candidate scan and reports skipped rows", async () => {
		const masRows: DirectRefreshManifestExistingRow[] = Array.from(
			{ length: 12 },
			(_, index) => ({
				...passRow,
				id: String(index + 1),
				sourceSlug: "mas",
				supermarketId: 50,
				ean: `77910000000${String(index + 1).padStart(2, "0")}`,
				skuId: `mas-sku-${index + 1}`,
				productUrl: "https://www.masonline.com.ar/leche-1/p",
			}),
		);
		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "mas",
			sampleSize: 10,
			candidateScanSize: 12,
			repository: repository(masRows),
			fetchDirectProducts: async (_sourceSlug, lookup) => [
				{
					ean:
						masRows.find((row) => row.skuId === lookup.value)?.ean ?? "missing",
					skuId: lookup.value,
					productUrl:
						lookup.value === "mas-sku-1" || lookup.value === "mas-sku-2"
							? "https://example.com/leche-1/p"
							: "https://www.masonline.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.selection.candidateScanSize, 12);
		assert.equal(report.selection.selectedRows, 10);
		assert.equal(report.summary.passRows, 10);
		assert.equal(report.summary.failRows, 0);
		assert.equal(report.skippedRows.length, 2);
		assert.match(
			report.summary.skippedBlockedReasons.join("\n"),
			/host is not/,
		);
		assert.deepEqual(
			report.rows.map((row) => row.rowId),
			masRows.slice(2).map((row) => row.id),
		);
	});

	it("evaluates candidate repository lookups serially to avoid pool exhaustion", async () => {
		const masRows: DirectRefreshManifestExistingRow[] = Array.from(
			{ length: 12 },
			(_, index) => ({
				...passRow,
				id: String(index + 1),
				sourceSlug: "mas",
				supermarketId: 50,
				ean: `77910000000${String(index + 1).padStart(2, "0")}`,
				skuId: `mas-sku-${index + 1}`,
				productUrl: "https://www.masonline.com.ar/leche-1/p",
			}),
		);
		const repo = repository(masRows);
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

		const report = await buildDirectRefreshManifestDryRun({
			sourceSlug: "mas",
			sampleSize: 10,
			candidateScanSize: 12,
			repository: repo,
			fetchDirectProducts: async (_sourceSlug, lookup) => [
				{
					ean:
						masRows.find((row) => row.skuId === lookup.value)?.ean ?? "missing",
					skuId: lookup.value,
					productUrl: "https://www.masonline.com.ar/leche-1/p",
					price: 990,
					listPrice: 1100,
					isAvailable: true,
				},
			],
		});

		assert.equal(report.status, "PASS");
		assert.equal(maxActiveSourceSkuLookups, 1);
	});

	it("rejects unsupported scope before repository or network work", async () => {
		await assert.rejects(
			() =>
				buildDirectRefreshManifestDryRun({
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
					},
					fetchDirectProducts: async () => {
						throw new Error("network should not be called");
					},
				}),
			/restricted to allowlisted source/,
		);
	});

	it("fails closed when no rows are selected", async () => {
		const report = await buildCarrefourDirectRefreshManifestDryRun({
			repository: repository([]),
			fetchDirectProducts: async () => [],
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.selection.selectedRows, 0);
		assert.deepEqual(report.summary.failClosedReasons, ["no rows selected"]);
	});

	it("parses only allowlisted read-only CLI options", () => {
		assert.deepEqual(
			parseDirectRefreshManifestCliOptions([
				"node",
				"script",
				"--source=carrefour",
				"--sample-size=7",
				"--output=manifest.json",
			]),
			{
				source: "carrefour",
				sampleSize: 7,
				candidateScanSize: 7,
				output: "manifest.json",
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshManifestCliOptions([
				"node",
				"script",
				"--source=vea",
				"--sample-size=10",
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
			parseDirectRefreshManifestCliOptions([
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
			parseDirectRefreshManifestCliOptions([
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
			parseDirectRefreshManifestCliOptions(["node", "script", "--source=mas"]),
			{
				source: "mas",
				sampleSize: 10,
				candidateScanSize: 10,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(parseDirectRefreshManifestCliOptions(["node", "script"]), {
			source: "carrefour",
			sampleSize: 10,
			candidateScanSize: 10,
			output: null,
			capacityReport: null,
			issueNumber: null,
		});
		assert.deepEqual(
			parseDirectRefreshManifestCliOptions([
				"node",
				"script",
				"--source=mas",
				"--sample-size=10",
				"--candidate-scan-size=12",
			]),
			{
				source: "mas",
				sampleSize: 10,
				candidateScanSize: 12,
				output: null,
				capacityReport: null,
				issueNumber: null,
			},
		);
		assert.deepEqual(
			parseDirectRefreshManifestCliOptions([
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
			["node", "script", "--sample-size=10", "--candidate-scan-size=9"],
			["node", "script", "--capacity-report=audit/capacity-report.json"],
			["node", "script", "--all-source"],
			["node", "script", "--all-sources=true"],
			["node", "script", "--confirm-write"],
			["node", "script", "--cron=true"],
			["node", "script", "--cleanup"],
			["node", "script", "--deploy"],
		]) {
			assert.throws(
				() => parseDirectRefreshManifestCliOptions(argv),
				/carrefour|read-only|candidate-scan-size|issue-number/,
			);
		}
	});
});
