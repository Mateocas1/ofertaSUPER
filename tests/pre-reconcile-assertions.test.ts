import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertPhase4PreReconcileGate,
	type PreReconcileSourceExecution,
} from "../scripts/pipeline/pre-reconcile-assertions";

const expectedEans = ["111", "222", "333", "444", "555"];

function pendingCandidate(ean: string, price: number | null = 100) {
	return { ean, price, status: "PENDING" as const };
}

function execution(
	overrides: Partial<PreReconcileSourceExecution> = {},
): PreReconcileSourceExecution {
	return {
		runId: 42,
		summary: {
			slug: "carrefour",
			status: "SUCCESS",
			queriesSent: 1,
			productsRejected: 0,
		},
		candidates: expectedEans.map((ean, index) =>
			pendingCandidate(ean, 100 + index),
		),
		...overrides,
	};
}

describe("Phase 4 pre-reconcile gate", () => {
	it("accepts one source, one query, five pending candidates, positive prices, and exact EAN match", () => {
		assert.doesNotThrow(() =>
			assertPhase4PreReconcileGate({
				expectedEans,
				executions: [execution()],
			}),
		);
	});

	it("rejects missing or extra actual EANs before reconciliation", () => {
		assert.throws(
			() =>
				assertPhase4PreReconcileGate({
					expectedEans,
					executions: [
						execution({
							candidates: [
								...expectedEans.slice(1).map((ean) => pendingCandidate(ean)),
								pendingCandidate("999"),
							],
						}),
					],
				}),
			/expected EAN mismatch: missing=111 extra=999/,
		);
	});

	it("rejects null, zero, and negative prices before public mutation", () => {
		for (const price of [null, 0, -1]) {
			assert.throws(
				() =>
					assertPhase4PreReconcileGate({
						expectedEans,
						executions: [
							execution({
								candidates: [
									pendingCandidate("111", price),
									...expectedEans.slice(1).map((ean) => pendingCandidate(ean)),
								],
							}),
						],
					}),
				/expected positive non-null price for EAN 111/,
			);
		}
	});

	it("rejects rejected candidates, duplicate EANs, multiple sources, and multiple queries", () => {
		assert.throws(
			() =>
				assertPhase4PreReconcileGate({
					expectedEans,
					executions: [
						execution({
							candidates: expectedEans.map((ean, index) => ({
								ean,
								price: 100,
								status:
									index === 0 ? ("REJECTED" as const) : ("PENDING" as const),
							})),
						}),
					],
				}),
			/expected all candidates to be PENDING before reconciliation/,
		);
		assert.throws(
			() =>
				assertPhase4PreReconcileGate({
					expectedEans,
					executions: [
						execution({
							candidates: [
								pendingCandidate("111"),
								pendingCandidate("111"),
								...expectedEans.slice(2).map((ean) => pendingCandidate(ean)),
							],
						}),
					],
				}),
			/expected 5 distinct actual EANs before reconciliation/,
		);
		assert.throws(
			() =>
				assertPhase4PreReconcileGate({
					expectedEans,
					executions: [execution(), execution()],
				}),
			/expected exactly one source before reconciliation/,
		);
		assert.throws(
			() =>
				assertPhase4PreReconcileGate({
					expectedEans,
					executions: [
						execution({
							summary: { ...execution().summary, queriesSent: 2 },
						}),
					],
				}),
			/expected exactly one query before reconciliation/,
		);
	});
});
