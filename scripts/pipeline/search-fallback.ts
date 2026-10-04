import { fallbackSearchTerms } from "../../src/lib/discovery/category-plan";

// The search attempts of one batch, tried in order until one returns products:
// 1. the VTEX category itself (`fq=C:/<department>/<category>/`), when the
//    discovered plan knows its path — exact, and independent of how the
//    category is named;
// 2. the category name as full text;
// 3. up to MAX_FALLBACK_TERMS meaningful words of the name, one at a time
//    ("Bañaderas, Cambiadores y Pelelas" as one phrase can match nothing).
// A batch that returned anything stops there. A frozen-plan batch
// (refresh=false) only ever searches its term: it is a pinned contract.

export type SearchAttempt = { term: string; categoryPath?: string };

export type StagedSearch = { productsFetched: number; queriesSent: number };

export type FallbackStageResult<T extends StagedSearch> = {
  result: T;
  searchedTerm: string;
  attemptedTerms: string[];
  queriesSent: number;
};

export function searchAttempts({ term, categoryPath, refresh }: { term: string; categoryPath?: string; refresh: boolean }): SearchAttempt[] {
  if (!refresh) return [{ term }];
  return [
    ...(categoryPath ? [{ term, categoryPath }] : []),
    { term },
    ...fallbackSearchTerms(term).map((word) => ({ term: word })),
  ];
}

export function attemptLabel(attempt: SearchAttempt) {
  return attempt.categoryPath ? `category ${attempt.categoryPath}` : attempt.term;
}

export async function stageWithFallbackTerms<T extends StagedSearch>({
  term,
  categoryPath,
  refresh,
  stage,
}: {
  term: string;
  categoryPath?: string;
  refresh: boolean;
  stage: (attempt: SearchAttempt) => Promise<T>;
}): Promise<FallbackStageResult<T>> {
  const [first, ...rest] = searchAttempts({ term, categoryPath, refresh });
  let result = await stage(first!);
  let searchedTerm = attemptLabel(first!);
  let queriesSent = result.queriesSent;
  const attemptedTerms = [searchedTerm];

  for (const attempt of rest) {
    if (result.productsFetched > 0) break;
    result = await stage(attempt);
    searchedTerm = attemptLabel(attempt);
    attemptedTerms.push(searchedTerm);
    queriesSent += result.queriesSent;
  }
  return { result, searchedTerm, attemptedTerms, queriesSent };
}
