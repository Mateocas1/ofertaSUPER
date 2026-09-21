# CMVP Herdr-assisted orchestration contract

This is the operating contract for **CMVP-02 and later consumer-MVP units**. It coordinates bounded human-directed work; it is not an autonomous delivery platform. The parent owns scope, evidence, and all integration decisions.

## Quick path

1. The parent maps dependencies and opens only eligible read-only lanes.
2. Scouts return evidence envelopes; the parent groups human decisions and selects one bounded writer.
3. The writer works in one isolated scope; an independent verifier checks its result.
4. The parent integrates only after explicit human approval and observed verification.

## Roles and authority

| Role | May do | Must not do |
|---|---|---|
| Parent | Decompose dependencies, assign lanes, collect evidence, maintain the ledger/blocker registry, request human decisions. | Write multiple integration scopes concurrently or answer a human prompt. |
| Read-only scout | Inspect its assigned facts and return an envelope. | Modify files, Git state, worktrees, prompts, or conclusions outside evidence. |
| Single-scope writer | Change one approved scope in one isolated worktree and report checks. | Touch another writer's scope, integrate, merge, delete, push, or answer prompts. |
| Independent verifier | Inspect the writer's candidate and run approved checks. | Edit the candidate, self-approve uncertainty, or integrate. |
| Integrator | Apply the explicitly approved integration sequence in the selected authoritative line. | Merge, commit, push, delete a worktree, or resolve a decision without explicit human authorization. |

The parent is the sole coordinator. The same person or process cannot be both writer and final independent verifier for one candidate.

## CMVP-02 observed closure

CMVP-02's authorization was granted and its authorized target branch/worktree was prepared on `feat/consumer-mvp-reset` at `a62540b`, with `origin/master` as an ancestor. The reconciliation record makes the base, included CMVP artifacts, paused work, preserved work, and integration sequence explicit. Baseline verification then passed: `npm test` reported 99 pass, 0 fail, and 12 skip; typecheck passed; lint reported 0 errors and 195 pre-existing warnings; and shell-helper checks passed. Only intended CMVP artifacts were dirty. SEPA remains excluded and Vea remains incomplete.

Native review `review-171abeb863d28cac` is terminal approved and acknowledged. Its registry-description, stale-evidence, help-argument, worktree-count, and doctor-failure observations are cleanup evidence, not CMVP-02 blockers. This bounded cleanup corrects the applicable documentation/script issues without starting CMVP-03.

## CMVP-03 authority and next bounded unit

- Local PostgreSQL is the acquisition and processing authority.
- A validated immutable static snapshot is the public Next.js/Vercel read surface.
- Supabase is temporary recovery/export only, will not be upgraded to Pro, and does not block CMVP-03; never delete it before backup/export parity is observed.
- Do not add another managed database.
- CMVP-03-T1 is complete: the frozen-manifest/snapshot gate reporter enforces exact-identity proof and reports deterministic freshness, representation, diagnostics, and exclusions.
- CMVP-03-T2 is complete: the offline injected-boundary snapshot generator feeds that gate and totally orders complete serialized offers, including equal `source:targetId` duplicates, independent of repository/DB return order.
- CMVP-03-T3 is pending and is the next bounded unit: local PostgreSQL bootstrap and reproducible fixture/seed-to-snapshot proof before any live source acquisition. Its acceptance boundary is the local authority plus validated immutable snapshot proof; its checks must be focused, deterministic, and exclude live acquisition, public deployment, Supabase deletion, and managed-database addition.

## Eligibility and useful concurrency

A lane is eligible only when its prerequisite facts are observed, its scope is disjoint from every active writer, its required credentials are available, and it has no unresolved blocker that affects its result. An `unknown` prerequisite is not eligible.

For CMVP-02, the maximum useful initial concurrency is **three read-only scouts**:

| Lane | Question | Depends on |
|---|---|---|
| `cmvp02-delivery-line` | What do `origin/master`, the current branch, and visible delivery claims establish? | None. |
| `cmvp02-os03-worktrees` | What are OS03, active branches, and worktree relationships? | None. |
| `cmvp02-openspec-claims` | Which OpenSpec changes and completion claims conflict or agree? | None. |

