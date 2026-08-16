import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
	assertJsonAuditInput,
	classifyProductionAudit,
	FOUNDATION_PATHS,
	validateFoundationInventory,
	validatePairedPackages,
} from "../src/lib/production-readiness/dependency-gate";
import { captureBaselineEvidence, NPM_AUDIT_ARGS } from "../scripts/production-security-evidence";
import { createProductionGraphEvidence, PRODUCTION_SECURITY_COMMANDS, verifyRetainedProductionGraphEvidence } from "../scripts/production-security-graph-evidence";

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

test("graph evidence binds a complete classified zero-audit snapshot to fixed commands", () => {
	const tree = [{ package: "next", version: "16.3.1", path: "node_modules/next" }];
	const lifecycle = [{ ...tree[0], hasInstallScript: false, markerExecuted: false, status: "skipped" as const }];
	const audit = `sha256:${"a".repeat(64)}`;
	assert.deepEqual(PRODUCTION_SECURITY_COMMANDS, [["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], ["npm", "ls", "--omit=dev", "--all", "--json", "--long"], ["npm", "audit", "--omit=dev", "--json", "--ignore-scripts"]]);
	const evidence = createProductionGraphEvidence({ tree, findings: [], lifecycle, audit: { sha256: audit, status: 0 }, candidate: { "package-lock.json": "sha256:lock", "package.json": "sha256:package" } });
	assert.equal(evidence.manifest.records.length, 3);
	assert.equal(evidence.manifest.records[1].sha256, `sha256:${createHash("sha256").update('[{"advisories":[],"package":"next","path":"node_modules/next","remediation":"clear","version":"16.3.1"}]\n').digest("hex")}`);
	assert.match(evidence.snapshotId, /^sha256:[a-f0-9]{64}$/);
	assert.throws(() => createProductionGraphEvidence({ tree, findings: [], lifecycle: [{ ...lifecycle[0], markerExecuted: true }], audit: { sha256: audit, status: 0 }, candidate: {} }), /graph evidence rejected/);
});

test("retained graph evidence accepts only an independently anchored current context", () => {
	const tree = [{ package: "next", version: "16.3.1", path: "node_modules/next" }];
	const candidate = { "package-lock.json": `sha256:${"b".repeat(64)}`, "package.json": `sha256:${"c".repeat(64)}`, "scripts/production-security-graph-evidence.ts": `sha256:${"d".repeat(64)}`, "src/lib/production-readiness/dependency-gate.ts": `sha256:${"e".repeat(64)}` };
	const audit = "{\"vulnerabilities\":{}}\n";
	const redefinedAudit = "{ \"vulnerabilities\": {} }\n";
	const classifications = "[{\"advisories\":[],\"package\":\"next\",\"path\":\"node_modules/next\",\"remediation\":\"clear\",\"version\":\"16.3.1\"}]\n";
	const lifecycle = "[{\"hasInstallScript\":false,\"markerExecuted\":false,\"package\":\"next\",\"path\":\"node_modules/next\",\"status\":\"skipped\",\"version\":\"16.3.1\"}]\n";
	const evidence = createProductionGraphEvidence({ tree, findings: [], lifecycle: [{ ...tree[0], hasInstallScript: false, markerExecuted: false, status: "skipped" as const }], audit: { sha256: `sha256:${createHash("sha256").update(audit).digest("hex")}`, status: 0 }, candidate });
	const retained = { directorySnapshotId: evidence.snapshotId, anchor: { snapshotId: evidence.snapshotId, candidate }, manifest: evidence.manifest, records: { audit, classifications, lifecycle }, candidate };
	assert.equal(verifyRetainedProductionGraphEvidence(retained), true);
	for (const invalid of [
		{ ...retained, candidate: { ...candidate, "package-lock.json": `sha256:${"d".repeat(64)}` } },
		{ ...retained, manifest: { ...evidence.manifest, audit: { sha256: "malformed", status: 0 } } },
		{ ...retained, manifest: { ...evidence.manifest, audit: { sha256: `sha256:${createHash("sha256").update(redefinedAudit).digest("hex")}`, status: 0 }, records: evidence.manifest.records.map((record) => record.path === "audit.json" ? { ...record, sha256: `sha256:${createHash("sha256").update(redefinedAudit).digest("hex")}` } : record) }, records: { ...retained.records, audit: redefinedAudit } },
		{ ...retained, manifest: { ...evidence.manifest, records: evidence.manifest.records.map((record) => record.path === "classifications.json" ? { ...record, sha256: `sha256:${"e".repeat(64)}` } : record) } },
		{ ...retained, records: { ...retained.records, classifications: "[]\n" } },
		{ ...retained, records: { ...retained.records, lifecycle: lifecycle.replace("]", `,${lifecycle.slice(1).trim()}`) } },
		{ ...retained, records: { ...retained.records, unexpected: "tampered" } }, { ...retained, manifest: { ...evidence.manifest, schema: "production-security-graph/v2" } }, { ...retained, manifest: { ...evidence.manifest, version: "v1" } }, { ...retained, manifest: { ...evidence.manifest, unexpected: "tampered" } },
		{ ...retained, anchor: { ...retained.anchor, snapshotId: `sha256:${"f".repeat(64)}` } },
	]) assert.throws(() => verifyRetainedProductionGraphEvidence(invalid), /retained graph evidence rejected/);
});
