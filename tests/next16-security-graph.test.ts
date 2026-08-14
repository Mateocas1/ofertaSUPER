import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGraphAuthority } from "../src/lib/production-readiness/dependency-gate";

const tree = [
	{ package: "next", version: "16.3.1", path: "node_modules/next" },
	{ package: "axios", version: "1.18.0", path: "node_modules/axios" },
];

test("graph authority rejects unknown lifecycle install-script and execution markers", () => {
	for (const lifecycle of [
		[{ path: "node_modules/next", markerExecuted: false }, { path: "node_modules/axios", hasInstallScript: false, markerExecuted: false }],
		[{ path: "node_modules/next", hasInstallScript: false }, { path: "node_modules/axios", hasInstallScript: false, markerExecuted: false }],
		[{ path: "node_modules/next", hasInstallScript: false, markerExecuted: true }, { path: "node_modules/axios", hasInstallScript: false, markerExecuted: false }],
	]) {
		const result = evaluateGraphAuthority({ tree, findings: [], lifecycle });
		assert.equal(result.allowed, false);
		assert.equal(result.reasons.some((reason) => reason.startsWith("lifecycle marker unknown") || reason.startsWith("lifecycle marker executed")), true);
	}
});

test("graph authority closes only a classified zero-audit graph", () => {
	assert.deepEqual(
		evaluateGraphAuthority({
			tree,
			findings: [],
			lifecycle: tree.map(({ path }) => ({ path, hasInstallScript: false, markerExecuted: false })),
		}),
		{
			allowed: true,
			reasons: [],
			classifications: [
				{ package: "axios", version: "1.18.0", path: "node_modules/axios", advisories: [], remediation: "clear" },
				{ package: "next", version: "16.3.1", path: "node_modules/next", advisories: [], remediation: "clear" },
			],
		},
	);

	for (const findings of [
		[{ path: "node_modules/next", advisory: "GHSA-residual" }],
		[{ path: "node_modules/unclassified", advisory: "GHSA-unclassified" }],
		[{ advisory: "GHSA-missing-path" }],
	]) {
		assert.equal(evaluateGraphAuthority({ tree, findings, lifecycle: tree.map(({ path }) => ({ path, hasInstallScript: false, markerExecuted: false })) }).allowed, false);
	}
});
