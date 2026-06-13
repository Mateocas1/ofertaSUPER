import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runDirectRefreshDiscoveryRollbackDrillCli } from "../scripts/audit-direct-refresh-discovery-rollback-drill";
import {
	assertNoDirectRefreshDiscoveryRollbackDrillForbiddenFlags,
	buildDirectRefreshDiscoveryRollbackDrill,
	createPrismaDirectRefreshDiscoveryRollbackDrillRepository,
	parseDirectRefreshDiscoveryRollbackDrillCliOptions,
	parseDirectRefreshDiscoveryRollbackDrillRealCliOptions,
	expectedDirectRefreshDiscoveryRollbackDrillArtifactFilename,
	validateDirectRefreshDiscoveryRollbackDrillArtifactPath,
	type DirectRefreshDiscoveryRollbackDrillRepository,
} from "../scripts/pipeline/direct-refresh-discovery-rollback-drill";
import type { DirectRefreshDiscoveryCreatePostwriteReport } from "../scripts/pipeline/direct-refresh-discovery-postwrite-audit";

const now = new Date("2026-06-11T12:00:00.000Z");
const evidence = {
	pitrBackupPosture:
		"PITR reviewed at 2026-06-11T11:55:00.000Z for disposable-row drill; no automated restore executed.",
	cacheHandling:
		"Cache reviewed at 2026-06-11T11:56:00.000Z; no purge automation executed in this core drill.",
};

const postwrite: DirectRefreshDiscoveryCreatePostwriteReport = {
	schemaVersion: 1,
	audit: "direct-refresh-discovery-create-postwrite",
	status: "PASS",
	issue: 192,
	generatedAt: "2026-06-11T11:50:00.000Z",
	source: "vea",
	count: 1,
	selectedKeys: ["discovery:vea:111:sku-111"],
	applyGeneratedAt: "2026-06-11T11:49:00.000Z",
	prewriteGeneratedAt: "2026-06-11T11:48:00.000Z",
	summary: {
		productsExpected: 0,
		productsFound: 0,
		supermarketProductsExpected: 1,
		supermarketProductsFound: 1,
		priceHistoryExpected: 1,
		priceHistoryFound: 1,
		failClosedReasons: [],
	},
	createdRows: {
		products: [],
		supermarketProducts: [
			{
				id: 901,
				productEan: "111",
				supermarketId: 7,
				skuId: "sku-111",
				price: 100,
				listPrice: 120,
				referencePrice: 100,
				referenceUnit: "lt",
				isAvailable: true,
				sellerId: "seller",
				productUrl: "https://www.vea.com.ar/product/111",
				lastCheckedAt: "2026-06-11T11:49:00.000Z",
			},
		],
		priceHistory: [
			{
				id: 1001,
				supermarketProductId: 901,
				price: 100,
				listPrice: 120,
				scrapedAt: "2026-06-11T11:49:00.000Z",
			},
		],
	},
	noExtraRows: { products: true, supermarketProducts: true, priceHistory: true },
	rollbackPlan: {
		deletePriceHistoryIds: [1001],
		deleteSupermarketProductIds: [901],
		deleteProductEans: [],
	},
};

function repository(
	overrides: Partial<DirectRefreshDiscoveryRollbackDrillRepository> & {
		calls?: string[];
	} = {},
): DirectRefreshDiscoveryRollbackDrillRepository & { calls: string[] } {
	const calls = overrides.calls ?? [];
	return {
		calls,
		getProductsByEan: async (eans) => {
			calls.push(`getProducts:${eans.join(",")}`);
			return eans.map((ean) => ({ ean }));
		},
		getSupermarketProductsByIds: async (ids) => {
			calls.push(`getSupermarketProducts:${ids.join(",")}`);
			return ids.map((id) => ({ id }));
		},
		getPriceHistoryRowsByIds: async (ids) => {
			calls.push(`getPriceHistory:${ids.join(",")}`);
			return ids.map((id) => ({ id }));
		},
		deletePriceHistoryByIds: async (ids) => {
			calls.push(`deletePriceHistory:${ids.join(",")}`);
			return { deletedCount: ids.length };
		},
		deleteSupermarketProductsByIds: async (ids) => {
			calls.push(`deleteSupermarketProducts:${ids.join(",")}`);
			return { deletedCount: ids.length };
		},
		deleteProductsByEan: async (eans) => {
			calls.push(`deleteProducts:${eans.join(",")}`);
			return { deletedCount: eans.length };
		},
		...overrides,
	};
}

