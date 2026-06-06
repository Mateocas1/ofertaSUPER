import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
	parseDirectRefreshDiscoveryCreateApplyCliOptions,
	parseDirectRefreshDiscoveryCreatePostwriteCliOptions,
	parseDirectRefreshDiscoveryCreatePrewriteCliOptions,
} from "../scripts/direct-refresh-discovery-create";
import {
	applyDirectRefreshDiscoveryCreatePrewrite,
	buildDirectRefreshDiscoveryCreatePrewrite,
	type DirectRefreshDiscoveryCreateRepository,
} from "../scripts/pipeline/direct-refresh-discovery-create-gate";
import type { DirectRefreshDiscoveryAuditRepository } from "../scripts/pipeline/direct-refresh-discovery-audit";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const now = new Date("2026-06-05T17:00:00.000Z");

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
		category: "LÃ¡cteos",
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
	overrides: Partial<DirectRefreshDiscoveryCreateRepository> = {},
): DirectRefreshDiscoveryCreateRepository {
	const calls: string[] = [];
	const repo: DirectRefreshDiscoveryCreateRepository = {
		calls,
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
		withCreateTransaction: async <T,>(fn: (tx: DirectRefreshDiscoveryCreateRepository) => Promise<T>) => fn(repo),
		acquireDiscoveryCreateLock: async () => true,
		createProduct: async (row) => {
			calls.push(`product:${row.ean}`);
		},
		createSupermarketProduct: async (row) => {
			calls.push(`source:${row.productEan}:${row.supermarketId}`);
			return { id: 900 + calls.length };
		},
		createPriceHistory: async (row) => {
			calls.push(`history:${row.supermarketProductId}:${row.price}`);
			return { id: 1000 + calls.length };
		},
		...overrides,
	} satisfies DirectRefreshDiscoveryCreateRepository;
	return repo;
}

async function sourceRowPrewrite(
	overrides: Partial<DirectRefreshDiscoveryAuditRepository> = {},
) {
	return buildDirectRefreshDiscoveryCreatePrewrite({
		source: "vea",
		term: "leche",
		count: 1,
		scanCount: 1,
		issue: 181,
		selectedIdempotencyKeys: ["discovery:vea:111:sku-111"],
		fetchCandidates: async () => [product("111")],
		repository: repository({
			getProductsByEan: async () => [{ ean: "111" }],
			...overrides,
		}),
		now,
	});
}

describe("direct-refresh discovery create gate", () => {
	it("builds a PASS prewrite with exact confirmation for a source-row discovery", async () => {
		const prewrite = await sourceRowPrewrite();

		assert.equal(prewrite.schemaVersion, 1);
		assert.equal(prewrite.gate, "direct-refresh-discovery-create-prewrite");
		assert.equal(prewrite.status, "PASS");
		assert.equal(prewrite.issue, 181);
		assert.equal(prewrite.summary.productCreatesPlanned, 0);
		assert.equal(prewrite.summary.supermarketProductCreatesPlanned, 1);
		assert.equal(prewrite.summary.priceHistoryCreatesPlanned, 1);
		assert.equal(prewrite.plannedCreates[0].classification, "source-row-discovery");
		assert.equal(prewrite.plannedCreates[0].product.ean, "111");
		assert.equal(prewrite.plannedCreates[0].supermarketProduct.skuId, "sku-111");
		assert.match(prewrite.exactConfirmation, /^direct-refresh-discovery-create issue=181 source=vea count=1 keys=discovery:vea:111:sku-111$/);
	});

	it("fails closed when a selected discovery became covered before prewrite", async () => {
		const prewrite = await sourceRowPrewrite({
			getSupermarketProducts: async () => [
				{ productEan: "111", supermarketId: 7, skuId: "sku-111" },
			],
		});

		assert.equal(prewrite.status, "FAIL");
		assert.equal(prewrite.summary.supermarketProductCreatesPlanned, 0);
		assert.match(prewrite.summary.failClosedReasons.join("\n"), /selected discovery key is no longer createable/);
	});

	it("rejects stale create prewrite reports before writes", async () => {
		const prewrite = await sourceRowPrewrite();
		const stalePrewrite = {
			...prewrite,
			generatedAt: "2026-06-05T16:44:59.000Z",
		};
		const repo = repository();

		const result = await applyDirectRefreshDiscoveryCreatePrewrite({
			prewrite: stalePrewrite,
			exactConfirmation: prewrite.exactConfirmation,
			repository: repo,
			now,
		});

		assert.equal(result.status, "FAIL");
		assert.match(result.summary.failClosedReasons.join("\n"), /prewrite is stale/);
		assert.deepEqual(repo.calls, []);
	});

	it("rejects apply unless the exact confirmation matches the prewrite", async () => {
		const prewrite = await sourceRowPrewrite();
		const repo = repository();

		const result = await applyDirectRefreshDiscoveryCreatePrewrite({
			prewrite,
			exactConfirmation: "wrong",
			repository: repo,
			now,
		});

		assert.equal(result.status, "FAIL");
		assert.match(result.summary.failClosedReasons.join("\n"), /exact confirmation mismatch/);
		assert.deepEqual(repo.calls, []);
	});

	it("rechecks races during apply and refuses writes if the source row now exists", async () => {
		const prewrite = await sourceRowPrewrite();
		const repo = repository({
			getProductsByEan: async () => [{ ean: "111" }],
			getSupermarketProducts: async () => [
				{ productEan: "111", supermarketId: 7, skuId: "sku-111" },
			],
		});

		const result = await applyDirectRefreshDiscoveryCreatePrewrite({
			prewrite,
			exactConfirmation: prewrite.exactConfirmation,
			repository: repo,
			now,
		});

		assert.equal(result.status, "FAIL");
		assert.match(result.summary.failClosedReasons.join("\n"), /source row already exists/);
		assert.deepEqual(repo.calls, []);
	});

	it("acquires the source discovery advisory lock before creating rows", async () => {
		const prewrite = await sourceRowPrewrite();
		let lockKey = 0;
		const repo = repository({
			getProductsByEan: async () => [{ ean: "111" }],
			acquireDiscoveryCreateLock: async (key) => {
				lockKey = key;
				return false;
			},
		});

		const result = await applyDirectRefreshDiscoveryCreatePrewrite({
			prewrite,
			exactConfirmation: prewrite.exactConfirmation,
			repository: repo,
			now,
		});

		assert.equal(lockKey, 54214510);
		assert.equal(result.status, "FAIL");
		assert.match(result.summary.failClosedReasons.join("\n"), /discovery create advisory lock unavailable/);
		assert.deepEqual(repo.calls, []);
	});

	it("creates product, source row, and price history for a confirmed product-and-source discovery", async () => {
		const prewrite = await buildDirectRefreshDiscoveryCreatePrewrite({
			source: "vea",
			term: "leche",
			count: 1,
			scanCount: 1,
			issue: 181,
			selectedIdempotencyKeys: ["discovery:vea:222:sku-222"],
			fetchCandidates: async () => [product("222")],
			repository: repository(),
			now,
		});
		const repo = repository();

		const result = await applyDirectRefreshDiscoveryCreatePrewrite({
			prewrite,
			exactConfirmation: prewrite.exactConfirmation,
			repository: repo,
			now,
		});

		assert.equal(prewrite.status, "PASS");
		assert.equal(result.status, "PASS");
		assert.equal(result.summary.productsCreated, 1);
		assert.equal(result.summary.supermarketProductsCreated, 1);
		assert.equal(result.summary.priceHistoryCreated, 1);
		assert.deepEqual(repo.calls, ["product:222", "source:222:7", "history:902:100"]);
	});
});


