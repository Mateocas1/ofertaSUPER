import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	DirectRefreshRunLedgerTransitionError,
	DirectRefreshRunLedgerValidationError,
	DirectRefreshSourceLockUnavailableError,
	activeDirectRefreshRunStatuses,
	assertValidDirectRefreshRunLedgerScope,
	createPlannedDirectRefreshRunLedgerEntry,
	directRefreshRunKey,
	directRefreshSourceLockKey,
	ensureDirectRefreshSourceAdvisoryLock,
	findActiveDirectRefreshRunConflict,
	isDirectRefreshRunTerminal,
	terminalDirectRefreshRunStatuses,
	transitionDirectRefreshRunStatus,
	type DirectRefreshRunLedgerScope,
} from "../scripts/pipeline/direct-refresh-run-ledger";

const now = new Date("2026-06-05T12:00:00.000Z");

function scope(
	overrides: Partial<DirectRefreshRunLedgerScope> = {},
): DirectRefreshRunLedgerScope {
	return {
		source: "vea",
		count: 50,
		attemptId: "20260605T120000Z",
		issue: {
			url: "https://github.com/Mateocas1/ofertaSUPER/issues/158",
			number: 158,
			title:
				"feat(data): add direct-refresh run ledger and source lock foundation",
			typeLabel: "type:feature",
			approvalLabel: "status:approved",
		},
		lineage: {
			artifactRoot: "audit/direct-refresh-run-ledger/20260605T120000Z",
			source: "vea",
			count: 50,
			plannerPath: "audit/direct-refresh-freshness-debt-planner/plan.json",
			parentHashes: { planner: "abc123" },
		},
		...overrides,
	};
}

describe("direct-refresh run ledger foundation", () => {
	it("builds stable run keys from source, count, and attempt", () => {
		assert.equal(
			directRefreshRunKey({
				source: " VEA ",
				count: 50,
				attemptId: "attempt1",
			}),
			"vea:count50:attempt1",
		);
	});

	it("uses deterministic positive source-scoped lock keys", () => {
		const vea = directRefreshSourceLockKey("vea");
		assert.equal(vea, directRefreshSourceLockKey(" VEA "));
		assert.notEqual(vea, directRefreshSourceLockKey("jumbo"));
		assert.ok(Number.isSafeInteger(vea));
		assert.ok(vea > 0);
	});

	it("allows a source advisory lock when Postgres grants it", async () => {
		let calls = 0;
		await assert.doesNotReject(
			ensureDirectRefreshSourceAdvisoryLock(
				{
					$queryRaw: async <T>() => {
						calls += 1;
						return [{ locked: true }] as T;
					},
				},
				"vea",
			),
		);
		assert.equal(calls, 1);
	});

	it("fails fast when a source advisory lock is unavailable", async () => {
		await assert.rejects(
			ensureDirectRefreshSourceAdvisoryLock(
				{ $queryRaw: async <T>() => [{ locked: false }] as T },
				"vea",
			),
			DirectRefreshSourceLockUnavailableError,
		);
	});

	it("creates planned entries with normalized source and lineage", () => {
		const entry = createPlannedDirectRefreshRunLedgerEntry({
			scope: scope(),
			now,
		});

		assert.equal(entry.source, "vea");
		assert.equal(entry.count, 50);
		assert.equal(entry.status, "PLANNED");
		assert.equal(entry.runKey, "vea:count50:20260605T120000Z");
		assert.equal(entry.sourceLockKey, directRefreshSourceLockKey("vea"));
		assert.equal(entry.plannedAt, now.toISOString());
		assert.equal(
			entry.lineage.plannerPath,
			"audit/direct-refresh-freshness-debt-planner/plan.json",
		);
	});

	it("rejects invalid scope, DIA writer scope, and unsupported counts", () => {
		assert.throws(
			() => assertValidDirectRefreshRunLedgerScope(scope({ source: "dia" })),
			/DIA|dia|audit-only/,
		);
		assert.throws(
			() => assertValidDirectRefreshRunLedgerScope(scope({ count: 100 })),
			/must be one of 10, 25, 50/,
		);
		assert.throws(
			() =>
				assertValidDirectRefreshRunLedgerScope(
					scope({
						lineage: { artifactRoot: "audit/x", source: "mas", count: 25 },
					}),
				),
			/lineage source must match run source|lineage count must match run count/,
		);
		assert.throws(
			() =>
				assertValidDirectRefreshRunLedgerScope(
					scope({
						issue: {
							url: "https://github.com/Mateocas1/ofertaSUPER/pull/158",
							number: 0,
							title: "",
							typeLabel: "type:feature,type:docs",
							approvalLabel: "status:review",
						},
					}),
				),
			DirectRefreshRunLedgerValidationError,
		);
	});

	it("detects active source conflicts for planned and running entries", () => {
		const planned = createPlannedDirectRefreshRunLedgerEntry({
			scope: scope({ attemptId: "planned" }),
			now,
		});
		const completed = {
			...createPlannedDirectRefreshRunLedgerEntry({
				scope: scope({ attemptId: "completed" }),
				now,
			}),
			status: "COMPLETED" as const,
		};

		assert.equal(findActiveDirectRefreshRunConflict([completed], "vea"), null);
		assert.equal(
			findActiveDirectRefreshRunConflict([completed, planned], " VEA ")?.runKey,
			planned.runKey,
		);
		assert.equal(findActiveDirectRefreshRunConflict([planned], "mas"), null);
	});

	it("allows only explicit non-terminal status transitions", () => {
		assert.equal(
			transitionDirectRefreshRunStatus({ from: "PLANNED", to: "RUNNING" }),
			"RUNNING",
		);
		assert.equal(
			transitionDirectRefreshRunStatus({ from: "PLANNED", to: "STOPPED" }),
			"STOPPED",
		);
		assert.equal(
			transitionDirectRefreshRunStatus({ from: "RUNNING", to: "COMPLETED" }),
			"COMPLETED",
		);
		assert.throws(
			() =>
				transitionDirectRefreshRunStatus({ from: "PLANNED", to: "COMPLETED" }),
			DirectRefreshRunLedgerTransitionError,
		);
		for (const terminal of terminalDirectRefreshRunStatuses()) {
			assert.equal(isDirectRefreshRunTerminal(terminal), true);
			assert.throws(
				() =>
					transitionDirectRefreshRunStatus({ from: terminal, to: "RUNNING" }),
				DirectRefreshRunLedgerTransitionError,
			);
		}
	});

	it("keeps active and terminal status sets explicit", () => {
		assert.deepEqual(activeDirectRefreshRunStatuses(), ["PLANNED", "RUNNING"]);
		assert.deepEqual(terminalDirectRefreshRunStatuses(), [
			"STOPPED",
			"FAILED",
			"COMPLETED",
		]);
	});

	it("documents no-overlap and closed-scope constraints in the migration", async () => {
		const migration = await readFile(
			"prisma/migrations/20260605_direct_refresh_run_ledger/migration.sql",
			"utf8",
		);

		assert.match(migration, /one_active_source_key/);
		assert.match(migration, /WHERE "status" IN \('PLANNED', 'RUNNING'\)/);
		assert.match(migration, /"count" IN \(10, 25, 50\)/);
		assert.match(migration, /"source_slug" <> 'dia'/);
		assert.match(migration, /"source_lock_key" INTEGER NOT NULL/);
	});
});
