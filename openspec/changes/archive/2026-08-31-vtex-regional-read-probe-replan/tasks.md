# Tasks: VTEX Regional Read Probe Replan

## Active authority, historical evidence, and executable base

`vtex-regional-read-probe-replan` is the sole active SDD authority and supersedes `vtex-regional-read-probe` for every future apply, sync, and archive decision. Old phase content survives only as immutable historical evidence in Engram observations 1472, 1473, 1475, 1477, and 1478, replay manifest 1484, and the provider-owned native ledger; historical comparisons are non-operational. Before any acquire, the parent MUST fetch and re-resolve current `origin/master`, record the exact local/remote relation, revalidate the narrow VTEX contracts, and establish an isolated Stack 1 base. Original candidate `988aeeba076a55e734e1720cc1aad128b6fd5be9` is historical and non-executable; observed candidates are not durable product requirements.

After verified lifecycle completion, only this replan's full new-domain spec may sync to `openspec/specs/vtex-regional-read-probe/spec.md`. The stale original same-domain spec MUST never sync or archive into canonical capability state. The old active OpenSpec directory will be removed without syncing or archiving that stale spec.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 860–970 total authored lines: Stack 1 350–385; Stack 2 370–400; Stack 3 140–185 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Stack 1 (adapter factory/core-facing seam/raw-transport security tests) → Stack 2 (session/catalog policy/report/aggregation/high-level core tests/first factory-backed report secrecy evidence) → Stack 3 (CLI/CLI tests) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
| Estimated review time | 125–155 minutes total: Stack 1 45–60, Stack 2 55–60, Stack 3 25–35 |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

The chain shape is resolved; the remaining decision is a later, explicit safe dirty-worktree/branch execution setup that preserves the current dirty and untracked baseline. No Git, worktree, branch, commit, or PR action is authorized by these tasks.

## Scope and delivery boundaries

- Intended future edit surfaces only: `src/lib/vtex/regional-read-probe.ts`, `tests/vtex-regional-read-probe.test.ts`, and, only in Stack 3, `scripts/probe-vtex-regional-read.ts`.
- `package.json`, shared VTEX modules, Next.js, persistence, SEPA, ingestion/publication, scheduler, cache, provider behavior, historical old-change evidence, and every other surface are excluded from future implementation edits.
- Strict TDD is mandatory: each RED, GREEN, TRIANGULATE, and REFACTOR checkpoint runs exactly `npm test`; tests remain with the behavior they verify and use deterministic fakes only.
- No stack may exceed 400 authored changed lines (additions plus deletions); no size exception is allowed. If RED evidence projects an overrun, stop apply and return to the parent for an artifact revision that still fits this exact three-stack boundary before implementation continues; do not add a fourth stack, omit evidence, move secrets into core, widen scope, or exceed the cap.

```text
master
 └─ Stack 1: adapter factory, core-facing seam, raw-transport security tests (targets master)
     └─ Stack 2: session/catalog policy, report/aggregation, high-level core tests, first factory-backed report secrecy evidence (targets Stack 1)
         └─ Stack 3: CLI and CLI tests (targets Stack 2)
```

Canonical session enum values remain `delivery_strategy: auto-chain` and `chain_strategy: stacked-to-main`; the human branch mapping above is the repository's actual `master` chain, never a literal `main` target.

Each future delivery unit is a review slice, not authorization to create a commit or PR. Each must start from the parent-approved isolated execution setup with the pre-existing dirty baseline preserved, finish with only its listed future surfaces changed, and be rollbackable by removing only that unit's isolated changes without reset/restore/cleanup of unrelated work.

## Parent-owned pre-apply actions

