import type { CandidateWriteMode } from "./candidate-snapshot";

export type IngestRunAggregateChunk = {
	status: "PASS" | "FAIL";
	mode: "post-write" | "rollback" | string;
	runId: number;
	source: string;
	writeMode: CandidateWriteMode | string;
	touchedEans: string[];
	warnings: string[];
	createdRows: {
		newProducts: number;
		supermarketProductsCreated: number;
	};
};

export type IngestRunAggregateReport = {
	schemaVersion: 1;
	audit: "ingest-run-aggregate";
	status: "PASS";
	writeMode: CandidateWriteMode;
	source: string;
	chunkCount: number;
	runIds: number[];
	touchedEans: string[];
	totals: {
		touchedEans: number;
		newProducts: number;
		supermarketProductsCreated: number;
	};
	warnings: string[];
};

function duplicates(values: string[]) {
	const seen = new Set<string>();
	const duplicateValues = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			duplicateValues.add(value);
		} else {
			seen.add(value);
		}
	}

	return Array.from(duplicateValues).sort();
}

function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}

function isNonNegativeFiniteNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasCompleteCreatedRowsEvidence(chunk: IngestRunAggregateChunk) {
	return (
		chunk.createdRows &&
		isNonNegativeFiniteNumber(chunk.createdRows.newProducts) &&
		isNonNegativeFiniteNumber(chunk.createdRows.supermarketProductsCreated)
	);
}

export function buildIngestRunAggregateReport({
	chunks,
	writeMode,
	allowMixedSources = false,
}: {
	chunks: IngestRunAggregateChunk[];
	writeMode: CandidateWriteMode;
	allowMixedSources?: boolean;
}): IngestRunAggregateReport {
	if (chunks.length === 0) {
		throw new Error("aggregate audit requires at least one chunk audit");
	}

	if (
		chunks.some(
			(chunk) => chunk.status !== "PASS" || chunk.mode !== "post-write",
		)
	) {
		throw new Error("all aggregate chunks must be PASS post-write audits");
	}

	const missingWriteMode = chunks.some(
		(chunk) => chunk.writeMode !== writeMode,
	);

	if (missingWriteMode) {
		throw new Error(
			"all aggregate chunks must include matching writeMode evidence",
		);
	}

	if (chunks.some((chunk) => !hasCompleteCreatedRowsEvidence(chunk))) {
		throw new Error(
			"all aggregate chunks must include complete numeric createdRows evidence",
		);
	}

	const sources = uniqueSorted(chunks.map((chunk) => chunk.source));

	if (!allowMixedSources && sources.length !== 1) {
		throw new Error(
			`mixed sources are not allowed in one aggregate audit: ${sources.join(",")}`,
		);
	}

	const touchedEansWithDuplicates = chunks.flatMap(
		(chunk) => chunk.touchedEans,
	);
	const duplicateEans = duplicates(touchedEansWithDuplicates);

	if (duplicateEans.length > 0) {
		throw new Error(
			`duplicate touched EANs across chunks: ${duplicateEans.join(",")}`,
		);
	}

	const newProducts = chunks.reduce(
		(total, chunk) => total + chunk.createdRows.newProducts,
		0,
	);
	const supermarketProductsCreated = chunks.reduce(
		(total, chunk) => total + chunk.createdRows.supermarketProductsCreated,
		0,
	);

	if (
		writeMode === "refresh-existing" &&
		(newProducts > 0 || supermarketProductsCreated > 0)
	) {
		throw new Error(
			`refresh-existing aggregate requires zero created rows: newProducts=${newProducts} supermarketProductsCreated=${supermarketProductsCreated}`,
		);
	}

	return {
		schemaVersion: 1,
		audit: "ingest-run-aggregate",
		status: "PASS",
		writeMode,
		source: sources.join(","),
		chunkCount: chunks.length,
		runIds: chunks
			.map((chunk) => chunk.runId)
			.sort((left, right) => left - right),
		touchedEans: uniqueSorted(touchedEansWithDuplicates),
		totals: {
			touchedEans: touchedEansWithDuplicates.length,
			newProducts,
			supermarketProductsCreated,
		},
		warnings: chunks.flatMap((chunk) => chunk.warnings).sort(),
	};
}
