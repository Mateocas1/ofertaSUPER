import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import {
	buildDirectRefreshDiscoveryRollbackDrill,
	createPrismaDirectRefreshDiscoveryRollbackDrillRepository,
	parseDirectRefreshDiscoveryRollbackDrillPostwriteJson,
	parseDirectRefreshDiscoveryRollbackDrillRealCliOptions,
} from "./pipeline/direct-refresh-discovery-rollback-drill";

const REAL_PITR_BACKUP_POSTURE =
	"Human-approved controlled disposable-row rollback drill; PITR/backup posture must be reviewed separately before execution.";
const REAL_CACHE_HANDLING =
	"Human-approved controlled disposable-row rollback drill; cache purge automation is intentionally not executed.";

async function writeJson(path: string, value: unknown) {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runDirectRefreshDiscoveryRollbackDrillRealCli(
	argv = process.argv,
) {
	const options = parseDirectRefreshDiscoveryRollbackDrillRealCliOptions(argv);
	const postwrite = parseDirectRefreshDiscoveryRollbackDrillPostwriteJson(
		await readFile(options.postwrite, "utf8"),
	);
	const report = await db.$transaction(
		(tx) =>
			buildDirectRefreshDiscoveryRollbackDrill({
				postwrite,
				repository: createPrismaDirectRefreshDiscoveryRollbackDrillRepository(tx),
				pitrBackupPosture: REAL_PITR_BACKUP_POSTURE,
				cacheHandling: REAL_CACHE_HANDLING,
			}),
		{ maxWait: 15_000, timeout: 120_000 },
	);

	await mkdir(options.outputDir, { recursive: true });
	await writeJson(join(options.outputDir, "rollback-drill.json"), report);
	await writeJson(join(options.outputDir, "preimage.json"), report.preimage);
	await writeJson(
		join(options.outputDir, "post-rollback-verification.json"),
		report.postRollbackVerification,
	);

	process.stdout.write(
		`Direct-refresh discovery rollback drill ${report.status}: ${options.outputDir}\n`,
	);
	if (report.status === "FAIL") process.exitCode = 1;
	return report;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void runDirectRefreshDiscoveryRollbackDrillRealCli().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
