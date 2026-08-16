import assert from "node:assert/strict";
import test from "node:test";

import {
	createStandalonePromotionReceipts,
	createHandoff,
	evaluateDistinctReleaseRollout,
	evaluateRollout,
	type RolloutDependencies,
} from "../scripts/next16-rollout";

const completeProof = {
	snapshotId: "sha256:candidate",
	releaseId: "sha256:image",
	routes: [
		{ path: "/api/health/live", status: 200, visibility: "public" as const },
		{
			path: "/api/products?limit=1",
			status: 200,
			visibility: "public" as const,
			catalog: {
				itemCount: 1,
				nonEmpty: true,
				provenance: "demo" as const,
				responseShape: "product-list/v1" as const,
				snapshotId: "sha256:candidate",
				releaseId: "sha256:image",
				observedAt: new Date().toISOString(),
			},
		},
		{ path: "/admin", status: 307, visibility: "protected" as const },
	],
};

function dependencies() {
	const events: string[] = [];
	const value: RolloutDependencies = {
		cleanup: () => events.push("cleanup"),
		switchTo: (release) => events.push(`switch:${release}`),
	};
	return { events, value };
}

test("accepts standalone evidence for representative public and protected routes", () => {
	const { events, value } = dependencies();
	const result = evaluateRollout({ candidate: "candidate", retained: "retained", runtime: completeProof }, value);

	assert.deepEqual(result, { activeRelease: "candidate", state: "promoted", switched: true });
	assert.deepEqual(events, ["switch:candidate", "cleanup"]);
});

test("blocks promotion when standalone runtime proof is missing without changing pre-cutover traffic", () => {
	const { events, value } = dependencies();
	const result = evaluateRollout({ candidate: "candidate", retained: "retained", runtime: null }, value);

	assert.deepEqual(result, { activeRelease: "retained", state: "blocked", switched: false });
	assert.deepEqual(events, []);
});

test("blocks promotion when the standalone catalog receipt is absent or empty", () => {
	for (const runtime of [
		{ ...completeProof, routes: completeProof.routes.filter((route) => route.path !== "/api/products?limit=1") },
		{
			...completeProof,
			routes: completeProof.routes.map((route) => route.path === "/api/products?limit=1"
				? { ...route, catalog: { ...route.catalog!, itemCount: 0, nonEmpty: false } }
				: route),
		},
		{
			...completeProof,
			routes: completeProof.routes.map((route) => route.path === "/api/products?limit=1"
				? { ...route, catalog: { ...route.catalog!, responseShape: "unexpected" } }
				: route),
		},
	]) {
		const { events, value } = dependencies();
		const result = evaluateRollout({ candidate: "candidate", retained: "retained", runtime }, value);

		assert.deepEqual(result, { activeRelease: "retained", state: "blocked", switched: false });
		assert.deepEqual(events, []);
	}
});

test("blocks stale or mixed standalone catalog receipts", () => {
	for (const catalog of [
		{ ...completeProof.routes[1].catalog!, observedAt: new Date(0).toISOString() },
		{ ...completeProof.routes[1].catalog!, releaseId: "sha256:other-image" },
	]) {
		const { events, value } = dependencies();
		const runtime = { ...completeProof, routes: completeProof.routes.map((route) => route.path === "/api/products?limit=1" ? { ...route, catalog } : route) };
		const result = evaluateRollout({ candidate: "candidate", retained: "retained", runtime }, value);

		assert.deepEqual(result, { activeRelease: "retained", state: "blocked", switched: false });
		assert.deepEqual(events, []);
	}
});

for (const failure of ["failure", "timeout", "signal"] as const) {
	test(`restores retained traffic once and cleans up after candidate ${failure}`, () => {
		const { events, value } = dependencies();
		const result = evaluateRollout({ candidate: "candidate", retained: "retained", runtime: completeProof, failure }, value);

		assert.deepEqual(result, { activeRelease: "retained", state: "rolled_back", switched: true });
		assert.deepEqual(events, ["switch:candidate", "switch:retained", "cleanup"]);
	});
}

test("records a pending production-readiness handoff without claiming its task is complete", () => {
	assert.deepEqual(createHandoff(completeProof, "promoted"), {
		productionReadiness: { task: "1.3", state: "pending" },
		runtime: { snapshotId: "sha256:candidate", state: "promoted" },
	});
});

test("converts the validated S2 standalone catalog proof into release-bound promotion receipts", () => {
	const receipts = createStandalonePromotionReceipts(completeProof);

	assert.deepEqual(receipts.map((receipt) => receipt.gate), [
		"standalone-liveness",
		"standalone-catalog-provenance",
		"protected-denial",
	]);
	assert.ok(receipts.every((receipt) => receipt.snapshotId === completeProof.snapshotId && receipt.releaseId === completeProof.releaseId));
});

test("rolls back a distinct candidate exactly once after post-cutover critical smoke fails", () => {
	const events: string[] = [];
	const result = evaluateDistinctReleaseRollout({
		retained: "local/retained", candidate: "local/candidate",
		retainedDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		candidateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		preCutover: {
			...completeProof,
			releaseId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			routes: completeProof.routes.map((route) => route.catalog ? { ...route, catalog: { ...route.catalog, releaseId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } } : route),
		},
		postCutover: null,
		criticalFailure: "timeout",
	}, { switchTo: (release) => { events.push(release); return true; } });

	assert.deepEqual(result, { state: "rolled_back", finalRelease: "retained", rollbackCount: 1 });
	assert.deepEqual(events, ["candidate", "retained"]);
});
