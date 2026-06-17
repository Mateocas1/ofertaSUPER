import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildCategoryPaginationCatalogComparisonReport,
	normalizeCategoryPaginationCatalogComparisonOutputPath,
	parseCategoryPaginationCatalogComparisonCliOptions,
} from "./pipeline/category-pagination-catalog-comparison";

export { parseCategoryPaginationCatalogComparisonCliOptions } from "./pipeline/category-pagination-catalog-comparison";

async function main() {
	const options = parseCategoryPaginationCatalogComparisonCliOptions();
	const candidateArtifact = await readJsonArtifact(options.candidateArtifact);
	const catalogFixture = await readJsonArtifact(options.catalogFixture);
	const report = buildCategoryPaginationCatalogComparisonReport({
		candidateArtifact,
		catalogFixture,
		generatedAt: new Date(options.generatedAt ?? Date.now()),
		issue: options.issue,
		outputPath: options.output,
		source: options.source,
	});
	const safeOutput = normalizeCategoryPaginationCatalogComparisonOutputPath(options.output, { issue: options.issue, source: options.source });
	await mkdir(dirname(safeOutput), { recursive: true });
	await writeFile(safeOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(`Wrote ${options.source} category pagination catalog comparison artifact to ${safeOutput}\n`);
	if (report.confidence.status === "FAIL") process.exitCode = 1;
}

async function readJsonArtifact(path: string) {
	const raw = await readFile(path, "utf8");
	const parsed = JSON.parse(raw) as Record<string, unknown> | unknown[];
	return Object.assign(parsed, { __inputPath: path });
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : "unknown category pagination catalog comparison error";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => {
		console.error(errorMessage(error));
		process.exitCode = 1;
	});
}
