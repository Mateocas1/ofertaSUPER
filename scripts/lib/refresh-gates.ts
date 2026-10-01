// Daily refresh publication gates, extracted from scripts/refresh-catalog.ts so
// the gate -> exit-code mapping is unit-testable on its own. The cloud workflow
// and the local cron share this decision: a run that trips any gate must not
// publish, and it must fail with a non-zero exit code.

export const FRESHNESS_FLOOR_PERCENT = 90;
export const SOURCE_READ_FAILURE_RATIO = 0.2;

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

export function evaluateRefreshGates(input: RefreshGateInput): RefreshGateVerdict {
  const failedBatches = Math.max(0, Math.trunc(input.failedBatches));
  const worstFreshness = worstFreshnessPercent(input.freshness);
  const offendingSource = findSourceReadFailure(input.sourceReads);
  const ok = failedBatches === 0 && worstFreshness >= FRESHNESS_FLOOR_PERCENT && offendingSource === null;

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
    offendingSource ? `, sourceReadFailures=${offendingSource.slug}` : ""
  }`;
  return {
    ok,
    exitCode: 1,
    worstFreshnessPercent: worstFreshness,
    offendingSource: offendingSource?.slug ?? null,
    message,
  };
}
