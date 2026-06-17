# Tasks: Catalog Comparison Evidence Loop

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 plan+provenance gates → PR 2 audits+improvements → PR 3 final Vea slice |
| Delivery strategy | force-chained for apply |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No — user approved chained PRs for this apply decision.
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Restore or explicitly gate Vea #295 artifact identity | PR 1 | Base = tracker branch; include provenance evidence only |
| 2 | Produce audited, approved PRD/plan | PR 2 | Base = PR 1; includes audit1, improvements, audit2 |
| 3 | Open minimal first-slice Vea issue/tasks if still warranted | PR 3 | Base = PR 2; no broader source expansion |

## Phase 1: Foundation / Provenance Gates

- [x] 1.1 Document the restore-first decision for `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`, including controlled read-only regeneration fallback criteria when the prior approved artifact cannot be located or validated.
- [x] 1.2 Gate the approved Vea catalog identity snapshot fixture/path and required provenance fields (`source`, `issue`, `approved_by`, `approved_at`, `sha256`) until the concrete path and approval record are available.
- [x] 1.3 Record hard stop rules: no live audits, no writes, no broad builds/typechecks, no source expansion beyond Vea.

### Slice/PR 1 Status: Provenance Gates

| Task | Status | Evidence |
|------|--------|----------|
| 1.1 | Complete | `proposal.md`, `spec.md`, and `design.md` now require restore/reuse first, documented restore provenance, and explicitly approved read-only regeneration only after restore cannot locate or validate the prior artifact. |
| 1.2 | Complete as gate-defined; execution still blocked | `design.md` now defines allowed snapshot source categories, required provenance fields, checksum/immutability expectations, approval evidence, reject conditions, and disallowed actions. The concrete fixture path and approval record remain unknown, so comparison execution stays blocked until evidence exists. |
| 1.3 | Complete | `design.md` and this task file preserve the hard stops: no live audits, writes, broad builds/typechecks, runtime comparison execution, later-source expansion, final handoff, or full-coverage claims in this slice. |

Strict TDD note: this slice changes planning artifacts only. No executable code changed, so no runtime TDD test was necessary; validation is artifact consistency against proposal/spec/design/tasks plus whitespace-safe diff validation.

## Phase 2: Draft Plan and Gates

- [ ] 2.1 Draft `openspec/changes/catalog-comparison-evidence-loop/design.md` into a final PRD/plan section set with scope, non-goals, output boundary, and restore-first Vea #295 decision.
- [ ] 2.2 Add the exact first-slice evidence path, source order, matching policy, and stop conditions for `audit/catalog-comparison/issue-<issue>/vea/category-pagination/`.
- [ ] 2.3 Gate future expansion as deferred only; do not create tasks for Disco/Jumbo/Carrefour, MAS, or DIA beyond a caveat.
- [ ] 2.4 Prepare a minimal Vea issue/task stub only if provenance and audit results still justify it.

## Phase 3: Fresh Audits and Improvements

- [ ] 3.1 Run a fresh objective audit #1 against the draft plan for invented claims, vague tasks, unsafe writes, missing provenance, and overreach; capture only concrete findings.
- [ ] 3.2 Apply approved improvements from audit #1 only; do not add new scope, sources, or implementation work.
- [ ] 3.3 Run a fresh objective audit #2 on the revised plan; stop if it finds scope drift or unresolved provenance gaps.

## Phase 4: Finalize and Handoff

- [ ] 4.1 Finalize the PRD/plan doc with bounded claims, provenance checklist, and restore/reuse decision outcome.
- [ ] 4.2 If still warranted, draft the minimal first-slice Vea issue(s)/tasks with explicit acceptance criteria and disallowed actions.
- [ ] 4.3 Update `openspec/changes/catalog-comparison-evidence-loop/tasks.md` only; do not touch application code or run live audit scripts.
