// Search time budget for the daily refresh (#568). More batches per run widen
// the day's coverage, but the cloud job has a hard 60-minute timeout and the
// EAN top-up and the snapshot still have to run after the searches. Once the
// searches have spent their budget, the remaining batches are skipped (not
// failed): the rotation reaches those categories on another day, and the
// top-up still re-reads every known offer the searches did not observe.

export const DEFAULT_SEARCH_BUDGET_MINUTES = 25;
const MAX_SEARCH_BUDGET_MINUTES = 45;

export function searchBudgetMs(value = process.env.REFRESH_SEARCH_BUDGET_MINUTES): number {
  const minutes = Number(value);
  const valid = value !== undefined && value.trim() !== "" && Number.isFinite(minutes) && minutes > 0;
  return Math.min(valid ? minutes : DEFAULT_SEARCH_BUDGET_MINUTES, MAX_SEARCH_BUDGET_MINUTES) * 60_000;
}

export function searchBudgetSpent(startedAtMs: number, nowMs: number, budgetMs: number): boolean {
  return nowMs - startedAtMs >= budgetMs;
}
