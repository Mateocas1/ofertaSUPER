import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildCategoryPaginationCatalogComparisonReport,
	normalizeCategoryPaginationCatalogComparisonOutputPath,
	parseCategoryPaginationCatalogComparisonCliOptions,
} from "../scripts/pipeline/category-pagination-catalog-comparison";

const generatedAt = new Date("2026-06-16T12:00:00.000Z");
const output = "audit/catalog-comparison/issue-320/vea/category-pagination/category-pagination-catalog-comparison.json";

describe("category pagination catalog comparison", () => {
	it("classifies known and likely missing candidates with source-scoped identity matching", () => {
		const report = buildCategoryPaginationCatalogComparisonReport({
			candidateArtifact: {
				__inputPath: "audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json",
				source: { slug: "vea" },
				candidates: [
					{ source: "vea", surface: "category-pagination", identityKind: "skuId", identity: "SKU-1", categoryPath: "almacen" },
					{ source: "vea", surface: "category-pagination", identityKind: "url", identity: "https://www.vea.com.ar/Missing/Product?utm=1", categoryPath: "bebidas" },
					{ source: "disco", surface: "category-pagination", identityKind: "skuId", identity: "SKU-1", categoryPath: "ignored" },
				],
			},
			catalogFixture: {
				__inputPath: "audit/catalog-snapshots/issue-320/vea/catalog-identities.json",
				rows: [
					{ source: "vea", skuId: "sku-1", productUrl: "https://www.vea.com.ar/known/product", ean: "7791111111111" },
					{ source: "disco", skuId: "sku-1", productUrl: "https://www.disco.com.ar/known/product", ean: "7791111111111" },
				],
			},
			generatedAt,
			issue: 320,
			outputPath: output,
			source: "vea",
		});

		assert.equal(report.posture.readOnly, true);
		assert.equal(report.posture.dbWrites, false);
		assert.equal(report.posture.productionWrites, false);
		assert.equal(report.posture.artifactOnly, true);
		assert.equal(report.counts.totalCandidates, 2);
		assert.equal(report.counts.knownCandidates, 1);
		assert.equal(report.counts.likelyMissingCandidates, 1);
		assert.equal(report.matchBreakdown.skuId.known, 1);
		assert.equal(report.samples.known[0]?.matchedBy, "skuId");
		assert.equal(report.samples.likelyMissing[0]?.identity.productUrl, "www.vea.com.ar/missing/product");
	});

	it("counts duplicate candidates inside the audit artifact", () => {
		const report = buildCategoryPaginationCatalogComparisonReport({
			candidateArtifact: {
				__inputPath: "audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json",
				candidates: [
					{ source: "vea", surface: "category-pagination", identityKind: "ean", identity: "7791111111111", categoryPath: "a" },
					{ source: "vea", surface: "category-pagination", identityKind: "ean", identity: "7791111111111", categoryPath: "b" },
				],
			},
			catalogFixture: { __inputPath: "audit/catalog-snapshots/issue-320/vea/catalog-identities.json", rows: [] },
			generatedAt,
			issue: 320,
			outputPath: output,
			source: "vea",
		});

		assert.equal(report.counts.duplicateCandidates, 1);
		assert.equal(report.samples.duplicates.length, 1);
		assert.equal(report.confidence.status, "WARN");
		assert.match(report.confidence.reasons.join("\n"), /duplicate candidate identities/);
	});

	it("reports conflicts when a candidate identity maps to multiple catalog rows", () => {
		const report = buildCategoryPaginationCatalogComparisonReport({
			candidateArtifact: {
				__inputPath: "audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json",
				candidates: [
					{ source: "vea", surface: "category-pagination", identityKind: "ean", identity: "7791111111111", categoryPath: "almacen" },
				],
			},
			catalogFixture: {
				__inputPath: "audit/catalog-snapshots/issue-320/vea/catalog-identities.json",
				rows: [
					{ source: "vea", skuId: "sku-a", ean: "7791111111111" },
					{ source: "vea", skuId: "sku-b", ean: "7791111111111" },
				],
			},
			generatedAt,
			issue: 320,
			outputPath: output,
			source: "vea",
		});

		assert.equal(report.counts.conflictCandidates, 1);
		assert.equal(report.counts.knownCandidates, 0);
		assert.equal(report.counts.likelyMissingCandidates, 0);
		assert.equal(report.matchBreakdown.ean.conflict, 1);
		assert.equal(report.confidence.status, "FAIL");
	});

	it("counts candidate and catalog rows with insufficient identity", () => {
		const report = buildCategoryPaginationCatalogComparisonReport({
			candidateArtifact: {
				__inputPath: "audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json",
				candidates: [{ source: "vea", surface: "category-pagination", identityKind: "name", identity: "Only Name", categoryPath: "almacen" }],
			},
			catalogFixture: {
				__inputPath: "audit/catalog-snapshots/issue-320/vea/catalog-identities.json",
				rows: [{ source: "vea", name: "Only Catalog Name" }],
			},
			generatedAt,
			issue: 320,
			outputPath: output,
			source: "vea",
		});

		assert.equal(report.counts.totalCandidates, 1);
		assert.equal(report.counts.insufficientIdentityRows, 2);
		assert.equal(report.samples.insufficientIdentity.length, 1);
		assert.equal(report.confidence.status, "WARN");
	});

	it("accepts a cross-issue category pagination candidate artifact for the requested source", () => {
		const options = parseCategoryPaginationCatalogComparisonCliOptions([
			"node",
			"script",
			"--source=vea",
			"--issue-number=320",
			"--candidate-artifact=audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json",
			"--catalog-fixture=audit/catalog-snapshots/issue-320/vea/catalog-identities.json",
		]);

		assert.equal(options.candidateArtifact, "audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json");
		assert.equal(options.output, output);
	});

	it("rejects a category pagination candidate artifact for a different source", () => {
		assert.throws(
			() => parseCategoryPaginationCatalogComparisonCliOptions([
				"node",
				"script",
				"--source=vea",
				"--issue-number=320",
				"--candidate-artifact=audit/coverage/issue-295/disco/category-pagination/category-pagination-audit.json",
				"--catalog-fixture=audit/catalog-snapshots/issue-320/vea/catalog-identities.json",
			]),
			/source must match --source \(vea\)/,
		);
	});

	it("rejects unsafe output paths and forbidden flags", () => {
		assert.equal(normalizeCategoryPaginationCatalogComparisonOutputPath(output, { issue: 320, source: "vea" }), output);
		assert.throws(
			() => normalizeCategoryPaginationCatalogComparisonOutputPath("audit/catalog-comparison/issue-320/disco/category-pagination/report.json", { issue: 320, source: "vea" }),
			/must be under audit\/catalog-comparison\/issue-320\/vea\/category-pagination\//,
		);
		assert.throws(
			() => parseCategoryPaginationCatalogComparisonCliOptions(["node", "script", "--source=vea", "--issue-number=320", "--candidate-artifact=a.json", "--catalog-fixture=b.json", "--apply"]),
			/rejects --apply/,
		);
		assert.throws(
			() => parseCategoryPaginationCatalogComparisonCliOptions(["node", "script", "--source=vea", "--issue-number=320", "--candidate-artifact=a.json", "--catalog-fixture=b.json"]),
			/must be under audit\/coverage\/issue-<positive-issue>\/vea\/category-pagination\/\*\.json/,
		);
	});
});
