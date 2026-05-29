import { createHash } from "node:crypto";

import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import type { CandidateAudit } from "./candidate-audit";

export type CandidateWriteMode = "phase4-count5" | "refresh-existing";

export type CandidateSnapshotHashInput = {
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	writeMode: CandidateWriteMode;
	candidates: NormalizedProduct[];
};

export type CandidateRollbackPlan = {
	schemaVersion: 1;
	requiresConfirmation: true;
	generatedFromSnapshotAt: string;
	source: string;
	term: string;
	writeMode: CandidateWriteMode;
	touchedEans: string[];
	restoreProducts: CandidateAudit["snapshots"]["products"];
	restoreSupermarketProducts: CandidateAudit["snapshots"]["supermarketProducts"];
	priceHistory: {
		deleteRowsWithIdGreaterThan: number | null;
		restoreLatestRows: CandidateAudit["snapshots"]["priceHistory"]["latest"];
	};
};

function normalizeNumber(value: number | null) {
	return value === null ? null : Number(value.toFixed(4));
}

function normalizeCandidate(candidate: NormalizedProduct) {
	return {
		ean: candidate.ean,
		name: candidate.name,
		brand: candidate.brand,
		description: candidate.description,
		imageUrl: candidate.imageUrl,
		images: [...candidate.images].sort(),
		category: candidate.category,
		skuId: candidate.skuId,
		sellerId: candidate.sellerId,
		productUrl: candidate.productUrl,
		price: normalizeNumber(candidate.price),
		listPrice: normalizeNumber(candidate.listPrice),
		referencePrice: normalizeNumber(candidate.referencePrice),
		referenceUnit: candidate.referenceUnit,
		isAvailable: candidate.isAvailable,
	};
}

function buildCandidateSnapshotPayload({
	source,
	term,
	count,
	queryLimit,
	writeMode,
	candidates,
}: CandidateSnapshotHashInput) {
	return {
		schemaVersion: 1,
		source,
		term,
		count,
		queryLimit,
		writeMode,
		candidateEans: candidates.map((candidate) => candidate.ean).sort(),
		candidates: candidates
			.map(normalizeCandidate)
			.toSorted((left, right) => left.ean.localeCompare(right.ean)),
	};
}

export function buildCandidateSnapshotHash(input: CandidateSnapshotHashInput) {
	return createHash("sha256")
		.update(JSON.stringify(buildCandidateSnapshotPayload(input)))
		.digest("hex");
}

export function buildCandidateRollbackPlan(
	audit: CandidateAudit,
): CandidateRollbackPlan {
	return {
		schemaVersion: 1,
		requiresConfirmation: true,
		generatedFromSnapshotAt: audit.createdAt,
		source: audit.source,
		term: audit.term,
		writeMode: audit.writeMode,
		touchedEans: [...audit.candidateEans].sort(),
		restoreProducts: [...audit.snapshots.products].sort((left, right) =>
			left.ean.localeCompare(right.ean),
		),
		restoreSupermarketProducts: [...audit.snapshots.supermarketProducts].sort(
			(left, right) => left.productEan.localeCompare(right.productEan),
		),
		priceHistory: {
			deleteRowsWithIdGreaterThan: audit.snapshots.priceHistory.maxId,
			restoreLatestRows: [...audit.snapshots.priceHistory.latest].sort(
				(left, right) => left.supermarketProductId - right.supermarketProductId,
			),
		},
	};
}
