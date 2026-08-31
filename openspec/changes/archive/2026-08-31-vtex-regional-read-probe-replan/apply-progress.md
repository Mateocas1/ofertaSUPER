# Apply Progress: VTEX Regional Read Probe Replan

## Stack 1 — adapter factory and seam

**Status:** Complete for the explicitly authorized task range 1.1–1.4. Candidate is ready for parent-owned native-attempt settlement. Stack 2 and Stack 3 remain unauthorized and unstarted.

### Structured status consumed / produced

- Change: `vtex-regional-read-probe-replan` (unambiguous active authority).
- Artifact store: hybrid/OpenSpec; proposal, specification, design, tasks, config, and absent prior apply progress were read from the isolated target.
- Apply state consumed: ready for assigned `stack-1-adapter-factory` slice under token ordinal 2/generation 2.
- Delivery decision: resolved `auto-chain` / `stacked-to-main`; this work unit is Stack 1 targeting `master` and contains no commit or PR action.
- Action context: workspace-planning with explicit allowed product roots `src/lib/vtex/regional-read-probe.ts` and `tests/vtex-regional-read-probe.test.ts`, plus bounded OpenSpec bookkeeping. No unsafe-root warning remains.
- Apply state produced: Stack 1 tasks complete; later implementation tasks remain pending and require separate authorization.

### Completed tasks and persisted checkbox evidence

- [x] 1.1 RED — deterministic raw-transport factory tests.
- [x] 1.2 GREEN — high-level seam, safe contracts, and factory.
- [x] 1.3 TRIANGULATE — adversarial boundary, isolation, and rejection tests.
- [x] 1.4 REFACTOR — compacted implementation/tests and enforced line cap.

The matching task rows in `tasks.md` were changed to `- [x]`; no 2.x or 3.x checkbox was changed.

### Files changed

- `src/lib/vtex/regional-read-probe.ts` — 167 additions, 0 deletions.
- `tests/vtex-regional-read-probe.test.ts` — 175 additions, 0 deletions.
- `openspec/changes/vtex-regional-read-probe-replan/tasks.md` — checkbox bookkeeping for exactly 1.1–1.4.
- `openspec/changes/vtex-regional-read-probe-replan/apply-progress.md` — this cumulative progress artifact.

Authored product total: **342 additions + 0 deletions = 342 lines**, within the approved 285–345 range and below the hard 400-line cap.

### TDD Cycle Evidence

| Task | Test file | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| 1.1 | `tests/vtex-regional-read-probe.test.ts` | Integration/unit boundary | `npm test`: expected missing-module failure; 718 passed, 1 failed, 719 total | — | — | — |
| 1.2 | same | Integration/unit boundary | inherited 1.1 RED | `npm test`: 721/721 passed across 70 suites | — | — |
| 1.3 | same | Integration/unit boundary | Added boundary/isolation/rejection sentinels; existing generalized implementation already satisfied them, so checkpoint stayed GREEN | — | `npm test`: 724/724 passed across 70 suites; no corrective production change needed | — |
| 1.4 | same | Integration/unit boundary | — | — | — | `npm test`: 724/724 passed across 70 suites after compaction |

### Verification and security evidence

- Exact CP1425/CP5000 session POST bodies and the derived leading-zero exact-EAN catalog GET were observed only by deterministic raw callbacks.
- Tests assert literal 10,000 ms timeout, shared signal, zero redirects, raw arraybuffer mode, disabled transforms, all-status acceptance, exact headers, and one callback per operation.
- Separate cookie lines are parsed without comma splitting; final exact assignments win, invalid finals fail closed, and catalog cookies retain exact order.
- Distinct target closures were invoked after both sessions opened and proved no cross-target cookie contamination.
- 429, closed 403/503 marker cases, the 65,536-byte boundary, generic failures, fatal UTF-8, and invalid JSON collapse to safe kinds.
- Session and catalog rejection matrices cover cancellation, both timeout codes, and generic failures. Runtime sentinels occupy message, stack, config, request, response, headers, data, URL, and `toJSON`; results contain only closed kinds and `toJSON` remains unaccessed.
- No live VTEX request, retry, alternate URL, logging, persistence, availability/stock policy, core operation, report construction, CLI, package edit, or shared-module edit was introduced.

