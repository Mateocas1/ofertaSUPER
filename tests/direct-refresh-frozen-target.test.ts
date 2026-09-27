import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { db } from "../src/lib/db";
import {
	createDirectRefreshManifestRepository,
	parseDirectRefreshManifestCliOptions,
} from "../scripts/audit-direct-refresh-manifest";
import {
	createDirectRefreshPrewriteRepository,
	parseDirectRefreshPrewriteGateCliOptions,
} from "../scripts/audit-direct-refresh-prewrite-gate";
import { buildDirectRefreshManifestDryRun } from "../scripts/pipeline/direct-refresh-manifest";
import {
	buildDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteExistingRow,
} from "../scripts/pipeline/direct-refresh-prewrite-gate";
import {
	parseDirectRefreshFrozenTarget,
} from "../scripts/pipeline/direct-refresh-frozen-target";
import {
	assertFreshPrewriteRerunMatches,
	parseCarrefourActiveWriteCliOptions,
	validatePrewriteReportForActiveWrite,
} from "../scripts/pipeline/direct-refresh-active-write";

function gtin(index: number) {
	const body = String(779000000000 + index);
	const sum = [...body].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0);
	return `${body}${(10 - sum % 10) % 10}`;
}

function input() {
	const manifest = {
		schemaVersion: 1,
		cycleId: "frozen-test",
		frozenAt: "2026-09-20T00:00:00.000Z",
		products: Array.from({ length: 500 }, (_, index) => ({
			targetId: `target-${index}`, ean: gtin(index), useful: true,
			pack: null, quantity: null, measurementUnit: null, variant: null,
		})),
	};
	const raw = JSON.stringify(manifest);
	return { raw, expectedSha256: digest(raw) };
}
function digest(raw: string) {
	return createHash("sha256").update(raw).digest("hex");
}
function changedInput(change: (manifest: ReturnType<typeof JSON.parse>) => void) {
	const manifest = JSON.parse(input().raw);
	change(manifest);
	const raw = JSON.stringify(manifest);
	return { raw, expectedSha256: digest(raw) };
}
function row(index: number): DirectRefreshPrewriteExistingRow {
	return {
		id: String(index + 1), sourceSlug: "carrefour", supermarketId: 1,
		ean: gtin(index), skuId: `sku-${index}`, sellerId: "1",
		productUrl: `https://www.carrefour.com.ar/product-${index}/p`,
		lastCheckedAt: "2026-09-20T00:00:00.000Z", price: 100, listPrice: 100,
		referencePrice: null, referenceUnit: null, isAvailable: true,
		product: { ean: gtin(index), name: "Product", brand: null, description: null,
			imageUrl: null, images: [], category: null }, latestPriceHistory: null,
	};
}
function dependencies(rows = Array.from({ length: 25 }, (_, index) => row(index))) {
	return {
		repository: {
			async getSource() { return { id: 1, slug: "carrefour", baseUrl: "https://www.carrefour.com.ar" }; },
			async listOldestPublicRankableRows(_source: string, count: number, eans?: readonly string[]) {
				return rows.filter((row) => !eans || eans.includes(row.ean!)).slice(0, count);
			},
			async findRowsBySourceSku(_source: string, sku: string) { return rows.filter((row) => row.skuId === sku); },
			async getMaxPriceHistoryId() { return 100; },
		},
		async fetchDirectProducts(_source: string, lookup: { value: string }) {
			const existing = rows.find((row) => row.skuId === lookup.value)!;
			return [{ ...existing.product!, skuId: existing.skuId, sellerId: "1", productUrl: existing.productUrl,
				price: 100, listPrice: 100, referencePrice: null, referenceUnit: null, isAvailable: true }];
		},
		now: new Date("2026-09-26T00:00:00.000Z"),
	};
}

test("frozen target validates 500 normalized checksum GTINs and pinned raw digest", () => {
	const target = parseDirectRefreshFrozenTarget(input());
	assert.equal(target.eans.length, 500);
	assert.equal(new Set(target.eans).size, 500);
	assert.equal(target.manifestSha256, input().expectedSha256);
	assert.match(target.targetFingerprint, /^[a-f0-9]{64}$/);
	for (const mutate of [
		(manifest: ReturnType<typeof JSON.parse>) => manifest.products.pop(),
		(manifest: ReturnType<typeof JSON.parse>) => manifest.products.push(manifest.products[0]),
		(manifest: ReturnType<typeof JSON.parse>) => { manifest.products[1].ean = ` ${manifest.products[0].ean}`; },
		(manifest: ReturnType<typeof JSON.parse>) => { manifest.products[0].ean = "7790000000000"; },
		(manifest: ReturnType<typeof JSON.parse>) => { manifest.products[0].useful = false; },
		(manifest: ReturnType<typeof JSON.parse>) => { manifest.products[0].ean = 123; },
	]) assert.throws(() => parseDirectRefreshFrozenTarget(changedInput(mutate)), /frozen target/i);
	assert.throws(() => parseDirectRefreshFrozenTarget({ ...input(), raw: `${input().raw}\n` }), /digest/i);
	assert.throws(() => parseDirectRefreshFrozenTarget({ ...input(), expectedSha256: "" }), /digest/i);
});

test("both CLIs require explicit manifest and digest together, leaving legacy defaults untouched", () => {
	for (const parse of [parseDirectRefreshManifestCliOptions, parseDirectRefreshPrewriteGateCliOptions]) {
		assert.equal(parse([]).frozenTargetManifest, undefined);
		assert.throws(() => parse(["--frozen-target-manifest=target.json"]), /requires/i);
		assert.throws(() => parse([`--frozen-target-sha256=${input().expectedSha256}`]), /requires/i);
		assert.equal(parse(["--frozen-target-manifest=target.json", `--frozen-target-sha256=${input().expectedSha256}`]).frozenTargetManifest, "target.json");
	}
});

