import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildCoverageAuditReport,
	normalizeCoverageAuditOutputPath,
	parseCoverageAuditCandidatesJson,
	parseCoverageAuditCliOptions,
} from "./pipeline/coverage-audit";

export { parseCoverageAuditCliOptions } from "./pipeline/coverage-audit";

export async function writeCoverageAuditJson(output: string, report: unknown) {
	const safeOutput = normalizeCoverageAuditOutputPath(output);
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	await mkdir(dirname(safeOutput), { recursive: true });
	await writeFile(safeOutput, serialized, "utf8");
	process.stdout.write(`Wrote coverage audit artifact to ${safeOutput}\n`);
}

async function main() {
	const options = parseCoverageAuditCliOptions();
	const inputRaw = await readFile(options.input, "utf8");
	const candidates = parseCoverageAuditCandidatesJson(inputRaw);
	const report = buildCoverageAuditReport({
		candidates,
		requestBudget: options.requestBudget,
		sourceBudget: options.sourceBudget,
		issue: options.issue,
		generatedAt: new Date(options.generatedAt),
		windowStart: options.windowStart,
		windowEnd: options.windowEnd,
		inputPath: options.input,
		inputRaw,
		outputPath: options.output,
	});
	await writeCoverageAuditJson(options.output, report);
	if (report.confidence.status === "FAIL") process.exitCode = 1;
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
