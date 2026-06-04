import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshKillSwitchCliOptions } from "../scripts/audit-direct-refresh-kill-switch";
import {
	assertDirectRefreshKillSwitchAllowsSource,
	evaluateDirectRefreshKillSwitch,
} from "../scripts/pipeline/direct-refresh-kill-switch";

const now = new Date("2026-06-04T12:00:00.000Z");

function control(overrides: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		control: "direct-refresh-kill-switch",
		global: { stop: false },
		sources: {},
		...overrides,
	};
}

describe("direct-refresh kill switch", () => {
	it("passes when no active stop applies", () => {
		const report = evaluateDirectRefreshKillSwitch({
			control: control(),
			source: "vea",
			controlPath: "control.json",
			now,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.activeStopCount, 0);
		assert.equal(report.summary.schedulerGate, "blocked");
		assert.match(report.writeBoundary, /no production writes/);
	});

	it("fails for active global stop", () => {
		const report = evaluateDirectRefreshKillSwitch({
			control: control({
				global: {
					stop: true,
					reason: "incident review",
					owner: "Direct-refresh operator",
					createdAt: "2026-06-04T10:00:00.000Z",
					expiresAt: "2026-06-04T13:00:00.000Z",
				},
			}),
			source: "vea",
			now,
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.activeControls[0].scope, "global");
		assert.equal(report.activeControls[0].source, null);
		assert.equal(report.activeControls[0].reason, "incident review");
	});

	it("fails only for matching active source stop", () => {
		const input = control({
			sources: {
				vea: {
					stop: true,
					reason: "source drift",
					owner: "Direct-refresh operator",
				},
			},
		});
		const blocked = evaluateDirectRefreshKillSwitch({ control: input, source: "vea", now });
		const other = evaluateDirectRefreshKillSwitch({ control: input, source: "jumbo", now });

		assert.equal(blocked.status, "FAIL");
		assert.equal(blocked.activeControls[0].source, "vea");
		assert.equal(blocked.activeControls[0].directRefreshSupport, "writer-supported");
		assert.equal(other.status, "PASS");
		assert.equal(
			other.inactiveControls.find((control) => control.source === "vea")?.source,
			"vea",
		);
	});

	it("reports expired controls without blocking", () => {
		const report = evaluateDirectRefreshKillSwitch({
			control: control({
				sources: {
					mas: {
						stop: true,
						reason: "old incident",
						owner: "Direct-refresh operator",
						expiresAt: "2026-06-04T11:59:00.000Z",
					},
				},
			}),
			source: "mas",
			now,
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.expiredStopCount, 1);
		assert.equal(
			report.inactiveControls.find((control) => control.source === "mas")?.expired,
			true,
		);
	});

	it("fails closed for malformed and invalid controls", () => {
		const malformed = evaluateDirectRefreshKillSwitch({ control: null, now });
		assert.equal(malformed.status, "FAIL");
		assert.match(malformed.invalidControls[0].message, /must be an object/);

		const invalidSource = evaluateDirectRefreshKillSwitch({
			control: control({ sources: { carrefor: { stop: true } } }),
			now,
		});
		assert.equal(invalidSource.status, "FAIL");
		assert.match(invalidSource.invalidControls[0].message, /unknown direct-refresh/);

		const missingMetadata = evaluateDirectRefreshKillSwitch({
			control: control({ sources: { vea: { stop: true } } }),
			source: "vea",
			now,
		});
		assert.equal(missingMetadata.status, "FAIL");
		const invalidMessages = missingMetadata.invalidControls
			.map((entry) => entry.message)
			.join("\n");
		assert.match(invalidMessages, /requires reason/);
		assert.match(invalidMessages, /requires owner/);
	});

	it("classifies DIA as audit-only/no-writer", () => {
		const report = evaluateDirectRefreshKillSwitch({
			control: control({
				sources: {
					dia: { stop: true, reason: "DIA excluded", owner: "Maintainer" },
				},
			}),
			source: "dia",
			now,
		});

		assert.equal(report.status, "FAIL");
		assert.equal(report.activeControls[0].directRefreshSupport, "audit-only-no-writer");
	});

	it("throws a clear writer guard error when blocked", () => {
		assert.throws(
			() =>
				assertDirectRefreshKillSwitchAllowsSource({
					control: control({
						sources: {
							vea: { stop: true, reason: "incident", owner: "Maintainer" },
						},
					}),
					source: "vea",
					now,
				}),
			/direct-refresh kill switch blocks source vea/,
		);
	});

	it("parses CLI defaults and rejects unsafe flags", () => {
		const options = parseDirectRefreshKillSwitchCliOptions(
			["node", "script", "--source=vea", "--control=control.json"],
			now,
		);
		assert.equal(options.source, "vea");
		assert.equal(options.control, "control.json");
		assert.match(options.output, /audit\/direct-refresh-kill-switch/);

		for (const flag of [
			"--write",
			"--confirm-write=1",
			"--all-source",
			"--scheduler=true",
			"--notify",
			"--notifications=true",
			"--deploy",
			"--refresh",
		]) {
			assert.throws(
				() => parseDirectRefreshKillSwitchCliOptions(["node", "script", "--control=x.json", flag]),
				/direct-refresh kill switch rejects/,
			);
		}
	});

	it("rejects missing control, unknown source, unknown flags, and bare flags", () => {
		assert.throws(
			() => parseDirectRefreshKillSwitchCliOptions(["node", "script"]),
			/requires --control=\.\.\./,
		);
		assert.throws(
			() => parseDirectRefreshKillSwitchCliOptions(["node", "script", "--control=x.json", "--source=unknown"]),
			/rejects source unknown/,
		);
		assert.throws(
			() => parseDirectRefreshKillSwitchCliOptions(["node", "script", "--control=x.json", "--dry-run"]),
			/unknown direct-refresh kill switch flag/,
		);
		assert.throws(
			() => parseDirectRefreshKillSwitchCliOptions(["node", "script", "--control"]),
			/requires --control=\.\.\./,
		);
	});
});
