import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { writeCoverageAuditJson } from "../scripts/audit-coverage";
import {
	buildCoverageAuditReport,
	parseCoverageAuditCandidatesJson,
	parseCoverageAuditCliOptions,
} from "../scripts/pipeline/coverage-audit";

const generatedAt = new Date("2026-06-14T12:00:00.000Z");
const windowStart = "2026-06-01T00:00:00.000Z";
const windowEnd = "2026-06-14T00:00:00.000Z";

function requiredCliArgs(...extraArgs: string[]) {
	return [
		"node",
		"script",
		"--input=fixtures/candidates.json",
		`--window-start=${windowStart}`,
		`--window-end=${windowEnd}`,
		"--generated-at=2026-06-14T12:00:00.000Z",
		...extraArgs,
	];
}

describe("coverage audit by source and surface", () => {
	it("builds a deterministic bounded read-only artifact with denominator counts by source/surface", () => {
		const inputRaw = JSON.stringify({ candidates: [
			{ source: "Vea", surface: "search", ean: "779111" },
			{ source: "Vea", surface: "category", ean: "779222" },
		] });
		const report = buildCoverageAuditReport({
			candidates: parseCoverageAuditCandidatesJson(inputRaw),
			requestBudget: 5,
			sourceBudget: 5,
			generatedAt,
			windowStart,
			windowEnd,
			inputPath: "fixtures/coverage-candidates.json",
			inputRaw,
			outputPath: "audit/coverage-audit-issue-243.json",
		});

		assert.equal(report.audit, "coverage-audit-by-source-surface");
		assert.equal(report.bounded, true);
		assert.equal(report.exhaustive, false);
		assert.equal(report.readOnly, true);
		assert.equal(report.generatedAt, "2026-06-14T12:00:00.000Z");
		assert.deepEqual(report.counts, {
			candidateRows: 2,
			denominatorCandidates: 2,
			duplicateRows: 0,
			overlapIdentities: 0,
			ambiguousRows: 0,
			errorRows: 0,
		});
		assert.deepEqual(report.bySourceSurface.map(({ source, surface, denominatorCandidates }) => ({ source, surface, denominatorCandidates })), [
			{ source: "vea", surface: "category", denominatorCandidates: 1 },
			{ source: "vea", surface: "search", denominatorCandidates: 1 },
		]);
		assert.match(report.lineage.inputSha256, /^sha256:[a-f0-9]{64}$/);
		assert.match(report.lineage.writeBoundary, /no DB writes/);
		assert.equal(report.posture.productionWrites, false);
		assert.equal(report.posture.dbWrites, false);
		assert.equal(report.posture.artifactWrites, "bounded-audit-output-only");
		assert.equal(report.confidence.status, "PASS");
	});

	it("requires explicit generatedAt and keeps report creation deterministic", () => {
		assert.throws(
			() => parseCoverageAuditCliOptions(requiredCliArgs().filter((arg) => !arg.startsWith("--generated-at="))),
			/requires --generated-at=<ISO>/,
		);

		const inputRaw = JSON.stringify([{ source: "vea", surface: "search", ean: "779111" }]);
		const baseReportOptions = {
			candidates: parseCoverageAuditCandidatesJson(inputRaw),
			requestBudget: 5,
			sourceBudget: 5,
			generatedAt,
			windowStart,
			windowEnd,
			inputPath: "fixtures/coverage-candidates.json",
			inputRaw,
			outputPath: "audit/coverage-audit-issue-243.json",
		};

		assert.deepEqual(
			buildCoverageAuditReport(baseReportOptions),
			buildCoverageAuditReport(baseReportOptions),
		);
	});

	it("detects duplicate rows and overlapping identities across surfaces", () => {
		const inputRaw = JSON.stringify([
			{ source: "vea", surface: "search", ean: "779111" },
			{ source: "vea", surface: "search", ean: "779111" },
			{ source: "vea", surface: "category", ean: "779111" },
		]);
		const report = buildCoverageAuditReport({
			candidates: parseCoverageAuditCandidatesJson(inputRaw),
			requestBudget: 5,
			sourceBudget: 5,
			generatedAt,
			windowStart,
			windowEnd,
			inputPath: "input.json",
			inputRaw,
			outputPath: "audit/out.json",
		});

		assert.equal(report.counts.denominatorCandidates, 2);
		assert.equal(report.counts.duplicateRows, 1);
		assert.equal(report.counts.overlapIdentities, 1);
		assert.deepEqual(report.duplicates, [{ source: "vea", surface: "search", identity: "ean:779111", rows: 2 }]);
		assert.deepEqual(report.overlaps, [{ source: "vea", identity: "ean:779111", surfaces: ["category", "search"] }]);
	});

	it("handles identity values containing colons without split-based decoding", () => {
		const inputRaw = JSON.stringify([
			{ source: "vea:source", surface: "search:surface", url: "https://example.test/p:1" },
			{ source: "vea:source", surface: "search:surface", url: "https://example.test/p:1" },
			{ source: "vea:source", surface: "category:surface", url: "https://example.test/p:1" },
		]);
		const report = buildCoverageAuditReport({
			candidates: parseCoverageAuditCandidatesJson(inputRaw),
			requestBudget: 5,
			sourceBudget: 5,
			generatedAt,
			windowStart,
			windowEnd,
			inputPath: "input.json",
			inputRaw,
			outputPath: "audit/out.json",
		});

		assert.deepEqual(report.duplicates, [{ source: "vea:source", surface: "search:surface", identity: "url:https://example.test/p:1", rows: 2 }]);
		assert.deepEqual(report.overlaps, [{ source: "vea:source", identity: "url:https://example.test/p:1", surfaces: ["category:surface", "search:surface"] }]);
	});

	it("fails closed for ambiguous identities and invalid candidate rows", () => {
		const inputRaw = JSON.stringify([
			{ source: "vea", surface: "search" },
			{ source: "vea", ean: "779222" },
		]);
		const report = buildCoverageAuditReport({
			candidates: parseCoverageAuditCandidatesJson(inputRaw),
			requestBudget: 5,
			sourceBudget: 5,
			generatedAt,
			windowStart,
			windowEnd,
			inputPath: "input.json",
			inputRaw,
			outputPath: "audit/out.json",
		});

		assert.equal(report.confidence.status, "FAIL");
		assert.equal(report.counts.ambiguousRows, 1);
		assert.equal(report.counts.errorRows, 1);
		assert.match(report.confidence.reasons.join("\n"), /ambiguous identities require fail-closed review/);
		assert.match(report.confidence.reasons.join("\n"), /invalid candidate rows require fail-closed review/);
	});

	it("records budget stop conditions as confidence reasons", () => {
		const inputRaw = JSON.stringify([
			{ source: "vea", surface: "search", ean: "1" },
			{ source: "vea", surface: "search", ean: "2" },
		]);
		const report = buildCoverageAuditReport({
			candidates: parseCoverageAuditCandidatesJson(inputRaw),
			requestBudget: 1,
			sourceBudget: 1,
			generatedAt,
			windowStart,
			windowEnd,
			inputPath: "input.json",
			inputRaw,
			outputPath: "audit/out.json",
		});

		assert.equal(report.budgets.request.status, "FAIL");
		assert.equal(report.budgets.source.status, "FAIL");
		assert.equal(report.budgets.stopCondition.triggered, true);
		assert.match(report.confidence.reasons.join("\n"), /request budget exceeded/);
		assert.match(report.confidence.reasons.join("\n"), /source budget exceeded for vea/);
	});

	it("parses CLI input/output and rejects broad or write-oriented flags", () => {
		const options = parseCoverageAuditCliOptions(requiredCliArgs(
			"--output=audit/coverage.json",
			"--request-budget=10",
			"--source-budget=5",
			"--issue-number=243",
		));

		assert.deepEqual(options, {
			input: "fixtures/candidates.json",
			output: "audit/coverage.json",
			requestBudget: 10,
			sourceBudget: 5,
			issue: 243,
			windowStart: "2026-06-01T00:00:00.000Z",
			windowEnd: "2026-06-14T00:00:00.000Z",
			generatedAt: "2026-06-14T12:00:00.000Z",
		});
		for (const flag of ["--apply", "--write", "--scheduler", "--all-source", "--deploy", "--migrations", "--purge-cache", "--production"]) {
			assert.throws(
				() => parseCoverageAuditCliOptions(requiredCliArgs(flag)),
				new RegExp(`rejects ${flag}`),
			);
		}
	});

	it("rejects unsafe output paths and invalid audit windows", () => {
		for (const output of ["coverage.json", "audit/../coverage.json", "../audit/coverage.json", "/tmp/coverage.json", "audit/coverage.txt", "audit"]) {
			assert.throws(
				() => parseCoverageAuditCliOptions(requiredCliArgs(`--output=${output}`)),
				/output/,
			);
		}

		assert.throws(
			() => parseCoverageAuditCliOptions([
				"node",
				"script",
				"--input=fixtures/candidates.json",
				"--window-start=not-a-date",
				`--window-end=${windowEnd}`,
				"--generated-at=2026-06-14T12:00:00.000Z",
			]),
			/valid ISO timestamp/,
		);
		assert.throws(
			() => parseCoverageAuditCliOptions([
				"node",
				"script",
				"--input=fixtures/candidates.json",
				"--window-start=2026-06-15T00:00:00.000Z",
				`--window-end=${windowEnd}`,
				"--generated-at=2026-06-14T12:00:00.000Z",
			]),
			/--window-start <= --window-end/,
		);
	});

	it("writes the issue-scoped artifact and wires a read-only package script", async () => {
		await mkdir("audit", { recursive: true });
		const dir = await mkdtemp(join("audit", "coverage-audit-test-"));
		try {
			const output = join(dir, "coverage.json");
			const report = buildCoverageAuditReport({
				candidates: [{ source: "vea", surface: "search", ean: "779111" }],
				requestBudget: 1,
				sourceBudget: 1,
				generatedAt,
				windowStart,
				windowEnd,
				inputPath: "input.json",
				inputRaw: "[]",
				outputPath: output,
			});
			await writeCoverageAuditJson(output, report);
			const written = await readFile(output, "utf8");
			assert.equal(written, `${JSON.stringify(report, null, 2)}\n`);
			assert.doesNotMatch(written, /"noWrites"\s*:\s*true/);
			assert.match(written, /"artifactWrites"\s*:\s*"bounded-audit-output-only"/);

			const fixture = join(dir, "input.json");
			await writeFile(fixture, JSON.stringify({ candidates: [{ source: "vea", surface: "search", ean: "779111" }] }), "utf8");
			assert.deepEqual(parseCoverageAuditCandidatesJson(await readFile(fixture, "utf8"))[0], {
				source: "vea",
				surface: "search",
				ean: "779111",
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}

		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		const cliScript = readFileSync("scripts/audit-coverage.ts", "utf8");
		assert.equal(packageJson.scripts["audit:coverage"], "tsx scripts/audit-coverage.ts");
		assert.doesNotMatch(cliScript, /db\./);
		assert.doesNotMatch(cliScript, /stageSourceProducts/);
		assert.match(cliScript, /buildCoverageAuditReport/);
	});
});
