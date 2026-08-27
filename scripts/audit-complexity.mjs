import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { ESLint } from "eslint";

import { functionSymbols, offsetForLocation, symbolAtLocation } from "./complexity/symbols.mjs";

export const THRESHOLDS = Object.freeze({ cyclomatic: 10, cognitive: 15 });
export const BASELINE_PATH = "config/complexity-baseline.json";
export const EXCEPTIONS_PATH = "config/complexity-exceptions.json";
export const ANALYSIS_TARGETS = Object.freeze([
	"src/**/*.{js,jsx,ts,tsx}",
	"scripts/**/*.{js,mjs,ts}",
	"prisma/**/*.ts",
	"*.config.{js,mjs,ts}",
	"next.config.ts",
]);

const RULES = Object.freeze({ cyclomatic: "complexity", cognitive: "sonarjs/cognitive-complexity" });
const METRICS = Object.freeze(Object.keys(RULES));
const CLI_ARGS = process.argv.slice(2);

function assertPolicy(condition, message) {
	if (!condition) throw new Error(`Invalid complexity policy: ${message}`);
}

function numeric(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function metricValues(value, label) {
	assertPolicy(value && typeof value === "object", `${label} must be an object`);
	for (const metric of METRICS) assertPolicy(numeric(value[metric]), `${label}.${metric} must be a finite non-negative number`);
}

function isFinding(value) {
	return value && typeof value === "object" && typeof value.functionId === "string" && value.functionId.length > 0
		&& typeof value.structuralFingerprint === "string" && value.structuralFingerprint.length > 0
		&& METRICS.every((metric) => numeric(value[metric]));
}

function compareFindings(left, right) {
	return left.functionId.localeCompare(right.functionId);
}

function isOverThreshold(finding) {
	return METRICS.some((metric) => finding[metric] > THRESHOLDS[metric]);
}

function increased(current, baseline) {
	return METRICS.some((metric) => current[metric] > baseline[metric]);
}

function decreased(current, baseline) {
	return METRICS.some((metric) => current[metric] < baseline[metric]);
}

function requiresApproval(current, baseline) {
	return increased(current, baseline)
		|| (current.structuralFingerprint !== baseline.structuralFingerprint && !decreased(current, baseline));
}

function policyContext(context) {
	return { testFiles: context?.testFiles instanceof Set ? context.testFiles : null, today: context?.today ?? new Date().toISOString().slice(0, 10) };
}

function validateSubstantiveFields(exception) {
	for (const field of ["owner", "reviewer", "rationale", "proportionality", "reviewTrigger", "removalTrigger"]) {
		assertPolicy(typeof exception[field] === "string" && exception[field].trim().length >= 12, `exception ${exception.functionId} requires substantive ${field}`);
	}
}

function validateExceptionBounds(exception) {
	metricValues(exception.measured, `exception ${exception.functionId}.measured`);
	metricValues(exception.ceilings, `exception ${exception.functionId}.ceilings`);
	for (const metric of METRICS) assertPolicy(exception.ceilings[metric] >= exception.measured[metric], `exception ${exception.functionId} has an understated ${metric} ceiling`);
}

function canonicalTestCommand(testPaths) {
	return `npx tsx --conditions=react-server --test ${testPaths.join(" ")}`;
}

function validateTestEvidence(exception, context) {
	assertPolicy(context.testFiles, "test file inventory is required to validate exception evidence");
	assertPolicy(Array.isArray(exception.tests) && exception.tests.length > 0 && exception.tests.every((path) => typeof path === "string" && /^tests\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.test\.ts$/.test(path)), `exception ${exception.functionId} requires linked test file(s) under tests/`);
	assertPolicy(new Set(exception.tests).size === exception.tests.length, `exception ${exception.functionId} test paths must be unique`);
	assertPolicy(exception.tests.every((path, index) => index === 0 || exception.tests[index - 1].localeCompare(path) < 0), `exception ${exception.functionId} test paths must be sorted`);
	for (const path of exception.tests) assertPolicy(context.testFiles.has(path), `exception ${exception.functionId} references missing test ${path}`);
	assertPolicy(exception.testCommand === canonicalTestCommand(exception.tests), `exception ${exception.functionId} test command must equal the canonical shell-free test command`);
}

function isFutureDate(value, today) {
	const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
	return parsed && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value > today;
}

function validateException(exception, context) {
	assertPolicy(exception && typeof exception === "object", "exception must be an object");
	assertPolicy(typeof exception.functionId === "string" && exception.functionId.length > 0, "exception requires exact functionId");
	validateSubstantiveFields(exception);
	validateExceptionBounds(exception);
	assertPolicy(typeof exception.testCommand === "string" && exception.testCommand.trim().length > 0, `exception ${exception.functionId} requires a runnable test command`);
	validateTestEvidence(exception, context);
	assertPolicy(isFutureDate(exception.expiresOn, context.today), `exception ${exception.functionId} requires a future expiry/review date`);
}

export function validateComplexityPolicy(baseline, exceptions, context) {
	const policy = policyContext(context);
	assertPolicy(baseline?.schemaVersion === 3, "baseline schemaVersion must be 3");
	metricValues(baseline.thresholds, "baseline.thresholds");
	for (const metric of METRICS) assertPolicy(baseline.thresholds[metric] === THRESHOLDS[metric], `baseline threshold ${metric} must be ${THRESHOLDS[metric]}`);
	assertPolicy(Array.isArray(baseline.findings), "baseline findings must be an array");
	assertPolicy(exceptions?.schemaVersion === 2 && Array.isArray(exceptions.exceptions), "exceptions schemaVersion must be 2 with an exceptions array");

	const baselineIds = new Set();
	for (const finding of baseline.findings) {
		assertPolicy(isFinding(finding) && isOverThreshold(finding), "baseline finding must identify an over-threshold function, structural fingerprint, and numeric metrics");
		assertPolicy(!baselineIds.has(finding.functionId), `duplicate baseline finding ${finding.functionId}`);
		baselineIds.add(finding.functionId);
	}
	const exceptionIds = new Set();
	for (const exception of exceptions.exceptions) {
		validateException(exception, policy);
		assertPolicy(!exceptionIds.has(exception.functionId), `duplicate exception ${exception.functionId}`);
		exceptionIds.add(exception.functionId);
	}
}

function exceptionMatches(exception, finding) {
	return METRICS.every((metric) => exception.measured[metric] === finding[metric] && exception.ceilings[metric] >= finding[metric]);
}

export function auditComplexity(currentFindings, baseline, exceptions, context) {
	validateComplexityPolicy(baseline, exceptions, context);
	const current = [...currentFindings].sort(compareFindings);
	const currentIds = new Set();
	for (const finding of current) {
		assertPolicy(isFinding(finding) && isOverThreshold(finding), "analyzer finding must identify an over-threshold function with numeric metrics");
		assertPolicy(!currentIds.has(finding.functionId), `duplicate analyzer finding ${finding.functionId}`);
		currentIds.add(finding.functionId);
	}
	const baselineById = new Map(baseline.findings.map((finding) => [finding.functionId, finding]));
	const exceptionById = new Map(exceptions.exceptions.map((exception) => [exception.functionId, exception]));
	const rows = current.map((finding) => {
		const inherited = baselineById.get(finding.functionId);
		const exception = exceptionById.get(finding.functionId);
		if (inherited && !requiresApproval(finding, inherited)) {
			if (exception) assertPolicy(false, `exception ${exception.functionId} mirrors unchanged baseline debt`);
			return { ...finding, status: "baseline" };
		}
		if (exception && exceptionMatches(exception, finding)) return { ...finding, status: "exception" };
		return { ...finding, status: inherited ? "regressed" : "new" };
	});
	for (const exception of exceptions.exceptions) {
		const row = rows.find((candidate) => candidate.functionId === exception.functionId);
		assertPolicy(row, `exception ${exception.functionId} is stale or unknown`);
		assertPolicy(row.status === "exception", `exception ${exception.functionId} does not match the current measured values`);
	}
	const resolvedFindings = baseline.findings.filter((finding) => !currentIds.has(finding.functionId)).sort(compareFindings);
	const unapprovedFindings = rows.filter((row) => row.status === "new" || row.status === "regressed");
	const statusCounts = Object.fromEntries(["baseline", "exception", "new", "regressed"].map((status) => [status, rows.filter((row) => row.status === status).length]));
	const metricCounts = Object.fromEntries(METRICS.map((metric) => [metric, rows.filter((row) => row[metric] > THRESHOLDS[metric]).length]));
	return { status: unapprovedFindings.length === 0 ? "pass" : "fail", current: rows, resolvedFindings, unapprovedFindings, statusCounts, metricCounts };
}

export function formatComplexityReport(report) {
	const lines = [
		`Complexity governance: ${report.status.toUpperCase()}`,
		`Over-threshold: cyclomatic=${report.metricCounts.cyclomatic} cognitive=${report.metricCounts.cognitive}`,
		`Statuses: baseline=${report.statusCounts.baseline} exception=${report.statusCounts.exception} new=${report.statusCounts.new} regressed=${report.statusCounts.regressed} resolved=${report.resolvedFindings.length}`,
	];
	for (const finding of report.current) lines.push(`${finding.functionId} cyclomatic=${finding.cyclomatic} cognitive=${finding.cognitive} status=${finding.status}`);
	return lines.join("\n");
}

export function machineComplexityReport(report) {
	return JSON.stringify({ ...report, current: [...report.current].sort(compareFindings), resolvedFindings: [...report.resolvedFindings].sort(compareFindings) });
}

export function isAnalyzedPath(filePath) {
	return /^(src\/.*\.(?:js|jsx|ts|tsx)|scripts\/.*\.(?:js|mjs|ts)|prisma\/.*\.ts|[^/]+\.config\.(?:js|mjs|ts)|next\.config\.ts)$/.test(filePath)
		&& !/(^|\/)(tests?|__tests__|generated|artifacts?)(\/|$)/.test(filePath);
}

function metricFromMessage(message) {
	if (message.ruleId === RULES.cyclomatic) return ["cyclomatic", Number(message.message.match(/complexity of (\d+)/i)?.[1])];
	if (message.ruleId === RULES.cognitive) return ["cognitive", Number(message.message.match(/Complexity from (\d+)/i)?.[1])];
	return null;
}

function recordMetric(findings, symbols, source, filePath, message) {
	const metric = metricFromMessage(message);
	if (!metric || !Number.isFinite(metric[1])) return;
	const symbol = symbolAtLocation(symbols, offsetForLocation(source, message.line, message.column));
	// Core complexity also reports class-field initializers at threshold zero; they are not functions and cannot become over-threshold function debt.
	if (!symbol && metric[1] <= THRESHOLDS[metric[0]]) return;
	assertPolicy(symbol, `could not map ${metric[0]} report at ${filePath}:${message.line}:${message.column} to a function symbol`);
	const finding = findings.get(symbol.functionId) ?? { functionId: symbol.functionId, structuralFingerprint: symbol.structuralFingerprint, cyclomatic: 0, cognitive: 0 };
	finding[metric[0]] = metric[1];
	findings.set(symbol.functionId, finding);
}

async function collectResultFindings(root, result, findings) {
	const filePath = relative(root, result.filePath).split(sep).join("/");
	if (!isAnalyzedPath(filePath)) return;
	const source = result.source ?? await readFile(result.filePath, "utf8");
	const symbols = functionSymbols(source, filePath);
	for (const message of result.messages) recordMetric(findings, symbols, source, filePath, message);
}

/** Runs ESLint's standard rules at zero only to obtain both numeric values, then applies the policy defaults. */
export async function analyzeComplexity(root = process.cwd()) {
	const eslint = new ESLint({
		cwd: root,
		overrideConfig: { rules: { complexity: ["warn", 0], "sonarjs/cognitive-complexity": ["warn", 0] } },
	});
	const findings = new Map();
	for (const result of await eslint.lintFiles(ANALYSIS_TARGETS)) await collectResultFindings(root, result, findings);
	return [...findings.values()].filter(isOverThreshold).sort(compareFindings);
}

async function existingTestFiles(root) {
	const testsRoot = resolve(root, "tests");
	const names = await readdir(testsRoot, { recursive: true });
	return new Set(names.filter((name) => typeof name === "string" && name.endsWith(".test.ts")).map((name) => `tests/${name.split(sep).join("/")}`));
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
	const root = process.cwd();
	const current = await analyzeComplexity(root);
	if (CLI_ARGS.includes("--write-baseline")) {
		const baseline = { schemaVersion: 3, thresholds: THRESHOLDS, findings: current };
		await writeFile(resolve(root, BASELINE_PATH), `${JSON.stringify(baseline)}\n`, "utf8");
		process.stdout.write(`Wrote complexity baseline with ${current.length} over-threshold functions to ${BASELINE_PATH}\n`);
		return;
	}
	const [baseline, exceptions, testFiles] = await Promise.all([
		readJson(resolve(root, BASELINE_PATH)),
		readJson(resolve(root, EXCEPTIONS_PATH)),
		existingTestFiles(root),
	]);
	const report = auditComplexity(current, baseline, exceptions, { testFiles });
	process.stdout.write(`${CLI_ARGS.includes("--json") ? machineComplexityReport(report) : formatComplexityReport(report)}\n`);
	if (report.status === "fail") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