### Deviations

- Before the target RED checkpoint, one `npm test` command was mistakenly launched from the parent repository cwd; it passed 669/669, made no implementation edits, and is not counted as target evidence. All four recorded checkpoints were then run from the isolated target.
- TRIANGULATE additions did not produce a second failing run because the minimal GREEN implementation already generalized across the new boundary, isolation, and rejection cases; the required full-suite checkpoint was still run and recorded.
- No design or product-scope deviation was made.

### Remaining implementation tasks

- [ ] **2.1 RED — add high-level `RegionalProbeHttp` fake tests for fixed execution, recognized session proof, and closed target failure mapping.** <!-- sdd-owner: implementation -->
- [ ] **2.2 GREEN — implement the fixed two-target core policy and report construction in `src/lib/vtex/regional-read-probe.ts` until the initial Stack 2 tests pass.** <!-- sdd-owner: implementation -->
- [ ] **2.3 TRIANGULATE — extend the high-level core fake matrix for catalog traversal, safe prices, trustworthy absence, report order, all aggregate combinations, and the first factory-backed core/report secrecy case, then harden only the core module.** <!-- sdd-owner: implementation -->
- [ ] **2.4 REFACTOR and Stack 2 acceptance checkpoint — consolidate deterministic payload builders/tables and enforce the second hard slice boundary.** <!-- sdd-owner: implementation -->
- [ ] **3.1 RED — add deterministic CLI runner tests in `tests/vtex-regional-read-probe.test.ts` before adding the script.** <!-- sdd-owner: implementation -->
- [ ] **3.2 GREEN — implement `scripts/probe-vtex-regional-read.ts` as the thin buffered runner and executable wrapper until Stack 3 RED tests pass.** <!-- sdd-owner: implementation -->
- [ ] **3.3 TRIANGULATE — complete CLI-to-core acceptance evidence in the same test file and make minimal script-only fixes.** <!-- sdd-owner: implementation -->
- [ ] **3.4 REFACTOR and final slice checkpoint — simplify only the script/test helpers, preserve exact output semantics, and enforce the final hard cap.** <!-- sdd-owner: implementation -->

### Candidate handoff

`candidate_status: success_ready_for_parent_settlement`

The parent retains sole authority to settle the native attempt and to authorize any later stack, branch, commit, push, or PR action.

## Stack 1 final bounded verification correction

**Status:** The remaining verification blocker was corrected within authorized tasks 1.1–1.4. No acquire, reset, settle, finish, Git, Stack 2, or Stack 3 action was performed.

### Structured status and task evidence

- The authoritative hybrid/OpenSpec change is `vtex-regional-read-probe-replan`; proposal, specification, design, tasks, config, and prior progress were consumed from this isolated workspace.
- Overall apply state remains `ready` only because implementation-owned 2.x/3.x rows are unchecked. The resolved delivery path remains `auto-chain` / `stacked-to-main`, and this correction stayed inside the Stack 1 boundary targeting `master`.
- Action context remained workspace-planning with explicit edit permission for the two Stack 1 product files and this evidence file; no out-of-root edit was made.
- Tasks 1.1–1.4 remain visibly `- [x]`. Tasks were not edited, and all exact unchecked 2.x/3.x lines listed above remain unauthorized.

### TDD Cycle Evidence

| Correction | Test file | Layer | RED | GREEN | REFACTOR/final |
|---|---|---|---|---|---|
| Hostile `data` introspection and shared two-stage matrix | `tests/vtex-regional-read-probe.test.ts` | Integration/unit boundary | `npm test`: **724 passed, 1 failed, 725 total**; hostile data proxy rejected from session classification | `npm test`: **725 passed, 0 failed, 725 total** after the minimal `bytesOf` guard | `npm test`: **725 passed, 0 failed, 725 total** with the compact shared matrix |

### Corrected verification evidence

