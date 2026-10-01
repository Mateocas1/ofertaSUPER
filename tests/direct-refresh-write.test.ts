import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import {
	ACTIVE_WRITE_SOURCES,
	activeWriteSourceDisplayName,
	activeWriteSourceFromArgv,
	parseActiveWriteCliOptions,
} from "../scripts/pipeline/direct-refresh-active-write";
import { directRefreshConfirmationToken } from "../scripts/pipeline/direct-refresh-batch-size";

// The five near-identical writers became one parameterized entry
// (scripts/direct-refresh-write.ts --source <slug>). These cases pin the
// per-source contract that used to live in five separate scripts.
const WRITER_ENTRY = "scripts/direct-refresh-write.ts";
const REPORT_HASH = "a".repeat(64);
const SOURCE_DISPLAY_NAMES: Record<(typeof ACTIVE_WRITE_SOURCES)[number], string> =
	{
		carrefour: "Carrefour",
		vea: "Vea",
		disco: "Disco",
		jumbo: "Jumbo",
		mas: "MAS",
	};

function writerArgv(source: string, overrides: Record<string, string> = {}) {
	const flags: Record<string, string> = {
		"--source": source,
		"--count": "10",
		"--prewrite-report": "report.json",
		"--prewrite-report-hash": REPORT_HASH,
		"--row-ids": "1,2,3,4,5,6,7,8,9,10",
		"--product-eans": "1,2,3,4,5,6,7,8,9,10",
		"--sku-ids": "1,2,3,4,5,6,7,8,9,10",
		"--confirm-write": directRefreshConfirmationToken(source, 10),
		"--output": "write.json",
		...overrides,
	};
	return [
		"node",
		"script",
		...Object.entries(flags).map(([flag, value]) => `${flag}=${value}`),
	];
}

describe("unified direct-refresh writer source config", () => {
	for (const source of ACTIVE_WRITE_SOURCES) {
		it(`accepts --source=${source} and keeps its own confirmation token`, () => {
			assert.equal(activeWriteSourceDisplayName(source).length > 0, true);
			assert.equal(
				activeWriteSourceDisplayName(source),
				SOURCE_DISPLAY_NAMES[source],
			);
			assert.equal(
				activeWriteSourceFromArgv(["--source=" + source]),
				source,
			);

			const parsed = parseActiveWriteCliOptions(
				writerArgv(source),
				source,
			);
			assert.equal(parsed.source, source);
			assert.equal(parsed.count, 10);
			assert.equal(
				parsed.confirmWrite,
				directRefreshConfirmationToken(source, 10),
			);

			const otherSource = ACTIVE_WRITE_SOURCES.find(
				(candidate) => candidate !== source,
			);
			assert.throws(
				() =>
					parseActiveWriteCliOptions(
						writerArgv(source),
						otherSource as (typeof ACTIVE_WRITE_SOURCES)[number],
					),
				new RegExp(`only accepts --source=${otherSource}`),
			);
		});
	}

	it("rejects a missing, unknown or duplicated --source", () => {
		assert.throws(
			() => activeWriteSourceFromArgv(["node", "script"]),
			/requires --source=/,
		);
		assert.throws(
			() => activeWriteSourceFromArgv(["--source=dia"]),
			/unknown active writer source dia/,
		);
		assert.throws(
			() => activeWriteSourceFromArgv(["--source=vea", "--source=disco"]),
			/at most one --source/,
		);
	});

	it("the real entry resolves the source before touching any prewrite report", () => {
		const run = spawnSync(
			process.execPath,
			["--import", "tsx", WRITER_ENTRY, "--source=dia"],
			{ encoding: "utf8" },
		);
		assert.equal(run.status, 1);
		assert.match(run.stderr, /unknown active writer source dia/);
	});
});
