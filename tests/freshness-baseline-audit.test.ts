import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseFreshnessBaselineCliOptions } from "../scripts/audit-freshness-baseline";
import {
	buildFreshnessBaselineReport,
	evaluateFreshnessDenominatorDeltas,
	type FreshnessBaselineRepository,
} from "../scripts/pipeline/freshness-baseline";

const fixedNow = new Date("2026-05-28T00:00:00.000Z");

function createRepository(): FreshnessBaselineRepository {
	return {
		async listSources(slugs) {
			const sources = [
				{ id: 1, slug: "disco", name: "Disco", freshnessSlaHours: 24 },
				{ id: 2, slug: "jumbo", name: "Jumbo", freshnessSlaHours: 24 },
			];

			return slugs
				? sources.filter((source) => slugs.includes(source.slug))
				: sources;
		},
		async listRows(sourceSlugs) {
			return [
				{
					productEan: "1111111111111",
					productName: "Leche reciente",
					sourceSlug: "disco",
					price: 1200,
					isAvailable: true,
					lastCheckedAt: "2026-05-27T18:00:00.000Z",
				},
				{
					productEan: "2222222222222",
					productName: "Yerba vieja",
					sourceSlug: "disco",
					price: 3000,
					isAvailable: true,
					lastCheckedAt: "2026-05-20T00:00:00.000Z",
				},
				{
					productEan: "3333333333333",
					productName: "",
					sourceSlug: "disco",
					price: 1500,
					isAvailable: true,
					lastCheckedAt: "2026-05-20T00:00:00.000Z",
				},
				{
					productEan: "",
					productName: "Producto sin EAN",
					sourceSlug: "disco",
					price: 1300,
					isAvailable: true,
					lastCheckedAt: "2026-05-20T00:00:00.000Z",
				},
				{
					productEan: "0000000000000",
					productName: "Aceite viejo no disponible",
					sourceSlug: "jumbo",
					price: 1,
					isAvailable: false,
					lastCheckedAt: "2026-05-20T00:00:00.000Z",
				},
				{
					productEan: "4444444444444",
					productName: "Producto sin precio",
					sourceSlug: "jumbo",
					price: null,
					isAvailable: true,
					lastCheckedAt: "2026-05-20T00:00:00.000Z",
				},
				{
					productEan: "5555555555555",
					productName: "Producto precio invalido",
					sourceSlug: "jumbo",
					price: 0,
					isAvailable: true,
					lastCheckedAt: "2026-05-20T00:00:00.000Z",
				},
				{
					productEan: "6666666666666",
					productName: "Arroz sin fecha",
					sourceSlug: "jumbo",
					price: 900,
					isAvailable: true,
					lastCheckedAt: null,
				},
				{
					productEan: null,
					productName: null,
					sourceSlug: "jumbo",
					price: null,
					isAvailable: false,
					lastCheckedAt: null,
				},
			].filter((row) => sourceSlugs.includes(row.sourceSlug));
		},
		async getStagingState() {
			return { runningRuns: 0, pendingStagingRows: 0 };
		},
	};
}

