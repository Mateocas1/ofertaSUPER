# Tasks: Catalog Comparison Evidence Loop

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Current PR/slice: ~205-230; whole chain remains split across PRs |
| 400-line budget risk | Low for the current PR/slice |
| Chained PRs recommended | Yes for the whole change chain; current PR/slice remains reviewable |
| Suggested split | PR 1 plan+provenance gates → PR 2 audited plan improvements → PR 3 final Vea slice |
| Delivery strategy | force-chained for apply |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No — user approved chained PRs for this apply decision.
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

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

- [x] 2.1 Draft `openspec/changes/catalog-comparison-evidence-loop/design.md` into a final PRD/plan section set with scope, non-goals, output boundary, and restore-first Vea #295 decision.
- [x] 2.2 Add the exact first-slice evidence path, source order, matching policy, and stop conditions for `audit/catalog-comparison/issue-<issue>/vea/category-pagination/`.
- [x] 2.3 Gate future expansion as deferred only; do not create tasks for Disco/Jumbo/Carrefour, MAS, or DIA beyond a caveat.
- [x] 2.4 Document a non-actionable gated draft Vea issue/task stub only if provenance and audit results still justify it; do not open or execute it from this change.

### Slice/PR 2 Draft Status: Plan Ready for Fresh Audit #1

| Task | Status | Evidence |
|------|--------|----------|
| 2.1 | Complete as draft plan | `plan.md` defines purpose, real objective, scope/non-goals, phase path, Vea #295 restore-first decision, allowed/disallowed actions, success conditions, and stop conditions. |
| 2.2 | Complete as gated boundaries | `plan.md` records the Vea candidate input path, intentionally-gated catalog snapshot input path, future comparison output boundary, source-scoped conservative matching policy, and execution stop conditions. Actual comparison remains blocked. |
| 2.3 | Complete as deferred expansion guidance | `plan.md` keeps later sources out of task scope and only records expansion order plus MAS and DIA caveats for future maintainer-approved work. |
| 2.4 | Complete as gated stub only | `plan.md` includes a non-actionable future Vea issue/task stub that must not be opened until audit #1, improvements, audit #2, and complete provenance approval pass. No issue was created. |

Strict TDD note: this slice changes planning artifacts only. No executable code changed, so no runtime RED/GREEN cycle or runtime test execution was necessary. Validation is artifact consistency against proposal/spec/design/tasks/plan plus whitespace-safe diff validation.

## Phase 3: Fresh Audits and Improvements

- [x] 3.1 Run a fresh objective audit #1 against the draft plan for invented claims, vague tasks, unsafe writes, missing provenance, and overreach; capture only concrete findings.
- [x] 3.2 Apply approved improvements from audit #1 only; do not add new scope, sources, or implementation work.
- [ ] 3.3 Run a fresh objective audit #2 on the revised plan; stop if it finds scope drift or unresolved provenance gaps.

### Slice/PR 2 Audit #1 Improvement Status

| Task | Status | Evidence |
|------|--------|----------|
| 3.1 | Complete via supplied audit verdict | Audit #1 was supplied to this improvement slice as PASS with three concrete improvements. This slice did not run audits or scripts. |
| 3.2 | Complete as approved improvement pass | Applied the audit #1 PASS-with-improvements findings only: added the concrete issue-number stop condition for comparison outputs, clarified task 2.4 as a non-actionable gated draft stub, and updated the review workload forecast to show the current PR/slice estimate as ~205-230 changed lines with Low risk while preserving the approved feature-branch-chain. |

Strict TDD note: this improvement slice changes planning artifacts only. No executable code changed, and the user explicitly constrained this slice to avoid audits, scripts, tests, builds, and typechecks. Validation is artifact consistency by re-reading changed sections plus `git diff --check`.

## Phase 4: Finalize and Handoff

- [x] 4.1 Finalize the PRD/plan doc with bounded claims, provenance checklist, and restore/reuse decision outcome.
- [x] 4.2 If still warranted, draft the minimal first-slice Vea issue(s)/tasks with explicit acceptance criteria and disallowed actions.
- [x] 4.3 Update `openspec/changes/catalog-comparison-evidence-loop/tasks.md` only; do not touch application code or run live audit scripts.

### Slice/PR 3 Final Handoff Status

| Task | Status | Evidence |
|------|--------|----------|
| 4.1 | Complete as final handoff draft; execution still blocked | `plan.md` now states final handoff readiness without authorizing comparison execution, issue creation, artifact generation, or writes. It preserves bounded claims, restore/reuse-first handling, provenance gates, concrete issue-number output gating, and the investigation-only meaning of `likely missing`. |
| 4.2 | Complete as warranted non-executable stub | `plan.md` now includes the minimal future Vea execution issue/task stub with purpose, prerequisites/gates, required inputs and provenance, allowed/disallowed actions, concrete approved issue-number output boundary, acceptance criteria, stop conditions, and regenerated-evidence caveats. No GitHub issue was created. |
| 4.3 | Complete for this slice | Only OpenSpec planning artifacts were edited. No application code, live audit script, actual Vea comparison, broad build/typecheck, DB/production write, commit, push, or PR action was performed. |

Strict TDD note: this finalization slice changes planning artifacts only. No executable code changed, so no runtime RED/GREEN cycle or runtime test execution was necessary. Validation is artifact consistency against proposal/spec/design/tasks/plan plus whitespace-safe diff validation.