- One shared matrix exercises both session and catalog stages: 429 before body access; 403 and 503 with each of the three ASCII-case markers; generic 403, generic 503, and 500 as `transport_error`; marker ending at byte 65,535, crossing the boundary, and beginning at 65,536; malformed JSON, fatal UTF-8, null/invalid data, hostile proxy data, and invalid status.
- The hostile data proxy throws during prototype/typed-array introspection. Both stages now return the closed `parse_error` kind for a 2xx hostile body rather than rejecting.
- Existing exact config, cookie parsing/isolation, runtime-generated session/catalog rejection-field traps, and safe-value secrecy assertions remain present and passing.
- Final physical product lines: `src/lib/vtex/regional-read-probe.ts` **177** plus `tests/vtex-regional-read-probe.test.ts` **192**, combined **369**. Native selected-candidate projection is **369 product lines + 8 task checkbox substitutions = 377**, below 400.
- Changed paths for this correction: `src/lib/vtex/regional-read-probe.ts`, `tests/vtex-regional-read-probe.test.ts`, and this evidence file only.

### Deviations and risks

- No design or scope deviation was introduced. The guard converts hostile byte-view introspection into the same fail-closed result already used for invalid data.
- JavaScript proxy behavior remains runtime-dependent, but the tested prototype-introspection throw covers the rejection path that previously escaped `bytesOf`.

## Stack 2 — core policy and report

**Status:** Complete for explicitly authorized tasks 2.1–2.4. Stack 3 remains unchecked and unauthorized; native lifecycle and Git delivery remain parent-owned.

### Structured status and delivery boundary

- Consumed active change `vtex-regional-read-probe-replan`, token ordinal 3/generation 3, work unit `stack-2-core-report`, and accepted Stack 1 baseline 725/725.
- Authoritative action context allowed only the two product files and bounded OpenSpec bookkeeping; every edit stayed within those roots.
- Resolved delivery path remained `auto-chain` / `stacked-to-main`; this slice targets accepted Stack 1 and performs no acquire/reset/settle/finish, branch, commit, push, or PR action.
- Hybrid inputs were read from OpenSpec and Engram; prior Stack 1 progress was preserved cumulatively.

### Completed tasks and persisted checkbox evidence

- [x] 2.1 RED — high-level fixed-execution, context-proof, and closed-failure tests.
- [x] 2.2 GREEN — fixed two-target policy and exact report construction.
- [x] 2.3 TRIANGULATE — catalog/price/absence/aggregation and factory-secrecy matrix.
- [x] 2.4 REFACTOR — readable closed vocabularies/contracts and hard-budget acceptance.

Only task rows 2.1–2.4 changed to `- [x]`; 1.x stayed checked and exact 3.x rows remain unchecked.

### TDD Cycle Evidence

| Task | Layer | RED | GREEN / correction | Final |
|---|---|---|---|---|
| 2.1 | High-level core integration | `npm test`: 725 passed, 3 failed, 728 total; operation missing | 2.2 `npm test`: 728/728 passed | — |
| 2.3 | High-level core plus one factory-backed case | `npm test`: 731 passed, 2 failed, 733 total; hostile plain-object introspection and an overbroad test assertion | `npm test`: 733/733 passed after fail-closed plain-object guard and assertion correction | — |
| 2.4 | Refactor/acceptance | — | Added compact stage-code, ordered-union, allowlisted-path, and clock checks | `npm test`: 736/736 passed across 70 suites |

Safety-net baseline before edits: `npm test` 725/725 passed across 70 suites.

### Files, budget, and verification

- `src/lib/vtex/regional-read-probe.ts`: **186 additions, 4 deletions = 190** Stack 2 product lines.
- `tests/vtex-regional-read-probe.test.ts`: **181 additions, 1 deletion = 182** Stack 2 product lines.
- Product total: **372** additions plus deletions relative to temporary out-of-repository Stack 2 baseline copies.
- Native selected-candidate projection: **372 product + 8 checkbox-accounting lines = 380**, within required 370–392 product range and at most 400 selected lines.
- `tasks.md`: exactly four 2.x checkbox substitutions; `apply-progress.md`: this workspace-only cumulative evidence.

### Schema, security, and behavior evidence