describe("direct-refresh discovery rollback drill core", () => {
	it("deletes in required order and returns preimage plus post-rollback verification", async () => {
		const repo = repository({
			getProductsByEan: async () => [],
			getSupermarketProductsByIds: async (ids) => {
				repo.calls.push(`getSupermarketProducts:${ids.join(",")}`);
				return repo.calls.length < 5 ? ids.map((id) => ({ id })) : [];
			},
			getPriceHistoryRowsByIds: async (ids) => {
				repo.calls.push(`getPriceHistory:${ids.join(",")}`);
				return repo.calls.length < 5 ? ids.map((id) => ({ id })) : [];
			},
		});

		const report = await buildDirectRefreshDiscoveryRollbackDrill({
			postwrite,
			repository: repo,
			...evidence,
			now,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.preimage.generatedAt, "2026-06-11T12:00:00.000Z");
		assert.equal(
			report.postRollbackVerification.generatedAt,
			"2026-06-11T12:00:00.000Z",
		);
		assert.match(report.preimage.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
		assert.deepEqual(report.preimage.rows.priceHistory, [{ id: 1001 }]);
		assert.deepEqual(report.preimage.rows.supermarketProducts, [{ id: 901 }]);
		assert.deepEqual(report.postRollbackVerification.remainingRows.priceHistory, []);
		assert.deepEqual(repo.calls.slice(2, 5), [
			"deletePriceHistory:1001",
			"deleteSupermarketProducts:901",
			"getSupermarketProducts:901",
		]);
		assert.equal(repo.calls.includes("deleteProducts:"), false);
	});

	it("rejects non-PASS postwrite without deleting", async () => {
		const repo = repository();
		const report = await buildDirectRefreshDiscoveryRollbackDrill({
			postwrite: { ...postwrite, status: "FAIL" },
			repository: repo,
			...evidence,
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.summary.failClosedReasons.join("\n"), /postwrite status must be PASS/);
		assert.deepEqual(repo.calls, []);
	});

	it("rejects missing exact rollback IDs and broad selectors", async () => {
		const repo = repository();
		const report = await buildDirectRefreshDiscoveryRollbackDrill({
			postwrite: {
				...postwrite,
				rollbackPlan: {
					deletePriceHistoryIds: [],
					deleteSupermarketProductIds: [],
					deleteProductEans: [],
					where: { source: "vea" },
				} as DirectRefreshDiscoveryCreatePostwriteReport["rollbackPlan"],
			},
			repository: repo,
			...evidence,
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.summary.failClosedReasons.join("\n"), /exact price_history IDs/);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/exact supermarket_products IDs/,
		);
		assert.match(report.summary.failClosedReasons.join("\n"), /broad rollback selector/);
		assert.deepEqual(repo.calls, []);
	});

	it("deletes product rows only by explicit EAN from the rollback plan", async () => {
		const repo = repository({
			getProductsByEan: async (eans) => {
				repo.calls.push(`getProducts:${eans.join(",")}`);
				return repo.calls.length === 1 ? eans.map((ean) => ({ ean })) : [];
			},
			getSupermarketProductsByIds: async () => [],
			getPriceHistoryRowsByIds: async () => [],
		});

		await buildDirectRefreshDiscoveryRollbackDrill({
			postwrite: {
				...postwrite,
				rollbackPlan: { ...postwrite.rollbackPlan, deleteProductEans: ["222"] },
			},
			repository: repo,
			...evidence,
		});

		assert.equal(repo.calls.includes("deleteProducts:222"), true);
		assert.equal(repo.calls.includes("deleteProducts:111"), false);
	});

	it("fails closed on partial rollback and remaining rows", async () => {
		const repo = repository({
			deletePriceHistoryByIds: async (ids) => {
				repo.calls.push(`deletePriceHistory:${ids.join(",")}`);
				return { deletedCount: 0 };
			},
		});

		const report = await buildDirectRefreshDiscoveryRollbackDrill({
			postwrite,
			repository: repo,
			...evidence,
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.summary.failClosedReasons.join("\n"), /partial price_history rollback/);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/price_history rollback target still exists: 1001/,
		);
	});

	it("validates role-specific artifact filenames", () => {
		assert.equal(
			expectedDirectRefreshDiscoveryRollbackDrillArtifactFilename("rollback-drill"),
			"rollback-drill.json",
		);
		assert.equal(
			expectedDirectRefreshDiscoveryRollbackDrillArtifactFilename("preimage"),
			"preimage.json",
		);
		assert.equal(
			expectedDirectRefreshDiscoveryRollbackDrillArtifactFilename(
				"post-rollback-verification",
			),
			"post-rollback-verification.json",
		);
		assert.equal(
			validateDirectRefreshDiscoveryRollbackDrillArtifactPath({
				role: "preimage",
				path: "audit/direct-refresh-discovery-rollback-drill/issue-192/preimage.json",
			}),
			true,
		);
		assert.equal(
			validateDirectRefreshDiscoveryRollbackDrillArtifactPath({
				role: "post-rollback-verification",
				path: "audit/direct-refresh-discovery-rollback-drill/issue-192/post-rollback-verification.json",
			}),
			true,
		);
		assert.equal(
			validateDirectRefreshDiscoveryRollbackDrillArtifactPath({
				role: "preimage",
				path: "audit/direct-refresh-discovery-rollback-drill/issue-192/post-rollback-verification.json",
			}),
			false,
		);
	});

	it("Prisma adapter uses exact selectors and maps delete counts", async () => {
		const calls: Array<{ model: string; method: string; args: unknown }> = [];
		const client = {
			priceHistory: {
				findMany: async (args: unknown) => {
					calls.push({ model: "priceHistory", method: "findMany", args });
					return [{ id: 1001 }];
				},
				deleteMany: async (args: unknown) => {
					calls.push({ model: "priceHistory", method: "deleteMany", args });
					return { count: 1 };
				},
			},
			supermarketProduct: {
				findMany: async (args: unknown) => {
					calls.push({ model: "supermarketProduct", method: "findMany", args });
					return [{ id: 901 }];
				},
				deleteMany: async (args: unknown) => {
					calls.push({ model: "supermarketProduct", method: "deleteMany", args });
					return { count: 1 };
				},
			},
			product: {
				findMany: async (args: unknown) => {
					calls.push({ model: "product", method: "findMany", args });
					return [{ ean: "222" }];
				},
				deleteMany: async (args: unknown) => {
					calls.push({ model: "product", method: "deleteMany", args });
					return { count: 1 };
				},
			},
		};
		const repo = createPrismaDirectRefreshDiscoveryRollbackDrillRepository(client);

		assert.deepEqual(await repo.getPriceHistoryRowsByIds([1001]), [{ id: 1001 }]);
		assert.deepEqual(await repo.getSupermarketProductsByIds([901]), [{ id: 901 }]);
		assert.deepEqual(await repo.getProductsByEan(["222"]), [{ ean: "222" }]);
		assert.deepEqual(await repo.deletePriceHistoryByIds([1001]), { deletedCount: 1 });
		assert.deepEqual(await repo.deleteSupermarketProductsByIds([901]), {
			deletedCount: 1,
		});
		assert.deepEqual(await repo.deleteProductsByEan(["222"]), { deletedCount: 1 });

		assert.deepEqual(calls, [
			{
				model: "priceHistory",
				method: "findMany",
				args: { where: { id: { in: [1001] } }, select: { id: true } },
			},
			{
				model: "supermarketProduct",
				method: "findMany",
				args: { where: { id: { in: [901] } }, select: { id: true } },
			},
			{
				model: "product",
				method: "findMany",
				args: { where: { ean: { in: ["222"] } }, select: { ean: true } },
			},
			{
				model: "priceHistory",
				method: "deleteMany",
				args: { where: { id: { in: [1001] } } },
			},
			{
				model: "supermarketProduct",
				method: "deleteMany",
				args: { where: { id: { in: [901] } } },
			},
			{
				model: "product",
				method: "deleteMany",
				args: { where: { ean: { in: ["222"] } } },
			},
		]);
	});

	it("rejects forbidden flags", () => {
		for (const flag of [
			"--apply",
			"--write",
			"--confirm",
			"--execute",
			"--rollback",
			"--delete",
			"--all-source",
			"--all-sources",
			"--scheduler",
			"--purge-cache",
			"--cache-purge",
			"--deploy",
			"--migrations",
		]) {
			assert.throws(
				() =>
					assertNoDirectRefreshDiscoveryRollbackDrillForbiddenFlags([
						"node",
						"script",
						flag,
					]),
				new RegExp(`rejects ${flag}`),
			);
		}
	});

	it("parses real CLI options only with specific rollback drill confirmation", () => {
		assert.deepEqual(
			parseDirectRefreshDiscoveryRollbackDrillRealCliOptions([
				"node",
				"script",
				"--postwrite=postwrite.json",
				"--output-dir=out",
				"--rollback-drill-confirm=CONTROLLED_DISPOSABLE_ROW_ROLLBACK_DRILL",
			]),
			{
				postwrite: "postwrite.json",
				outputDir: "out",
				rollbackDrillConfirm: "CONTROLLED_DISPOSABLE_ROW_ROLLBACK_DRILL",
			},
		);

		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillRealCliOptions([
					"node",
					"script",
					"--postwrite=postwrite.json",
					"--output-dir=out",
				]),
			/requires --rollback-drill-confirm=CONTROLLED_DISPOSABLE_ROW_ROLLBACK_DRILL/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillRealCliOptions([
					"node",
					"script",
					"--postwrite=postwrite.json",
					"--output-dir=out",
					"--confirm=CONTROLLED_DISPOSABLE_ROW_ROLLBACK_DRILL",
				]),
			/rejects --confirm=CONTROLLED_DISPOSABLE_ROW_ROLLBACK_DRILL/,
		);
	});

	it("parses mock/no-db CLI options and requires explicit inputs", () => {
		assert.deepEqual(
			parseDirectRefreshDiscoveryRollbackDrillCliOptions([
				"node",
				"script",
				"--mock",
				"--postwrite=postwrite.json",
				"--output-dir=out",
			]),
			{ mode: "mock", postwrite: "postwrite.json", outputDir: "out" },
		);
		assert.deepEqual(
			parseDirectRefreshDiscoveryRollbackDrillCliOptions([
				"node",
				"script",
				"--no-db",
				"--postwrite=postwrite.json",
				"--output-dir=out",
			]).mode,
			"no-db",
		);

		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillCliOptions([
					"node",
					"script",
					"--postwrite=postwrite.json",
					"--output-dir=out",
				]),
			/requires --mock or --no-db/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillCliOptions([
					"node",
					"script",
					"--mock",
					"--output-dir=out",
				]),
			/requires --postwrite=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillCliOptions([
					"node",
					"script",
					"--mock",
					"--postwrite=postwrite.json",
				]),
			/requires --output-dir=\.\.\./,
		);
	});

	it("rejects unknown and bare value flags", () => {
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillCliOptions([
					"node",
					"script",
					"--mock",
					"--postwrite=postwrite.json",
					"--output-dir=out",
					"--surprise",
				]),
			/unknown direct-refresh discovery rollback drill flag --surprise/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryRollbackDrillCliOptions([
					"node",
					"script",
					"--mock",
					"--postwrite",
					"--output-dir=out",
				]),
			/requires --postwrite=\.\.\./,
		);
	});

	it("wrapper writes the exact three mock/no-db artifact filenames", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "rollback-drill-"));
		try {
			const postwritePath = join(tempDir, "postwrite.json");
			const outputDir = join(tempDir, "out");
			await writeFile(postwritePath, JSON.stringify(postwrite), "utf8");

			const report = await runDirectRefreshDiscoveryRollbackDrillCli([
				"node",
				"script",
				"--mock",
				`--postwrite=${postwritePath}`,
				`--output-dir=${outputDir}`,
			]);
			const filenames = await readdir(outputDir);
			assert.deepEqual(filenames.sort(), [
				"post-rollback-verification.json",
				"preimage.json",
				"rollback-drill.json",
			]);

			const rollbackDrill = JSON.parse(
				await readFile(join(outputDir, "rollback-drill.json"), "utf8"),
			);
			const preimage = JSON.parse(
				await readFile(join(outputDir, "preimage.json"), "utf8"),
			);
			const verification = JSON.parse(
				await readFile(join(outputDir, "post-rollback-verification.json"), "utf8"),
			);

			assert.equal(report.status, "PASS");
			assert.match(rollbackDrill.generatedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
			assert.match(preimage.generatedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
			assert.match(verification.generatedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
			assert.deepEqual(rollbackDrill.deletionResults, {
				priceHistoryDeleted: 1,
				supermarketProductsDeleted: 1,
				productsDeleted: 0,
			});
			assert.deepEqual(preimage.rows.priceHistory, [{ id: 1001 }]);
			assert.deepEqual(preimage.rows.supermarketProducts, [{ id: 901 }]);
			assert.deepEqual(verification.remainingRows.priceHistory, []);
			assert.deepEqual(verification.remainingRows.supermarketProducts, []);
		} finally {
			await rm(tempDir, { force: true, recursive: true });
		}
	});

	it("keeps the wrapper/source static no-db and exposes package script", async () => {
		const wrapperSource = await readFile(
			"scripts/audit-direct-refresh-discovery-rollback-drill.ts",
			"utf8",
		);
		assert.doesNotMatch(
			wrapperSource,
			/import .*(@prisma|prisma|src\/lib\/db|load-env|vtex|redis|cache)/i,
		);

		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		assert.equal(
			packageJson.scripts["audit:direct-refresh-discovery-rollback-drill"],
			"tsx scripts/audit-direct-refresh-discovery-rollback-drill.ts",
		);
		assert.equal(
			packageJson.scripts["direct-refresh:discovery-rollback-drill"],
			"tsx scripts/direct-refresh-discovery-rollback-drill.ts",
		);
	});
});
