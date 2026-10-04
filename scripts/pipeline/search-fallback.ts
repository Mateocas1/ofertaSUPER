import { fallbackSearchTerms } from "../../src/lib/discovery/category-plan";

// Option 2 of the empty-category fix: a discovered refresh batch whose
// category name returns nothing retries with the name's meaningful words. The
// first word that returns products wins; the rest are not searched, so a
// batch never sends more than 1 + MAX_FALLBACK_TERMS queries. A batch that
// returned anything on its first search never falls back, and a frozen-plan
// batch (refresh=false) never does either: its term is a pinned contract.

export type StagedSearch = { productsFetched: number; queriesSent: number };

export type FallbackStageResult<T extends StagedSearch> = {
  result: T;
  searchedTerm: string;
  attemptedTerms: string[];
  queriesSent: number;
};

export async function stageWithFallbackTerms<T extends StagedSearch>({
  term,
  refresh,
  stage,
}: {
  term: string;
  refresh: boolean;
  stage: (term: string) => Promise<T>;
}): Promise<FallbackStageResult<T>> {
  let result = await stage(term);
  let searchedTerm = term;
  let queriesSent = result.queriesSent;
  const attemptedTerms = [term];
  if (!refresh || result.productsFetched > 0) return { result, searchedTerm, attemptedTerms, queriesSent };

  for (const fallback of fallbackSearchTerms(term)) {
    const retry = await stage(fallback);
    attemptedTerms.push(fallback);
    queriesSent += retry.queriesSent;
    result = retry;
    searchedTerm = fallback;
    if (retry.productsFetched > 0) break;
  }
  return { result, searchedTerm, attemptedTerms, queriesSent };
}
