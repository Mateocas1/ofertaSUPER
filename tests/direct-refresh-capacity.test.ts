import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	defaultDirectRefreshCapacityOutput,
	parseDirectRefreshCapacityCliOptions,
} from "../scripts/audit-direct-refresh-capacity";
import {
	buildDirectRefreshCapacityReport,
	type DirectRefreshCapacityRepository,
	type DirectRefreshCapacityRow,
	type DirectRefreshCapacitySource,
} from "../scripts/pipeline/direct-refresh-capacity";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("direct-refresh operating capacity audit", () => {
	it("aggregates denominator, freshness, viability, and chunks per source", async () => {
		const rows = [
			row("carrefour", "1", "ean-1", "sku-1", {
				lastCheckedAt: "2026-06-03T06:00:00.000Z",
			}),
			row("carrefour", "2", "ean-2", "sku-2", {
				lastCheckedAt: "2026-06-01T06:00:00.000Z",
			}),
			row("carrefour", "3", "ean-3", "sku-3", {
				lastCheckedAt: "2026-06-01T07:00:00.000Z",
			}),
			row("carrefour", "4", "ean-4", "sku-4", { price: null }),
		];
		const report = await buildDirectRefreshCapacityReport({
			repository: fakeRepository({ sources: [source("carrefour")], rows }),
			fetchDirectProducts: async (_sourceSlug, lookup) => [
				live("carrefour", `ean-${lookup.value.slice(-1)}`, lookup.value),
			],
			candidateScanSize: 3,
			targetBatchSize: 2,
			freshnessTargetsPercent: [80, 95, 100],
			now: NOW,
		});

		assert.equal(report.audit, "direct-refresh-operating-capacity");
		assert.equal(report.issue, 82);
		assert.equal(report.dryRun, true);
		assert.match(report.writeBoundary, /read-only/);
		assert.equal(report.status, "PASS");
		assert.equal(report.summary.publicRankableRows, 3);
		assert.equal(report.summary.freshRows, 1);
		assert.equal(report.summary.staleRows, 2);
		assert.equal(report.summary.viableRowsInScan, 3);
		assert.equal(
			report.summary.recommendedNextPhase,
			"phase-2-batch-size-generalization",
		);
		const carrefour = report.sources[0];
		assert.equal(carrefour.denominator.totalRows, 4);
		assert.equal(carrefour.denominator.publicRankableRows, 3);
		assert.equal(carrefour.denominator.excludedRows, 1);
		assert.equal(carrefour.candidateScan.viableRows, 3);
		assert.equal(carrefour.capacity.recommendedBatchSize, 2);
		assert.deepEqual(carrefour.capacity.estimatedRowsToRefresh, {
			"80": 2,
			"95": 2,
			"100": 2,
		});
		assert.deepEqual(carrefour.capacity.estimatedChunks, {
			"80": 1,
			"95": 1,
			"100": 1,
		});
	});

	it("counts guard blockers and excludes blocked rows from viable capacity", async () => {
		const rows = [
			row("carrefour", "1", "ean-1", "zero-products"),
			row("carrefour", "2", "ean-2", "zero-price"),
			row("carrefour", "3", "ean-3", "host-drift", {
				productUrl: "https://carrefour.com.ar/p",
			}),
			row("carrefour", "4", "ean-4", "unavailable"),
			row("carrefour", "5", "ean-5", "ean-mismatch"),
			row("carrefour", "6", "ean-6", "sku-mismatch"),
			row("carrefour", "7", "ean-7", "duplicate"),
			row("carrefour", "8", "ean-8", "delta", { price: 100 }),
			row("carrefour", "9", "ean-9", "duplicate"),
		];
		const report = await buildDirectRefreshCapacityReport({
			repository: fakeRepository({ sources: [source("carrefour")], rows }),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				if (lookup.value === "zero-products") return [];
				if (lookup.value === "zero-price")
					return [live("carrefour", "ean-2", lookup.value, { price: 0 })];
				if (lookup.value === "host-drift")
					return [live("vea", "ean-3", lookup.value)];
				if (lookup.value === "unavailable")
					return [
						live("carrefour", "ean-4", lookup.value, { isAvailable: false }),
					];
				if (lookup.value === "ean-mismatch")
					return [live("carrefour", "other", lookup.value)];
				if (lookup.value === "sku-mismatch")
					return [live("carrefour", "ean-6", "other-sku")];
				if (lookup.value === "delta")
					return [live("carrefour", "ean-8", lookup.value, { price: 500 })];
				return [live("carrefour", `ean-${lookup.value}`, lookup.value)];
			},
			candidateScanSize: 8,
			targetBatchSize: 2,
			now: NOW,
		});

		const reasons = report.sources[0].blockers
			.map((blocker) => blocker.reason)
			.join("\n");
		assert.match(reasons, /direct sku-id lookup returned 0 live products/);
		assert.match(reasons, /live price is not positive/);
		assert.match(reasons, /live product URL host is not carrefour.com.ar/);
		assert.match(reasons, /existing\/live product URL host drift/);
		assert.match(reasons, /live product is unavailable/);
		assert.match(reasons, /direct lookup EAN does not match existing EAN/);
		assert.match(reasons, /direct lookup SKU does not match existing SKU/);
		assert.match(reasons, /sourceSlug\+skuId is not unique/);
		assert.match(reasons, /live price delta exceeds 200%/);
		assert.equal(report.sources[0].candidateScan.viableRows, 0);
		assert.equal(report.sources[0].classification, "excluded");
		assert.equal(report.status, "FAIL");
		assert.match(
			report.stopConditions.join("\n"),
			/no viable direct-refresh rows/,
		);
	});

	it("classifies DIA as audit-only and never writer-supported", async () => {
		const rows = [
			row("dia", "1", "ean-1", "sku-1", {
				productUrl: "https://diaonline.supermercadosdia.com.ar/p",
			}),
			row("dia", "2", "ean-2", "sku-2"),
		];
		const report = await buildDirectRefreshCapacityReport({
			repository: fakeRepository({ sources: [source("dia", "DIA")], rows }),
			fetchDirectProducts: async (_sourceSlug, lookup) =>
				lookup.value === "sku-1" ? [live("dia", "ean-1", lookup.value)] : [],
			candidateScanSize: 2,
			targetBatchSize: 1,
			now: NOW,
		});

		const dia = report.sources[0];
		assert.equal(dia.slug, "dia");
		assert.equal(dia.directRefreshSupport, "audit-only-no-writer");
		assert.equal(dia.classification, "mixed");
		assert.equal(dia.status, "WARN");
		assert.match(dia.recommendation, /do not schedule or write/);
	});

	it("computes candidate scan rows needed to fill the target batch", async () => {
		const rows = Array.from({ length: 40 }, (_, index) =>
			row("mas", String(index + 1), `ean-${index + 1}`, `sku-${index + 1}`),
		);
		const report = await buildDirectRefreshCapacityReport({
			repository: fakeRepository({ sources: [source("mas", "MAS")], rows }),
			fetchDirectProducts: async (_sourceSlug, lookup) => {
				const id = Number(lookup.value.replace("sku-", ""));
				return id <= 10 ? [live("mas", `ean-${id}`, lookup.value)] : [];
			},
			candidateScanSize: 40,
			targetBatchSize: 25,
			now: NOW,
		});

		const mas = report.sources[0];
		assert.equal(mas.candidateScan.viableRows, 10);
		assert.equal(mas.candidateScan.scanRowsNeededForBatch, 100);
		assert.equal(mas.capacity.recommendedCandidateScanSize, 100);
		assert.equal(mas.status, "WARN");
		assert.match(mas.recommendation, /increase candidate scan evidence/);
	});

	it("rejects unsafe CLI flags and parses defaults/output", () => {
		assert.throws(
			() => parseDirectRefreshCapacityCliOptions(["node", "script", "--write"]),
			/read-only/,
		);
		assert.throws(
			() =>
				parseDirectRefreshCapacityCliOptions([
					"node",
					"script",
					"--scheduler=true",
				]),
			/read-only/,
		);
		const options = parseDirectRefreshCapacityCliOptions([
			"node",
			"script",
			"--source=carrefour,dia",
			"--candidate-scan-size=50",
			"--target-batch-size=25",
			"--sla-hours=12",
			"--freshness-targets=80,95,100",
			"--max-price-delta-percent=150",
			"--output=audit/out.json",
		]);
		assert.deepEqual(options, {
			sources: ["carrefour", "dia"],
			candidateScanSize: 50,
			targetBatchSize: 25,
			slaHours: 12,
			freshnessTargetsPercent: [80, 95, 100],
			maxPriceDeltaPercent: 150,
			output: "audit/out.json",
		});
		assert.match(
			defaultDirectRefreshCapacityOutput(new Date("2026-06-03T12:00:00.000Z")),
			/^audit\/operations-capacity\/2026-06-03T12-00-00-000Z\/capacity-report\.json$/,
		);
	});
});

