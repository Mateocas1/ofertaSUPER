# Exploration: catalog-comparison-evidence-loop

### Current State
The repo already has bounded, read-only category-pagination audits and a new fixture-backed catalog-comparison pipeline. The comparison tool is source-scoped, artifact-only, and rejects write-oriented flags. It matches candidates conservatively by `source + skuId`, then normalized `source + productUrl`, then `source + ean`, and reports conflicts/duplicates/insufficient identity instead of assuming coverage.

### Affected Areas
- `docs/category-pagination-catalog-comparison-plan.md` — existing plan to supersede or refine.
- `scripts/pipeline/category-pagination-catalog-comparison.ts` — core comparison logic, safety boundaries, match policy, report shape.
- `scripts/audit-category-pagination-catalog-comparison.ts` — CLI entrypoint and file write boundary.
- `tests/category-pagination-catalog-comparison.test.ts` — current guardrail and classification coverage.
- `docs/category-pagination-evidence-matrix.md` / `docs/category-pagination-budget-expansion-evidence.md` — source/budget evidence baseline and caveats.

### Approaches
1. **Tight evidence-loop PRD** — document a phased loop for draft plan → objective audit → improvement pass → second objective audit → final plan, with explicit boundaries and non-goals.
   - Pros: matches user intent, keeps the next implementation slice reviewable, avoids invented scope.
   - Cons: still needs later proposal/spec work for exact task breakdown.
   - Effort: Low

2. **Broader catalog strategy doc** — fold comparison tooling into a wider public catalog discovery/freshness strategy.
   - Pros: gives more context across surfaces and future work.
   - Cons: risks over-engineering and dilutes the requested evidence-loop focus.
   - Effort: Medium

### Recommendation
Use the tight evidence-loop PRD. The next artifact should stay narrowly focused on source-scoped, read-only comparison evidence, with Vea as the first slice and no claim of full coverage.

### Risks
- Unknown catalog-fixture provenance for the next source slice must not be assumed.
- Later phases may be tempted to blur artifact-only comparison into discovery/apply work.
- MAS and DIA need source-specific caveats preserved; the loop must not generalize their behavior to all sources.

### Ready for Proposal
Yes — the facts are enough to draft a strict PRD/plan proposal, but the proposal should explicitly call out unresolved fixture selection and audit-window questions.
