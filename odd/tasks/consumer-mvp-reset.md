# Consumer MVP reset

## Objective

Persist and execute the accepted four-milestone reset that turns ofertaSUPER from a portfolio/demo baseline into a small, trustworthy consumer MVP.

## Problem

The repository contains substantial UI, catalog, ingestion, safety, and operations work, but delivery is fragmented and the public experience still relies on a degraded demo catalog. Infrastructure and governance have outpaced visible consumer value.

## Why

A durable, versioned source of truth is required so future sessions resume the same sequence without reopening accepted product decisions or depending on conversation context.

## Product outcome

A person can search for a real product, compare an exact product across supermarkets, understand price freshness and availability, add products to a local basket, and compare basket totals.

## Accepted scope

- Initial supermarkets: Disco, Jumbo, and Carrefour.
- Exact product matching by EAN, pack, quantity, and variant.
- Initial catalog target: 500–1,000 useful products.
- At least daily refresh, subject to source capability.
- Anonymous public usage; basket remains local.
- Availability is a source observation, not guaranteed quantity or checkout inventory.
- Four sequential milestones: project reconciliation, small live catalog, real consumer journey, controlled public pilot.

## Constraints and non-goals

- Do not expand to six supermarkets before the initial three-source slice is credible.
- Do not introduce approximate product matching in the first MVP.
- Do not add consumer accounts, checkout, complex promotions, or advanced admin work.
- Pause new publication-authority, recovery, backup, audit, and operational layers unless the current consumer slice demonstrably requires them.
- Preserve existing branches and worktrees until reconciliation classifies them; do not delete ambiguous work.
- Use outcome gates rather than task-count completion.

## Delivery strategy

- ODD route: delegated direct for the multi-file documentation unit; later implementation routes are selected per task.
- Trigger evidence: the durable reset requires multiple non-trivial files and therefore uses one bounded writer.
- Delivery strategy: `ask-on-risk`.
- Forecast: under 400 authored lines for this documentation unit; later milestones must be forecast independently.
- Commit status: pending explicit user authorization; no commit is authorized by this document alone.
- TDD: not applicable to the documentation-only bootstrap. Future behavior tasks must resolve the repository's effective TDD mode and exact runner before implementation.

## Tasks

- [x] **CMVP-01 — Persist the roadmap.** Create the versioned consumer MVP roadmap, link its durable execution contract, and prevent local CodeGraph state from polluting diffs.
  - Route: delegated writer; multi-file write trigger.
  - Acceptance: one authoritative roadmap states milestones, gates, exclusions, resume protocol, and immediate next unit; `.codegraph/` is ignored without deleting local state.
  - Checks: structural readback, link/path consistency, `git diff --check`, and focused status inspection.
  - Evidence: `docs/consumer-mvp-roadmap.md` was structurally read back with the four milestones, outcome gates, exclusions, 12-unit order, authority/resume protocol, and CMVP-02 next step; README links it with a non-readiness claim; `.gitignore` contains `.codegraph/`; `git diff --check` passed; `git status --short` showed only the intended documentation/ignore changes plus pre-existing untracked `odd/`.

- [x] **CMVP-ORCH-01 — Bootstrap Herdr-assisted orchestration.** Establish the persistent parent/worker/verifier operating contract, blocker registry, and minimal safe Herdr automation before using it on CMVP-02.
  - Route: delegated writer; multi-file write and Herdr-specific exploration triggers.
  - Acceptance: versioned orchestration contract defines roles, dependency-aware concurrency, worktree isolation, blocker handling, stop conditions, and resume behavior; a blocker registry template exists; minimal automation can inspect/plan Herdr lanes without destructive or autonomous Git integration.
  - Checks: script syntax/help or dry-run, structural readback, `git diff --check`, and focused status inspection.
  - Evidence: `odd/orchestration/consumer-mvp-herdr.md` defines the parent/scout/writer/verifier/integrator boundary, three initial CMVP-02 read-only lanes, Herdr state caveats, isolation, envelopes, decision inbox, stop/recovery behavior, and prohibitions; `odd/blockers/consumer-mvp-blockers.md` is an empty schema-only registry; `scripts/orchestration/consumer-mvp-herdr.sh` completed syntax, help, doctor, and deterministic CMVP-02 dry-run checks without starting CMVP-02 or mutating Herdr/Git state.

