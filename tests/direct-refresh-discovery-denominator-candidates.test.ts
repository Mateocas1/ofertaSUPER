import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { writeDirectRefreshDiscoveryDenominatorCandidateJson } from "../scripts/audit-direct-refresh-discovery-denominator-candidates";
import {
	buildDirectRefreshDiscoveryDenominatorCandidateSnapshot,
	defaultDirectRefreshDiscoveryDenominatorCandidateOutputPath,
	parseDirectRefreshDiscoveryDenominatorCandidateCliOptions,
} from "../scripts/pipeline/direct-refresh-discovery-denominator-candidates";
import { parseDirectRefreshDiscoveryDenominatorCandidatesJson } from "../scripts/pipeline/direct-refresh-discovery-denominator";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const fetchedAt = new Date("2026-06-12T12:00:00.000Z");

function product(
	ean: string,
	overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
	return {
		ean,
		name: `Product ${ean}`,
		brand: "Vea",
		description: null,
		imageUrl: null,
		images: [],
		category: null,
		skuId: `sku-${ean}`,
		sellerId: null,
		productUrl: null,
		price: 1,
		listPrice: 1,
		referencePrice: null,
		referenceUnit: null,
		isAvailable: true,
		...overrides,
	};
}

describe("direct-refresh discovery denominator candidate generator", () => {
	it("builds a bounded Vea-first candidate snapshot compatible with denominator audit parsing", () => {
		const snapshot = buildDirectRefreshDiscoveryDenominatorCandidateSnapshot({
			products: [product("111"), product("222")],
			fetchedAt,
			requestBudget: 5,
			sourceBudget: 5,
			artifactRaw: "fixture-artifact",
		});

		assert.equal(snapshot.schemaVersion, 1);
		assert.equal(snapshot.artifact, "direct-refresh-discovery-denominator-candidates");
		assert.deepEqual(snapshot.sources, ["vea"]);
		assert.equal(snapshot.coverage.mode, "bounded");
		assert.equal(snapshot.coverage.exhaustive, false);
		assert.deepEqual(snapshot.counts, {
			fetchedRows: 2,
			candidateRows: 2,
			excludedRows: 0,
			duplicateRows: 0,
		});
		assert.deepEqual(snapshot.failClosedReasons, []);
		assert.equal(snapshot.posture.readOnly, true);
		assert.equal(snapshot.posture.noWrites, true);
		assert.match(snapshot.posture.writeBoundary, /no DB writes/);
		assert.match(snapshot.candidates[0].lineage?.artifactSha256 ?? "", /^sha256:[a-f0-9]{64}$/);

		const parsed = parseDirectRefreshDiscoveryDenominatorCandidatesJson(
			JSON.stringify(snapshot),
		);
		assert.deepEqual(parsed, snapshot.candidates);
	});

	it("dedupes by source+EAN/SKU and tracks exclusions with explicit reasons", () => {
		const snapshot = buildDirectRefreshDiscoveryDenominatorCandidateSnapshot({
			products: [
				product("111", { skuId: "sku-a" }),
				product("111", { skuId: "sku-a" }),
				product("", { skuId: "sku-missing-ean" }),
			],
			fetchedAt,
			requestBudget: 5,
			sourceBudget: 5,
		});

		assert.equal(snapshot.counts.candidateRows, 1);
		assert.equal(snapshot.counts.excludedRows, 2);
		assert.equal(snapshot.counts.duplicateRows, 1);
		assert.match(snapshot.exclusions[0].reason, /duplicate|missing EAN/);
		assert(snapshot.exclusions.every((entry) => entry.reason.length > 0));
	});

	it("fails closed on request/source budget overflow", () => {
		const snapshot = buildDirectRefreshDiscoveryDenominatorCandidateSnapshot({
			products: [product("111"), product("222")],
			fetchedAt,
			requestBudget: 1,
			sourceBudget: 1,
		});

		assert.equal(snapshot.budgets.request.status, "FAIL");
		assert.equal(snapshot.budgets.source.status, "FAIL");
		assert.match(snapshot.failClosedReasons.join("\n"), /request budget exceeded/);
		assert.match(snapshot.failClosedReasons.join("\n"), /source budget exceeded for vea/);
	});

	it("rejects dangerous flags and non-Vea/all-source generation", () => {
		const options = parseDirectRefreshDiscoveryDenominatorCandidateCliOptions([
			"node",
			"script",
			"--source=vea",
			"--terms=leche,yogur",
			"--request-budget=10",
			"--source-budget=5",
			"--issue-number=223",
			"--output=audit/candidates.json",
		]);
		assert.deepEqual(options, {
			source: "vea",
			terms: ["leche", "yogur"],
			input: null,
			requestBudget: 10,
			sourceBudget: 5,
			issue: 223,
			output: "audit/candidates.json",
		});

		assert.throws(
			() =>
				parseDirectRefreshDiscoveryDenominatorCandidateCliOptions([
					"node",
					"script",
					"--source=disco",
					"--terms=leche",
				]),
			/Vea-only/,
		);
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
					parseDirectRefreshDiscoveryDenominatorCandidateCliOptions([
						"node",
						"script",
						"--terms=leche",
						flag,
					]),
				new RegExp(`rejects ${flag}`),
			);
		}
	});

	it("writes timestamped candidate JSON and wires the package script without writer calls", async () => {
		const snapshot = buildDirectRefreshDiscoveryDenominatorCandidateSnapshot({
			products: [product("111")],
			fetchedAt,
			requestBudget: 1,
			sourceBudget: 1,
		});
		const dir = await mkdtemp(join(tmpdir(), "denominator-candidates-"));
		try {
			const output = join(dir, "candidates.json");
			const written = await writeDirectRefreshDiscoveryDenominatorCandidateJson(
				output,
				snapshot,
			);
			assert.equal(written, output);
			assert.equal(await readFile(output, "utf8"), `${JSON.stringify(snapshot, null, 2)}\n`);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}

		assert.match(
			defaultDirectRefreshDiscoveryDenominatorCandidateOutputPath(fetchedAt),
			/audit\/direct-refresh-discovery-denominator-candidates-2026-06-12T12-00-00-000Z\.json/,
		);
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		const cliScript = readFileSync(
			"scripts/audit-direct-refresh-discovery-denominator-candidates.ts",
			"utf8",
		);
		assert.equal(
			packageJson.scripts["audit:direct-refresh-discovery-denominator-candidates"],
			"tsx scripts/audit-direct-refresh-discovery-denominator-candidates.ts",
		);
		assert.doesNotMatch(cliScript, /db\./);
		assert.doesNotMatch(cliScript, /writeMany|updateMany|deleteMany|createMany/);
	});
});