- Before the Stack 1 acquire, fetch and re-resolve current `origin/master`, record the exact local/remote relation, revalidate the narrow VTEX contracts, and establish the isolated Stack 1 base. Before every later acquire or apply invocation, retain the recorded relation and revalidate it when the local or remote reference has changed.
- Obtain explicit authorization for the safe worktree/branch setup, record how the current dirty and untracked baseline will be preserved, and make Stack 1's isolated start state available; do not delegate this Git/PR decision to `sdd-apply`.
- Every Stack 1 acquire or apply invocation MUST receive only the explicitly human-authorized task range `1.1–1.4`; every Stack 2 invocation MUST receive only `2.1–2.4`; and every Stack 3 invocation MUST receive only `3.1–3.4`. Native `sdd-owner: implementation` markers remain, but unchecked later tasks alone never authorize advancement.
- Before each later stack, confirm its predecessor's accepted slice and target relationship (`master` ← Stack 1 ← Stack 2 ← Stack 3); obtain separate explicit authorization before any branch, commit, push, or PR action. These tasks do not claim that authorization.

## 1. Stack 1 — adapter factory, core-facing seam types, and deterministic raw-transport tests

**Target/dependency:** first auto-chain / stacked-to-main slice, targeting repository default branch `master`; no CLI or core policy operation, report construction, or stub operation beyond the safe seam. **Forecast:** 350–385 authored lines; 45–60 minutes review. **Edit surfaces:** `src/lib/vtex/regional-read-probe.ts` and `tests/vtex-regional-read-probe.test.ts` only. **Start/end/rollback:** start from the parent-approved isolated baseline; end with factory/seam behavior and its raw-transport tests passing, no operational caller; rollback removes only Stack 1 changes from these two paths.

**Stack 1 apply gate:** acquire or apply only after the parent has explicitly human-authorized range `1.1–1.4`; pass only `1.1–1.4` to that invocation. Native markers and unchecked Stack 2/3 tasks do not authorize advancement. Branch, commit, push, and PR operations require separate user authorization and are not claimed here.

- [x] **1.1 RED — add deterministic raw-transport factory tests in `tests/vtex-regional-read-probe.test.ts` before production code exists.** <!-- sdd-owner: implementation -->
  - Exercise the test-visible `createRegionalProbeHttp(request)` through a raw callback fake: exact session POST and catalog GET application configs, literal 10,000 ms timeout, shared signal, no redirects, all-status acceptance, disabled transforms, one callback per operation, no retry/alternate URL, leading-zero EAN preservation, and `buildVtexCatalogSearchRequest`-derived catalog URL.
  - Cover separate `set-cookie` line parsing: final exact case-sensitive assignment wins; attributes discarded; first `=` split only; `=` valid in values; missing/empty/scalar/collapsed/non-string/differently-cased/empty-or-invalid final assignments yield false and no catalog closure; never comma-split; outbound header order is exactly `vtex_session=<final>; vtex_segment=<final>`; distinct CP closures cannot cross-contaminate.
  - Cover factory-local response classification: 429 without body inspection; 403/503 only with ASCII-case-folded contiguous `captcha`, `access denied`, or `too many requests` wholly in bytes 0–65,535; match ending at 65,535; crossing/after-boundary and generic 403/503/other statuses as transport failures; invalid status/data and fatal UTF-8/JSON failures as closed safe kinds.
  - Run exactly `npm test` and record the expected RED failure; generate synthetic bytes, cookies, and sentinels at runtime with no live request, real cookie fixture, raw-body fixture, or secret-bearing snapshot.

- [x] **1.2 GREEN — implement only the `RegionalProbeHttp` seam, safe result/type contracts, and `createRegionalProbeHttp` factory in `src/lib/vtex/regional-read-probe.ts` until Stack 1 RED tests pass.** <!-- sdd-owner: implementation -->
  - Keep raw Axios-compatible request/config/response types module-private; export only the high-level seam, closed payload/session kinds, factory, report-facing types, and later-operation contract. Bind the default transport once from a dedicated interceptor-free Axios instance without exposing raw Axios objects to core.
  - Decode and parse only 2xx bytes inside the factory; drop raw response/status/header/body/text/URL state; retain cookie values only inside the target-scoped catalog closure; emit only parsed `unknown`, cookie-presence boolean, or `rate_limited`/`timeout`/`transport_error`/`parse_error`/`aborted`.
  - Collapse unknown rejections at the factory boundary using only external abort state and safely-readable string `code`: `ERR_CANCELED`/external abort → `aborted`, `ECONNABORTED`/`ETIMEDOUT` → `timeout`, otherwise `transport_error`; do not stringify, serialize, log, spread, retain, or read messages, stacks, config, request, response, headers, data, URLs, or `toJSON`.
  - Run exactly `npm test` and record GREEN evidence.

