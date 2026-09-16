# Project Repository Hygiene — Organic Progress

## Method and invariant

- **Workflow:** Organic Driven Development (ODD) for the entire ofertaSUPER project unless the user explicitly selects another method.
- Before a new substantial implementation unit, inspect the active worktree for completed tracked/untracked work, generated contaminants, ambiguous ownership, and review-size risk.
- Organize completed behavior into cohesive work-unit commits: implementation, migrations, focused tests, and relevant documentation stay together.
- A commit boundary does not reduce PR review size by itself. Use chained branches/PRs when the cumulative range remains too large.
- Never commit, rewrite history, delete files, clean worktrees, or change ignore rules without explicit user authorization for the exact action.
- Exclude generated/local contaminants such as `.codegraph/`, `test-results/`, generated service workers, build output, and editor/OS metadata; verify before changing ignore rules.
- Preserve unrelated user changes. Stop when ownership is ambiguous.

## Current tasks

- [ ] **H1 — OS03 inventory:** Classify every tracked and untracked OS03 path by completed work unit, generated contaminant, unrelated change, or unresolved ownership.
- [ ] **H2 — OS03 commit plan:** Produce exact ordered commit boundaries, messages, verification evidence, rollback boundaries, and projected review sizes; obtain explicit authorization before committing.
- [ ] **H3 — OS03 normalization:** Create only authorized work-unit commits and confirm the remaining working tree contains no accidentally omitted completed work or generated contaminants.
- [ ] **H4 — Project-wide audit:** Inspect every ofertaSUPER worktree/branch for dirty state, untracked files, stale generated output, completed-but-uncommitted units, and branch/PR continuity; report before mutation.
- [ ] **H5 — Project-wide normalization:** Apply only explicitly authorized commits/exclusions/cleanup, preserving independent worktrees and human-owned changes.
- [ ] **H6 — Continuous gate:** Before U14 and every later substantial ODD unit, repeat the active-worktree hygiene check and prevent completed units from accumulating.

## Current order

1. Inventory and plan OS03.
2. Ask for exact commit authorization.
3. Normalize OS03.
4. Audit and normalize the wider project with separate mutation approval.
5. Reconcile and implement U14 under lean ODD.
