import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import {
	buildDirectRefreshDiscoveryRollbackVerification,
	parseDirectRefreshDiscoveryRollbackVerificationCliOptions,
	parseDirectRefreshDiscoveryRollbackVerificationPostwriteJson,
	type DirectRefreshDiscoveryRollbackVerificationRepository,
} from "./pipeline/direct-refresh-discovery-rollback-verification";
import type { DirectRefreshDiscoveryCreatePostwriteReport } from "./pipeline/direct-refresh-discovery-postwrite-audit";

function createPrismaRollbackVerificationRepository(
	client: typeof db = db,
): DirectRefreshDiscoveryRollbackVerificationRepository {
	return {
		async getProductsByEan(eans) {
			if (eans.length === 0) return [];
			return client.product.findMany({
				where: { ean: { in: eans } },
				select: { ean: true },
			});
		},
		async getSupermarketProductsByIds(ids) {
			if (ids.length === 0) return [];
			return client.supermarketProduct.findMany({
				where: { id: { in: ids } },
				select: { id: true },
			});
		},
		async getPriceHistoryRowsByIds(ids) {
			if (ids.length === 0) return [];
			return client.priceHistory.findMany({
				where: { id: { in: ids } },
				select: { id: true },
			});
		},
	};
}

async function readJson<T>(path: string): Promise<T> {
	return parseDirectRefreshDiscoveryRollbackVerificationPostwriteJson(
		await readFile(path, "utf8"),
	) as T;
}

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh discovery rollback verification to ${output}\n`,
	);
}

async function main() {
	const options = parseDirectRefreshDiscoveryRollbackVerificationCliOptions();
	const postwrite = await readJson<DirectRefreshDiscoveryCreatePostwriteReport>(
		options.postwrite,
	);
	const report = await buildDirectRefreshDiscoveryRollbackVerification({
		postwrite,
		repository: createPrismaRollbackVerificationRepository(),
	});
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
