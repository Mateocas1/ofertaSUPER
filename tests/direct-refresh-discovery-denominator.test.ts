import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { writeDirectRefreshDiscoveryDenominatorJson } from "../scripts/audit-direct-refresh-discovery-denominator";
import {
	buildDirectRefreshDiscoveryDenominatorReport,
	parseDirectRefreshDiscoveryDenominatorCliOptions,
	type DirectRefreshDiscoveryDenominatorCandidate,
} from "../scripts/pipeline/direct-refresh-discovery-denominator";

const now = new Date("2026-06-12T12:00:00.000Z");
const hash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function candidate(
	ean: string,
	overrides: Partial<DirectRefreshDiscoveryDenominatorCandidate> = {},
): DirectRefreshDiscoveryDenominatorCandidate {
	return {
		ean,
		source: "vea",
		skuId: `sku-${ean}`,
		lineage: {
			source: "vea",
			fetchedAt: "2026-06-12T11:59:00.000Z",
			artifactSha256: hash,
		},
		...overrides,
	};
}

describe("direct-refresh discovery denominator audit", () => {
	it("passes for a supported source with denominator, numerator, exclusions, budgets, and no-write posture", () => {
		const report = buildDirectRefreshDiscoveryDenominatorReport({
			sources: ["vea"],
			candidates: [
				candidate("111"),
				candidate("222"),
				candidate("333", {
					excluded: true,
					exclusionReason: "already covered by previous denominator sample",
				}),
			],
			numerator: [{ source: "vea", ean: "111" }],
			requestBudget: 5,
			sourceBudget: 5,
			issue: 221,
			now,
		});

		assert.equal(report.schemaVersion, 1);
		assert.equal(report.audit, "direct-refresh-discovery-denominator-audit");
		assert.equal(report.status, "PASS");
		assert.equal(report.issue, 221);
		assert.deepEqual(report.sources, ["vea"]);
		assert.match(report.denominatorFormula, /distinct source\+EAN/);
		assert.deepEqual(report.counts, {
			candidateRows: 3,
			denominatorCandidates: 2,
			numeratorCandidates: 1,
			excludedCandidates: 1,
		});
		assert.equal(report.exclusions[0].ean, "333");
		assert.deepEqual(report.failClosedReasons, []);
		assert.equal(report.budgets.request.status, "PASS");
		assert.equal(report.budgets.source.status, "PASS");
		assert.equal(report.posture.readOnly, true);
		assert.equal(report.posture.noWrites, true);
		assert.match(report.posture.writeBoundary, /no DB writes/);
	});

	it("fails closed for unsupported sources", () => {
		const report = buildDirectRefreshDiscoveryDenominatorReport({
			sources: ["dia"],
			candidates: [candidate("111", { source: "dia", lineage: { source: "dia", fetchedAt: "2026-06-12T11:59:00.000Z", artifactSha256: hash } })],
			requestBudget: 5,
			sourceBudget: 5,
			now,
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.failClosedReasons.join("\n"), /unsupported source: dia/);
	});

	it("fails closed for budget overflow and missing lineage", () => {
		const report = buildDirectRefreshDiscoveryDenominatorReport({
			sources: ["vea"],
			candidates: [candidate("111"), candidate("222", { lineage: undefined })],
			requestBudget: 1,
			sourceBudget: 1,
			now,
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.failClosedReasons.join("\n"), /request budget exceeded/);
		assert.match(report.failClosedReasons.join("\n"), /source budget exceeded for vea/);
		assert.match(report.failClosedReasons.join("\n"), /candidate vea:222 is missing lineage/);
	});

	it("rejects dangerous write and broad-operation flags while parsing read-only options", () => {
		const options = parseDirectRefreshDiscoveryDenominatorCliOptions([
			"node",
			"script",
			"--sources=vea,disco",
			"--candidates=audit/candidates.json",
			"--numerator=audit/numerator.json",
			"--request-budget=10",
			"--source-budget=5",
			"--issue-number=221",
			"--output=audit/denominator.json",
		]);

		assert.deepEqual(options, {
			sources: ["disco", "vea"],
			candidates: "audit/candidates.json",
			numerator: "audit/numerator.json",
			requestBudget: 10,
			sourceBudget: 5,
			issue: 221,
			output: "audit/denominator.json",
		});
		for (const flag of [
			"--apply",
			"--write",
			"--confirm",
			"--execute",
			"--delete",
			"--scheduler",
			"--all-source",
			"--all-sources",
			"--deploy",
			"--migrations",
			"--purge-cache",
		]) {
			assert.throws(
				() =>
					parseDirectRefreshDiscoveryDenominatorCliOptions([
						"node",
						"script",
						"--source=vea",
						"--candidates=audit/candidates.json",
						flag,
					]),
				new RegExp(`rejects ${flag}`),
			);
		}
	});

	it("writes deterministic JSON to an output artifact and JSON to stdout when omitted", async () => {
		const report = buildDirectRefreshDiscoveryDenominatorReport({
			sources: ["vea"],
			candidates: [candidate("111")],
			numerator: [{ source: "vea", ean: "111" }],
			requestBudget: 1,
			sourceBudget: 1,
			now,
		});
		const dir = await mkdtemp(join(tmpdir(), "denominator-audit-"));
		try {
			const output = join(dir, "report.json");
			await writeDirectRefreshDiscoveryDenominatorJson(output, report);
			assert.equal(await readFile(output, "utf8"), `${JSON.stringify(report, null, 2)}\n`);

			let stdout = "";
			const originalWrite = process.stdout.write.bind(process.stdout);
			process.stdout.write = ((chunk: string | Uint8Array) => {
				stdout += chunk.toString();
				return true;
			}) as typeof process.stdout.write;
			try {
				await writeDirectRefreshDiscoveryDenominatorJson(null, report);
			} finally {
				process.stdout.write = originalWrite;
			}
			assert.equal(stdout, `${JSON.stringify(report, null, 2)}\n`);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("wires the package script to the read-only denominator audit CLI without writer calls", () => {
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		const cliScript = readFileSync(
			"scripts/audit-direct-refresh-discovery-denominator.ts",
			"utf8",
		);

		assert.equal(
			packageJson.scripts["audit:direct-refresh-discovery-denominator"],
			"tsx scripts/audit-direct-refresh-discovery-denominator.ts",
		);
		assert.doesNotMatch(cliScript, /db\./);
		assert.doesNotMatch(cliScript, /stageSourceProducts/);
		assert.match(cliScript, /buildDirectRefreshDiscoveryDenominatorReport/);
	});
});