function fakeRepository({
	sources,
	rows,
}: {
	sources: DirectRefreshCapacitySource[];
	rows: DirectRefreshCapacityRow[];
}): DirectRefreshCapacityRepository {
	return {
		async listSources(sourceSlugs) {
			return sources.filter(
				(source) => !sourceSlugs?.length || sourceSlugs.includes(source.slug),
			);
		},
		async listRowsForDenominator(sourceSlug) {
			return rows.filter((row) => row.sourceSlug === sourceSlug);
		},
		async listOldestPublicRankableRows(sourceSlug, limit) {
			return rows
				.filter(
					(row) =>
						row.sourceSlug === sourceSlug &&
						row.price !== null &&
						row.price > 0,
				)
				.slice(0, limit);
		},
		async findRowsBySourceSku(sourceSlug, skuId) {
			return rows.filter(
				(row) => row.sourceSlug === sourceSlug && row.skuId === skuId,
			);
		},
	};
}

function source(slug: string, displayName = slug): DirectRefreshCapacitySource {
	return {
		id: 1,
		slug,
		displayName,
		baseUrl: `https://${slug}.example.com`,
		freshnessSlaHours: 24,
	};
}

function row(
	sourceSlug: string,
	id: string,
	ean: string,
	skuId: string,
	overrides: Partial<DirectRefreshCapacityRow> = {},
): DirectRefreshCapacityRow {
	return {
		id,
		sourceSlug,
		supermarketId: 1,
		ean,
		skuId,
		productUrl: `https://${sourceSlugHost(sourceSlug)}/p`,
		lastCheckedAt: "2026-06-01T00:00:00.000Z",
		price: 100,
		listPrice: 120,
		isAvailable: true,
		product: { ean, name: `Product ${id}` },
		...overrides,
	};
}

function live(
	sourceSlug: string,
	ean: string,
	skuId: string,
	overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
	return {
		ean,
		name: `Live ${ean}`,
		brand: null,
		description: null,
		imageUrl: null,
		images: [],
		category: null,
		skuId,
		sellerId: null,
		productUrl: `https://${sourceSlugHost(sourceSlug)}/p`,
		price: 100,
		listPrice: 120,
		referencePrice: null,
		referenceUnit: null,
		isAvailable: true,
		...overrides,
	};
}

function sourceSlugHost(sourceSlug: string) {
	if (sourceSlug === "carrefour") return "carrefour.com.ar";
	if (sourceSlug === "vea") return "vea.com.ar";
	if (sourceSlug === "disco") return "disco.com.ar";
	if (sourceSlug === "jumbo") return "jumbo.com.ar";
	if (sourceSlug === "mas") return "masonline.com.ar";
	if (sourceSlug === "dia") return "diaonline.supermercadosdia.com.ar";
	return `${sourceSlug}.example.com`;
}
