import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import {
	buildCandidateAudit,
	type CandidateAuditRepository,
} from "../scripts/pipeline/candidate-audit";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const eans = ["111", "222", "333", "444", "555"];
const now = () => new Date("2026-05-26T12:00:00.000Z");

function product(
	ean: string,
	overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
	return {
		ean,
		name: `Leche ${ean}`,
		brand: "Marca",
		description: "Leche entera",
		imageUrl: `https://example.test/${ean}.jpg`,
		images: [`https://example.test/${ean}.jpg`],
		category: "Lácteos",
		skuId: `sku-${ean}`,
		sellerId: "seller",
		productUrl: `https://example.test/product/${ean}`,
		price: 100,
		listPrice: 120,
		referencePrice: 100,
		referenceUnit: "lt",
		isAvailable: true,
		...overrides,
	};
}

function repository(
	overrides: Partial<CandidateAuditRepository> = {},
): CandidateAuditRepository {
	return {
		getSourceBySlug: async (slug) => ({
			id: 7,
			slug,
			name: "Carrefour",
			isActive: true,
			isVtex: true,
		}),
		getProductsByEan: async (requestedEans) =>
			requestedEans.map((ean) => ({
				ean,
				name: `Stored ${ean}`,
				brand: null,
				description: null,
				imageUrl: null,
				images: [],
				category: null,
			})),
		getSupermarketProducts: async (requestedEans, supermarketId) =>
			requestedEans.map((ean, index) => ({
				id: index + 100,
				productEan: ean,
				supermarketId,
				price: 90,
				listPrice: 100,
				referencePrice: 90,
				referenceUnit: "lt",
				isAvailable: true,
				skuId: `old-sku-${ean}`,
				sellerId: "old-seller",
				productUrl: `https://old.example.test/${ean}`,
				lastCheckedAt: "2026-05-25T12:00:00.000Z",
			})),
		getLatestPriceHistory: async (supermarketProductIds) =>
			supermarketProductIds.map((id) => ({
				id: id + 1000,
				supermarketProductId: id,
				price: 90,
				listPrice: 100,
				scrapedAt: "2026-05-25T12:00:00.000Z",
			})),
		getMaxPriceHistoryId: async () => 1999,
		...overrides,
	};
}

function repositoryMissingLastSupermarketProduct() {
	return repository({
		getSourceBySlug: async (slug) => ({
			id: 7,
			slug,
			name: "Jumbo",
			isActive: true,
			isVtex: true,
		}),
		getSupermarketProducts: async (requestedEans, supermarketId) =>
			requestedEans.slice(0, 4).map((ean, index) => ({
				id: index + 100,
				productEan: ean,
				supermarketId,
				price: 90,
				listPrice: 100,
				referencePrice: 90,
				referenceUnit: "lt",
				isAvailable: true,
				skuId: `old-sku-${ean}`,
				sellerId: "old-seller",
				productUrl: `https://old.example.test/${ean}`,
				lastCheckedAt: "2026-05-25T12:00:00.000Z",
			})),
	});
}

