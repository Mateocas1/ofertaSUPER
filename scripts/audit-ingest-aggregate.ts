import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	buildIngestRunAggregateReport,
	type IngestRunAggregateChunk,
} from "./pipeline/ingest-run-aggregate-audit";
import type { CandidateWriteMode } from "./pipeline/candidate-snapshot";

type CliOptions = {
	chunks: string[];
	writeMode: CandidateWriteMode;
	allowMixedSources: boolean;
	output: string | null;
};

function readFlagValues(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv
		.filter((value) => value.startsWith(prefix))
		.map((value) => value.slice(prefix.length));
}

function readOptionalSingleFlag(argv: string[], flagName: string) {
	const values = readFlagValues(argv, flagName);

	if (values.length > 1) {
		throw new Error(`aggregate audit accepts at most one ${flagName}=... flag`);
	}

	return values[0] ?? null;
}

function hasFlag(argv: string[], flagName: string) {
	return argv.includes(flagName);
}

function rejectWriteFlags(argv: string[]) {
	const forbidden = [
		"--confirm-write",
		"--active",
		"--write",
		"--reconcile",
		"--purge-cache",
	];
	const found = argv.find((entry) =>
		forbidden.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);

	if (found) {
		throw new Error(`aggregate audit is read-only and rejects ${found}`);
	}
}

function parseWriteMode(argv: string[]): CandidateWriteMode {
	const raw =
		readOptionalSingleFlag(argv, "--write-mode") ?? "refresh-existing";

	if (raw === "phase4-count5" || raw === "refresh-existing") {
		return raw;
	}

	throw new Error(
		"aggregate audit requires --write-mode=phase4-count5 or --write-mode=refresh-existing",
	);
}

export function parseIngestAggregateCliOptions(
	argv = process.argv,
): CliOptions {
	rejectWriteFlags(argv);
	const chunks = readFlagValues(argv, "--chunk");

	if (chunks.length === 0) {
		throw new Error(
			"aggregate audit requires at least one --chunk=path.json flag",
		);
	}

	return {
		chunks,
		writeMode: parseWriteMode(argv),
		allowMixedSources: hasFlag(argv, "--allow-mixed-sources"),
		output: readOptionalSingleFlag(argv, "--output"),
	};
}

async function readChunks(paths: string[]) {
	return Promise.all(
		paths.map(
			async (path) =>
				JSON.parse(await readFile(path, "utf8")) as IngestRunAggregateChunk,
		),
	);
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;

	if (!output) {
		process.stdout.write(serialized);
		return;
	}

	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote ingest aggregate audit to ${output}\n`);
}

async function main() {
	const options = parseIngestAggregateCliOptions();
	const report = buildIngestRunAggregateReport({
		chunks: await readChunks(options.chunks),
		writeMode: options.writeMode,
		allowMixedSources: options.allowMixedSources,
	});

	await writeJson(options.output, report);
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
