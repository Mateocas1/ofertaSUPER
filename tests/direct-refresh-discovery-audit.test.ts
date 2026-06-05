import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseDirectRefreshDiscoveryAuditCliOptions } from "../scripts/audit-direct-refresh-discovery";
import {
	buildDirectRefreshDiscoveryAuditReport,
	type DirectRefreshDiscoveryAuditRepository,
} from "../scripts/pipeline/direct-refresh-discovery-audit";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const now = new Date("2026-06-05T16:00:00.000Z");

function product(
	ean: string,
	overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
	return {
		ean,
		name: `Leche ${ean}`,
		brand: "Marca",
		description: "Leche entera",
		imageUrl: `https://www.vea.com.ar/${ean}.jpg`,
		images: [`https://www.vea.com.ar/${ean}.jpg`],
		category: "Lácteos",
		skuId: `sku-${ean}`,
		sellerId: "seller",
		productUrl: `https://www.vea.com.ar/product/${ean}`,
		price: 100,
		listPrice: 120,
		referencePrice: 100,
		referenceUnit: "lt",
		isAvailable: true,
		...overrides,
	};
}

function repository(
	overrides: Partial<DirectRefreshDiscoveryAuditRepository> = {},
): DirectRefreshDiscoveryAuditRepository {
	return {
		getSourceBySlug: async (slug) => ({
			id: 7,
			slug,
			name: "Vea",
			isActive: true,
			isVtex: true,
			baseUrl: "https://www.vea.com.ar",
		}),
		getProductsByEan: async () => [],
		getSupermarketProducts: async () => [],
		getPendingStagingRowsByEan: async () => [],
		getSupermarketProductsBySourceSku: async () => [],
		...overrides,
	};
}

describe("direct-refresh discovery audit", () => {
	it("classifies a missing global EAN as product-and-source discovery with rollback preview", async () => {
		const report = await buildDirectRefreshDiscoveryAuditReport({
			source: "vea",
			term: "leche",
			count: 1,
			scanCount: 1,
			fetchCandidates: async () => [product("7798095171363")],
			repository: repository(),
			now,
			issue: 21,
		});

		assert.equal(report.schemaVersion, 1);
		assert.equal(report.audit, "direct-refresh-discovery-audit");
		assert.equal(report.status, "PASS");
		assert.equal(report.dryRun, true);
		assert.match(report.writeBoundary, /read-only/);
		assert.match(report.writeBoundary, /no production writes/);
		assert.equal(report.summary.selectedDiscoveries, 1);
		assert.equal(report.summary.productCreatesPreview, 1);
		assert.equal(report.summary.sourceRowCreatesPreview, 1);
		const candidate = report.candidates[0];
		assert.equal(candidate.classification, "product-and-source-discovery");
		assert.equal(candidate.qualityStatus, "PASS");
		assert.match(candidate.idempotencyKey, /^discovery:vea:7798095171363:sku-7798095171363$/);
		assert.deepEqual(candidate.rollbackPreview, {
			deleteCreatedProduct: true,
			deleteCreatedSupermarketProduct: true,
			deleteCreatedPriceHistory: true,
		});
	});

	it("classifies an existing global product missing only the source row as source-row discovery", async () => {
		const report = await buildDirectRefreshDiscoveryAuditReport({
			source: "vea",
			term: "leche",
			count: 1,
			scanCount: 1,
			fetchCandidates: async () => [product("111")],
			repository: repository({
				getProductsByEan: async () => [{ ean: "111" }],
			}),
			now,
			issue: 21,
		});

		const candidate = report.candidates[0];
		assert.equal(candidate.classification, "source-row-discovery");
		assert.equal(report.summary.productCreatesPreview, 0);
		assert.equal(report.summary.sourceRowCreatesPreview, 1);
		assert.equal(candidate.rollbackPreview.deleteCreatedProduct, false);
	});

	it("blocks already-covered, staging-conflicting, duplicate-SKU, and low-quality candidates", async () => {
		const live = [
			product("111"),
			product("222"),
			product("333", { skuId: "duplicate-sku" }),
			product("444", { name: "Leche NiÃƒÂ±as" }),
		];
		const report = await buildDirectRefreshDiscoveryAuditReport({
			source: "vea",
			term: "leche",
			count: 4,
			scanCount: 4,
			fetchCandidates: async () => live,
			repository: repository({
				getProductsByEan: async () => [{ ean: "111" }],
				getSupermarketProducts: async () => [
					{ productEan: "111", supermarketId: 7, skuId: "sku-111" },
				],
				getPendingStagingRowsByEan: async () => [{ ean: "222", sourceSlug: "vea" }],
				getSupermarketProductsBySourceSku: async (_source, skuId) =>
					skuId === "duplicate-sku"
						? [
								{ productEan: "333", supermarketId: 7, skuId },
								{ productEan: "999", supermarketId: 7, skuId },
							]
						: [],
			}),
			now,
			issue: 21,
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.summary.selectedDiscoveries, 0);
		assert.equal(report.summary.blockedCandidates, 4);
		assert.deepEqual(
			report.candidates.map((candidate) => candidate.classification),
			["already-covered", "blocked", "blocked", "blocked"],
		);
		assert.equal(report.candidates[0].qualityStatus, "PASS");
		assert.deepEqual(report.candidates[0].blockers, ["source row already exists"]);
		assert.match(report.candidates[1].blockers.join("\n"), /pending staging/);
		assert.match(report.candidates[2].blockers.join("\n"), /source SKU is not unique/);
		assert.match(report.candidates[3].blockers.join("\n"), /mojibake/);
	});

	it("rejects write-shaped CLI flags and parses bounded discovery options", () => {
		const options = parseDirectRefreshDiscoveryAuditCliOptions([
			"node",
			"script",
			"--source=vea",
			"--terms=leche",
			"--count=1",
			"--scan-count=5",
			"--issue-number=21",
			"--output=audit/out.json",
		]);

		assert.deepEqual(options, {
			source: "vea",
			term: "leche",
			count: 1,
			scanCount: 5,
			issue: 21,
			output: "audit/out.json",
		});
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryAuditCliOptions([
					"node",
					"script",
					"--source=vea",
					"--terms=leche",
					"--write=true",
				]),
			/read-only direct-refresh discovery audit rejects --write=true/,
		);
	});

	it("has a package script wired to the read-only discovery audit CLI", () => {
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		const cliScript = readFileSync(
			"scripts/audit-direct-refresh-discovery.ts",
			"utf8",
		);

		assert.equal(
			packageJson.scripts["audit:direct-refresh-discovery"],
			"tsx scripts/audit-direct-refresh-discovery.ts",
		);
		assert.match(cliScript, /dryRun:\s*true/);
		assert.match(cliScript, /stageSourceProducts/);
		assert.match(cliScript, /buildDirectRefreshDiscoveryAuditReport/);
	});
});
