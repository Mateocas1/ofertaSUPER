import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildDirectRefreshDiscoveryDenominatorReport,
	parseDirectRefreshDiscoveryDenominatorCandidatesJson,
	parseDirectRefreshDiscoveryDenominatorCliOptions,
	parseDirectRefreshDiscoveryDenominatorNumeratorJson,
} from "./pipeline/direct-refresh-discovery-denominator";

export { parseDirectRefreshDiscoveryDenominatorCliOptions } from "./pipeline/direct-refresh-discovery-denominator";

export async function writeDirectRefreshDiscoveryDenominatorJson(
	output: string | null,
	report: unknown,
) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) {
		process.stdout.write(serialized);
		return;
	}
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh discovery denominator audit to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshDiscoveryDenominatorCliOptions();
	const candidates = parseDirectRefreshDiscoveryDenominatorCandidatesJson(
		await readFile(options.candidates, "utf8"),
	);
	const numerator = options.numerator
		? parseDirectRefreshDiscoveryDenominatorNumeratorJson(
				await readFile(options.numerator, "utf8"),
			)
		: [];
	const report = buildDirectRefreshDiscoveryDenominatorReport({
		sources: options.sources,
		candidates,
		numerator,
		requestBudget: options.requestBudget,
		sourceBudget: options.sourceBudget,
		issue: options.issue,
	});
	await writeDirectRefreshDiscoveryDenominatorJson(options.output, report);
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
