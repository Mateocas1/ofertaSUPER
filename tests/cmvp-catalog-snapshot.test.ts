import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	executeCmvpCatalogSnapshot,
	parseCmvpCatalogSnapshotCliOptions,
	requireDatabaseUrl,
} from "../scripts/audit-cmvp-catalog-snapshot";
import { buildCmvpCatalogGateReport } from "../scripts/pipeline/cmvp-catalog-gate";
import { buildCmvpCatalogSnapshot, type CmvpCatalogSnapshotRepository, type CmvpTargetManifest } from "../scripts/pipeline/cmvp-catalog-snapshot";

const ean = "7790000000003";
const fixedNow = "2026-09-19T12:00:00.000Z";
type GateInput = Omit<Parameters<typeof buildCmvpCatalogGateReport>[0], "now"> & { now?: string };
const gate = (input: GateInput) => buildCmvpCatalogGateReport({ ...input, now: input.now ?? fixedNow });
const targetManifest: CmvpTargetManifest = {
	schemaVersion: 1,
	cycleId: "cycle-003",
	frozenAt: "2026-09-19T12:00:00.000Z",
	products: [{ targetId: "milk-1l", useful: true, ean, pack: "bottle", quantity: "1 l", measurementUnit: "l", variant: "whole" }],
};

describe("CMVP catalog snapshot", () => {
	it("represents a valid normalized EAN with null optional observations and passes it to the gate", async () => {
		const repository: CmvpCatalogSnapshotRepository = {
			async listOffers(input) {
				assert.deepEqual(input, { sources: ["carrefour", "disco", "jumbo"], productEans: [ean] });
				return [
					{ source: "jumbo", productEan: "779 000000000-3", available: true, price: 1200, observedAt: "2026-09-19T11:00:00.000Z" },
					{ source: "disco", productEan: ean, available: true, price: 1100, observedAt: "2026-09-19T10:00:00.000Z" },
				];
			},
		};
		const generated = await buildCmvpCatalogSnapshot({ targetManifest, repository, observedAt: "2026-09-19T12:00:00.000Z" });
		assert.deepEqual(generated.offers.map(({ pack, quantity, measurementUnit, variant }) => ({ pack, quantity, measurementUnit, variant })), [
			{ pack: null, quantity: null, measurementUnit: null, variant: null },
			{ pack: null, quantity: null, measurementUnit: null, variant: null },
		]);
		assert.equal(gate({ targetManifest, snapshot: generated }).identity.exactComparableProducts, 1);
	});

	it("preserves explicitly observed optional attributes and reports conflicts deterministically without target copying", async () => {
		const repository = { async listOffers() { return [{ source: "disco" as const, productEan: ean, available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" }]; } };
		const generated = await buildCmvpCatalogSnapshot({
			targetManifest, repository, observedAt: "2026-09-19T12:00:00.000Z",
			identityEvidence: [
				{ source: "disco", ean, pack: "carton", quantity: "1 l", measurementUnit: "l", variant: "whole" },
				{ source: "disco", ean, pack: "bottle", quantity: "1 l", measurementUnit: "l", variant: "whole" },
				{ source: "jumbo", ean: "malformed", pack: "copied?", quantity: "9", measurementUnit: "kg", variant: "wrong" },
			],
		});
		assert.deepEqual(generated.offers[0], { source: "disco", targetId: "milk-1l", ean, pack: null, quantity: "1 l", measurementUnit: "l", variant: "whole", available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" });
		assert.deepEqual(generated.identity.attributeConflicts, [{ source: "disco", ean, attributes: ["pack"] }]);
	});

	it("rejects invalid and mismatched EAN rows while retaining deterministic output ordering", async () => {
		const rows = [
			{ source: "disco" as const, productEan: "malformed", available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" },
			{ source: "disco" as const, productEan: "7790000000010", available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" },
		];
		const generated = await buildCmvpCatalogSnapshot({ targetManifest, repository: { async listOffers() { return rows; } }, observedAt: "2026-09-19T12:00:00.000Z" });
		assert.deepEqual(generated.offers, []);
	});

	it("fails closed for duplicate normalized source identities", async () => {
		const rows = [
			{ source: "disco" as const, productEan: ean, available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" },
			{ source: "disco" as const, productEan: "779 000-000 0003", available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" },
		];

		await assert.rejects(
			() => buildCmvpCatalogSnapshot({ targetManifest, repository: { async listOffers() { return rows; } }, observedAt: "2026-09-19T12:00:00.000Z" }),
			/duplicate normalized source identity/,
		);
	});

	it("serializes the generated snapshot rather than evaluating gate thresholds", async () => {
		const snapshot = await executeCmvpCatalogSnapshot({
			targetManifest,
			repository: {
				async listOffers() {
					return [{ source: "disco", productEan: ean, available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" }];
				},
			},
			observedAt: "2026-09-19T12:00:00.000Z",
		});

		assert.deepEqual(snapshot, {
			schemaVersion: 1,
			cycleId: "cycle-003",
			observedAt: "2026-09-19T12:00:00.000Z",
			offers: [{ source: "disco", targetId: "milk-1l", ean, pack: null, quantity: null, measurementUnit: null, variant: null, available: true, price: 100, observedAt: "2026-09-19T11:00:00.000Z" }],
			readOnly: true,
			identity: { missingStructuredEvidenceIsUnproven: false, attributeConflicts: [] },
		});
		assert.equal("status" in snapshot, false);
		assert.equal("report" in snapshot, false);
	});

	it("requires a read-only environment and rejects source expansion or write-oriented CLI flags", () => {
		assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL is required/);
		assert.doesNotThrow(() => requireDatabaseUrl({ DATABASE_URL: "configured" }));
		assert.deepEqual(parseCmvpCatalogSnapshotCliOptions(["node", "script", "--target-manifest=target.json", "--observed-at=2026-09-19T12:00:00.000Z"]), { targetManifest: "target.json", observedAt: "2026-09-19T12:00:00.000Z", identityEvidence: null });
		assert.deepEqual(parseCmvpCatalogSnapshotCliOptions(["node", "script", "--target-manifest=target.json", "--observed-at=2026-09-19T12:00:00.000Z", "--identity-evidence=evidence.json"]), { targetManifest: "target.json", observedAt: "2026-09-19T12:00:00.000Z", identityEvidence: "evidence.json" });
		assert.throws(() => parseCmvpCatalogSnapshotCliOptions(["node", "script", "--target-manifest=target.json", "--observed-at=2026-09-19T12:00:00.000Z", "--write"]), /read-only/);
	});
});
