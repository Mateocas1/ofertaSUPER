import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildCategoryPaginationAuditReport,
	normalizeCategoryPaginationOutputPath,
	parseCategoryPaginationCliOptions,
	type CategoryPaginationCategory,
} from "../scripts/pipeline/category-pagination-audit";

const generatedAt = new Date("2026-06-14T12:00:00.000Z");
const output = "audit/coverage/issue-258/vea/category-pagination/category-pagination-audit.json";
const category: CategoryPaginationCategory = {
	id: "1",
	name: "Almacen",
	path: "almacen",
	url: "https://www.vea.com.ar/almacen",
};

describe("Vea category pagination audit", () => {
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

	it("parses only the approved Vea source and issue-scoped output path", () => {
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
		assert.throws(() => parseCategoryPaginationCliOptions(["node", "script", "--source=jumbo"]), /approved only/);
		assert.throws(() => parseCategoryPaginationCliOptions(["node", "script", "--write"]), /rejects --write/);
		assert.throws(() => normalizeCategoryPaginationOutputPath("audit/coverage/issue-258/vea/other.json"), /must be under/);
	});
});