- [x] **1.3 TRIANGULATE — extend the same factory tests with adversarial security and isolation matrices, then make the minimum seam-only fixes.** <!-- sdd-owner: implementation -->
  - Use runtime-only sentinels in thrown error message, stack, config/cookie, URL, request, response headers/data, and `toJSON`; prove `toJSON` is not accessed and the factory returns only the exact closed kind.
  - Drive `openSession` and, when present, only that result's target-scoped `readCatalog` closure directly; inspect only their safe high-level `kind`, parsed-payload, `requiredCookiesPresent`, and closure-nullability values. With runtime-only cookie, header, non-2xx-body, URL, and rejection sentinels, prove those safe values remain closed and `toJSON` is never accessed; test session and catalog timeout, cancellation, and generic network-shaped rejection at both stages. Do not invoke `probeJumboRegionalEan`, construct a report, call `JSON.stringify`, or add a stub core operation in Stack 1.
  - Re-run exactly `npm test` after RED additions and after GREEN fixes; preserve deterministic fake transport and no live I/O.

- [x] **1.4 REFACTOR and Stack 1 acceptance checkpoint — compact tables/helpers without weakening the raw-transport matrix, then enforce the slice boundary.** <!-- sdd-owner: implementation -->
  - Run exactly `npm test`; measure additions plus deletions for only Stack 1's two allowed paths and, if the forecast or hard 400-line cap is threatened, stop the invocation and return to the parent for an artifact revision that preserves exactly three stacks; do not implement or add a fourth slice.
  - Verify no secret sentinel, cookie value, raw body/header/error/URL, stock/availability field, live request, output file, persistence/cache/queue/scheduler action, retry, redirect, shared-module edit, or side effect is introduced; confirm only the two Stack 1 surfaces changed.

## 2. Stack 2 — session/catalog policy, report/aggregation, and high-level core fake tests

**Target/dependency:** second auto-chain / stacked-to-main slice, targeting Stack 1 after it is accepted; it adds the first operational core/report path and must not duplicate raw-adapter matrices or add the CLI. **Forecast:** 370–400 authored lines; 55–60 minutes review. **Edit surfaces:** `src/lib/vtex/regional-read-probe.ts` and `tests/vtex-regional-read-probe.test.ts` only. **Start/end/rollback:** start from the accepted Stack 1 seam in the parent-approved isolated setup; end with a callable but unexposed core, report construction, and policy/secrecy tests passing; rollback removes only Stack 2 changes from these two paths, leaving Stack 1 intact.

**Stack 2 apply gate:** acquire or apply only after Stack 1 is accepted and the parent has explicitly human-authorized range `2.1–2.4`; pass only `2.1–2.4` to that invocation. Native markers and unchecked Stack 3 tasks do not authorize advancement. Branch, commit, push, and PR operations require separate user authorization and are not claimed here.

- [x] **2.1 RED — add high-level `RegionalProbeHttp` fake tests for fixed execution, recognized session proof, and closed target failure mapping.** <!-- sdd-owner: implementation -->
  - Require Jumbo-only validation of one 8–14 ASCII-digit EAN with leading zeros preserved, a one-shot injected valid UTC clock, sequential CP1425 then CP5000 execution, both targets continuing after found/failure, at most one session plus conditional catalog call per target, literal 10,000 ms inputs, no retry, and abort propagation with no report.
  - Require only exact plain-object session paths `namespaces.public.postalCode.value` and `namespaces.checkout.regionId.value`; prove accepted code, both cookie-presence proof, and non-empty region are independently required; recognized incomplete envelopes emit all applicable context codes and suppress only that target catalog call; unknown/invalid successful sessions are `parse_error`.
  - Require safe kind mapping to stage-specific rate/timeout/transport/payload codes, the closed outcome vocabulary, and no raw transport semantics in this high-level fake; run exactly `npm test` and record RED evidence without live VTEX or real cookies.

