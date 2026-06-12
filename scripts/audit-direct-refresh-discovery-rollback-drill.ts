import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildDirectRefreshDiscoveryRollbackDrill,
	createMockDirectRefreshDiscoveryRollbackDrillRepository,
	parseDirectRefreshDiscoveryRollbackDrillCliOptions,
	parseDirectRefreshDiscoveryRollbackDrillPostwriteJson,
} from "./pipeline/direct-refresh-discovery-rollback-drill";

const MOCK_PITR_BACKUP_POSTURE =
	"Mock/no-db rollback drill only; PITR/backup automation is intentionally not executed.";
const MOCK_CACHE_HANDLING =
	"Mock/no-db rollback drill only; cache purge automation is intentionally not executed.";

async function writeJson(path: string, value: unknown) {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runDirectRefreshDiscoveryRollbackDrillCli(
	argv = process.argv,
) {
	const options = parseDirectRefreshDiscoveryRollbackDrillCliOptions(argv);
	const postwrite = parseDirectRefreshDiscoveryRollbackDrillPostwriteJson(
		await readFile(options.postwrite, "utf8"),
	);
	const report = await buildDirectRefreshDiscoveryRollbackDrill({
		postwrite,
		repository: createMockDirectRefreshDiscoveryRollbackDrillRepository(postwrite),
		pitrBackupPosture: MOCK_PITR_BACKUP_POSTURE,
		cacheHandling: MOCK_CACHE_HANDLING,
	});

	await mkdir(options.outputDir, { recursive: true });
	await writeJson(join(options.outputDir, "rollback-drill.json"), report);
	await writeJson(join(options.outputDir, "preimage.json"), report.preimage);
	await writeJson(
		join(options.outputDir, "post-rollback-verification.json"),
		report.postRollbackVerification,
	);

	process.stdout.write(
		`Mock direct-refresh discovery rollback drill ${report.status}: ${options.outputDir}\n`,
	);
	if (report.status === "FAIL") process.exitCode = 1;
	return report;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void runDirectRefreshDiscoveryRollbackDrillCli().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
