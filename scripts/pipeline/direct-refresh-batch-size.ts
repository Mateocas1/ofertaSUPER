export const DIRECT_REFRESH_ALLOWED_BATCH_COUNTS = [10, 25, 50] as const;

export type DirectRefreshAllowedBatchCount =
	(typeof DIRECT_REFRESH_ALLOWED_BATCH_COUNTS)[number];

export function isDirectRefreshAllowedBatchCount(
	count: number,
): count is DirectRefreshAllowedBatchCount {
	return DIRECT_REFRESH_ALLOWED_BATCH_COUNTS.includes(
		count as DirectRefreshAllowedBatchCount,
	);
}

export function assertDirectRefreshAllowedBatchCount(
	count: number,
	context = "direct-refresh batch count",
): DirectRefreshAllowedBatchCount {
	if (!isDirectRefreshAllowedBatchCount(count)) {
		throw new Error(
			`${context} must be one of ${DIRECT_REFRESH_ALLOWED_BATCH_COUNTS.join(", ")}`,
		);
	}
	return count;
}

export function directRefreshConfirmationToken(source: string, count: number) {
	return `${source}-direct-refresh-count${count}`;
}