- Report tests assert exact top-level, target, and match field order; fixed target order; one injected UTC timestamp; closed ordered duplicate-free codes; null unavailable proofs; and no stock, availability, seller IDs, URLs, raw fields, or free text.
- High-level fakes prove CP1425 then CP5000 continuation, literal 10,000 ms, one session and conditional catalog per target, no retry, strict recognized session paths, independent proofs, stage-specific failures, and abort propagation.
- Catalog matrices prove exact ordered traversal, all matching SKUs, product-only evidence, malformed-sibling found precedence, trustworthy absence, exactly-one-default seller, both offer spellings, price boundaries, and 3050/252066 handling.
- Aggregation tests prove found precedence, strict distinct-region absence, aggregate-only `regions_not_distinct`, and closed fallback precedence.
- The first factory-backed completed-report case generates cookie/header/payload/error/transport sentinels and proves neither the report nor `JSON.stringify(report)` contains any sentinel.
- No live request, real cookie fixture, side effect, CLI, shared-module, package, Next.js, persistence, SEPA, provider, output, cache, queue, scheduler, availability, logging, or retry change was made.

### Remaining implementation tasks

- [ ] **3.1 RED — add deterministic CLI runner tests in `tests/vtex-regional-read-probe.test.ts` before adding the script.** <!-- sdd-owner: implementation -->
- [ ] **3.2 GREEN — implement `scripts/probe-vtex-regional-read.ts` as the thin buffered runner and executable wrapper until Stack 3 RED tests pass.** <!-- sdd-owner: implementation -->
- [ ] **3.3 TRIANGULATE — complete CLI-to-core acceptance evidence in the same test file and make minimal script-only fixes.** <!-- sdd-owner: implementation -->
- [ ] **3.4 REFACTOR and final slice checkpoint — simplify only the script/test helpers, preserve exact output semantics, and enforce the final hard cap.** <!-- sdd-owner: implementation -->

### Candidate handoff

`candidate_status: success_ready_for_parent_settlement`

The parent retains sole authority for native settlement and any Stack 3 or Git/delivery action.

## Stack 2 independent acceptance-gap correction

**Status:** Acceptance evidence complete inside authorized tasks 2.1–2.4; no production correction, task edit, native lifecycle action, Git action, or Stack 3 work was performed.

### Structured status and boundary

- Consumed the authoritative OpenSpec proposal, specification, design, tasks, config, prior cumulative progress, and existing code/tests for `vtex-regional-read-probe-replan`.
- Resolved delivery remains `auto-chain` / `stacked-to-main`; the assigned work unit is the existing Stack 2 slice targeting accepted Stack 1.
- Workspace-planning edit roots were explicitly limited to the Stack 2 test/core paths and this concise evidence path; only the test and evidence paths changed.
- Tasks 2.1–2.4 were re-read and remain visibly `- [x]`; task editing was expressly parent-owned for this correction.

### TDD and matrix evidence

| Checkpoint | Exact command | Result |
|---|---|---|
| Acceptance additions | `npm test` | 736 passed, 0 failed, 736 total across 70 suites; existing generalized behavior satisfied the new cases, so no production fix was needed |
| Compact refactor/final | `npm test` | 736 passed, 0 failed, 736 total across 70 suites |

- Session matrix independently proves wrong postal, missing cookie proof, missing/null region, and unknown successful payload classification; each case asserts only its required failure code, suppresses only CP1425 catalog, and observes CP5000 catalog completion.
- Aggregation matrix proves found over context, found with same-region trustworthy nonmatch, and all six fallback pairings in both target orders: rate vs transport/parse/context, transport vs parse/context, and parse vs context.
- Trustworthy-absence matrix proves malformed `referenceId` arrays, malformed records, and non-string `Value`/`value` candidates block absence at representative product and SKU levels.

### Final line accounting and readiness

- `src/lib/vtex/regional-read-probe.ts`: baseline-relative **+186/-4 = 190** product lines; unchanged by this correction.
- `tests/vtex-regional-read-probe.test.ts`: baseline-relative **+194/-1 = 195** product lines.
- Stack 2 product total: **385** additions plus deletions, a net correction increase of **13** from the preserved 372-line Stack 2 candidate and within the required maximum of 392.
- Native selected-candidate projection: **385 product + 8 checkbox-accounting lines = 393**, within the hard 400-line ceiling.
- Candidate is ready for parent-owned native-attempt handling. Residual risk is limited to the intentionally compact table syntax; every table entry executes under the full deterministic suite.

## Stack 3 — buffered CLI and executable wrapper