describe("freshness baseline audit", () => {
	it("builds production-only denominator and exclusion bucket metrics", async () => {
		const report = await buildFreshnessBaselineReport({
			repository: createRepository(),
			now: fixedNow,
			sampleSize: 2,
			targetPercent: 95,
		});

		assert.equal(report.audit, "freshness-baseline");
		assert.equal(report.filters.basis, "production");
		assert.equal(report.summary.totalRows, 9);
		assert.equal(report.summary.freshRows, 1);
		assert.equal(report.summary.staleRows, 6);
		assert.equal(report.summary.unknownRows, 2);
		assert.equal(report.summary.unavailableRows, 2);
		assert.equal(report.summary.overallFreshnessPercent, 11.11);
		assert.equal(report.status, "WARN");
		assert.equal(report.denominators.primary.publicRankableRows, 3);
		assert.equal(report.denominators.primary.excludedRows, 6);
		assert.equal(report.denominators.secondary.allExistingRows, 9);
		assert.equal(
			report.denominators.primary.exclusionBucketSemantics,
			"reasonCounts",
		);
		assert.deepEqual(report.denominators.primary.exclusionBuckets.global, {
			unavailable: 2,
			missingPrice: 2,
			invalidPrice: 1,
			missingProductName: 2,
			missingProductEan: 2,
			unknownNonRankable: 0,
		});
		assert.deepEqual(
			report.denominators.primary.exclusionBuckets.bySource.find(
				(source) => source.slug === "disco",
			),
			{
				slug: "disco",
				totalRows: 4,
				publicRankableRows: 2,
				excludedRows: 2,
				unavailable: 0,
				missingPrice: 0,
				invalidPrice: 0,
				missingProductName: 1,
				missingProductEan: 1,
				unknownNonRankable: 0,
			},
		);
		assert.equal(
			report.sources.find((source) => source.slug === "disco")?.freshRows,
			1,
		);
		assert.equal(report.stalePublicRankingExamples[0]?.ean, "2222222222222");
		assert.ok(
			report.stalePublicRankingExamples.every(
				(example) =>
					example.ean !== "0000000000000" &&
					example.ean !== "3333333333333" &&
					example.ean !== "",
			),
		);
	});

	it("fails denominator delta checks on unresolved public-rankable shrinkage", async () => {
		const current = {
			globalPublicRankableRows: 98,
			sources: [
				{ slug: "disco", publicRankableRows: 39 },
				{ slug: "jumbo", publicRankableRows: 59 },
			],
		};
		const previous = {
			globalPublicRankableRows: 130,
			sources: [
				{ slug: "disco", publicRankableRows: 50 },
				{ slug: "jumbo", publicRankableRows: 59 },
				{ slug: "mas", publicRankableRows: 21 },
			],
		};
		const unresolved = evaluateFreshnessDenominatorDeltas({
			current,
			previous,
			requireComparison: true,
		});

		assert.equal(unresolved.status, "FAIL");
		assert.match(
			unresolved.blockers.join("\n"),
			/global public-rankable denominator shrank/,
		);
		assert.match(
			unresolved.blockers.join("\n"),
			/disco public-rankable denominator shrank/,
		);
		assert.match(
			unresolved.blockers.join("\n"),
			/mas public-rankable denominator shrank/,
		);

		const explained = evaluateFreshnessDenominatorDeltas({
			current,
			previous,
			requireComparison: true,
			explanations: [
				{ scope: "global", reason: "source availability policy reviewed" },
				{
					scope: "source",
					slug: "disco",
					reason: "source availability policy reviewed",
				},
				{
					scope: "source",
					slug: "mas",
					reason: "source availability policy reviewed",
				},
			],
		});

		assert.equal(explained.status, "PASS");
		assert.equal(explained.blockers.length, 0);

		const roundingEdgeCase = evaluateFreshnessDenominatorDeltas({
			current: {
				globalPublicRankableRows: 989,
				sources: [{ slug: "disco", publicRankableRows: 989 }],
			},
			previous: {
				globalPublicRankableRows: 999,
				sources: [{ slug: "disco", publicRankableRows: 999 }],
			},
			requireComparison: true,
		});

		assert.equal(roundingEdgeCase.status, "FAIL");
		assert.match(roundingEdgeCase.blockers.join("\n"), /1%/);

		const missingPrevious = evaluateFreshnessDenominatorDeltas({
			current,
			requireComparison: true,
		});

		assert.equal(missingPrevious.status, "FAIL");
		assert.match(missingPrevious.blockers.join("\n"), /previous denominator/i);
	});

	it("reports denominator delta failures in baseline status when comparison is required", async () => {
		const report = await buildFreshnessBaselineReport({
			repository: createRepository(),
			now: fixedNow,
			denominatorDelta: { requireComparison: true, previous: { globalPublicRankableRows: 20, sources: [{ slug: "disco", publicRankableRows: 15 }, { slug: "jumbo", publicRankableRows: 5 }] } },
		});

		assert.equal(report.denominatorDeltas.status, "FAIL");
		assert.equal(report.status, "FAIL");
		assert.match(report.denominatorDeltas.blockers.join("\n"), /global public-rankable denominator shrank/);
	});

	it("fails under an explicit freshness threshold and rejects unknown source filters", async () => {
		const failing = await buildFreshnessBaselineReport({
			repository: createRepository(),
			now: fixedNow,
			failUnderPercent: 50,
		});

		assert.equal(failing.status, "FAIL");
		await assert.rejects(
			() =>
				buildFreshnessBaselineReport({
					repository: createRepository(),
					sourceSlugs: ["missing"],
				}),
			/unknown source slug/,
		);
	});

	it("parses CLI flags and rejects write-shaped flags", () => {
		assert.deepEqual(
			parseFreshnessBaselineCliOptions([
				"node",
				"script",
				"--source=disco,jumbo",
				"--sample-size=3",
				"--fail-under=80",
				"--output=audit/baseline.json",
			]),
			{
				sources: ["disco", "jumbo"],
				sampleSize: 3,
				targetPercent: 95,
				failUnderPercent: 80,
				output: "audit/baseline.json",
			},
		);

		assert.throws(
			() =>
				parseFreshnessBaselineCliOptions(["node", "script", "--confirm-write"]),
			/read-only/,
		);
	});

	it("has package scripts wired and no DB-write primitives in audit files", () => {
		const packageJson = readFileSync("package.json", "utf8");
		assert.match(
			packageJson,
			/"audit:freshness-baseline": "tsx scripts\/audit-freshness-baseline\.ts"/,
		);

		for (const filePath of [
			"scripts/audit-freshness-baseline.ts",
			"scripts/pipeline/freshness-baseline.ts",
		]) {
			const source = readFileSync(filePath, "utf8");
			assert.doesNotMatch(
				source,
				/\b(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/,
			);
			assert.doesNotMatch(
				source,
				/\$executeRaw|stageSourceProducts\(|from ["'].*reconcile|setCachedJson\(|\bredis\b/i,
			);
		}
	});
});