describe("direct-refresh discovery create CLI", () => {
	it("parses prewrite/apply options and rejects broad write-shaped flags", () => {
		const prewrite = parseDirectRefreshDiscoveryCreatePrewriteCliOptions([
			"node",
			"script",
			"prewrite",
			"--source=vea",
			"--terms=leche",
			"--count=1",
			"--scan-count=5",
			"--issue-number=181",
			"--selected-keys=discovery:vea:111:sku-111",
			"--output=audit/prewrite.json",
		]);
		assert.deepEqual(prewrite, {
			source: "vea",
			term: "leche",
			count: 1,
			scanCount: 5,
			issue: 181,
			selectedIdempotencyKeys: ["discovery:vea:111:sku-111"],
			output: "audit/prewrite.json",
		});

		const apply = parseDirectRefreshDiscoveryCreateApplyCliOptions([
			"node",
			"script",
			"apply",
			"--prewrite=audit/prewrite.json",
			"--confirm=direct-refresh-discovery-create issue=181 source=vea count=1 keys=discovery:vea:111:sku-111",
			"--output=audit/apply.json",
		]);
		assert.equal(apply.prewrite, "audit/prewrite.json");
		assert.match(apply.confirm, /issue=181/);
		assert.equal(apply.output, "audit/apply.json");

		const postwrite = parseDirectRefreshDiscoveryCreatePostwriteCliOptions([
			"node",
			"script",
			"postwrite",
			"--prewrite=audit/prewrite.json",
			"--apply=audit/apply.json",
			"--output=audit/postwrite.json",
		]);
		assert.deepEqual(postwrite, {
			prewrite: "audit/prewrite.json",
			apply: "audit/apply.json",
			output: "audit/postwrite.json",
		});

		assert.throws(
			() =>
				parseDirectRefreshDiscoveryCreatePrewriteCliOptions([
					"node",
					"script",
					"prewrite",
					"--source=vea",
					"--terms=leche",
					"--selected-keys=discovery:vea:111:sku-111",
					"--all-source",
				]),
			/read-only selection rejects --all-source/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryCreatePostwriteCliOptions([
					"node",
					"script",
					"postwrite",
					"--prewrite=audit/prewrite.json",
					"--apply=audit/apply.json",
					"--scheduler",
				]),
			/direct-refresh discovery create postwrite rejects --scheduler/,
		);
	});

	it("wires package scripts for discovery create prewrite and apply", () => {
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		assert.equal(
			packageJson.scripts["direct-refresh:discovery-create"],
			"tsx scripts/direct-refresh-discovery-create.ts",
		);
	});
});
