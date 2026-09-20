import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { dateToIso, decimalToNumber } from "./pipeline/audit-utils";
import type { CmvpTargetManifest } from "./pipeline/cmvp-catalog-gate";
import {
	buildCmvpCatalogSnapshot,
	type CmvpCatalogSnapshotRepository,
	type CmvpSourceIdentityEvidence,
} from "./pipeline/cmvp-catalog-snapshot";

export type CmvpCatalogSnapshotCliOptions = {
	targetManifest: string;
	observedAt: string;
	identityEvidence: string | null;
};

export type CmvpCatalogSnapshotExecutionInput = {
	targetManifest: CmvpTargetManifest;
	repository: CmvpCatalogSnapshotRepository;
	observedAt: string;
	identityEvidence?: CmvpSourceIdentityEvidence[];
};

const ALLOWED_FLAGS = new Set(["--target-manifest", "--observed-at", "--identity-evidence"]);
const FORBIDDEN_FLAGS = [
	"--write",
	"--refresh",
	"--ingest",
	"--migrate",
	"--migration",
	"--schedule",
	"--scheduler",
	"--cron",
	"--source",
	"--network",
];

export function parseCmvpCatalogSnapshotCliOptions(
	argv = process.argv,
): CmvpCatalogSnapshotCliOptions {
	const flags = argv.slice(2);
	const forbidden = flags.find((flag) =>
		FORBIDDEN_FLAGS.some((name) => flag === name || flag.startsWith(`${name}=`)),
	);
	if (forbidden) throw new Error(`CMVP catalog snapshot is read-only and rejects ${forbidden}`);
	for (const flag of flags) {
		const name = flag.split("=", 1)[0];
		if (!ALLOWED_FLAGS.has(name)) throw new Error(`CMVP catalog snapshot is read-only and rejects ${name}`);
	}
	const targetManifest = singleFlag(flags, "--target-manifest");
	const observedAt = singleFlag(flags, "--observed-at");
	const identityEvidence = singleFlag(flags, "--identity-evidence");
	if (!targetManifest) throw new Error("--target-manifest is required");
	if (!observedAt) throw new Error("--observed-at is required");
	return { targetManifest, observedAt, identityEvidence };
}

export function requireDatabaseUrl(environment: Record<string, string | undefined> = process.env) {
	if (!environment.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for the read-only CMVP catalog snapshot");
}

export function createPrismaCmvpCatalogSnapshotRepository(): CmvpCatalogSnapshotRepository {
	return {
		async listOffers({ sources, productEans }) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					product_ean: { in: productEans },
					supermarket: { slug: { in: sources } },
				},
				select: {
					product_ean: true,
					price: true,
					is_available: true,
					last_checked_at: true,
					supermarket: { select: { slug: true } },
				},
			});
			return rows.flatMap((row) => {
				const observedAt = dateToIso(row.last_checked_at);
				if (!observedAt) return [];
				return [{
					source: row.supermarket.slug,
					productEan: row.product_ean,
					available: row.is_available,
					price: decimalToNumber(row.price),
					observedAt,
				}];
			});
		},
	};
}

export function executeCmvpCatalogSnapshot(input: CmvpCatalogSnapshotExecutionInput) {
	return buildCmvpCatalogSnapshot(input);
}

async function main() {
	const options = parseCmvpCatalogSnapshotCliOptions();
	requireDatabaseUrl();
	const targetManifest = JSON.parse(
		await readFile(options.targetManifest, "utf8"),
	) as CmvpTargetManifest;
	const snapshot = await executeCmvpCatalogSnapshot({
		targetManifest,
		repository: createPrismaCmvpCatalogSnapshotRepository(),
		observedAt: options.observedAt,
		identityEvidence: options.identityEvidence
			? JSON.parse(await readFile(options.identityEvidence, "utf8")) as CmvpSourceIdentityEvidence[]
			: [],
	});
	process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

function singleFlag(flags: string[], name: string) {
	const matches = flags.filter((flag) => flag === name || flag.startsWith(`${name}=`));
	if (matches.length > 1) throw new Error(`${name} must appear exactly once`);
	if (matches[0] === name) throw new Error(`${name} requires =value`);
	return matches[0]?.slice(name.length + 1) || null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
