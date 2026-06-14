import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildCategoryPaginationAuditReport,
	getCategoryPaginationSourceConfig,
	normalizeCategoryPaginationOutputPath,
	parseCategoryPaginationCliOptions,
	type CategoryPaginationCategory,
} from "../scripts/pipeline/category-pagination-audit";

const generatedAt = new Date("2026-06-14T12:00:00.000Z");
const output = "audit/coverage/issue-258/vea/category-pagination/category-pagination-audit.json";
const discoOutput = "audit/coverage/issue-263/disco/category-pagination/category-pagination-audit.json";
const issue260Output = "audit/coverage/issue-260/vea/category-pagination/category-pagination-audit.json";
const category: CategoryPaginationCategory = {
	id: "1",
	name: "Almacen",
	path: "almacen",
	url: "https://www.vea.com.ar/almacen",
};

describe("category pagination audit", () => {
	it("builds a bounded read-only category pagination artifact", () => {
		const report = buildCategoryPaginationAuditReport({
			generatedAt,
			issue: 258,
			outputPath: output,
			requestBudget: 5,
			categoryBudget: 1,
			pageBudget: 2,
			pageSize: 2,
			timeoutMs: 1000,
			categoryTreeStatus: 200,
			categories: [category],
			pages: [{
				category,
				page: 0,
				from: 0,
				to: 1,
				endpoint: "https://www.vea.com.ar/api/catalog_system/pub/products/search/almacen?_from=0&_to=1",
				status: 206,
				contentRange: "resources 0-1/20",
				products: [
					{ ean: "7791111111111", skuId: "sku-1", productUrl: "https://www.vea.com.ar/a/p", name: "A" },
					{ ean: "7791111111111", skuId: "sku-1", productUrl: "https://www.vea.com.ar/a/p", name: "A" },
				],
			}],
			errors: [],
		});

		assert.equal(report.audit, "vea-category-pagination-discovery-surface");
		assert.equal(report.readOnly, true);
		assert.equal(report.exhaustive, false);
		assert.equal(report.posture.dbWrites, false);
		assert.equal(report.posture.artifactWrites, "issue-258-category-pagination-audit-only");
		assert.equal(report.lineage.tool, "scripts/audit-category-pagination.ts");
		assert.equal(report.surface.pagination.style, "_from/_to");
		assert.equal(report.counts.denominatorCandidates, 1);
		assert.equal(report.counts.duplicateRows, 1);
		assert.equal(report.endpointBehavior.categoryTree.categoriesDiscovered, 1);
		assert.match(report.lineage.writeBoundary, /no DB writes/);
	});

	it("fails closed on bounded stop reasons and ambiguous products", () => {
		const report = buildCategoryPaginationAuditReport({
			generatedAt,
			issue: 258,
			outputPath: output,
			requestBudget: 2,
			categoryBudget: 1,
			pageBudget: 1,
			pageSize: 1,
			timeoutMs: 1000,
			categoryTreeStatus: 200,
			categories: [category, { ...category, id: "2", path: "bebidas" }],
			pages: [{
				category,
				page: 0,
				from: 0,
				to: 0,
				endpoint: "https://www.vea.com.ar/api/catalog_system/pub/products/search/almacen?_from=0&_to=0",
				status: 206,
				contentRange: null,
				products: [{}],
			}],
			errors: [],
		});

		assert.equal(report.confidence.status, "FAIL");
		assert.equal(report.budgets.stopCondition.triggered, true);
		assert.match(report.confidence.reasons.join("\n"), /category budget reached/);
		assert.match(report.confidence.reasons.join("\n"), /page budget reached/);
		assert.match(report.confidence.reasons.join("\n"), /ambiguous products/);
	});

	it("accepts the approved Vea source and issue-scoped output path", () => {
		const options = parseCategoryPaginationCliOptions([
			"node",
			"script",
			"--source=vea",
			`--output=${output}`,
			"--request-budget=7",
			"--category-budget=2",
			"--page-budget=3",
			"--page-size=4",
			"--timeout-ms=5000",
			"--issue-number=258",
			"--generated-at=2026-06-14T12:00:00.000Z",
		]);

		assert.deepEqual(options, {
			source: "vea",
			output,
			requestBudget: 7,
			categoryBudget: 2,
			pageBudget: 3,
			pageSize: 4,
			timeoutMs: 5000,
			issue: 258,
			generatedAt: "2026-06-14T12:00:00.000Z",
		});
		assert.throws(() => parseCategoryPaginationCliOptions(["node", "script", "--write"]), /rejects --write/);
		assert.throws(() => normalizeCategoryPaginationOutputPath("audit/coverage/issue-258/vea/other.json"), /must be under/);
	});

	it("accepts and configures the approved Disco source", () => {
		const options = parseCategoryPaginationCliOptions([
			"node",
			"script",
			"--source=disco",
			`--output=${discoOutput}`,
			"--issue-number=263",
		]);
		const report = buildCategoryPaginationAuditReport({
			generatedAt,
			source: options.source,
			issue: options.issue,
			outputPath: options.output,
			requestBudget: 5,
			categoryBudget: 1,
			pageBudget: 2,
			pageSize: 2,
			timeoutMs: 1000,
			categoryTreeStatus: 200,
			categories: [{ ...category, url: "https://www.disco.com.ar/almacen" }],
			pages: [{
				category,
				page: 0,
				from: 0,
				to: 1,
				endpoint: "https://www.disco.com.ar/api/catalog_system/pub/products/search/almacen?_from=0&_to=1",
				status: 206,
				contentRange: null,
				products: [{ ean: "7792222222222", productUrl: "https://www.disco.com.ar/a/p", name: "A" }],
			}],
			errors: [],
		});

		assert.equal(options.source, "disco");
		assert.equal(options.output, discoOutput);
		assert.deepEqual(getCategoryPaginationSourceConfig("disco"), {
			slug: "disco",
			baseUrl: "https://www.disco.com.ar",
		});
		assert.equal(report.audit, "disco-category-pagination-discovery-surface");
		assert.equal(report.source.slug, "disco");
		assert.equal(report.source.baseUrl, "https://www.disco.com.ar");
		assert.equal(report.candidates[0]?.source, "disco");
		assert.match(report.lineage.writeBoundary, /audit\/coverage\/issue-263\/disco\/category-pagination\//);
	});

	it("rejects unsupported category pagination sources", () => {
		assert.throws(() => parseCategoryPaginationCliOptions(["node", "script", "--source=jumbo"]), /approved only/);
		assert.throws(() => parseCategoryPaginationCliOptions(["node", "script", "--source=unknown"]), /approved only/);
	});

	it("accepts the supplied issue-numbered output boundary", () => {
		const options = parseCategoryPaginationCliOptions([
			"node",
			"script",
			"--source=vea",
			`--output=${issue260Output}`,
			"--issue-number=260",
		]);

		assert.equal(options.issue, 260);
		assert.equal(options.output, issue260Output);
		assert.equal(normalizeCategoryPaginationOutputPath(issue260Output, {
			issue: 260,
			source: "vea",
			surface: "category-pagination",
		}), issue260Output);
	});

	it("rejects writes outside the supplied issue-numbered output boundary", () => {
		assert.throws(
			() => parseCategoryPaginationCliOptions(["node", "script", `--output=${output}`, "--issue-number=260"]),
			/must be under audit\/coverage\/issue-260\/vea\/category-pagination\//,
		);
		assert.throws(
			() => normalizeCategoryPaginationOutputPath("audit/coverage/issue-260/vea/other.json", {
				issue: 260,
				source: "vea",
				surface: "category-pagination",
			}),
			/must be under audit\/coverage\/issue-260\/vea\/category-pagination\//,
		);
	});
});
