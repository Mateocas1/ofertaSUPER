import { compareExpectedEans } from "../ingest-options";

type CandidateStatus = "PENDING" | "REJECTED" | string;

type PreReconcileCandidate = {
	ean: string;
	price: number | null;
	status: CandidateStatus;
};

export type PreReconcileSourceExecution = {
	runId?: number;
	candidateHash?: string | null;
	summary: {
		slug: string;
		status: string;
		queriesSent: number;
		productsRejected: number;
	};
	candidates: PreReconcileCandidate[];
};

export type Phase4PreReconcileGateOptions = {
	expectedEans: string[];
	executions: PreReconcileSourceExecution[];
};

export type ChunkPreReconcileGateOptions = {
	expectedEans: string[];
	executions: PreReconcileSourceExecution[];
	expectedQueryCount?: number;
	expectedCandidateHash?: string | null;
};

const PHASE_4_EXPECTED_EAN_COUNT = 5;

function formatList(values: string[]) {
	return values.length > 0 ? values.join(",") : "none";
}

export function assertChunkPreReconcileGate({
	expectedEans,
	executions,
	expectedQueryCount = 1,
	expectedCandidateHash = null,
}: ChunkPreReconcileGateOptions) {
	if (expectedEans.length === 0) {
		throw new Error("expected at least one expected EAN before reconciliation");
	}

	const expectedComparison = compareExpectedEans(expectedEans, expectedEans);

	if (expectedComparison.duplicateExpected.length > 0) {
		throw new Error(
			`expected distinct EAN allowlist before reconciliation: duplicate=${formatList(expectedComparison.duplicateExpected)}`,
		);
	}

	if (executions.length !== 1) {
		throw new Error("expected exactly one source before reconciliation");
	}

	const [execution] = executions;

	if (!execution || execution.summary.queriesSent !== expectedQueryCount) {
		throw new Error(
			expectedQueryCount === 1
				? "expected exactly one query before reconciliation"
				: `expected exactly ${expectedQueryCount} queries before reconciliation`,
		);
	}

	if (
		expectedCandidateHash &&
		execution.candidateHash !== expectedCandidateHash
	) {
		throw new Error(
			`candidate hash mismatch before reconciliation: expected=${expectedCandidateHash} actual=${execution.candidateHash ?? "none"}`,
		);
	}

	if (execution.summary.productsRejected !== 0) {
		throw new Error("expected zero rejected candidates before reconciliation");
	}

	if (execution.candidates.length !== expectedEans.length) {
		throw new Error(
			`expected exactly ${expectedEans.length} candidates before reconciliation`,
		);
	}

	const actualEans = execution.candidates.map((candidate) => candidate.ean);
	const actualDistinctEans = new Set(actualEans);

	if (actualDistinctEans.size !== expectedEans.length) {
		throw new Error(
			`expected ${expectedEans.length} distinct actual EANs before reconciliation`,
		);
	}

	for (const candidate of execution.candidates) {
		if (candidate.status !== "PENDING") {
			throw new Error(
				"expected all candidates to be PENDING before reconciliation",
			);
		}

		if (
			candidate.price === null ||
			!Number.isFinite(candidate.price) ||
			candidate.price <= 0
		) {
			throw new Error(
				`expected positive non-null price for EAN ${candidate.ean} before reconciliation`,
			);
		}
	}

	const comparison = compareExpectedEans(expectedEans, actualEans);

	if (!comparison.ok) {
		throw new Error(
			`expected EAN mismatch: missing=${formatList(comparison.missing)} extra=${formatList(comparison.extra)} duplicateExpected=${formatList(comparison.duplicateExpected)} duplicateActual=${formatList(comparison.duplicateActual)}`,
		);
	}
}

export function assertPhase4PreReconcileGate({
	expectedEans,
	executions,
}: Phase4PreReconcileGateOptions) {
	if (expectedEans.length !== PHASE_4_EXPECTED_EAN_COUNT) {
		throw new Error("expected exactly 5 expected EANs before reconciliation");
	}

	assertChunkPreReconcileGate({ expectedEans, executions });
}
