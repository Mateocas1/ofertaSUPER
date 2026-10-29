# Consumer MVP delivery-line reconciliation

## Recommendation

Use the latest cumulative OS03 tip, `feat/os03-u16-guarded-catalog-consumers` at `a62540b`, as the **candidate** authoritative base. It becomes the selected base only after the required baseline checks pass and a human authorizes creation of an authoritative branch/worktree plus transplantation of the dirty CMVP documentation.

Do not treat this recommendation as evidence that the live consumer MVP is ready.

## Observed inventory

| Area | Observed fact | Classification |
|---|---|---|
| Current checkout | `docs/comparaya-planning-hygiene` at `167d3726...` is ahead 2 and behind 4 against `origin/master` at `37b4994d...`. | Preserve; not the candidate base. |
| CMVP artifacts | CMVP planning/orchestration files are untracked or dirty only in this worktree. | Preserve for transplantation. |
| OS03 lineage | All numbered OS03/U15/U16 branches have cumulative ancestry from `origin/master`. | Included candidate sequence. |
| Latest OS03 | `feat/os03-u16-guarded-catalog-consumers` at `a62540b` is the latest OS03 tip. | Candidate base. |
| Worktrees | Seven OS03 worktrees are clean; 52 worktrees exist in total. | Preserve; pause detached/legacy worktrees pending classification. |
| Vea OpenSpec | The active Vea change has 13/13 tasks, but its acceptance/output evidence is unmet. | Follow-up; not live-readiness evidence. |
| SEPA baseline | Commit `9801931` is not in `origin/master`, the current branch, or the OS03 tip. | Preserve and classify separately; do not silently include it. |

## Recommended authoritative sequence

1. Obtain explicit human authorization for one new authoritative branch/worktree based on the verified `a62540b` candidate.
2. Create that branch/worktree without deleting, moving, merging, or otherwise integrating existing worktrees.
3. Transplant the dirty CMVP planning and orchestration documentation from this checkout into the authorized worktree.
4. Re-run the baseline checks there and record the selected base, included CMVP artifacts, paused worktrees, and preserved SEPA boundary.
5. Keep the Vea acceptance/output mismatch and SEPA classification as separate follow-ups; do not use either as proof of live readiness.

## Required human authorization

**Decision:** authorize creation of the authoritative branch/worktree from the verified `a62540b` candidate and transplantation of the dirty CMVP documentation into it.

Until granted, CMVP-02 remains in progress. No branch/worktree lifecycle operation, file move, merge, commit, push, deletion, or CMVP-03 work is authorized.

## Non-destructive preparation completed

- The three Herdr scouts have completed their read-only inventory.
- This reconciliation records their observed topology and a candidate sequence.
- Current CMVP artifacts, detached/legacy worktrees, and the SEPA baseline remain preserved in place.

## Checks required before final selection

Run these checks in the proposed authoritative worktree after authorization:

- Confirm `a62540b` resolves to `feat/os03-u16-guarded-catalog-consumers` and remains cumulatively descended from `origin/master`.
- Confirm the numbered OS03/U15/U16 ancestry and the `origin/master` baseline relationship.
- Confirm the new worktree has the intended branch/base and no unintended carried changes before transplantation.
- Confirm the transplanted CMVP artifacts are the intended dirty planning/orchestration set and pass `git diff --check`.
- Record that `9801931` remains outside the selected line, with a separate preservation/classification follow-up.
- Re-check the Vea change's acceptance/output evidence; task count alone must not satisfy a readiness claim.

Only observed passing checks and the recorded human authorization make the candidate base final.
