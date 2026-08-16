import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGraphAuthority, validateProductionGraphEvidence } from "../src/lib/production-readiness/dependency-gate";
import { extractProductionTree } from "../scripts/production-security-graph-evidence";

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

test("persisted graph evidence requires one matching lifecycle receipt for every path", () => {
	const lifecycle = tree.map(({ package: name, version, path }) => ({ package: name, version, path, hasInstallScript: false, markerExecuted: false, status: "skipped" as const }));
	assert.equal(validateProductionGraphEvidence({ tree, findings: [], lifecycle }).allowed, true);
	for (const invalid of [
		[...lifecycle, lifecycle[0]],
		[...lifecycle, { ...lifecycle[0], path: "node_modules/extra" }],
		lifecycle.map((receipt, index) => index === 0 ? { ...receipt, version: "unexpected" } : receipt),
	]) assert.equal(validateProductionGraphEvidence({ tree, findings: [], lifecycle: invalid }).allowed, false);
});

test("installed-tree extraction ignores pathless references and collapses repeated physical paths", () => {
	const raw = JSON.stringify({ dependencies: { next: { path: "/repo/node_modules/next", version: "16.3.1", dependencies: { shared: { path: "/repo/node_modules/shared", version: "1.0.0" } } }, alias: { dependencies: { shared: { path: "/repo/node_modules/shared", version: "1.0.0" } } } } });
	assert.deepEqual(extractProductionTree(raw, "/repo"), [{ package: "next", version: "16.3.1", path: "node_modules/next" }, { package: "shared", version: "1.0.0", path: "node_modules/shared" }]);
});
