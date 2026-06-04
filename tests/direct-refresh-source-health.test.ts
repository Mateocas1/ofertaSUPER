import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshSourceHealthCliOptions } from "../scripts/audit-direct-refresh-source-health";
import {
	buildDirectRefreshSourceHealthReport,
	type DirectRefreshSourceHealthRepository,
	type DirectRefreshSourceHealthRow,
	type DirectRefreshSourceHealthSource,
} from "../scripts/pipeline/direct-refresh-source-health";

const now = new Date("2026-06-04T12:00:00.000Z");

function source(
	overrides: Partial<DirectRefreshSourceHealthSource> = {},
): DirectRefreshSourceHealthSource {
	return {
		id: 1,
		slug: "vea",
		displayName: "Vea",
		baseUrl: "https://www.vea.com.ar",
		isActive: true,
		isVtex: true,
		freshnessSlaHours: 12,
		...overrides,
	};
}

function row(overrides: Partial<DirectRefreshSourceHealthRow> = {}) {
	return {
		sourceSlug: "vea",
		productEan: "7790001000011",
		productName: "Leche",
		price: 1000,
		isAvailable: true,
		lastCheckedAt: "2026-06-04T10:00:00.000Z",
		...overrides,
	};
}

function repository({
	sources,
	rows,
	stagingState = { runningRuns: 0, pendingStagingRows: 0 },
}: {
	sources: DirectRefreshSourceHealthSource[];
	rows: DirectRefreshSourceHealthRow[];
	stagingState?: { runningRuns: number; pendingStagingRows: number };
}): DirectRefreshSourceHealthRepository {
	return {
		async listSources(sourceSlugs) {
			return sources.filter((source) =>
				sourceSlugs.includes(source.slug as never),
			);
		},
		async listRows(sourceSlugs) {
			return rows.filter((row) =>
				sourceSlugs.includes(row.sourceSlug as never),
			);
		},
		async getStagingState() {
			return stagingState;
		},
	};
}

describe("direct-refresh source health", () => {
	it("passes a healthy writer-supported source with capacity evidence", async () => {
		const report = await buildDirectRefreshSourceHealthReport({
			repository: repository({
				sources: [source()],
				rows: [row(), row({ productEan: "7790001000012" })],
			}),
			sources: ["vea"],
			now,
			capacityReport: {
				sources: [
					{
						slug: "vea",
						status: "PASS",
						classification: "viable",
						candidateScan: { viableRows: 25, blockedRows: 0 },
						capacity: {
							recommendedBatchSize: 25,
							recommendedCandidateScanSize: 25,
						},
						blockers: [],
					},
				],
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.writerSupportedStatus, "PASS");
		assert.equal(report.sources[0].status, "PASS");
		assert.equal(report.sources[0].freshness.publicRankableRows, 2);
		assert.equal(report.sources[0].freshness.freshRows, 2);
		assert.match(report.writeBoundary, /no production writes/);
	});

	it("warns for stale freshness and missing capacity evidence", async () => {
		const report = await buildDirectRefreshSourceHealthReport({
			repository: repository({
				sources: [source()],
				rows: [row({ lastCheckedAt: "2026-06-03T00:00:00.000Z" })],
			}),
			sources: ["vea"],
			now,
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.sources[0].status, "WARN");
		assert.match(
			report.sources[0].reasons.join("\n"),
			/freshness below target/,
		);
		assert.match(
			report.sources[0].reasons.join("\n"),
			/capacity\/readiness report not provided/,
		);
	});

	it("fails closed for missing source records and invalid base URL", async () => {
		const missing = await buildDirectRefreshSourceHealthReport({
			repository: repository({ sources: [], rows: [] }),
			sources: ["vea"],
			now,
		});
		assert.equal(missing.status, "FAIL");
		assert.match(
			missing.sources[0].reasons.join("\n"),
			/source record is missing/,
		);

		const invalid = await buildDirectRefreshSourceHealthReport({
			repository: repository({
				sources: [source({ baseUrl: "not a url" })],
				rows: [row()],
			}),
			sources: ["vea"],
			now,
		});
		assert.equal(invalid.status, "FAIL");
		assert.match(invalid.sources[0].reasons.join("\n"), /base URL is invalid/);
	});

	it("classifies DIA as audit-only/no-writer", async () => {
		const report = await buildDirectRefreshSourceHealthReport({
			repository: repository({
				sources: [
					source({
						id: 6,
						slug: "dia",
						displayName: "DIA",
						baseUrl: "https://diaonline.supermercadosdia.com.ar",
					}),
				],
				rows: [row({ sourceSlug: "dia" })],
			}),
			sources: ["dia"],
			now,
		});

		assert.equal(
			report.sources[0].directRefreshSupport,
			"audit-only-no-writer",
		);
		assert.equal(report.sources[0].status, "WARN");
		assert.match(report.sources[0].recommendation, /audit-only/);
	});

	it("propagates capacity WARN and blocker reasons", async () => {
		const report = await buildDirectRefreshSourceHealthReport({
			repository: repository({ sources: [source()], rows: [row()] }),
			sources: ["vea"],
			now,
			capacityReport: {
				sources: [
					{
						slug: "vea",
						status: "WARN",
						classification: "mixed",
						candidateScan: { viableRows: 19, blockedRows: 6 },
						blockers: [{ reason: "live product is unavailable", count: 6 }],
					},
				],
			},
		});

		assert.equal(report.status, "WARN");
		assert.match(
			report.sources[0].reasons.join("\n"),
			/capacity status is WARN/,
		);
		assert.match(report.sources[0].reasons.join("\n"), /blocked rows/);
	});

	it("parses CLI defaults and rejects write-shaped flags", () => {
		const options = parseDirectRefreshSourceHealthCliOptions(
			["node", "script"],
			now,
		);
		assert.deepEqual(options.sources, [
			"carrefour",
			"vea",
			"disco",
			"jumbo",
			"mas",
			"dia",
		]);
		assert.match(options.output, /audit\/direct-refresh-source-health/);

		for (const flag of [
			"--write",
			"--confirm-write=1",
			"--all-source",
			"--scheduler=true",
			"--cron",
			"--workflow",
			"--ingest",
			"--refresh",
		]) {
			assert.throws(
				() =>
					parseDirectRefreshSourceHealthCliOptions(["node", "script", flag]),
				/direct-refresh source health rejects/,
			);
		}
	});

	it("rejects unknown sources, unknown flags, bare flags, and invalid percentages", () => {
		assert.throws(
			() =>
				parseDirectRefreshSourceHealthCliOptions([
					"node",
					"script",
					"--source=unknown",
				]),
			/rejects source unknown/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSourceHealthCliOptions([
					"node",
					"script",
					"--dry-run",
				]),
			/unknown direct-refresh source health flag/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSourceHealthCliOptions([
					"node",
					"script",
					"--source",
				]),
			/requires --source=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshSourceHealthCliOptions([
					"node",
					"script",
					"--freshness-target-percent=101",
				]),
			/between 0 and 100/,
		);
		assert.throws(
			() =>
				parseDirectRefreshSourceHealthCliOptions([
					"node",
					"script",
					"--fail-under-freshness-percent=-1",
				]),
			/between 0 and 100/,
		);
	});
});
