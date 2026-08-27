import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	THRESHOLDS,
	auditComplexity,
	formatComplexityReport,
	isAnalyzedPath,
	machineComplexityReport,
	validateComplexityPolicy,
} from "../scripts/audit-complexity.mjs";

const fingerprint = "sha256:dab26e8ac5328e41e1dbda5ec32a80435b4d4809ba8effbaff58b47f93af1b7d";
const baseline = {
	schemaVersion: 3,
	thresholds: THRESHOLDS,
	findings: [{ functionId: "src/example.ts#function:calculate", structuralFingerprint: fingerprint, cyclomatic: 12, cognitive: 16 }],
};
const context = { testFiles: new Set(["tests/complexity-governance.test.ts"]), today: "2026-01-01" };
const emptyExceptions = { schemaVersion: 2, exceptions: [] };

function finding(
	functionId: string,
	cyclomatic: number,
	cognitive: number,
	structuralFingerprint: string = fingerprint,
) {
	return { functionId, structuralFingerprint, cyclomatic, cognitive };
}

function exception(functionId: string = "src/new.ts#function:newWork") {
	return {
		functionId,
		owner: "platform-team",
		reviewer: "maintainer-one",
		measured: { cyclomatic: 13, cognitive: 17 },
		ceilings: { cyclomatic: 13, cognitive: 17 },
		rationale: "The transactional branches share state and cannot be split safely this release.",
		proportionality: "The ceiling is exactly the measured value and applies only to this named function.",
		tests: ["tests/complexity-governance.test.ts"],
		testCommand: "npx tsx --conditions=react-server --test tests/complexity-governance.test.ts",
		expiresOn: "2027-01-01",
		reviewTrigger: "Review whenever the transactional branch structure changes.",
		removalTrigger: "Remove after extracting the transaction decision helper.",
	};
}

test("thresholds are fixed to core cyclomatic 10 and SonarJS cognitive 15", () => {
	assert.doesNotThrow(() => validateComplexityPolicy(baseline, emptyExceptions, context));
	assert.throws(() => validateComplexityPolicy({ ...baseline, thresholds: { cyclomatic: 9, cognitive: 15 } }, emptyExceptions, context), /threshold cyclomatic/);
});

test("baseline permits unchanged or decreased inherited debt but rejects either metric increase", () => {
	assert.equal(auditComplexity(baseline.findings, baseline, emptyExceptions, context).status, "pass");
	assert.equal(auditComplexity([finding("src/example.ts#function:calculate", 11, 15)], baseline, emptyExceptions, context).status, "pass");
	assert.equal(auditComplexity([finding("src/example.ts#function:calculate", 13, 16)], baseline, emptyExceptions, context).current[0].status, "regressed");
	assert.equal(auditComplexity([finding("src/example.ts#function:calculate", 12, 17)], baseline, emptyExceptions, context).current[0].status, "regressed");
});

test("a structural change at equal metrics requires approval while decreased debt still passes", () => {
	assert.equal(auditComplexity([finding("src/example.ts#function:calculate", 12, 16, "sha256:changed")], baseline, emptyExceptions, context).current[0].status, "regressed");
	assert.equal(auditComplexity([finding("src/example.ts#function:calculate", 11, 15, "sha256:changed")], baseline, emptyExceptions, context).current[0].status, "baseline");
});

test("new over-threshold functions fail separately for cyclomatic and cognitive metrics", () => {
	assert.equal(auditComplexity([finding("src/new.ts#function:core", 11, 0)], baseline, emptyExceptions, context).status, "fail");
	assert.equal(auditComplexity([finding("src/new.ts#function:cognitive", 0, 16)], baseline, emptyExceptions, context).status, "fail");
});

