import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshFeasibilityCliOptions } from "../scripts/audit-direct-refresh-feasibility";
import {
	buildDirectRefreshFeasibilityReport,
	type DirectRefreshExistingRow,
	type DirectRefreshLookup,
} from "../scripts/pipeline/direct-refresh-feasibility";

const rows: DirectRefreshExistingRow[] = [
	{
		id: "url",
		sourceSlug: "vea",
		ean: "111",
		skuId: null,
		productUrl: "https://www.vea.com.ar/leche/p",
	},
	{
		id: "sku",
		sourceSlug: "vea",
		ean: "222",
		skuId: "sku-222",
		productUrl: null,
	},
	{ id: "ean", sourceSlug: "vea", ean: "333", skuId: null, productUrl: null },
	{
		id: "missing",
		sourceSlug: "vea",
		ean: null,
		skuId: null,
		productUrl: null,
	},
	{
		id: "ambiguous",
		sourceSlug: "dia",
		ean: "444",
		skuId: null,
		productUrl: null,
	},
	{
		id: "drift",
		sourceSlug: "dia",
		ean: "555",
		skuId: null,
		productUrl: "https://dia.com.ar/arroz/p",
	},
];

function repository(extraRows: DirectRefreshExistingRow[] = []) {
	const allRows = [...rows, ...extraRows];
	return {
		async listSources(slugs?: string[]) {
			return [{ slug: "vea" }, { slug: "dia" }].filter(
				(source) => !slugs?.length || slugs.includes(source.slug),
			);
		},
		async listOldestPublicRankableRows(sourceSlug: string) {
			return allRows.filter((row) => row.sourceSlug === sourceSlug);
		},
		async findRowsBySourceEan(sourceSlug: string, ean: string) {
			return allRows.filter(
				(row) => row.sourceSlug === sourceSlug && row.ean === ean,
			);
		},
	};
}

function lookupKey(lookup: DirectRefreshLookup) {
	return `${lookup.kind}:${lookup.value}`;
}

describe("direct refresh feasibility", () => {
	it("classifies direct SKU and unique EAN probes without using source-url search", async () => {
		const probes: DirectRefreshLookup[] = [];
		const report = await buildDirectRefreshFeasibilityReport({
			repository: repository(),
			sourceSlugs: ["vea"],
			fetchProducts: async (_sourceSlug, lookup) => {
				probes.push(lookup);
				return (
					{
						"ean:111": [
							{
								ean: "111",
								skuId: null,
								productUrl: "https://www.vea.com.ar/leche/p?utm=1",
							},
						],
						"sku-id:sku-222": [
							{ ean: "222", skuId: "sku-222", productUrl: null },
						],
						"ean:333": [{ ean: "333", skuId: null, productUrl: null }],
					}[lookupKey(lookup)] ?? []
				);
			},
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.sources[0].recommendation, "search-fallback");
		assert.deepEqual(
			report.sources[0].rows.map((row) => row.status),
			["viable", "viable", "viable", "unviable"],
		);
		assert.match(
			report.sources[0].rows[0].reasons.join("\n"),
			/direct ean lookup matched existing row/,
		);
		assert.match(
			report.sources[0].rows[3].reasons.join("\n"),
			/no stable identifier/,
		);
		assert.deepEqual(probes.map(lookupKey), [
			"ean:111",
			"sku-id:sku-222",
			"ean:333",
		]);
		assert.equal(
			report.writeBoundary,
			"read-only feasibility only; no persistence or scheduler side effects",
		);
	});

	it("distinguishes ambiguous candidates, source drift, collisions, and SKU mismatch", async () => {
		const report = await buildDirectRefreshFeasibilityReport({
			repository: repository([
				{
					id: "ambiguous-2",
					sourceSlug: "dia",
					ean: "444",
					skuId: null,
					productUrl: null,
				},
				{
					id: "sku-mismatch",
					sourceSlug: "dia",
					ean: "666",
					skuId: "sku-666",
					productUrl: null,
				},
				{
					id: "collision",
					sourceSlug: "dia",
					ean: "777",
					skuId: "sku-777",
					productUrl: null,
				},
			]),
			fetchProducts: async (_sourceSlug, lookup) => {
				if (lookupKey(lookup) === "ean:444")
					return [{ ean: "444", skuId: null, productUrl: null }];
				if (lookupKey(lookup) === "ean:555")
					return [
						{
							ean: "555",
							skuId: null,
							productUrl: "https://other.example/arroz/p",
						},
					];
				if (lookupKey(lookup) === "sku-id:sku-666")
					return [{ ean: "666", skuId: "changed", productUrl: null }];
				if (lookupKey(lookup) === "sku-id:sku-777")
					return [
						{ ean: "777", skuId: "sku-777", productUrl: null },
						{ ean: "777", skuId: "sku-777-b", productUrl: null },
					];
				return [];
			},
		});

		const dia = report.sources.find((source) => source.slug === "dia");
		assert.equal(dia?.recommendation, "larger-bounded-chunks");
		assert.deepEqual(
			dia?.rows.map((row) => row.status),
			["ambiguous", "unviable", "ambiguous", "ambiguous", "ambiguous"],
		);
		assert.match(
			dia?.rows[0].reasons.join("\n") ?? "",
			/EAN maps to 2 existing rows/,
		);
		assert.match(dia?.rows[1].reasons.join("\n") ?? "", /source host drift/);
		assert.match(dia?.rows[3].reasons.join("\n") ?? "", /SKU does not match/);
		assert.match(
			dia?.rows[4].reasons.join("\n") ?? "",
			/direct sku-id lookup returned 2 live products/,
		);
		assert.equal(report.status, "WARN");
	});

	it("fails closed when direct lookup returns zero products and keeps CLI read-only", async () => {
		const report = await buildDirectRefreshFeasibilityReport({
			repository: {
				...repository(),
				async listSources() {
					return [{ slug: "x" }];
				},
				async listOldestPublicRankableRows() {
					return [
						{
							id: "x1",
							sourceSlug: "x",
							ean: "999",
							skuId: "sku-999",
							productUrl: null,
						},
					];
				},
			},
			fetchProducts: async () => [],
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.sources[0].recommendation, "stop");
		assert.match(
			report.sources[0].rows[0].reasons.join("\n"),
			/no direct lookup returned a live product/,
		);
		assert.deepEqual(
			parseDirectRefreshFeasibilityCliOptions([
				"node",
				"script",
				"--source=vea,dia",
				"--sample-size=2",
				"--count=3",
				"--output=a0-direct.json",
			]),
			{
				sources: ["vea", "dia"],
				sampleSize: 2,
				count: 3,
				output: "a0-direct.json",
			},
		);
		assert.throws(
			() =>
				parseDirectRefreshFeasibilityCliOptions([
					"node",
					"script",
					"--confirm-write",
				]),
			/read-only/,
		);
	});
});