- [x] **2.2 GREEN — implement the fixed two-target core policy and report construction in `src/lib/vtex/regional-read-probe.ts` until the initial Stack 2 tests pass.** <!-- sdd-owner: implementation -->
  - Assemble exactly schemaVersion 1 top-level fields and CP1425/CP5000 target records in required order, with null unavailable proofs, one injected `observedAt`, whitelisted compact match fields, ordered duplicate-free warning/failure unions, and no stock, availability, timings, URLs, raw products/offers, cookies, or free-form errors.
  - Implement found-first aggregation, strict distinct-region `confirmed_absent`, same-region `context_unresolved` plus aggregate-only `regions_not_distinct`, and fallback precedence `rate_limited` > `transport_error` > `parse_error` > `context_unresolved`.
  - Run exactly `npm test` and record GREEN evidence.

- [x] **2.3 TRIANGULATE — extend the high-level core fake matrix for catalog traversal, safe prices, trustworthy absence, report order, all aggregate combinations, and the first factory-backed core/report secrecy case, then harden only the core module.** <!-- sdd-owner: implementation -->
  - Prove top-level-array-only traversal across every product/SKU in payload order using exact string `ean`, `EAN`, and `referenceId[].Value/value`; preserve every matching SKU, emit product-only null-price evidence with `exact_ean_without_sku_match`, never borrow another SKU price, and retain found despite malformed siblings while retaining `catalog_payload_uninspectable`.
  - Prove empty-array absence; fully inspectable non-empty mismatches; malformed products/SKU collections/EAN candidates/reference arrays block absence as `parse_error`; exact evidence wins over every other target failure and same-region resolution.
  - Prove exactly one `sellerDefault === true`, allowed `commertialOffer` then fallback `commercialOffer`, safe finite positive selling price, inclusive 1x–5x list-price bounds, missing/ambiguous seller, unusable selling price, unusable list price, and the 3050/252066 → 3050/null case; warnings never downgrade found.
  - After `probeJumboRegionalEan` exists, add the first factory-backed end-to-end core/report secrecy matrix: pass `createRegionalProbeHttp(rawRequestFake)` to the operation, cover generated transport/cookie/error sentinels plus unrelated successful-payload sentinels, and prove the combined adapter and report allowlists remove every sentinel from the completed report and `JSON.stringify(report)`. The recording assertion may observe only factory-safe high-level values; keep raw config, cookie parsing, status/body classification, and rejection matrices owned by Stack 1.
  - Prove field order, target/match order, closed code vocabulary/order/deduplication, all six target/aggregate outcomes, strict two-region absence, every fallback-precedence pairing, and sentinel-free serialized reports. Run exactly `npm test` after each RED addition and GREEN correction.

- [x] **2.4 REFACTOR and Stack 2 acceptance checkpoint — consolidate deterministic payload builders/tables and enforce the second hard slice boundary.** <!-- sdd-owner: implementation -->
  - Run exactly `npm test`; measure Stack 2 additions plus deletions in its two allowed paths and, if RED evidence threatens the forecast or 400-line cap, stop the invocation and return to the parent for an artifact revision that preserves exactly three stacks rather than adding a fourth stack, omitting matrix evidence, or requesting an exception.
  - Verify all test inputs are parsed high-level fakes or generated synthetic values, no live requests/real cookie fixtures/raw transport retention occur, no persistence/output/cache/queue/scheduler/SEPA side effect exists, and no files outside Stack 2's two surfaces changed.

## 3. Stack 3 — CLI and CLI tests

