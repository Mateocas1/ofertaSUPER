import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCmvpCatalogGateCliOptions } from "../scripts/audit-cmvp-catalog-gate";
import {
	buildCmvpCatalogGateReport,
	type CmvpCatalogSnapshot,
	type CmvpTargetManifest,
} from "../scripts/pipeline/cmvp-catalog-gate";

const ean = "7790000000003";
const fixedNow = "2026-09-19T12:00:00.000Z";
type GateInput = Omit<Parameters<typeof buildCmvpCatalogGateReport>[0], "now"> & { now?: string };
const gate = (input: GateInput) => buildCmvpCatalogGateReport({ ...input, now: input.now ?? fixedNow });
const manifest: CmvpTargetManifest = {
	schemaVersion: 1,
	cycleId: "cycle-002",
	frozenAt: "2026-09-19T12:00:00.000Z",
	products: [{ targetId: "milk-1l", useful: true, ean, pack: "bottle", quantity: "1 l", measurementUnit: "l", variant: "whole" }],
};

const snapshot: CmvpCatalogSnapshot = {
	schemaVersion: 1,
	cycleId: "cycle-002",
	observedAt: "2026-09-19T12:00:00.000Z",
	offers: [
		{ source: "jumbo", targetId: "milk-1l", ean: "779 000000000-3", pack: null, quantity: null, measurementUnit: null, variant: null, available: true, price: 1200, observedAt: "2026-09-19T11:00:00.000Z" },
		{ source: "disco", targetId: "milk-1l", ean, pack: "carton", quantity: null, measurementUnit: null, variant: null, available: true, price: 1100, observedAt: "2026-09-19T10:00:00.000Z" },
	],
	identity: { attributeConflicts: [{ source: "disco", ean, attributes: ["pack"] }] },
};

describe("CMVP catalog gate", () => {
	it("uses a valid normalized matching EAN alone for exact identity while preserving optional-attribute diagnostics", () => {
		const report = gate({ targetManifest: manifest, snapshot });
		assert.equal(report.identity.model, "normalized-EAN/GTIN");
		assert.equal(report.identity.exactComparableProducts, 1);
		assert.deepEqual(report.sources, [
			{ source: "carrefour", offers: 0, represented: false, available: 0, priceRankable: 0, withinWindow: 0 },
			{ source: "disco", offers: 1, represented: true, available: 1, priceRankable: 1, withinWindow: 1 },
			{ source: "jumbo", offers: 1, represented: true, available: 1, priceRankable: 1, withinWindow: 1 },
		]);
		assert.equal(report.observations.freshDistinctUsefulProducts, 1);
		assert.deepEqual(report.identity.attributeConflicts, [{ source: "disco", ean, attributes: ["pack"] }]);
		assert.deepEqual(report.exclusions, []);
	});

	it("rejects malformed, missing, and mismatched EANs without hiding their deterministic diagnostics", () => {
		const report = gate({
			targetManifest: manifest,
			snapshot: { ...snapshot, offers: [
				{ ...snapshot.offers[0], ean: "malformed" },
				{ ...snapshot.offers[1], ean: null },
			] },
		});
		assert.equal(report.identity.exactComparableProducts, 0);
		assert.equal(report.sources[1].represented, false);
		assert.deepEqual(report.exclusions, [
			{ source: "disco", targetId: "milk-1l", reasons: ["missing-ean"] },
			{ source: "jumbo", targetId: "milk-1l", reasons: ["invalid-ean", "ean-mismatch"] },
		]);
	});

	it("fails closed for unsupported sources, cycle drift, duplicates, future observations, and invalid prices", () => {
		for (const changed of [
			{ ...snapshot, cycleId: "other" },
			{ ...snapshot, offers: [{ ...snapshot.offers[0], source: "vea" }] },
			{ ...snapshot, offers: [snapshot.offers[0], snapshot.offers[0]] },
			{ ...snapshot, offers: [{ ...snapshot.offers[0], observedAt: "2026-09-19T12:00:01.000Z" }] },
			{ ...snapshot, offers: [{ ...snapshot.offers[0], price: 0 }] },
		] as unknown as CmvpCatalogSnapshot[]) {
			assert.throws(() => gate({ targetManifest: manifest, snapshot: changed }), /cycle|source|duplicate|future|price/);
		}
	});

	it("rejects duplicate normalized target and source identities and evaluates freshness against injected now", () => {
		assert.throws(() => gate({ targetManifest: { ...manifest, products: [...manifest.products, { ...manifest.products[0], targetId: "milk-duplicate", ean: "779 000000000-3" }] }, snapshot }), /duplicate normalized target EAN/);
		assert.throws(() => gate({ targetManifest: manifest, snapshot: { ...snapshot, offers: [...snapshot.offers, { ...snapshot.offers[1], ean: "779 000-000 0003" }] } }), /duplicate normalized source identity/);
		const stale = gate({ targetManifest: manifest, snapshot, now: "2026-09-20T12:00:00.000Z" });
		assert.equal(stale.observations.freshDistinctUsefulProducts, 0);
		assert.throws(() => gate({ targetManifest: manifest, snapshot: { ...snapshot, observedAt: "2026-09-19T12:06:00.000Z" }, now: fixedNow }), /future snapshot observation/);
	});

	it("requires explicit fixture paths and rejects write-oriented CLI flags", () => {
		assert.deepEqual(parseCmvpCatalogGateCliOptions(["node", "script", "--target-manifest=target.json", "--snapshot=observed.json"]), { targetManifest: "target.json", snapshot: "observed.json", priorCycle: null });
		assert.throws(() => parseCmvpCatalogGateCliOptions(["node", "script", "--target-manifest=target.json", "--snapshot=observed.json", "--write"]), /read-only/);
	});
});
