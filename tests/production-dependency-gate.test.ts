import assert from "node:assert/strict";
import test from "node:test";

import {
	assertJsonAuditInput,
	classifyProductionAudit,
	FOUNDATION_PATHS,
	validateFoundationInventory,
	validatePairedPackages,
} from "../src/lib/production-readiness/dependency-gate";
import { captureBaselineEvidence, NPM_AUDIT_ARGS } from "../scripts/production-security-evidence";

test("audit input rejects hostile paths and retains inert JSON payloads as data", () => {
	for (const path of ["../audit.json", "/tmp/audit.json", "C:\\audit.json", "\\\\server\\audit.json", "audit\u0000.json", "requirements.txt", "CMakeLists.txt", "report.md", "report.mdx", "README.sh"]) {
		assert.throws(() => assertJsonAuditInput({ path, raw: '{"critical":0}' }), /repository-relative JSON/);
	}
	assert.deepEqual(assertJsonAuditInput({ path: "evidence/audit.json", raw: '{"note":"$(touch never-runs)"}' }), { note: "$(touch never-runs)" });
});

test("paired Next.js packages must share one supplied version", () => {
	assert.deepEqual(validatePairedPackages({ next: "16.3.1", "@next/env": "16.3.1", "eslint-config-next": "16.3.1" }), { allowed: true, reasons: [] });
	assert.deepEqual(validatePairedPackages({ next: "16.3.1", "@next/env": "16.3.0", "eslint-config-next": "16.3.1" }), { allowed: false, reasons: ["paired package versions differ"] });
});

test("classification covers every supplied path in deterministic order", () => {
	const result = classifyProductionAudit({
		tree: [{ package: "z", version: "1", path: "node_modules/z" }, { package: "a", version: "2", path: "node_modules/a" }],
		findings: [],
	});
	assert.deepEqual(result, {
		allowed: true,
		reasons: [],
		classifications: [
			{ package: "a", version: "2", path: "node_modules/a", advisories: [], remediation: "clear" },
			{ package: "z", version: "1", path: "node_modules/z", advisories: [], remediation: "clear" },
		],
	});
});

test("residual and unclassified findings deny audit closure", () => {
	const residual = classifyProductionAudit({ tree: [{ package: "next", version: "16.3.1", path: "node_modules/next" }], findings: [{ path: "node_modules/next", advisory: "GHSA-test" }] });
	assert.deepEqual(residual, {
		allowed: false,
		reasons: ["residual finding: node_modules/next#GHSA-test"],
		classifications: [{ package: "next", version: "16.3.1", path: "node_modules/next", advisories: ["GHSA-test"], remediation: "residual" }],
	});
	const unclassified = classifyProductionAudit({ tree: [{ package: "next", version: "16.3.1", path: "node_modules/next" }], findings: [{ advisory: "GHSA-missing" }] });
	assert.equal(unclassified.allowed, false);
	assert.deepEqual(unclassified.reasons, ["audit finding path missing"]);
});

test("foundation inventory rejects noncanonical, staged, empty, and mismatched extraction", () => {
	const expectedBase = "a".repeat(40);
	const complete = { root: "/workspace/ofertaSUPER", expectedRoot: "/workspace/ofertaSUPER", base: expectedBase, expectedBase, staged: [], paths: FOUNDATION_PATHS };
	assert.deepEqual(validateFoundationInventory(complete), { allowed: true, reasons: [] });
	for (const input of [
		{ ...complete, root: "../ofertaSUPER" },
		{ ...complete, root: "C:\\ofertaSUPER" },
		{ ...complete, staged: ["package.json"] },
		{ ...complete, paths: [] },
		{ ...complete, paths: [...FOUNDATION_PATHS, "src/lib/production-readiness/repository.ts"] },
	]) assert.equal(validateFoundationInventory(input).allowed, false);
});

test("baseline evidence fixes argv, blocks shell interpretation, and redacts the environment", () => {
	const calls: Array<{ command: string; args: string[]; options: { shell: boolean; env: Record<string, string> } }> = [];
	const secret = "SECRET_CANARY_SHOULD_NOT_LEAK";
	const expectedArgs = ["audit", "--omit=dev", "--json", "--ignore-scripts"];
	assert.deepEqual(NPM_AUDIT_ARGS, expectedArgs);
	const evidence = captureBaselineEvidence({
		environment: { HOME: "/safe", PATH: "/safe;$(touch never-runs)", SECRET_CANARY: secret },
		runner: (command, args, options) => {
			calls.push({ command, args, options });
			return { status: 1, stdout: '{"metadata":{"vulnerabilities":{"high":1}}}' };
		},
	});
	assert.deepEqual(calls, [{ command: "npm", args: expectedArgs, options: { shell: false, env: { HOME: "/safe", PATH: "/safe;$(touch never-runs)" } } }]);
	assert.deepEqual(JSON.parse(evidence), {
		audit: { metadata: { vulnerabilities: { high: 1 } } },
		command: ["npm", ...expectedArgs],
		environment: ["HOME", "PATH"],
		status: 1,
	});
	assert.doesNotMatch(evidence, new RegExp(secret));
	assert.doesNotMatch(evidence, /touch never-runs/);
});
