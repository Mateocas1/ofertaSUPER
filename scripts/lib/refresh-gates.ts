// Daily refresh publication gates, extracted from scripts/refresh-catalog.ts so
// the gate -> exit-code mapping is unit-testable on its own. The cloud workflow
// and the local cron share this decision: a run that trips any gate must not
// publish, and it must fail with a non-zero exit code.

export const FRESHNESS_FLOOR_PERCENT = 90;
export const SOURCE_READ_FAILURE_RATIO = 0.2;

// A discovered category whose search returns nothing (even after the
// compact-term fallback) is tolerated: the store tree names it, but today it
// has nothing searchable. Many empty categories at once mean the search itself
// broke, so the run fails above max(2, 10% of the planned batches).
export const EMPTY_BATCH_RATIO = 0.1;
export const EMPTY_BATCH_FLOOR = 2;

export function emptyBatchTolerance(plannedBatches: number): number {
  return Math.max(EMPTY_BATCH_FLOOR, Math.floor(Math.max(0, plannedBatches) * EMPTY_BATCH_RATIO));
}

export type SourceReadCounts = {
  slug: string;
  readsOk: number;
  readsFailed: number;
};

export type FreshnessEntry = {
  slug: string;
  under24hPercent: number;
};

export type RefreshGateInput = {
  failedBatches: number;
  /** Discovered batches whose search returned no product (tolerated up to emptyBatchTolerance). */
  emptyBatches?: number;
  plannedBatches?: number;
  freshness: FreshnessEntry[];
  sourceReads: SourceReadCounts[];
};

export type RefreshGateVerdict = {
  ok: boolean;
  exitCode: 0 | 1;
  worstFreshnessPercent: number;
  offendingSource: string | null;
  message: string | null;
};

// No freshness rows means there is nothing fresh to publish, so the run fails
// closed instead of treating an empty catalog as publishable.
export function worstFreshnessPercent(freshness: FreshnessEntry[]): number {
  if (freshness.length === 0) return 0;
  return Math.min(...freshness.map((entry) => entry.under24hPercent));
}

export function findSourceReadFailure(sourceReads: SourceReadCounts[]): SourceReadCounts | null {
  return (
    sourceReads.find(({ readsOk, readsFailed }) => {
      const total = readsOk + readsFailed;
      return total > 0 && readsFailed / total > SOURCE_READ_FAILURE_RATIO;
    }) ?? null
  );
}

function emptyBatchCheck(input: RefreshGateInput) {
  const count = Math.max(0, Math.trunc(input.emptyBatches ?? 0));
  const limit = emptyBatchTolerance(input.plannedBatches ?? 0);
  return { count, limit, exceeded: count > limit };
}

export function evaluateRefreshGates(input: RefreshGateInput): RefreshGateVerdict {
  const failedBatches = Math.max(0, Math.trunc(input.failedBatches));
  const worstFreshness = worstFreshnessPercent(input.freshness);
  const offendingSource = findSourceReadFailure(input.sourceReads);
  const empty = emptyBatchCheck(input);
  const ok = failedBatches === 0 && !empty.exceeded && worstFreshness >= FRESHNESS_FLOOR_PERCENT && offendingSource === null;

  if (ok) {
    return {
      ok,
      exitCode: 0,
      worstFreshnessPercent: worstFreshness,
      offendingSource: null,
      message: null,
    };
  }

  const message = `failedBatches=${failedBatches}, worstFreshness=${worstFreshness}%${
    empty.exceeded ? `, emptyBatches=${empty.count}>${empty.limit}` : ""
  }${offendingSource ? `, sourceReadFailures=${offendingSource.slug}` : ""}`;
  return {
    ok,
    exitCode: 1,
    worstFreshnessPercent: worstFreshness,
    offendingSource: offendingSource?.slug ?? null,
    message,
  };
}
