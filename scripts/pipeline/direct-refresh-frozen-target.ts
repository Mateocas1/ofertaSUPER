import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { normalizeGtin } from "../../src/lib/identity/gtin";
import { getOptionalSingleFlag } from "./audit-utils";

export type DirectRefreshFrozenTargetInput = {
	raw: string;
	expectedSha256: string;
};
export type DirectRefreshFrozenTargetEvidence = {
	manifestSha256: string;
	targetFingerprint: string;
	targetCount: 500;
	selectedEans: string[];
};
type FrozenTarget = Omit<DirectRefreshFrozenTargetEvidence, "selectedEans"> & {
	eans: readonly string[];
};

// Pin the exact file bytes as well as the CMVP catalog's identity fingerprint.
// No implicit artifact path or fallback to an unfiltered query is permitted.
export function parseDirectRefreshFrozenTarget(input: DirectRefreshFrozenTargetInput): FrozenTarget {
	const manifestSha256 = createHash("sha256").update(input.raw).digest("hex");
	if (!/^[a-f0-9]{64}$/.test(input.expectedSha256) || manifestSha256 !== input.expectedSha256) {
		throw new Error("frozen target manifest digest mismatch or invalid expected digest");
	}
	let manifest;
	try { manifest = JSON.parse(input.raw); }
	catch { throw new Error("invalid frozen target manifest JSON"); }
	if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.cycleId !== "string" || !manifest.cycleId.trim() ||
		typeof manifest.frozenAt !== "string" || !Number.isFinite(Date.parse(manifest.frozenAt)) ||
		!Array.isArray(manifest.products) || manifest.products.length !== 500) {
		throw new Error("frozen target manifest requires exactly 500 products and valid frozen metadata");
	}
	const ids = new Set<string>();
	const eans = new Set<string>();
	const products = manifest.products.map((product: Record<string, unknown> | null) => {
		const ean = typeof product?.ean === "string" ? normalizeGtin(product.ean) : null;
		if (!product || product.useful !== true || typeof product.targetId !== "string" || !product.targetId.trim() ||
			!ean || eans.has(ean) || ids.has(product.targetId)) {
			throw new Error("invalid or duplicate frozen target identity; requires 500 unique checksum GTINs");
		}
		for (const field of ["pack", "quantity", "measurementUnit", "variant"]) {
			if (product[field] !== null && typeof product[field] !== "string") {
				throw new Error(`invalid frozen target ${field}`);
			}
		}
		ids.add(product.targetId);
		eans.add(ean);
		return { targetId: product.targetId, ean: product.ean, pack: product.pack,
			quantity: product.quantity, measurementUnit: product.measurementUnit, variant: product.variant };
	});
	products.sort((left: { targetId: string }, right: { targetId: string }) => left.targetId.localeCompare(right.targetId));
	return {
		manifestSha256,
		targetFingerprint: createHash("sha256").update(JSON.stringify(products)).digest("hex"),
		targetCount: 500,
		eans: Object.freeze([...eans].sort()),
	};
}

export function assertFrozenTargetMembership(target: FrozenTarget | null, eans: Array<string | null>) {
	if (target && eans.some((ean) => ean === null || !target.eans.includes(ean))) {
		throw new Error("selected row is outside frozen target; refusing direct lookup/prewrite");
	}
}

export function frozenTargetEvidence(target: FrozenTarget, selectedEans: Array<string | null>): DirectRefreshFrozenTargetEvidence {
	assertFrozenTargetMembership(target, selectedEans);
	return {
		manifestSha256: target.manifestSha256,
		targetFingerprint: target.targetFingerprint,
		targetCount: target.targetCount,
		selectedEans: [...new Set(selectedEans as string[])].sort(),
	};
}

export function parseFrozenTargetFlags(argv: string[]): {
	frozenTargetManifest?: string;
	frozenTargetSha256?: string;
} {
	for (const flag of ["--frozen-target-manifest", "--frozen-target-sha256"]) {
		if (argv.includes(flag)) throw new Error(`${flag} requires an explicit =value`);
	}
	const frozenTargetManifest = getOptionalSingleFlag(argv, "--frozen-target-manifest");
	const frozenTargetSha256 = getOptionalSingleFlag(argv, "--frozen-target-sha256");
	if (frozenTargetManifest !== null || frozenTargetSha256 !== null) {
		if (!frozenTargetManifest?.trim() || !frozenTargetSha256 || !/^[a-f0-9]{64}$/.test(frozenTargetSha256)) {
			throw new Error("frozen target mode requires --frozen-target-manifest=... and --frozen-target-sha256=<64 lowercase hex>");
		}
	}
	return frozenTargetManifest !== null && frozenTargetSha256 !== null
		? { frozenTargetManifest, frozenTargetSha256 }
		: {};
}

export async function readDirectRefreshFrozenTarget(options: ReturnType<typeof parseFrozenTargetFlags>): Promise<DirectRefreshFrozenTargetInput | null> {
	if (options.frozenTargetManifest === undefined) return null;
	const input = { raw: await readFile(options.frozenTargetManifest, "utf8"), expectedSha256: options.frozenTargetSha256 ?? "" };
	parseDirectRefreshFrozenTarget(input);
	return input;
}