- [ ] **CMVP-02 — Reconcile the authoritative delivery line.** Inventory `origin/master`, OS03, active branches/worktrees, OpenSpec changes, and conflicting completion claims; select and prepare the authoritative feature line without deleting ambiguous work.
  - Route: Herdr-assisted parallel read-only scouts followed by one bounded reconciliation writer; no concurrent integration writers.
  - Acceptance: base branch, included work, paused work, preserved work, and exact integration sequence are explicit; baseline checks are observed.
  - Evidence: all three Herdr scouts completed; `docs/consumer-mvp-delivery-line-reconciliation.md` records `feat/os03-u16-guarded-catalog-consumers` at `a62540b` as the candidate base, CMVP-artifact transplantation, paused/preserved boundaries, and final-selection checks. CMVP-02 remains in progress pending explicit authorization to prepare the branch/worktree and observed baseline verification.

- [ ] **CMVP-03 — Establish the small live catalog.** Deliver recent, measurable Disco/Jumbo/Carrefour data with honest freshness and availability semantics.
  - Route: to be derived after CMVP-02.
  - Acceptance: 500–1,000 recent useful products; at least 100 exact EANs comparable in two sources; three sources represented; at least 90% of the target catalog refreshed within 24 hours; two consecutive successful runs.
  - Evidence: pending.

- [ ] **CMVP-04 — Complete the real consumer journey.** Replace illustrative public surfaces with live catalog data and verify search → compare → freshness/availability → basket totals.
  - Route: to be derived after CMVP-03.
  - Acceptance: no illustrative data presented as real; five-product basket totals and coverage are correct; mobile journey and degraded states are verified in production.
  - Evidence: pending.

- [ ] **CMVP-05 — Run a controlled public pilot.** Observe 5–15 external users and classify failures as data, trust, or interaction problems before expanding scope.
  - Route: to be derived after CMVP-04.
  - Acceptance: at least five users complete the journey; search success, comparison coverage, basket use, abandonment, and trust feedback are recorded; the next product investment is decided from evidence.
  - Evidence: pending.

## Progress

- The user accepted the four-milestone consumer-first reset exactly as proposed.
- The project audit established that a portfolio/demo MVP exists but a broad, current live catalog does not.
- A tooling incident created untracked `.codegraph/` local index state; it was diagnosed as generated state and will be ignored, not deleted.
- CMVP-01 is complete: the roadmap is versioned, discoverable from README without a live-readiness claim, and local `.codegraph/` state is ignored without deletion.
- The user accepted the Herdr-assisted parent/worker/verifier factory with dependency-aware concurrency and durable blocker classification.
- CMVP-ORCH-01 is complete; the three CMVP-02 Herdr scouts are complete and the reconciliation recommendation is recorded.
- CMVP-02 remains in progress until an authorized authoritative branch/worktree is prepared and its baseline checks are observed. CMVP-03 must not start.

## Verification evidence

- Public demo inspection showed a four-product illustrative home and degraded stale demo search data.
- Repository audit found extensive real acquisition and guarded-write capabilities, but no proof of current broad freshness or recurring operation.
- Git/worktree audit found no single unambiguous current delivery line.
- CMVP-01 structural readback confirmed the roadmap, README link, `.gitignore` entry, and ledger update; `git diff --check` passed.
- CMVP-ORCH-01 observed checks: `bash -n scripts/orchestration/consumer-mvp-herdr.sh` exited 0; `bash scripts/orchestration/consumer-mvp-herdr.sh help` exited 0 and rendered command/safety guidance; `bash scripts/orchestration/consumer-mvp-herdr.sh doctor` exited 0 with Git worktree and `herdr 0.9.0` prerequisites; `bash scripts/orchestration/consumer-mvp-herdr.sh plan CMVP-02` exited 0 and rendered the three-scout dry-run plan; `git diff --check` exited 0; `git status --short` showed pre-existing modified `.gitignore` and `README.md`, pre-existing untracked `docs/consumer-mvp-roadmap.md` and `odd/`, plus untracked `scripts/orchestration/`.

## Resume protocol

1. Read this file.
2. Load Engram topic `odd/consumer-mvp-reset/tasks` and reconcile both copies.
3. Inspect current Git status and the latest evidence for the first unchecked task.
4. Continue only that task; do not skip milestone gates or reopen accepted scope without new user authorization.
5. Update this file, its Engram mirror, and the visible todo projection after every task transition or material plan change.

## Next step

CMVP-02 is in progress: obtain the authorization recorded in `odd/blockers/consumer-mvp-blockers.md`, then prepare the candidate authoritative branch/worktree and observe its baseline checks. Do not start CMVP-03 or live-catalog implementation until the authoritative delivery line is reconciled.
