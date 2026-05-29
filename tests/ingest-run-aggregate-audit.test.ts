import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
	buildIngestRunAggregateReport,
	type IngestRunAggregateChunk,
} from "../scripts/pipeline/ingest-run-aggregate-audit";

function chunk(
	overrides: Partial<IngestRunAggregateChunk> = {},
): IngestRunAggregateChunk {
	return {
		status: "PASS",
		mode: "post-write",
		runId: 42,
		source: "carrefour",
		writeMode: "refresh-existing",
		touchedEans: ["111", "222"],
		warnings: [],
		createdRows: { newProducts: 0, supermarketProductsCreated: 0 },
		...overrides,
	};
}

describe("ingest run aggregate audit", () => {
	it("aggregates passing refresh-existing chunks", () => {
		const report = buildIngestRunAggregateReport({
			chunks: [
				chunk(),
				chunk({ runId: 43, touchedEans: ["333"], warnings: ["manual check"] }),
			],
			writeMode: "refresh-existing",
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.chunkCount, 2);
		assert.deepEqual(report.runIds, [42, 43]);
		assert.deepEqual(report.touchedEans, ["111", "222", "333"]);
		assert.equal(report.totals.touchedEans, 3);
		assert.deepEqual(report.warnings, ["manual check"]);
	});

	it("rejects duplicate EANs, mixed sources, failing chunks, or created rows", () => {
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [chunk(), chunk({ runId: 43, touchedEans: ["222"] })],
					writeMode: "refresh-existing",
				}),
			/duplicate touched EANs across chunks: 222/,
		);
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [
						chunk(),
						chunk({ runId: 43, source: "dia", touchedEans: ["333"] }),
					],
					writeMode: "refresh-existing",
				}),
			/mixed sources are not allowed/,
		);
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [chunk({ status: "FAIL" })],
					writeMode: "refresh-existing",
				}),
			/all aggregate chunks must be PASS post-write audits/,
		);
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [chunk({ writeMode: "phase4-count5" })],
					writeMode: "refresh-existing",
				}),
			/matching writeMode evidence/,
		);
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [{ ...chunk(), createdRows: undefined as never }],
					writeMode: "refresh-existing",
				}),
			/createdRows evidence/,
		);
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [{ ...chunk(), createdRows: {} as never }],
					writeMode: "refresh-existing",
				}),
			/complete numeric createdRows evidence/,
		);
		assert.throws(
			() =>
				buildIngestRunAggregateReport({
					chunks: [
						chunk({
							createdRows: { newProducts: 0, supermarketProductsCreated: 1 },
						}),
					],
					writeMode: "refresh-existing",
				}),
			/refresh-existing aggregate requires zero created rows/,
		);
	});

	it("has a read-only CLI script wired", () => {
		const packageJson = readFileSync("package.json", "utf8");
		const cliSource = readFileSync("scripts/audit-ingest-aggregate.ts", "utf8");

		assert.match(
			packageJson,
			/"audit:ingest-aggregate": "tsx scripts\/audit-ingest-aggregate\.ts"/,
		);
		assert.match(cliSource, /buildIngestRunAggregateReport/);
		assert.doesNotMatch(
			cliSource,
			/\b(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/,
		);
		assert.doesNotMatch(
			cliSource,
			/\$executeRaw|stageSourceProducts\(|from ["'].*reconcile|setCachedJson\(|\bredis\b/i,
		);
	});
});