Do not open a writer or integrator lane until all three envelopes are returned and the parent has classified conflicts. The verifier becomes eligible only after the writer reports a bounded candidate and its checks. More scouts are justified only by a newly observed independent question; do not add workers merely to fill capacity.

## Herdr state handling

Herdr's recognized states are `idle`, `working`, `blocked`, `done`, and `unknown`. `idle` and `done` mean ready for input, not that the assigned result is accepted. `blocked` means a recognized approval/question UI, but Herdr can miss it; the parent must also inspect returned output and stalled/timeout evidence. `unknown` means Herdr cannot classify the agent confidently and is **never success**.

Treat `blocked`, `unknown`, timeout, stalled submission, missing envelope, failed check, or contradictory evidence as a stop-and-classify event. Never submit an answer to an approval or question UI. Use Herdr only after checking its installed help/version and only through its documented read/control surface; Stage A automation below does not control it.

## Write isolation and worktree lifecycle

- Scouts run read-only against the selected checkout and do not share a writer worktree.
- Each writer has one named, purpose-specific Git worktree and one declared allowed edit surface.
- No two active writers may edit the same path, generated output, lockfile, migration domain, or integration branch.
- The parent records the worktree path, branch/commit baseline, scope, owner, and candidate checks before work begins.
- Preserve existing and ambiguous worktrees. A worktree is closed or removed only after the human explicitly authorizes it and the parent records the outcome in the ledger.
- A writer never creates/removes worktrees autonomously under this contract. The parent may request a human-authorized lifecycle action outside this Stage A script.

## Result envelopes

Every lane returns this complete, concise envelope:

```text
lane: <stable lane name>
role: scout | writer | verifier | integrator
scope: <question or allowed edit surface>
baseline: <branch/commit/worktree identity observed>
status: complete | blocked | unknown | failed
facts: <observed facts with paths/commands>
checks: <exact command and observed result>
blockers: <registry IDs, or none>
decisions_needed: <decision IDs, or none>
next_eligible: <lanes now eligible, or none>
```

`complete` requires evidence for the lane's stated question; it does not imply milestone completion. An incomplete envelope is `unknown`, never silently inferred as complete.

## Human decision inbox and blockers

The parent groups unresolved decisions into one inbox entry per decision, rather than interrupting each lane independently:

| Decision ID | Question | Options | Affected lanes | Default posture |
|---|---|---|---|---|
| `D-<date>-<n>` | One concrete decision | Closed, evidence-backed choices | Lane names | Pause affected lanes; continue independent lanes. |

Record durable impediments in [`../blockers/consumer-mvp-blockers.md`](../blockers/consumer-mvp-blockers.md). Continue only lanes demonstrably independent of the blocker; do not fabricate a blocker to justify a guess.

## Stop conditions

Stop the affected lane and surface a blocker or decision when: eligibility is unknown; evidence conflicts; a credential is absent; a required command fails; a scope overlap appears; a human prompt appears or may have been missed; Herdr reports `blocked`/`unknown`; a worktree is ambiguous; or a lane would require merge, deletion, commit, push, or decision-answering.

Stop the whole CMVP unit when its authoritative-line decision cannot be made from observed evidence. Preserve evidence and worktrees; do not start the next milestone.

## Resume and recovery

1. Read the CMVP ledger, this contract, the blocker registry, and the latest envelopes.
2. Reinspect Git/worktree topology and compare it with each recorded baseline; do not trust stale Herdr state.
3. Classify each interrupted lane as eligible, blocked, or unknown. Re-run read-only scouts when their baseline changed or their output is missing.
4. Reopen only independent eligible lanes. A writer requires a fresh isolated scope and an explicit parent assignment.
5. Rebuild the grouped decision inbox and continue only after its affected decisions are answered by a human.

## Explicit prohibitions

This contract and Stage A script must never automatically merge, delete worktrees, push, commit, answer prompts, answer decisions, create a scheduler/daemon/queue, or treat agent state as proof of product readiness. It must not delete Supabase before backup/export parity is observed or add another managed database. CMVP-02 is closed with its observed reconciliation evidence. CMVP-03 remains open: T1 and T2 are complete, while T3 is pending and is the next eligible bounded unit; no live source acquisition has started.
