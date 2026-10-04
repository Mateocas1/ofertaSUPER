import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SEARCH_BUDGET_MINUTES, searchBudgetMs, searchBudgetSpent } from "../scripts/lib/search-budget";

describe("refresh search budget", () => {
  it("defaults to 25 minutes and reads a positive override, capped at 45", () => {
    assert.equal(searchBudgetMs(undefined), DEFAULT_SEARCH_BUDGET_MINUTES * 60_000);
    assert.equal(searchBudgetMs(""), DEFAULT_SEARCH_BUDGET_MINUTES * 60_000);
    assert.equal(searchBudgetMs("abc"), DEFAULT_SEARCH_BUDGET_MINUTES * 60_000);
    assert.equal(searchBudgetMs("0"), DEFAULT_SEARCH_BUDGET_MINUTES * 60_000);
    assert.equal(searchBudgetMs("10"), 10 * 60_000);
    assert.equal(searchBudgetMs("500"), 45 * 60_000);
  });

  it("is spent once the elapsed time reaches the budget", () => {
    assert.equal(searchBudgetSpent(0, 59_999, 60_000), false);
    assert.equal(searchBudgetSpent(0, 60_000, 60_000), true);
  });
});