**Status:** Complete for the explicitly authorized task range 3.1–3.4. No native lifecycle, Git, delivery, dependency, core-module, or out-of-scope action was performed.

### Structured status and boundary

- Consumed change `vtex-regional-read-probe-replan`, token ordinal/generation 4/4, work unit `stack-3-cli`, accepted Stack 2 baseline tree `678f580b362a06559d869bf84b1f78debc6f5ca1`, and 736/736 baseline tests.
- Resolved delivery remained `auto-chain` / `stacked-to-main`; Stack 3 targets accepted Stack 2, with no branch, commit, push, PR, acquire, reset, settle, or finish action.
- Workspace-planning roots were exactly the two Stack 3 product files plus bounded tasks/apply-progress bookkeeping. The core module remained read-only.
- The test baseline was saved before editing at `/tmp/vtex-stack3-baseline.jBeZBb/test.baseline.ts`; the script baseline was confirmed absent.

### Completed tasks and persisted checkbox evidence

- [x] 3.1 RED — exact grammar, help, invalid, report, cancellation, and internal-failure runner tests.
- [x] 3.2 GREEN — thin buffered runner and temporary-SIGINT executable wrapper.
- [x] 3.3 TRIANGULATE — all six exits, wrapper settlement, and reused factory-backed serialization evidence.
- [x] 3.4 REFACTOR — compact successful-outcome helper and final budget/test checkpoint.

Exactly the four 3.x task rows were changed to `- [x]`; all 1.x and 2.x rows remained checked.

### TDD Cycle Evidence

| Task | Layer | Safety net / RED | GREEN | TRIANGULATE / REFACTOR |
|---|---|---|---|---|
| 3.1 | Unit/integration runner | Safety `npm test`: 736/736; RED `npm test`: 718 passed, 1 failed, 719 total from the expected missing script module | — | — |
| 3.2 | Unit/integration runner | Inherited 3.1 RED | `npm test`: 740/740 passed | — |
| 3.3 | Runner/core/wrapper integration | `npm test`: 741 passed, 1 failed, 742 total; wrapper ignored injected runtime/operation | `npm test`: 742/742 passed after minimal injectable wrapper boundary | Six outcomes, exact streams, temporary SIGINT removal, wait-for-settlement, and factory-backed sentinel exclusion passed |
| 3.4 | Refactor/final | — | — | Final `npm test`: 742/742 passed across 70 suites |

### Files, budget, and verification

- `scripts/probe-vtex-regional-read.ts`: **79 additions, 0 deletions**.
- `tests/vtex-regional-read-probe.test.ts`: **62 additions, 0 deletions** against the preserved Stack 3 begin-state copy.
- Stack 3 product total: **141 additions + 0 deletions = 141 authored lines**, within the authorized 140–185 range.
- Native selected-candidate projection: **141 product lines + 8 checkbox-substitution lines = 149**, within the authorized 148–193 total.
- `tasks.md`: exactly four 3.x checkbox substitutions; `apply-progress.md`: this cumulative evidence only.
- Help is exactly `Usage: npx tsx scripts/probe-vtex-regional-read.ts --ean=<8-14 ASCII digits>\n       npx tsx scripts/probe-vtex-regional-read.ts --help\n`.
- Invalid usage is exactly `Invalid usage. Run with --help.\n`; internal failure is exactly `Regional probe failed internally.\n`.
- Runner tests prove pre-abort skips the probe, during-probe abort waits for settlement, and both return 130 with empty streams. Wrapper evidence proves one temporary SIGINT listener, shared abort, listener removal, and no buffered writes after cancellation.
- The existing Stack 2 factory-backed report case now passes through the runner; pretty JSON stdout excludes every generated cookie/header/payload/error/transport sentinel.
- No live request, subprocess framework, package alias, output file, persistence, retry, logging, expanded target/timeout, core edit, or shared-module change was introduced.

### Deviations, remaining work, and handoff

- No design or scope deviation was made. The wrapper accepts an injectable process-shaped runtime solely for deterministic direct testing; production defaults remain the real process and accepted core operation.
- No implementation-owned task remains unchecked. Verification, native settlement, and every Git/delivery action remain parent-owned.
- `candidate_status: success_ready_for_parent_settlement`
