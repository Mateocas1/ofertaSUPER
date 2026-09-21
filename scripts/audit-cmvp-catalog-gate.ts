import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildCmvpCatalogGateReport,
	type CmvpCatalogSnapshot,
	type CmvpPriorCycle,
	type CmvpTargetManifest,
} from "./pipeline/cmvp-catalog-gate";

type CliOptions = {
	targetManifest: string;
	snapshot: string;
	priorCycle: string | null;
};

export function parseCmvpCatalogGateCliOptions(argv = process.argv): CliOptions {
	const flags = argv.slice(2);
	const allowed = new Set(["--target-manifest", "--snapshot", "--prior-cycle"]);
	for (const flag of flags) {
		const name = flag.split("=", 1)[0];
		if (!allowed.has(name)) throw new Error(`CMVP catalog gate is read-only and accepts exactly --target-manifest, --snapshot, and optional --prior-cycle; rejected ${name}`);
	}
	const targetManifest = singleFlag(flags, "--target-manifest");
	const snapshot = singleFlag(flags, "--snapshot");
	if (!targetManifest) throw new Error("--target-manifest is required");
	if (!snapshot) throw new Error("--snapshot is required");
	return { targetManifest, snapshot, priorCycle: singleFlag(flags, "--prior-cycle") };
}

async function readJson(path: string) {
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main() {
	const options = parseCmvpCatalogGateCliOptions();
	const report = buildCmvpCatalogGateReport({
		targetManifest: (await readJson(options.targetManifest)) as CmvpTargetManifest,
		snapshot: (await readJson(options.snapshot)) as CmvpCatalogSnapshot,
		priorCycle: options.priorCycle ? (await readJson(options.priorCycle)) as CmvpPriorCycle : null,
	});
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	if (report.status === "FAIL") process.exitCode = 1;
}

function singleFlag(flags: string[], name: string) {
	const matches = flags.filter((flag) => flag === name || flag.startsWith(`${name}=`));
	if (matches.length > 1) throw new Error(`${name} must appear exactly once`);
	if (matches[0] === name) throw new Error(`${name} requires =path`);
	return matches[0]?.slice(name.length + 1) || null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
