import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildCandidateRollbackPlan,
	buildCandidateSnapshotHash,
} from "../scripts/pipeline/candidate-snapshot";
import type { CandidateAudit } from "../scripts/pipeline/candidate-audit";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

function product(ean: string, price = 100): NormalizedProduct {
	return {
		ean,
		name: `Producto ${ean}`,
		brand: "Marca",
		description: "Descripción",
		imageUrl: null,
		images: [],
		category: "Almacén",
		skuId: `sku-${ean}`,
		sellerId: "1",
		productUrl: `https://example.test/${ean}`,
		price,
		listPrice: price + 10,
		referencePrice: price,
		referenceUnit: "kg",
		isAvailable: true,
	};
}

function audit(): CandidateAudit {
	const candidateEans = ["111", "222"];
	return {
		schemaVersion: 1,
		createdAt: "2026-05-28T00:00:00.000Z",
		writeMode: "refresh-existing",
		source: "carrefour",
		term: "leche",
		count: 2,
		queryLimit: 1,
		candidateHash: "hash",
		candidateEans,
		candidates: candidateEans.map((ean, index) => product(ean, 100 + index)),
		selection: {
			mode: "strict",
			scanCount: candidateEans.length,
			selectedCount: candidateEans.length,
			skippedCandidates: [],
		},
		mojibakeWaivers: [],
		allowMissingSupermarketProductEans: [],
		rollbackPlan: null,
		snapshots: {
			source: {
				id: 7,
				slug: "carrefour",
				name: "Carrefour",
				isActive: true,
				isVtex: true,
			},
			products: candidateEans.map((ean) => ({
				ean,
				name: `Stored ${ean}`,
				brand: null,
				description: null,
				imageUrl: null,
				images: [],
				category: null,
			})),
			supermarketProducts: candidateEans.map((ean, index) => ({
				id: index + 100,
				productEan: ean,
				supermarketId: 7,
				price: 90 + index,
				listPrice: 100 + index,
				referencePrice: 90 + index,
				referenceUnit: "kg",
				isAvailable: true,
				skuId: `old-${ean}`,
				sellerId: "old",
				productUrl: `https://old.example.test/${ean}`,
				lastCheckedAt: "2026-05-27T00:00:00.000Z",
			})),
			priceHistory: {
				maxId: 999,
				latest: candidateEans.map((_ean, index) => ({
					id: index + 200,
					supermarketProductId: index + 100,
					price: 90 + index,
					listPrice: 100 + index,
					scrapedAt: "2026-05-27T00:00:00.000Z",
				})),
			},
		},
	};
}

describe("candidate snapshot hash", () => {
	it("is stable across candidate order and excludes volatile snapshot metadata", () => {
		const left = buildCandidateSnapshotHash({
			source: "carrefour",
			term: "leche",
			count: 2,
			queryLimit: 1,
			writeMode: "refresh-existing",
			candidates: [product("222", 101), product("111", 100)],
		});
		const right = buildCandidateSnapshotHash({
			source: "carrefour",
			term: "leche",
			count: 2,
			queryLimit: 1,
			writeMode: "refresh-existing",
			candidates: [product("111", 100), product("222", 101)],
		});

		assert.equal(left, right);
		assert.match(left, /^[a-f0-9]{64}$/);
	});

	it("changes when candidate values change and never serializes secrets", () => {
		const baseline = buildCandidateSnapshotHash({
			source: "carrefour",
			term: "leche",
			count: 1,
			queryLimit: 1,
			writeMode: "refresh-existing",
			candidates: [product("111", 100)],
		});
		const changed = buildCandidateSnapshotHash({
			source: "carrefour",
			term: "leche",
			count: 1,
			queryLimit: 1,
			writeMode: "refresh-existing",
			candidates: [product("111", 101)],
		});

		assert.notEqual(baseline, changed);
	});

	it("builds a confirmation-gated rollback plan from pre-write snapshots", () => {
		const plan = buildCandidateRollbackPlan(audit());

		assert.equal(plan.requiresConfirmation, true);
		assert.equal(plan.source, "carrefour");
		assert.deepEqual(plan.touchedEans, ["111", "222"]);
		assert.equal(plan.priceHistory.deleteRowsWithIdGreaterThan, 999);
		assert.equal(plan.restoreProducts.length, 2);
		assert.equal(plan.restoreSupermarketProducts.length, 2);
	});
});
