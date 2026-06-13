import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256,
	evaluateDirectRefreshDiscoveryPrewriteFoundation,
	parseDirectRefreshDiscoveryPrewriteFoundationCliOptions,
	parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson,
} from "./pipeline/direct-refresh-discovery-prewrite-foundation";

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh discovery prewrite foundation audit to ${output}\n`,
	);
}

async function main() {
	const options = parseDirectRefreshDiscoveryPrewriteFoundationCliOptions();
	const rawEvidence = await readFile(options.evidence, "utf8");
	const evidence = parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson(
		rawEvidence,
	);
	const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
		evidence,
		evidencePath: options.evidence,
		evidenceSha256:
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidence,
			),
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
