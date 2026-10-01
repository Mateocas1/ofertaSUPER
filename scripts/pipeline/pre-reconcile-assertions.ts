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

function assertDistinctExpectedEans(expectedEans: string[]) {
	if (expectedEans.length === 0) {
		throw new Error("expected at least one expected EAN before reconciliation");
	}

	const expectedComparison = compareExpectedEans(expectedEans, expectedEans);

	if (expectedComparison.duplicateExpected.length > 0) {
		throw new Error(
			`expected distinct EAN allowlist before reconciliation: duplicate=${formatList(expectedComparison.duplicateExpected)}`,
		);
	}
}

function singleExecution(
	executions: PreReconcileSourceExecution[],
	expectedQueryCount: number,
): PreReconcileSourceExecution {
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

	return execution;
}

function assertExecutionSummary(
	execution: PreReconcileSourceExecution,
	expectedCandidateHash: string | null,
) {
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
}

function assertCandidateSet(execution: PreReconcileSourceExecution, expectedEans: string[]) {
	if (execution.candidates.length !== expectedEans.length) {
		throw new Error(
			`expected exactly ${expectedEans.length} candidates before reconciliation`,
		);
	}

	const actualDistinctEans = new Set(
		execution.candidates.map((candidate) => candidate.ean),
	);

	if (actualDistinctEans.size !== expectedEans.length) {
		throw new Error(
			`expected ${expectedEans.length} distinct actual EANs before reconciliation`,
		);
	}
}

function assertCandidatesUsable(candidates: PreReconcileCandidate[]) {
	for (const candidate of candidates) {
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
}

export function assertChunkPreReconcileGate({
	expectedEans,
	executions,
	expectedQueryCount = 1,
	expectedCandidateHash = null,
}: ChunkPreReconcileGateOptions) {
	assertDistinctExpectedEans(expectedEans);
	const execution = singleExecution(executions, expectedQueryCount);
	assertExecutionSummary(execution, expectedCandidateHash);
	assertCandidateSet(execution, expectedEans);
	assertCandidatesUsable(execution.candidates);

	const comparison = compareExpectedEans(
		expectedEans,
		execution.candidates.map((candidate) => candidate.ean),
	);

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
