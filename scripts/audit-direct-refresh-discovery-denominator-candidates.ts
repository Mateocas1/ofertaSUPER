import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getSupermarketBySlug } from "@/lib/supermarkets";
import type { NormalizedProduct } from "@/lib/vtex/normalize";

import {
	buildDirectRefreshDiscoveryDenominatorCandidateSnapshot,
	defaultDirectRefreshDiscoveryDenominatorCandidateOutputPath,
	fetchDirectRefreshDiscoveryDenominatorCandidatesByKnownIdentity,
	parseDirectRefreshDiscoveryDenominatorCandidateCliOptions,
	type DirectRefreshDiscoveryDenominatorCandidateSnapshot,
} from "./pipeline/direct-refresh-discovery-denominator-candidates";
import type { DirectLookup } from "@/lib/ingestion/adapters/types";

export { parseDirectRefreshDiscoveryDenominatorCandidateCliOptions } from "./pipeline/direct-refresh-discovery-denominator-candidates";

export async function writeDirectRefreshDiscoveryDenominatorCandidateJson(
	output: string | null,
	snapshot: DirectRefreshDiscoveryDenominatorCandidateSnapshot,
) {
	const target = output ?? defaultDirectRefreshDiscoveryDenominatorCandidateOutputPath();
	const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, serialized, "utf8");
	process.stdout.write(
		`Wrote direct-refresh discovery denominator candidates to ${target}\n`,
	);
	return target;
}

async function readInputProducts(input: string) {
	const raw = await readFile(input, "utf8");
	const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
	const products = Array.isArray(parsed)
		? parsed
		: (parsed as { products?: unknown[] }).products ?? [];
	return { raw, products: products as NormalizedProduct[] };
}

async function main() {
	const options = parseDirectRefreshDiscoveryDenominatorCandidateCliOptions();
	const fetchedAt = new Date();
	const supermarket = getSupermarketBySlug(options.source);
	const input = await readCandidateInput({
		options,
		baseUrl: supermarket.baseUrl,
	});
	const snapshot = buildDirectRefreshDiscoveryDenominatorCandidateSnapshot({
		products: input.products,
		source: options.source,
		fetchedAt,
		requestBudget: options.requestBudget,
		sourceBudget: options.sourceBudget,
		issue: options.issue,
		artifactRaw: input.raw,
		surface: input.surface,
	});
	await writeDirectRefreshDiscoveryDenominatorCandidateJson(options.output, snapshot);
	if (snapshot.failClosedReasons.length > 0) process.exitCode = 1;
}

async function readCandidateInput({
	options,
	baseUrl,
}: {
	options: ReturnType<typeof parseDirectRefreshDiscoveryDenominatorCandidateCliOptions>;
	baseUrl: string;
}) {
	if (options.input) {
		return {
			...(await readInputProducts(options.input)),
			surface: "input-artifact" as const,
		};
	}
	if (options.lookups.length > 0) {
		return {
			raw: undefined,
			products: await fetchDirectRefreshDiscoveryDenominatorCandidatesByKnownIdentity({
				source: options.source,
				lookups: options.lookups,
				fetchDirectProducts: fetchVeaDirectProducts,
			}),
			surface: "direct-catalog-lookup" as const,
		};
	}
	return {
		raw: undefined,
		products: (
			await Promise.all(
				options.terms.map((term) =>
					fetchVeaProducts({
						baseUrl,
						query: term,
						count: options.sourceBudget,
					}),
				),
			)
		).flat(),
		surface: "product-suggestions" as const,
	};
}

async function fetchVeaProducts(options: {
	baseUrl: string;
	query: string;
	count: number;
}) {
	const { fetchVtexProducts } = await import("@/lib/vtex/client");
	return fetchVtexProducts(options);
}

async function fetchVeaDirectProducts(_source: "vea", lookup: DirectLookup) {
	const { getSourceAdapter } = await import("../src/lib/ingestion/adapters/registry");
	return getSourceAdapter("vea").fetchDirectProducts(lookup, { retries: 1 });
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