describe("Phase 4 candidate audit", () => {
	it("builds a rollback-ready JSON snapshot for five existing positive-price candidates", async () => {
		const audit = await buildCandidateAudit({
			source: "carrefour",
			term: "leche",
			count: 5,
			queryLimit: 1,
			fetchCandidates: async () => eans.map((ean) => product(ean)),
			repository: repository(),
			now,
		});

		assert.equal(audit.schemaVersion, 1);
		assert.equal(audit.writeMode, "phase4-count5");
		assert.equal(audit.source, "carrefour");
		assert.equal(audit.term, "leche");
		assert.equal(audit.count, 5);
		assert.match(audit.candidateHash, /^[a-f0-9]{64}$/);
		assert.equal(audit.rollbackPlan?.requiresConfirmation, true);
		assert.deepEqual(audit.candidateEans, eans);
		assert.deepEqual(audit.allowMissingSupermarketProductEans, []);
		assert.equal(audit.createdAt, "2026-05-26T12:00:00.000Z");
		assert.equal(audit.snapshots.products.length, 5);
		assert.equal(audit.snapshots.supermarketProducts.length, 5);
		assert.equal(audit.snapshots.priceHistory.maxId, 1999);
		assert.equal(audit.snapshots.priceHistory.latest.length, 5);
	});

	it("allows one explicitly allowlisted missing source row", async () => {
		const audit = await buildCandidateAudit({
			source: "jumbo",
			term: "leche",
			count: 5,
			queryLimit: 1,
			fetchCandidates: async () => eans.map((ean) => product(ean)),
			repository: repositoryMissingLastSupermarketProduct(),
			allowMissingSupermarketProductEans: ["555"],
			now,
		});

		assert.deepEqual(audit.allowMissingSupermarketProductEans, ["555"]);
		assert.equal(audit.snapshots.products.length, 5);
		assert.equal(audit.snapshots.supermarketProducts.length, 4);
		assert.equal(audit.snapshots.priceHistory.latest.length, 4);
	});

	it("supports bounded refresh-existing candidate snapshots without missing source rows", async () => {
		const audit = await buildCandidateAudit({
			source: "carrefour",
			term: "leche",
			count: 3,
			queryLimit: 1,
			writeMode: "refresh-existing",
			fetchCandidates: async () => eans.slice(0, 3).map((ean) => product(ean)),
			repository: repository(),
			now,
		});

		assert.equal(audit.writeMode, "refresh-existing");
		assert.deepEqual(audit.candidateEans, ["111", "222", "333"]);
		assert.deepEqual(audit.allowMissingSupermarketProductEans, []);
		assert.equal(audit.snapshots.supermarketProducts.length, 3);
	});

	it("rejects refresh-existing snapshots that would create source rows", async () => {
		await assert.rejects(
			buildCandidateAudit({
				source: "jumbo",
				term: "leche",
				count: 5,
				queryLimit: 1,
				writeMode: "refresh-existing",
				fetchCandidates: async () => eans.map((ean) => product(ean)),
				repository: repositoryMissingLastSupermarketProduct(),
				allowMissingSupermarketProductEans: ["555"],
				now,
			}),
			/missing existing supermarket_products: 555/,
		);
	});

	it("rejects candidate sets that are not exactly five distinct EANs", async () => {
		await assert.rejects(
			buildCandidateAudit({
				source: "carrefour",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () =>
					eans.slice(0, 4).map((ean) => product(ean)),
				repository: repository(),
				now,
			}),
			/exactly 5 distinct candidate EANs/,
		);
		await assert.rejects(
			buildCandidateAudit({
				source: "carrefour",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () =>
					["111", "111", "333", "444", "555"].map((ean) => product(ean)),
				repository: repository(),
				now,
			}),
			/exactly 5 distinct candidate EANs/,
		);
	});

	it("has a package script wired to the read-only candidate audit CLI", () => {
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		const cliScript = readFileSync(
			"scripts/audit-ingest-candidates.ts",
			"utf8",
		);

		assert.equal(
			packageJson.scripts["audit:ingest-candidates"],
			"tsx scripts/audit-ingest-candidates.ts",
		);
		assert.match(cliScript, /stageSourceProducts/);
		assert.match(cliScript, /dryRun:\s*true/);
		assert.match(cliScript, /buildCandidateAudit/);
		assert.match(cliScript, /--allow-missing-supermarket-product-eans/);
		assert.match(cliScript, /--write-mode/);
	});

	it("rejects duplicate CLI flags and invalid numeric flags before DB/network work", () => {
		const duplicateSource = spawnSync(
			process.execPath,
			[
				"./node_modules/tsx/dist/cli.mjs",
				"scripts/audit-ingest-candidates.ts",
				"--source=carrefour",
				"--source=dia",
				"--terms=leche",
			],
			{ encoding: "utf8" },
		);
		const invalidCount = spawnSync(
			process.execPath,
			[
				"./node_modules/tsx/dist/cli.mjs",
				"scripts/audit-ingest-candidates.ts",
				"--source=carrefour",
				"--terms=leche",
				"--count=abc",
			],
			{ encoding: "utf8" },
		);

		assert.notEqual(duplicateSource.status, 0);
		assert.match(duplicateSource.stderr, /exactly one --source=\.\.\. flag/);
		assert.notEqual(invalidCount.status, 0);
		assert.match(invalidCount.stderr, /--count to be a positive integer/);
	});

	it("accepts explicit mojibake waivers with a reason", async () => {
		const audit = await buildCandidateAudit({
			source: "dia",
			term: "leche",
			count: 5,
			queryLimit: 1,
			fetchCandidates: async () =>
				eans.map((ean) =>
					product(ean, {
						name: ean === "111" ? "Leche NiÃ±as" : `Leche ${ean}`,
					}),
				),
			repository: repository({
				getSourceBySlug: async (slug) => ({
					id: 7,
					slug,
					name: "DIA",
					isActive: true,
					isVtex: true,
				}),
			}),
			mojibakeWaivers: [
				{
					ean: "111",
					field: "name",
					reason: "pre-existing DIA encoding issue",
				},
			],
			now,
		});

		assert.deepEqual(audit.mojibakeWaivers, [
			{ ean: "111", field: "name", reason: "pre-existing DIA encoding issue" },
		]);
	});

	it("rejects mojibake waivers for non-DIA sources", async () => {
		await assert.rejects(
			buildCandidateAudit({
				source: "carrefour",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () => eans.map((ean) => product(ean)),
				repository: repository(),
				mojibakeWaivers: [{ ean: "111", field: "name", reason: "not allowed" }],
				now,
			}),
			/mojibake waivers are only allowed for DIA/,
		);
	});

	it("rejects unsafe candidates before evidence is produced", async () => {
		await assert.rejects(
			buildCandidateAudit({
				source: "carrefour",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () =>
					eans.map((ean, index) =>
						product(ean, { price: index === 0 ? null : 100 }),
					),
				repository: repository(),
				now,
			}),
			/positive non-null price for EAN 111/,
		);
		await assert.rejects(
			buildCandidateAudit({
				source: "carrefour",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () => eans.map((ean) => product(ean)),
				repository: repository({
					getProductsByEan: async (requestedEans) =>
						requestedEans.slice(1).map((ean) => ({
							ean,
							name: `Stored ${ean}`,
							brand: null,
							description: null,
							imageUrl: null,
							images: [],
							category: null,
						})),
				}),
				now,
			}),
			/missing existing products: 111/,
		);
		await assert.rejects(
			buildCandidateAudit({
				source: "jumbo",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () => eans.map((ean) => product(ean)),
				repository: repositoryMissingLastSupermarketProduct(),
				now,
			}),
			/missing existing supermarket_products: missing=555 allowed=none/,
		);
		await assert.rejects(
			buildCandidateAudit({
				source: "jumbo",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () => eans.map((ean) => product(ean)),
				repository: repository(),
				allowMissingSupermarketProductEans: ["555"],
				now,
			}),
			/missing existing supermarket_products: missing=none allowed=555/,
		);
		await assert.rejects(
			buildCandidateAudit({
				source: "jumbo",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () => eans.map((ean) => product(ean)),
				repository: repositoryMissingLastSupermarketProduct(),
				allowMissingSupermarketProductEans: ["555", "444"],
				now,
			}),
			/at most one missing supermarket_products row/,
		);
		await assert.rejects(
			buildCandidateAudit({
				source: "carrefour",
				term: "leche",
				count: 5,
				queryLimit: 1,
				fetchCandidates: async () =>
					eans.map((ean) =>
						product(ean, {
							name: ean === "111" ? "Leche NiÃ±as" : `Leche ${ean}`,
						}),
					),
				repository: repository(),
				now,
			}),
			/mojibake detected for EAN 111 field name/,
		);
	});
});
