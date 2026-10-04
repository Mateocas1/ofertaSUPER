import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallbackSearchTerms, MAX_FALLBACK_TERMS } from "../src/lib/discovery/category-plan";
import { stageWithFallbackTerms } from "../scripts/pipeline/search-fallback";

describe("fallback search terms", () => {
  it("splits a multi-family category name into its meaningful words", () => {
    assert.deepEqual(fallbackSearchTerms("banaderas cambiadores y pelelas"), ["banaderas", "cambiadores", "pelelas"]);
    assert.deepEqual(fallbackSearchTerms("Bañaderas, Cambiadores y Pelelas"), ["banaderas", "cambiadores", "pelelas"]);
  });

  it("drops connectors, short words and numbers, and caps the retries", () => {
    assert.deepEqual(fallbackSearchTerms("caldos sopas pure y bolsas para horno"), ["caldos", "sopas", "pure"]);
    assert.deepEqual(fallbackSearchTerms("pack x 6 de 500 aguas"), ["pack", "aguas"]);
    assert.ok(fallbackSearchTerms("a b c d e f g h").length <= MAX_FALLBACK_TERMS);
  });

  it("has no fallback for a one-word name", () => {
    assert.deepEqual(fallbackSearchTerms("isotonicas"), []);
    assert.deepEqual(fallbackSearchTerms("  "), []);
  });
});

describe("stage with fallback terms", () => {
  const stageReturning = (fetchedByTerm: Record<string, number>) => {
    const calls: string[] = [];
    return {
      calls,
      stage: async (term: string) => {
        calls.push(term);
        return { productsFetched: fetchedByTerm[term] ?? 0, queriesSent: 1 };
      },
    };
  };

  it("searches only the full name when it returns products", async () => {
    const { calls, stage } = stageReturning({ "carne de cerdo": 30 });
    const outcome = await stageWithFallbackTerms({ term: "carne de cerdo", refresh: true, stage });

    assert.deepEqual(calls, ["carne de cerdo"]);
    assert.equal(outcome.searchedTerm, "carne de cerdo");
    assert.equal(outcome.queriesSent, 1);
  });

  it("retries an empty refresh search with the first word that returns products", async () => {
    const { calls, stage } = stageReturning({ cambiadores: 4, pelelas: 9 });
    const outcome = await stageWithFallbackTerms({ term: "banaderas cambiadores y pelelas", refresh: true, stage });

    assert.deepEqual(calls, ["banaderas cambiadores y pelelas", "banaderas", "cambiadores"]);
    assert.equal(outcome.searchedTerm, "cambiadores");
    assert.equal(outcome.result.productsFetched, 4);
    assert.equal(outcome.queriesSent, 3);
  });

  it("reports the last empty attempt when no word returns anything", async () => {
    const { calls, stage } = stageReturning({});
    const outcome = await stageWithFallbackTerms({ term: "banaderas cambiadores y pelelas", refresh: true, stage });

    assert.equal(calls.length, 4);
    assert.equal(outcome.result.productsFetched, 0);
  });

  it("never falls back for a frozen-plan batch", async () => {
    const { calls, stage } = stageReturning({});
    const outcome = await stageWithFallbackTerms({ term: "banaderas cambiadores y pelelas", refresh: false, stage });

    assert.deepEqual(calls, ["banaderas cambiadores y pelelas"]);
    assert.equal(outcome.result.productsFetched, 0);
  });
});
