import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
	parseIngestionOptions,
	shouldFailForRequestedSourceHealth,
	compareExpectedEans,
	validateIngestionSafety,
} from "../scripts/ingest-options";

describe("ingestion CLI safety options", () => {
	it("requires explicit confirmation before active non-dry-run writes", () => {
		const options = parseIngestionOptions(
			["node", "scripts/ingest.ts", "--source=carrefour"],
			{
				INGESTION_V2: "active",
			},
		);

		assert.deepEqual(validateIngestionSafety(options), {
			ok: false,
			reason:
				"active ingestion writes require --confirm-write or INGESTION_ACTIVE_WRITE_APPROVED=true",
		});
	});

	it("accepts active count=5 writes only with a single source, term, and expected EAN set", () => {
		const argv = [
			"node",
			"scripts/ingest.ts",
			"--source=carrefour",
			"--terms=leche",
			"--count=5",
			"--expected-eans=111,222,333,444,555",
			"--confirm-write",
		];
		const flagOptions = parseIngestionOptions(argv, { INGESTION_V2: "active" });
		const envOptions = parseIngestionOptions(argv.slice(0, -1), {
			INGESTION_V2: "active",
			INGESTION_ACTIVE_WRITE_APPROVED: "true",
		});

		assert.deepEqual(validateIngestionSafety(flagOptions), { ok: true });
		assert.deepEqual(validateIngestionSafety(envOptions), { ok: true });
	});

	it("rejects all-source and loosely targeted active writes", () => {
		const missingSource = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--terms=leche",
				"--count=5",
				"--expected-eans=111,222,333,444,555",
				"--confirm-write",
			],
			{
				INGESTION_V2: "active",
			},
		);
		const multipleSources = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--source=carrefour,dia",
				"--terms=leche",
				"--count=5",
				"--expected-eans=111,222,333,444,555",
				"--confirm-write",
			],
			{ INGESTION_V2: "active" },
		);
		const allSourcesFlag = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--terms=leche",
				"--count=5",
				"--expected-eans=111,222,333,444,555",
				"--confirm-write",
				"--all-sources",
			],
			{ INGESTION_V2: "active" },
		);

		assert.deepEqual(validateIngestionSafety(missingSource), {
			ok: false,
			reason: "active ingestion writes require exactly one --source=<slug>",
		});
		assert.deepEqual(validateIngestionSafety(multipleSources), {
			ok: false,
			reason: "active ingestion writes require exactly one --source=<slug>",
		});
		assert.deepEqual(validateIngestionSafety(allSourcesFlag), {
			ok: false,
			reason: "active all-source writes are disabled for this rollout",
		});
	});

	it("allows active dry-runs without write confirmation or source", () => {
		const options = parseIngestionOptions(
			["node", "scripts/ingest.ts", "--dry-run"],
			{
				INGESTION_V2: "active",
			},
		);

		assert.equal(options.mode, "active");
		assert.equal(options.dryRun, true);
		assert.deepEqual(validateIngestionSafety(options), { ok: true });
	});

	it("parses bounded targeting flags separately from query-term limit", () => {
		const options = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--dry-run",
				"--source=carrefour,dia",
				"--terms=uva rosada, leche ,",
				"--expected-eans=111, 222,333,",
				"--count=7",
				"--limit=3",
				"--batch-size=25",
			],
			{ INGESTION_V2: "shadow" },
		);

		assert.deepEqual(options.sourceFilter, ["carrefour", "dia"]);
		assert.deepEqual(options.queryTerms, ["uva rosada", "leche"]);
		assert.deepEqual(options.expectedEans, ["111", "222", "333"]);
		assert.equal(options.writeMode, "phase4-count5");
		assert.equal(options.candidateHash, null);
		assert.equal(options.count, 7);
		assert.equal(options.queryLimit, 3);
		assert.equal(options.reconcileBatchSize, 25);
	});

	it("fails closed on unknown active write mode", () => {
		assert.throws(
			() =>
				parseIngestionOptions(
					[
						"node",
						"scripts/ingest.ts",
						"--write-mode=refresh_existing",
						"--source=carrefour",
						"--terms=leche",
						"--count=5",
						"--expected-eans=111,222,333,444,555",
						"--confirm-write",
					],
					{ INGESTION_V2: "active" },
				),
			/--write-mode=phase4-count5 or --write-mode=refresh-existing/,
		);
	});

	it("accepts active refresh-existing writes only with an explicit bounded chunk", () => {
		const options = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--write-mode=refresh-existing",
				"--source=carrefour",
				"--terms=leche",
				"--count=3",
				"--expected-eans=111,222,333",
				"--candidate-hash=abcdef",
				"--confirm-write",
			],
			{ INGESTION_V2: "active" },
		);

		assert.equal(options.writeMode, "refresh-existing");
		assert.equal(options.candidateHash, "abcdef");
		assert.deepEqual(validateIngestionSafety(options), { ok: true });
	});

	it("rejects unsafe refresh-existing active write shapes", () => {
		const base = [
			"node",
			"scripts/ingest.ts",
			"--write-mode=refresh-existing",
			"--source=carrefour",
			"--terms=leche",
			"--count=3",
			"--expected-eans=111,222,333",
			"--confirm-write",
		];

		assert.deepEqual(
			validateIngestionSafety(
				parseIngestionOptions(base, {
					INGESTION_V2: "active",
				}),
			),
			{
				ok: false,
				reason:
					"refresh-existing writes require --candidate-hash from the candidate snapshot",
			},
		);
		const baseWithHash = [...base, "--candidate-hash=abcdef"];
		assert.deepEqual(
			validateIngestionSafety(
				parseIngestionOptions(
					baseWithHash.filter((arg) => arg !== "--expected-eans=111,222,333"),
					{
						INGESTION_V2: "active",
					},
				),
			),
			{
				ok: false,
				reason:
					"refresh-existing writes require at least one --expected-eans value",
			},
		);
		assert.deepEqual(
			validateIngestionSafety(
				parseIngestionOptions(
					baseWithHash.map((arg) =>
						arg === "--expected-eans=111,222,333"
							? "--expected-eans=111,222,222"
							: arg,
					),
					{ INGESTION_V2: "active" },
				),
			),
			{
				ok: false,
				reason: "refresh-existing writes require distinct --expected-eans",
			},
		);
		assert.deepEqual(
			validateIngestionSafety(
				parseIngestionOptions(
					baseWithHash.map((arg) => (arg === "--count=3" ? "--count=4" : arg)),
					{ INGESTION_V2: "active" },
				),
			),
			{
				ok: false,
				reason: "refresh-existing --count must equal --expected-eans length",
			},
		);
		assert.deepEqual(
			validateIngestionSafety(
				parseIngestionOptions(
					baseWithHash.map((arg) => (arg === "--count=3" ? "--count=26" : arg)),
					{ INGESTION_V2: "active" },
				),
			),
			{
				ok: false,
				reason:
					"refresh-existing writes are capped at --count=25 for this rollout",
			},
		);
	});

	it("requires expected EANs and exactly one query term for active writes", () => {
		const missingExpected = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--source=carrefour",
				"--terms=leche",
				"--count=5",
				"--confirm-write",
			],
			{ INGESTION_V2: "active" },
		);
		const tooFewExpected = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--source=carrefour",
				"--terms=leche",
				"--count=5",
				"--expected-eans=111,222,333,444",
				"--confirm-write",
			],
			{ INGESTION_V2: "active" },
		);
		const multipleTerms = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--source=carrefour",
				"--terms=leche,yogur",
				"--count=5",
				"--expected-eans=111,222,333,444,555",
				"--confirm-write",
			],
			{ INGESTION_V2: "active" },
		);
		const wrongTerm = parseIngestionOptions(
			[
				"node",
				"scripts/ingest.ts",
				"--source=carrefour",
				"--terms=yogur",
				"--count=5",
				"--expected-eans=111,222,333,444,555",
				"--confirm-write",
			],
			{ INGESTION_V2: "active" },
		);

		assert.deepEqual(validateIngestionSafety(missingExpected), {
			ok: false,
			reason: "active ingestion writes require exactly five --expected-eans",
		});
		assert.deepEqual(validateIngestionSafety(tooFewExpected), {
			ok: false,
			reason: "active ingestion writes require exactly five --expected-eans",
		});
		assert.deepEqual(validateIngestionSafety(multipleTerms), {
			ok: false,
			reason: "active ingestion writes require exactly one --terms=<query>",
		});
		assert.deepEqual(validateIngestionSafety(wrongTerm), {
			ok: false,
			reason: "active Phase 4 writes require --terms=leche",
		});
	});

	it("compares expected EAN sets with stable mismatch details", () => {
		assert.deepEqual(compareExpectedEans(["111", "222"], ["222", "111"]), {
			ok: true,
			missing: [],
			extra: [],
			duplicateExpected: [],
			duplicateActual: [],
		});
		assert.deepEqual(
			compareExpectedEans(["111", "222", "222"], ["222", "333"]),
			{
				ok: false,
				missing: ["111"],
				extra: ["333"],
				duplicateExpected: ["222"],
				duplicateActual: [],
			},
		);
	});

	it("fails readiness when a requested source reports a failed health/source summary", () => {
		const summaries = [
			{ slug: "carrefour", status: "FAILED" as const },
			{ slug: "dia", status: "SUCCESS" as const },
		];

		assert.equal(
			shouldFailForRequestedSourceHealth(["carrefour"], summaries),
			true,
		);
		assert.equal(shouldFailForRequestedSourceHealth(null, summaries), false);
		assert.equal(
			shouldFailForRequestedSourceHealth(
				["dia"],
				[{ slug: "dia", status: "SUCCESS" }],
			),
			false,
		);
		assert.equal(shouldFailForRequestedSourceHealth(["dia"], summaries), false);
	});

	it("wires the parsed safety and targeting options into the ingestion script", () => {
		const ingestScript = readFileSync("scripts/ingest.ts", "utf8");

		assert.match(ingestScript, /parseIngestionOptions/);
		assert.match(ingestScript, /assertSafeIngestionOptions/);
		assert.match(ingestScript, /shouldFailForRequestedSourceHealth/);
		assert.match(ingestScript, /queryTerms:\s*queryTerms \?\? undefined/);
		assert.match(ingestScript, /count,/);
	});
});
