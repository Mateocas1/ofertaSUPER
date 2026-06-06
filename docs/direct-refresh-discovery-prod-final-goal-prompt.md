# Direct-refresh Discovery Prod-final `/goal` Prompt

Este artifact es el prompt operativo para ejecutar el roadmap aprobado en `docs/direct-refresh-discovery-prod-final-prd.md` sin atajos. El objetivo no es mover rapido: es llegar a `discovery-prod-final` con evidencia, rollback, freshness, performance y ownership reales.

## Uso

Copiar el bloque completo y ejecutarlo como `/goal` en una sesion nueva o limpia.

```text
/goal Execute the ofertasSUPER direct-refresh discovery prod-final roadmap from docs/direct-refresh-discovery-prod-final-prd.md with maximum rigor, zero shortcuts, and a hard success/closure protocol.

Mission:
Bring direct-refresh discovery from postwrite-ready tooling to the `discovery-prod-final` state defined in docs/direct-refresh-discovery-prod-final-prd.md. Success means source-scoped discovery can measure coverage, create missing products/source rows safely, audit writes, roll back by exact IDs, feed freshness recovery, protect VTEX/DB/public APIs, alert owners, and prove final acceptance. Coverage without freshness is only `coverage-operational`, never prod-final.

Primary source of truth:
1. docs/direct-refresh-discovery-prod-final-prd.md
2. docs/direct-refresh-production-operations-plan.md
3. AGENTS.md and project rules in the current workspace
4. Current git history and current local docs/code verified at execution time

Non-negotiable operating rules:
- Follow the PRD phase order exactly unless a decision record documents why a different order is technically safer, what tradeoff it creates, and which files/issues/artifacts are affected.
- Never run `npm run build`.
- Use Strict TDD for implementation work: write/adjust focused tests before production behavior where applicable.
- Do not touch unrelated untracked files such as `.pi-tmp-*`, `NUL`, or `context.md` unless a dedicated approved cleanup issue exists.
- Use conventional commits only. Never add Co-Authored-By or AI attribution.
- Keep work review-sized. If a work unit approaches >400 changed lines, split into chained PR/work-unit slices or record an explicit `size:exception` before continuing.
- No scheduler execution, all-source operation, repeated batches, DIA writes, deploys, secrets changes, remote config changes, cache purge, or production writes unless the phase has a dedicated approved issue and exact gate evidence.
- Every real write requires approved issue, source-scoped scope, fresh audit/prewrite, exact confirmation, apply report, postwrite PASS, rollback IDs, baseline/freshness observation, and issue evidence comment.
- Fail closed on missing, stale, malformed, mismatched, cross-source, cross-count, cross-attempt, cross-environment, or non-PASS evidence.
- Save Engram/project memory at the end of every completed phase, and immediately after any architecture decision, bug fix, non-obvious discovery, convention, or tradeoff.
- Do not mark the goal complete because of time, token budget, or partial progress. If not all final gates pass, persist state and report the last valid state.

Startup verification before work:
1. Read this goal prompt, the PRD, AGENTS.md, and current git status before modifying anything.
2. Reconstruct current phase from live evidence, not from memory. At authoring time, Phase 1 was still expected to fail until migration status, compliance posture, performance guard, and rollback-drill evidence are actually PASS; verify current truth.
3. List the active phase, last valid state, blocking gates, touched files, and allowed next work unit.
4. If local docs, memory, git history, and generated artifacts disagree, treat the disagreement as a blocker and resolve the source of truth before implementing.

Plan-adherence governor:
- Before each work unit, write the exact PRD requirement it advances and the gate it is intended to satisfy.
- After each work unit, prove whether that gate is PASS, STOPPED, or DEFERRED with artifact paths and command output.
- If a better technical path is found, do not silently pivot. Create a decision record containing: original plan step, proposed change, technical reason, tradeoff, risk, rollback impact, and affected acceptance gates.
- Never reduce acceptance criteria to make progress look better. If the real prod-final target is not feasible, document the lower operational state and why.
- Edge cases are first-class requirements: race conditions, stale evidence, malformed artifacts, duplicated SKU/EAN, cross-source leakage, cross-count leakage, cross-attempt leakage, DB env mismatch, VTEX hash drift, rate limits, blocked/captcha/HTML responses, mojibake, invalid GTIN, multi-seller ambiguity, stale public API claims, cache inconsistency, rollback partials, ledger conflicts, and owner/alert gaps must be inspected or explicitly justified as out of scope for the current phase.

Execution loop for every phase:
1. Read the relevant PRD phase and current files before acting.
2. State the phase objective, allowed boundary (read-only, dry-run, prewrite, apply), required artifacts, and hard stop rules.
3. Verify prerequisites from the previous phase. Missing evidence means STOP, not assumption.
4. Implement only the smallest reviewable work unit needed for the phase.
5. Run allowed focused verification for that work unit. Always run `git diff --check` for changed files. Never build.
6. Write or update required artifacts with lineage: issue, source, count, attempt, path, hash, git commit, tool/script version, schema version, DB/environment identity, source config snapshot, VTEX hash/probe timestamp when applicable.
7. Save memory and summarize phase result as PASS, STOPPED, or DEFERRED.
8. Continue only when the phase gate passes.

Canonical phase sequence and gates:

Phase 0 - PRD, plan truth, docs cleanup
- Verify this PRD and goal prompt are the current source of truth.
- Update stale docs so completed work is not listed as pending.
- Gate: no contradiction between PRD phases, issue sequence, and current operations docs.

Phase 1 - Pre-write foundation mandatory before any pilot apply
- Verify/implement DB constraints, schema/index gates, source lock, ledger/attempt identity, TTL, owner, stop/resume states, idempotency policy, artifact lineage, VTEX request budgets, compliance/allowed-use, minimum alert channel, and minimum performance guard.
- Require rollback drill EXECUTED before any real apply in non-prod/prod-like environment or controlled disposable-row mode, with exact IDs and post-rollback verification.
- Read-only rollback review is preparatory evidence only. It does not satisfy rollback proof.
- Minimum performance guard must include Prisma pool posture, transaction timeout posture, PriceHistory insert/read baseline, public API baseline, and cache TTL baseline.
- Gate: no apply if ledger/lock/TTL/owner, lineage, rollback drill executed, post-rollback verification, performance guard, VTEX budget, or compliance posture is missing.

Phase 2 - Discovery coverage denominator read-only
- Measure what "all products" means per writer-supported source with bounded VTEX/API requests.
- Produce denominator, dedupe, blocked/already-covered/candidate classification, formulas, and coverage/freshness metrics.
- Gate: each source has timestamped denominator, limitations documented, request budget respected, and no arbitrary single-query coverage claim.

Phase 3 - Source-row discovery pilot `count=1`
- Create exactly one missing source row for an existing global product.
- Gate: pre-write foundation PASS, discovery audit PASS, prewrite PASS, exact confirmation, apply report, postwrite PASS, rollback/no-partial verification, baseline/freshness observation, issue evidence comment.

Phase 4 - Product-and-source discovery pilot `count=1`
- Create exactly one global Product, one SupermarketProduct, and one PriceHistory when the EAN is absent globally.
- Gate: product quality review passes EAN/GTIN check digit, name, brand, image, category, URL, pack/unit, currency/list-price semantics, multi-seller selection, availability, and mojibake status.

Phase 5 - Controlled batch discovery `count<=5`
- Prove multiple candidates can be selected, created, audited, and rolled back without losing traceability.
- Gate: exact planned/applied counts match, no duplicate SKU/EAN, rollback IDs for each row, no stale prewrite, no degraded freshness baseline.

Phase 6 - Cross-source validation
- Validate Carrefour, Vea, Disco, Jumbo, and MAS independently, source-scoped.
- Gate: each writer-supported source has denominator, candidate classification, at least one successful appropriate pilot or documented blocker, VTEX hash/source health policy, and compliance posture.

Phase 7 - Freshness integration and recovery to SLO
- Ensure discovered rows enter refresh-existing/cadence freshness policy.
- Gate: discovered rows are included in freshness debt, recovery plan exists, public APIs do not claim current price for stale rows, and freshness reaches 95%/12h for prod-final. If not, state is `coverage-operational`, not prod-final.

Phase 8 - Performance and scalability validation
- Validate scale after pilots against Phase 1 baselines without harming VTEX, Prisma, PriceHistory, cache, or public APIs.
- Gate: no pool exhaustion, no transaction timeout, PriceHistory growth modeled, public APIs do not degrade versus baseline, and blocked/rate-limited VTEX sources STOP without automatic retry.

Phase 9 - Alerts, rollback certification, and ownership
- Revalidate/certify the Phase 1 rollback drill evidence if schema/env/tooling changed or evidence expired.
- Implement/test alert policy with severity, channel, owner, ack SLA, resolution SLA, escalation path, suppression/noise policy, and retry policy.
- Gate: test-alert proof, incident/no-partial verification, ownership handoff, and current rollback certification exist.

Phase 10 - Source-scoped discovery cadence design
- Design semi-automatic, human-controlled cadence. Disabled by default.
- Gate: one source per run, max count per run, cooldown, ledger conflict checks, budget checks, manual approval for increases, no all-source automation, and source health/VTEX hash recheck before live fetch.

Phase 11 - Prod-final acceptance and closure
- Verify every acceptance checkbox in the PRD.
- Final state can be `discovery-prod-final` only if coverage target, freshness 95%/12h, control plane, rollback, alerts, ownership, performance, cadence policy, and public API truth all pass.
- If coverage passes but freshness does not, report `coverage-operational` and do not claim prod-final.

Issue sequence to preserve:
1. `docs(data): add direct-refresh discovery prod-final PRD`
2. `feat(data): add discovery prewrite safety foundation`
3. `feat(data): add discovery denominator audit`
4. `ops(data): run source-row discovery pilot count1`
5. `ops(data): run product-and-source discovery pilot count1`
6. `ops(data): run controlled discovery batch count5`
7. `ops(data): validate discovery across writer-supported sources`
8. `feat(data): add discovery freshness bridge and recovery gate`
9. `perf(data): add discovery scale performance validation`
10. `feat(data): add discovery alerts and rollback drill certification`
11. `docs(data): design discovery source-scoped cadence`
12. `ops(data): certify discovery prod-final gate`

Mandatory stop rules:
- Stop if someone proposes "just test in prod" without artifact chain.
- Stop if discovery coverage is confused with freshness success.
- Stop if all-source, scheduler, repeated execution, DIA writes, deploys, secrets changes, remote config changes, cache purge, or production writes are attempted outside an approved phase/issue.
- Stop if VTEX hash/source health is ignored.
- Stop if apply lacks pre-write foundation PASS.
- Stop if apply lacks rollback drill executed pre-write.
- Stop if apply lacks minimum performance guard.
- Stop if artifact lineage lacks commit/schema/env/source config.
- Stop if denominator scales without VTEX budget and compliance posture.
- Stop if rows are written without postwrite plan.
- Stop if rollback is broad by EAN instead of exact IDs.
- Stop if edge cases are skipped as "improbable".
- Stop if code changes lack tests or documented technical justification.

Final success closure protocol:
1. Produce a final evidence report with phase-by-phase PASS/STOP status, artifacts, issue links/comments, commit hashes, verification commands, and remaining risks.
2. Run final hygiene checks for changed files, including `git diff --check`; run focused tests relevant to changed code; do not build.
3. Run adversarial review/Judgment Day on the final evidence if subagents/reviewers are available. Do not declare prod-final with any CRITICAL or real WARNING unresolved.
4. Re-run a final plan-adherence audit: every PRD acceptance item must map to current PASS evidence, and every documented tradeoff must still preserve prod-final semantics or explicitly lower the final state.
5. Reconfirm public truth: discovered products exist in the site/API with correct source association, prices/freshness semantics are honest, stale rows are not presented as current, and cache behavior matches policy.
6. Save Engram session summary with goal, instructions, discoveries, accomplished work, next steps, and relevant files.
7. Only then mark the goal complete and report:
   - final state: `discovery-prod-final` or the exact lower state reached;
   - evidence paths;
   - commits/PRs/issues;
   - verification performed;
   - rollback certification and owner/alert handoff status;
   - explicit statement that no build was run.

If blocked:
- Do not improvise around the blocker.
- Persist current phase state, exact failed gate, evidence, likely root cause, and minimal next action.
- Report the last valid state (`planning-ready`, `pilot-ready`, `coverage-operational`, `freshness-operational`) instead of claiming prod-final.
```

## Criterio de cierre

El goal solo puede cerrarse como exitoso si la Fase 11 del PRD pasa completa. Si no, el cierre correcto es reportar el estado menor alcanzado y dejar next steps concretos.