**Target/dependency:** final auto-chain / stacked-to-main slice, targeting Stack 2 only after Stack 1 and Stack 2 are accepted. **Forecast:** 140–185 authored lines; 25–35 minutes review. **Edit surfaces:** `scripts/probe-vtex-regional-read.ts` and `tests/vtex-regional-read-probe.test.ts` only; `src/lib/vtex/regional-read-probe.ts` is read-only in this stack. **Start/end/rollback:** start from accepted Stack 2 core in the parent-approved isolated setup; end with the manual buffered CLI and its tests passing; rollback removes only Stack 3 script/test changes without altering either core stack.

**Stack 3 apply gate:** acquire or apply only after Stack 2 is accepted and the parent has explicitly human-authorized range `3.1–3.4`; pass only `3.1–3.4` to that invocation. Native markers do not independently authorize advancement. Branch, commit, push, and PR operations require separate user authorization and are not claimed here.

- [x] **3.1 RED — add deterministic CLI runner tests in `tests/vtex-regional-read-probe.test.ts` before adding the script.** <!-- sdd-owner: implementation -->
  - Require only exactly one `--ean=<8-14 ASCII digits>` token or exactly one `--help`; reject no token, spaced/positional/duplicate EAN, combined help, unknown flags, retailer/postal/SKU/category expansion, output/write, and timeout forms with no probe call.
  - Assert exact buffered help text to stdout with newline and exit 0; exact `Invalid usage. Run with --help.\n` to stderr with empty stdout and exit 2; supported reports as exactly `JSON.stringify(report, null, 2) + "\n"` once with empty stderr and exits 0 for `found`/`confirmed_absent` or 1 otherwise.
  - Add pre- and during-probe abort cases returning 130 with both streams empty, plus unexpected secret-bearing thrown errors returning only `Regional probe failed internally.\n` on stderr and exit 3; run exactly `npm test` and record RED evidence with an injected fake operation only.

- [x] **3.2 GREEN — implement `scripts/probe-vtex-regional-read.ts` as the thin buffered runner and executable wrapper until Stack 3 RED tests pass.** <!-- sdd-owner: implementation -->
  - Export the small testable runner accepting argv, an injected probe operation, and an `AbortSignal`; keep the wrapper responsible only for temporary SIGINT wiring, shared abort, waiting for settlement, removing the handler, and one buffered stream write after a complete non-aborted result.
  - Invoke the core only for valid input, never add a package alias, timeout override, output file, write mode, logging, retry, or target expansion, and never print raw error details or partial JSON.
  - Run exactly `npm test` and record GREEN evidence.

- [x] **3.3 TRIANGULATE — complete CLI-to-core acceptance evidence in the same test file and make minimal script-only fixes.** <!-- sdd-owner: implementation -->
  - Exercise each supported outcome exit mapping, all invalid grammar classes, exact stream emptiness/newline rules, no-request help/errors, cancellation before and during work, and fixed internal-error sanitization.
  - Reuse one Stack-2-established factory-backed core case through the buffered runner and prove its completed serialized stdout retains only the report's closed schema and excludes its generated sentinels. This is core-to-CLI serialization evidence only: do not add or duplicate factory transport, cookie, status/body, or rejection matrices in Stack 3.
  - Run exactly `npm test` after RED additions and GREEN fixes; make no live call, filesystem output, persistent-state change, or stock/availability claim.

- [x] **3.4 REFACTOR and final slice checkpoint — simplify only the script/test helpers, preserve exact output semantics, and enforce the final hard cap.** <!-- sdd-owner: implementation -->
  - Run exactly `npm test`; measure Stack 3 additions plus deletions in its two allowed paths and stop for a separately approved replan if the hard 400-line cap would be exceeded.
  - Confirm the completed three-slice diff remains limited to `src/lib/vtex/regional-read-probe.ts`, `tests/vtex-regional-read-probe.test.ts`, and `scripts/probe-vtex-regional-read.ts`; confirm no secret retention, live fixture/request, output file, persistence/product-state change, shared VTEX/Next.js/package edit, or SEPA-baseline change.
