# Consumer MVP delivery-line reconciliation

> Historical CMVP-02 record. At the 2026-09-21 audit, OS03/CMVP integration was already merged into `master` at `f8d8f4eccf82dfbd35f0c152b42bdb0379747b15`. Paths, permissions and next steps below describe the earlier preparation window; they are not current execution instructions. Resume from the [feature ledger](../odd/tasks/consumer-mvp-reset.md), currently CMVP-04-T01.

## Historical decision

The latest cumulative OS03 tip, `feat/os03-u16-guarded-catalog-consumers` at `a62540b`, is the selected authoritative base. Human authorization was granted, `feat/consumer-mvp-reset` was created from that exact commit, the CMVP documentation was transplanted, and the required baseline checks passed.

This delivery-line decision is not evidence that the live consumer MVP is ready.

## Observed inventory

| Area | Observed fact | Classification |
|---|---|---|
| Previous checkout | `docs/comparaya-planning-hygiene` at `167d3726...` was ahead 2 and behind 4 against `origin/master` at `37b4994d...`. | Preserved; not the authoritative base. |
| CMVP artifacts | CMVP planning/orchestration files were dirty in the previous checkout and were transplanted into the authorized worktree. | Included CMVP contract. |
| OS03 lineage | All numbered OS03/U15/U16 branches have cumulative ancestry from `origin/master`. | Included sequence. |
| Latest OS03 | `feat/os03-u16-guarded-catalog-consumers` at `a62540b` is the latest verified OS03 tip. | Selected base for `feat/consumer-mvp-reset`. |
| Worktrees | Existing OS03, detached, and legacy worktrees remain preserved. | Paused unless a later task explicitly needs them. |
| Vea OpenSpec | The active Vea change has 13/13 tasks, but its acceptance/output evidence is unmet. | Follow-up; not live-readiness evidence. |
| SEPA baseline | Commit `9801931` is not in `origin/master`, the previous branch, or the selected OS03 tip. | Preserved and excluded; do not silently include it. |

## Authoritative sequence completed

1. The human authorized one new authoritative branch/worktree based on `a62540b`.
2. `feat/consumer-mvp-reset` was created without deleting, moving, merging, or integrating existing worktrees.
3. Only the approved CMVP planning and orchestration documentation was transplanted.
4. Baseline checks passed and were independently verified.
5. The Vea acceptance/output mismatch and SEPA classification remain separate follow-ups and are not live-readiness evidence.

## Authorization boundary

The authorization covered branch/worktree creation and CMVP documentation transplantation only. It did not authorize deletion, merge, commit, push, existing-worktree integration, a live-readiness declaration, or CMVP-03 implementation.

## Non-destructive preparation completed

- The three Herdr scouts completed their read-only inventory.
- The authoritative worktree is `/home/picala/.herdr/worktrees/ofertaSUPER/feat-consumer-mvp-reset` on `feat/consumer-mvp-reset` at `a62540b`.
- CMVP artifacts were transplanted; detached/legacy worktrees and the SEPA baseline remain preserved.
- Native review `review-171abeb863d28cac` completed approved and acknowledged without required correction.

## Final selection evidence

- `npm test`: 99 passed, 0 failed, 12 skipped.
- `npm run typecheck`: passed.
- `npm run lint`: completed with 0 errors and 195 warnings.
- Herdr helper syntax, `doctor`, and `plan CMVP-02`: passed.
- `git diff --check`: passed.
- `origin/master` is an ancestor of the selected base.
- SEPA `9801931` remains outside the selected line.
- Vea acceptance/output evidence remains incomplete and is not treated as readiness.

At this historical preparation checkpoint, CMVP-02 was closed and CMVP-03 had not started. CMVP-03 was completed subsequently; current state belongs to the feature ledger.
