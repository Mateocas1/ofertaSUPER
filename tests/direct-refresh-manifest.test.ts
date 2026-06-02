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
			{ source: "carrefour", sampleSize: 7, output: "manifest.json" },
		);
		assert.deepEqual(
			parseDirectRefreshManifestCliOptions([
				"node",
				"script",
				"--source=vea",
				"--sample-size=10",
			]),
			{ source: "vea", sampleSize: 10, output: null },
		);
		assert.deepEqual(
			parseDirectRefreshManifestCliOptions([
				"node",
				"script",
				"--source=disco",
			]),
			{ source: "disco", sampleSize: 10, output: null },
		);
		assert.deepEqual(parseDirectRefreshManifestCliOptions(["node", "script"]), {
			source: "carrefour",
			sampleSize: 10,
			output: null,
		});
		for (const argv of [
			["node", "script", "--source=dia"],
			["node", "script", "--source=carrefour,dia"],
			["node", "script", "--all-source"],
			["node", "script", "--all-sources=true"],
			["node", "script", "--confirm-write"],
			["node", "script", "--cron=true"],
			["node", "script", "--cleanup"],
			["node", "script", "--deploy"],
		]) {
			assert.throws(
				() => parseDirectRefreshManifestCliOptions(argv),
				/carrefour|read-only/,
			);
		}
	});
});
