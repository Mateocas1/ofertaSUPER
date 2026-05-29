import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { probeRedis, type RedisProbeResult } from "../src/lib/redis";
import {
	buildOpsFreshnessReport,
	type OpsFreshnessRepository,
} from "./pipeline/ops-checks";

type CliOptions = {
	checkRedis: boolean;
	output: string | null;
	runningRunMaxAgeMinutes: number;
	pendingStagingMaxAgeMinutes: number;
};

function getOptionalSingleFlag(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	const values = argv.filter((value) => value.startsWith(prefix));

	if (values.length > 1) {
		throw new Error(`ops freshness audit accepts at most one ${flagName}=... flag`);
	}

	return values[0]?.slice(prefix.length) ?? null;
}

function parsePositiveIntegerFlag(argv: string[], flagName: string, fallback: number) {
	const raw = getOptionalSingleFlag(argv, flagName);

	if (raw === null) {
		return fallback;
	}

	const parsed = Number(raw);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`ops freshness audit requires ${flagName}=<positive integer>`);
	}

	return parsed;
}

function rejectWriteFlags(argv: string[]) {
	const forbidden = ["--confirm-write", "--active", "--write", "--reconcile", "--purge-cache"];
	const found = argv.find((entry) =>
		forbidden.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);

	if (found) {
		throw new Error(`ops freshness audit is read-only and rejects ${found}`);
	}
}

export function parseOpsFreshnessCliOptions(argv = process.argv): CliOptions {
	rejectWriteFlags(argv);

	return {
		checkRedis: argv.includes("--check-redis"),
		output: getOptionalSingleFlag(argv, "--output"),
		runningRunMaxAgeMinutes: parsePositiveIntegerFlag(argv, "--running-run-max-age-minutes", 60),
		pendingStagingMaxAgeMinutes: parsePositiveIntegerFlag(argv, "--pending-staging-max-age-minutes", 60),
	};
}

function createPrismaOpsFreshnessRepository(): OpsFreshnessRepository {
	return {
		async findRunningRuns(cutoffIso) {
			const rows = await db.ingestionRun.findMany({
				where: {
					status: "RUNNING",
					started_at: { lt: new Date(cutoffIso) },
				},
				orderBy: { started_at: "asc" },
				select: { id: true, source_slug: true, started_at: true },
			});

			return rows.map((row) => ({
				id: row.id,
				sourceSlug: row.source_slug,
				startedAt: row.started_at.toISOString(),
			}));
		},
		async countOldPendingStagingRows(cutoffIso) {
			return db.stagingProduct.count({
				where: {
					status: "PENDING",
					created_at: { lt: new Date(cutoffIso) },
				},
			});
		},
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;

	if (!output) {
		process.stdout.write(serialized);
		return;
	}

	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote ops freshness audit to ${output}\n`);
}

async function main() {
	const options = parseOpsFreshnessCliOptions();
	const redisProbe = options.checkRedis
		? probeRedis
		: async (): Promise<RedisProbeResult> => ({ status: "degraded", reason: "redis_ping_not_requested", latencyMs: null });
	const report = await buildOpsFreshnessReport({
		repository: createPrismaOpsFreshnessRepository(),
		redisProbe,
		runningRunMaxAgeMinutes: options.runningRunMaxAgeMinutes,
		pendingStagingMaxAgeMinutes: options.pendingStagingMaxAgeMinutes,
	});

	await writeJson(options.output, report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