test("a valid bounded exception approves only its exact new function and measured values", () => {
	const approved = exception();
	const exceptions = { schemaVersion: 2, exceptions: [approved] };
	assert.equal(auditComplexity([finding(approved.functionId, 13, 17)], baseline, exceptions, context).current[0].status, "exception");
	assert.throws(() => auditComplexity([finding("src/new.ts#function:replacement", 13, 17)], baseline, exceptions, context), /stale or unknown/);
	assert.throws(() => auditComplexity([finding(approved.functionId, 14, 17)], baseline, exceptions, context), /does not match/);
});

test("a regressed baseline function can use an exact current bounded exception but an unchanged mirror fails", () => {
	const approved = exception("src/example.ts#function:calculate");
	const exceptions = { schemaVersion: 2, exceptions: [approved] };
	assert.equal(auditComplexity([finding(approved.functionId, 13, 17)], baseline, exceptions, context).current[0].status, "exception");
	assert.throws(() => auditComplexity([finding(approved.functionId, 12, 16)], baseline, { schemaVersion: 2, exceptions: [{ ...approved, measured: { cyclomatic: 12, cognitive: 16 }, ceilings: { cyclomatic: 12, cognitive: 16 } }] }, context), /mirrors unchanged baseline debt/);
});

test("exception policy rejects duplicate, stale, expired, unbounded, understated, and non-canonical evidence", () => {
	const approved = exception();
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [approved, approved] }, context), /duplicate/);
	assert.throws(() => auditComplexity(baseline.findings, baseline, { schemaVersion: 2, exceptions: [approved] }, context), /stale or unknown/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, expiresOn: "2025-12-31" }] }, context), /future expiry/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, expiresOn: "2027-02-30" }] }, context), /future expiry/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, ceilings: { cyclomatic: Infinity, cognitive: 17 } }] }, context), /finite/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, ceilings: { cyclomatic: 12, cognitive: 17 } }] }, context), /understated/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, tests: ["tests/missing.test.ts"] }] }, context), /missing test/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, testCommand: "echo tests/complexity-governance.test.ts" }] }, context), /canonical/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, testCommand: "npx tsx --conditions=react-server --test tests/complexity-governance.test.ts && echo done" }] }, context), /canonical/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, tests: ["tests/complexity-governance.test.ts", "tests/complexity-governance.test.ts"] }] }, context), /unique/);
	assert.throws(() => validateComplexityPolicy(baseline, { schemaVersion: 2, exceptions: [{ ...approved, tests: ["tests/z.test.ts", "tests/complexity-governance.test.ts"] }] }, { ...context, testFiles: new Set(["tests/z.test.ts", "tests/complexity-governance.test.ts"]) }), /sorted/);
});

test("scope covers production source, scripts, Prisma, and executable root configs without tests or artifacts", () => {
	for (const path of ["src/lib/catalog.ts", "scripts/audit-complexity.mjs", "prisma/seed.ts", "eslint.config.mjs", "next.config.ts"]) assert.equal(isAnalyzedPath(path), true, path);
	for (const path of ["tests/complexity-governance.test.ts", ".next/cache/file.js", "src/generated/client.ts", "node_modules/pkg/index.js", "artifacts/report.ts"]) assert.equal(isAnalyzedPath(path), false, path);
});

test("reports are deterministic machine-readable per-function audit records", () => {
	const current = [
		finding("src/z.ts#function:z", 0, 16),
		finding("src/a.ts#function:a", 11, 0),
	];
	const first = auditComplexity(current, { ...baseline, findings: [] }, emptyExceptions, context);
	const second = auditComplexity([...current].reverse(), { ...baseline, findings: [] }, emptyExceptions, context);
	assert.equal(formatComplexityReport(first), formatComplexityReport(second));
	assert.equal(machineComplexityReport(first), machineComplexityReport(second));
	assert.match(formatComplexityReport(first), /src\/a.ts#function:a cyclomatic=11 cognitive=0 status=new/);
	assert.match(formatComplexityReport(first), /Over-threshold: cyclomatic=1 cognitive=1/);
});

