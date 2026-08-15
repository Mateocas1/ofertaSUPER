import assert from "node:assert/strict";
import test from "node:test";

import {
	createHandoff,
	evaluateRollout,
	type RolloutDependencies,
} from "../scripts/next16-rollout";

const completeProof = {
	snapshotId: "sha256:candidate",
	routes: [
		{ path: "/api/health/live", status: 200, visibility: "public" as const },
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