test("both Prisma selectors restrict membership before take, including 10/25 batches and legacy queries", async (t) => {
	const target = parseDirectRefreshFrozenTarget(input());
	const allRows = [row(900), ...Array.from({ length: 25 }, (_, index) => row(index))];
	const original = db.supermarketProduct.findMany;
	t.after(() => { db.supermarketProduct.findMany = original; });
	// Prisma delegates are proxies; node:test method mocking cannot find their descriptors.
	db.supermarketProduct.findMany = (async (query: { where: { product_ean: { not: string; in?: string[] } }; take: number }) => {
		assert.equal(query.where.product_ean.not, "");
		const eligible = allRows.filter((row) => !query.where.product_ean.in || query.where.product_ean.in.includes(row.ean!));
		return eligible.slice(0, query.take).map((row) => ({
			id: Number(row.id), product_ean: row.ean, sku_id: row.skuId, seller_id: "1",
			product_url: row.productUrl, last_checked_at: null, price: 100, list_price: 100,
			reference_price: null, reference_unit: null, is_available: true,
			supermarket_id: 1, supermarket: { slug: "carrefour" }, product: null, price_history: [],
		}));
	}) as unknown as typeof original;
	for (const create of [createDirectRefreshManifestRepository, createDirectRefreshPrewriteRepository]) {
		for (const count of [10, 25]) {
			const selected = await create().listOldestPublicRankableRows("carrefour", count, target.eans);
			assert.equal(selected.length, count);
			assert.equal(selected[0].ean, gtin(0));
			assert.ok(selected.every((row) => target.eans.includes(row.ean!)));
		}
		assert.equal((await create().listOldestPublicRankableRows("carrefour", 10))[0].ean, gtin(900));
	}
});

test("both builders reject invalid targets before any repository or live access", async () => {
	for (const build of [buildDirectRefreshManifestDryRun, buildDirectRefreshPrewriteGate]) {
		const deps = dependencies();
		deps.repository.getSource = async () => { assert.fail("DB accessed before target validation"); };
		await assert.rejects(build({ ...deps, frozenTarget: { ...input(), expectedSha256: "0".repeat(64) } }), /digest/i);
	}
});

test("both builders bind exact eligible batches, reject leaked non-target rows and insufficient fill", async () => {
	for (const build of [buildDirectRefreshManifestDryRun, buildDirectRefreshPrewriteGate]) {
		for (const sampleSize of [10, 25]) {
			const report = await build({ ...dependencies(), sampleSize, frozenTarget: input() });
			assert.equal(report.status, "PASS");
			assert.equal(report.rows.length, sampleSize);
			assert.equal(report.selection.frozenTarget?.manifestSha256, input().expectedSha256);
			assert.equal(report.selection.frozenTarget?.selectedEans.length, sampleSize);
		}
		const deps = dependencies([row(900)]);
		deps.repository.listOldestPublicRankableRows = async () => [row(900)];
		deps.fetchDirectProducts = async () => { assert.fail("out-of-target live lookup"); };
		await assert.rejects(build({ ...deps, frozenTarget: input() }), /outside frozen target/i);
		const short = await build({ ...dependencies([row(0)]), frozenTarget: input() });
		assert.equal(short.status, "FAIL");
		const legacy = await build({ ...dependencies([row(900)]), sampleSize: 1 });
		assert.equal(legacy.status, "PASS");
		assert.equal("frozenTarget" in legacy.selection, false);
	}
});

test("prewrite confirmation rejects target drift, membership tampering and a legacy fresh rerun", async () => {
	const report = await buildDirectRefreshPrewriteGate({ ...dependencies(), frozenTarget: input() });
	const shape = report.futureConfirmation.shape;
	const options = parseCarrefourActiveWriteCliOptions([
		"node", "test", "--source=carrefour", "--count=10", "--confirm-write=carrefour-direct-refresh-count10", "--output=unused.json",
		"--prewrite-report=report.json", `--prewrite-report-hash=${shape.reportHash}`,
		`--row-ids=${shape.rowIds.join(",")}`, `--sku-ids=${shape.skuIds.join(",")}`,
		`--product-eans=${shape.productEans.join(",")}`,
	]);
	validatePrewriteReportForActiveWrite(report, options, new Date(report.generatedAt));
	for (const field of ["manifestSha256", "targetFingerprint"] as const) {
		const changed = structuredClone(report);
		changed.selection.frozenTarget![field] = "0".repeat(64);
		assert.throws(() => validatePrewriteReportForActiveWrite(changed, options, new Date(report.generatedAt)), /hash mismatch/i);
	}
	const changed = structuredClone(report);
	changed.rows[0].currentDb.supermarketProduct.productEan = gtin(900);
	assert.throws(() => validatePrewriteReportForActiveWrite(changed, options, new Date(report.generatedAt)), /hash mismatch/i);
	const rerun = await buildDirectRefreshPrewriteGate({ ...dependencies() });
	assert.throws(() => assertFreshPrewriteRerunMatches(report, rerun, options), /hash/i);
	const changedTarget = changedInput((manifest) => { manifest.products[499].ean = gtin(900); });
	const changedReport = await buildDirectRefreshPrewriteGate({ ...dependencies(), frozenTarget: changedTarget });
	assert.notEqual(changedReport.futureConfirmation.shape.reportHash, shape.reportHash);
});
