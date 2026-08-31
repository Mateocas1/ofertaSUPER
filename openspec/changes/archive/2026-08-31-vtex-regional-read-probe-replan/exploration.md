# Exploration: vtex-regional-read-probe-replan

## Purpose and evidence read

`vtex-regional-read-probe-replan` is the sole active SDD authority for `vtex-regional-read-probe`. It supersedes `vtex-regional-read-probe` for every future apply, sync, and archive decision. The capability remains a selective live VTEX evidence overlay while SEPA remains the daily baseline.

## Active authority, historical evidence, and executable base

The old phase content survives only as immutable historical evidence in Engram observations 1472, 1473, 1475, 1477, and 1478, replay manifest 1484, and the provider-owned native ledger. Historical comparisons below are evidence only, not alternate operational instructions. Before acquire, the parent MUST fetch and re-resolve current `origin/master`, record the exact local/remote relation, revalidate the narrow VTEX contracts, and establish an isolated Stack 1 base. Original candidate `988aeeba076a55e734e1720cc1aad128b6fd5be9` is historical and non-executable; observed candidates are not durable product requirements.

After verified lifecycle completion, only this replan's full new-domain spec may sync to `openspec/specs/vtex-regional-read-probe/spec.md`. The stale original same-domain spec MUST never sync or archive into canonical capability state. The old active OpenSpec directory will be removed without syncing or archiving that stale spec.

Read inputs:
- `openspec/config.yaml` and `AGENTS.md`.
- All five original change artifacts: exploration, proposal, capability spec, design, and tasks.
- Existing baseline spec `openspec/specs/catalog-comparison-evidence-loop/spec.md`.
- Current targeted source/test evidence: `src/lib/vtex/client.ts`, `src/lib/vtex/encode.ts`, `src/lib/vtex/normalize.ts`, `src/lib/supermarkets.ts`, `scripts/probe-vtex.ts`, `scripts/pipeline/audit-utils.ts`, `tests/vtex.test.ts`, and `package.json`.
- Parent-supplied replay manifest 1484, including references to the official SEPA baseline, Engram observations 1464/1466/1468/1470, and the historical/non-executable original candidate base `988aeeba076a55e734e1720cc1aad128b6fd5be9`.

Evidence limitations:
- `.codegraph/` exists, but this executor has no CodeGraph MCP, CLI, or shell capability. After that check, exploration used only targeted reads and narrow searches.
- No Engram read/fetch tool was injected, so observations 1464/1466/1468/1470 and manifest observation 1484 could not be independently fetched; their parent-supplied constraints are preserved, not re-proven here.
- No git/shell tool was available to verify the checkout against the original candidate base. Targeted search found no current product implementation of the regional probe.
- No tests or live VTEX requests were run; this phase is exploration only.

## Fixed capability boundary

The smallest acceptable capability is one read-only CLI for one exact EAN at Jumbo, using anonymous VTEX sessions for exactly CP1425 and CP5000. It must:

1. Prove each submitted postal code was accepted.
2. Prove both required ephemeral cookies are present without exposing their values.
3. Prove each `checkout.regionId` is non-null.
4. Perform an exact-EAN public catalog lookup under each individually resolved regional context.
5. Return exactly one aggregate outcome from `found`, `confirmed_absent`, `rate_limited`, `transport_error`, `parse_error`, or `context_unresolved`.
6. Let positive exact evidence win even when the other target fails.
7. Return `confirmed_absent` only when both contexts are accepted, cookie-complete, non-null, regionally distinct, and return trustworthy non-matches.
8. Fail selling/list price handling safely, including a deterministic `price=3050`, `listPrice=252066` case that keeps `found` and nulls the unsafe list price.
9. Keep cookies invocation-local and never log, hash, report, fixture with real values, or persist them.

Explicit non-goals remain DB/cache access, ingestion or staging, publication, scheduling, availability changes, discovery, multi-retailer work, and changes to the SEPA baseline. The CLI accepts no target-expansion or write flags.

## Current architecture and relevant flows

### Existing VTEX read paths

- `src/lib/supermarkets.ts` owns retailer metadata and already resolves Jumbo to `https://www.jumbo.com.ar` through `getSupermarketBySlug("jumbo")`.
- `src/lib/vtex/encode.ts` owns public request construction. `buildVtexCatalogSearchRequest({ kind: "ean", value })` produces `/api/catalog_system/pub/products/search?fq=alternateIds_Ean:<ean>` and is the correct exact-query primitive.
- `src/lib/vtex/client.ts` has two existing network paths:
  - `probeVtexHash`/`fetchVtexProducts` use persisted-query GraphQL and are unrelated to the regional exact-EAN contract.
  - `fetchVtexDirectProducts` uses the public catalog request, retries failures, and normalizes the payload, but cannot inject per-region cookies and collapses errors in ways incompatible with the required taxonomy.
- `src/lib/vtex/normalize.ts` normalizes the first SKU of a product and already rejects list prices below selling price or above five times selling price. It does not reject non-positive selling prices, emit warnings, or reliably select a later SKU containing the requested EAN.
- `scripts/probe-vtex.ts` demonstrates JSON stdout and process exit behavior, but its permissive flag parsing and broad multi-source loop must not be copied as the new CLI contract.
- `scripts/pipeline/audit-utils.ts` provides useful single-flag/duplicate rejection patterns, but it does not reject arbitrary unknown flags by itself.

### Current tests

`tests/vtex.test.ts` uses Node's test runner and proves direct catalog URL construction, catalog normalization, payload traversal, and basic price extraction. `npm test` runs `tsx --conditions=react-server --test tests/**/*.test.ts`. There is no existing regional session, cookie secrecy, aggregate classification, or CLI test.

### Required future flow

```text
operator CLI --ean
  -> validate one 8-14 digit EAN and reject all other inputs
  -> core probe fixes retailer=jumbo and targets=[CP1425, CP5000]
  -> for each target, anonymous POST /api/sessions
  -> prove accepted postal code + required cookie presence + non-null regionId
  -> if individually resolved, GET exact-EAN public catalog with ephemeral cookies
  -> inspect every EAN-bearing product/SKU and normalize compact safe evidence
  -> aggregate: exact found first; then strict two-region absence; then failures
  -> emit one secret-free JSON report
```

The core must continue to the second target after the first target fails so a later exact hit can still win. Maximum live network work remains two session requests plus up to two catalog requests. No retry belongs in the core probe because retries obscure the single-invocation evidence classification.

## Recommended implementation surfaces for later phases

- `src/lib/vtex/regional-read-probe.ts`: fixed targets, transport dependency injection, session proof, secret handling, exact-EAN extraction, safe price evidence, per-target detail, and aggregate classification.
- `tests/vtex-regional-read-probe.test.ts`: deterministic scripted fake HTTP with sanitized session/catalog bodies and runtime-only synthetic cookie material.
- `scripts/probe-vtex-regional-read.ts`: thin read-only CLI in a separate stacked delivery.

Reuse `getSupermarketBySlug("jumbo")` and `buildVtexCatalogSearchRequest`. Do not call `fetchVtexDirectProducts`, alter shared VTEX client/normalizer semantics, or wire `package.json` initially.

## Historical comparison: replan deltas versus the original direction

1. **Use exactly three mandatory ordered review stacks.** Stack 1 delivers the adapter factory, core-facing seam, and raw-transport security tests; Stack 2 delivers session/catalog policy, report/aggregation, high-level core tests, and first factory-backed report secrecy evidence; Stack 3 delivers the CLI and CLI tests. They target `master`, Stack 1, and Stack 2 respectively. Each independently stays at or below 400 authored changed lines with no size exception, uses strict TDD with exact `npm test`, and follows auto-chain delivery. This preserves the corrected Stack 1→2→3 dependency story without widening scope.
2. **Prefer a compact probe-specific exact-EAN extractor over `normalizeProduct`.** The original design proposed reordering a shallow product copy so a matching later SKU becomes first, then inspecting raw offers again for warnings. That couples probe correctness to first-SKU shared behavior and duplicates traversal. A narrow extractor in the isolated module can select the exact matching SKU once, emit only required evidence, and apply Jumbo price safety without changing ingestion semantics.
3. **Separate secret-bearing transport data from serializable reports.** The original broad `headers` response type makes accidental header serialization easier. The transport boundary should expose only status, body, and an internal non-serializable cookie input needed by session resolution; report construction should whitelist fields and never retain raw request/response headers or raw errors.
4. **Use explicit observed session paths, not recursive/fuzzy context discovery.** Postal-code acceptance and `checkout.regionId` parsing should recognize only the response paths established by evidence 1464/1466/1468/1470. An unrelated occurrence of the submitted digits must not count as acceptance. Unknown envelopes are `parse_error`; recognized envelopes lacking proof are `context_unresolved`.
5. **Define trustworthy non-match structurally.** An empty catalog array is trustworthy absence evidence. A non-empty array is trustworthy only when every relevant entry can be inspected for EAN candidates and none equals the request. Malformed/uninspectable entries must yield `parse_error`, never `confirmed_absent`.
6. **Sanitize failures at the transport boundary.** Convert axios/fetch failures immediately into stage, classification, safe code, and optional status. Never attach raw error objects, configs, headers, response bodies, or cookie-bearing URLs to reports or CLI stderr.

The fixed aggregate precedence, target set, outcomes, read-only behavior, SEPA baseline, and 3050/252066 handling are preserved unchanged.

## Classification and safety notes

- `found`: at least one individually resolved target has an exact EAN match. This wins over every other target failure.
- `confirmed_absent`: both target contexts are fully resolved, their region IDs are non-null and distinct, and both catalog results are trustworthy non-matches.
- `rate_limited`: HTTP 429, plus only explicitly recognized anti-bot evidence if later design documents narrow markers.
- `transport_error`: timeout, DNS/TLS/network failure, or non-success HTTP that is not narrowly proven rate limiting.
- `parse_error`: successful transport with invalid JSON, an unexpected envelope, or catalog entries insufficient to prove an exact match/non-match.
- `context_unresolved`: a recognized session envelope that does not prove accepted postal code, both required cookies, non-null region, or regional distinctness needed for absence.

Selling price is trusted only when finite and positive. List price is trusted only when selling price is trusted and `price <= listPrice <= price * 5`; otherwise it is null with a warning. Price warnings never downgrade exact presence.

## Deterministic TDD map for later implementation

Strict TDD must use exact command `npm test`.

Stack 1 tests should prove the adapter factory preserves the raw-transport security contract: exact requests, separate-cookie handling, target isolation, closed status/body classification, and immediate secret/error collapse.

Stack 2 tests should prove: (1) both accepted contexts resolve to non-null distinct region IDs without secret output; (2) exact match in either target produces `found`, including when the other target is rate-limited, transport-failed, unparseable, or unresolved; (3) empty and inspectable mismatched results produce `confirmed_absent` only across both distinct resolved targets; (4) rejected postal code, missing either cookie, null region, and same-region absence fail as `context_unresolved`; (5) matching EAN on a non-first SKU is selected exactly; (6) the 3050/252066 case remains `found`, preserves selling price 3050, nulls list price, and emits a warning; and (7) the first factory-backed report secrecy evidence excludes every generated sentinel.

Stack 3 CLI tests should prove required/duplicate/invalid `--ean`, help, positional and unknown flag rejection, all expansion/write flag rejection, JSON-only stdout for supported outcomes, sanitized stderr, and semantic exit codes. No live HTTP, DB, Redis, filesystem output, or package-script mutation is needed.

## Open decisions for proposal/design

1. Confirm the exact allowlisted VTEX session JSON paths for accepted postal code and `checkout.regionId` from the cited evidence observations; do not invent a permissive parser.
2. Choose the smallest default HTTP adapter that preserves multiple `Set-Cookie` lines and supports abort timeouts without exposing raw errors. Axios is installed, but its error config can contain request headers and therefore requires immediate sanitization.
3. Decide the narrow anti-bot signatures, if any, that elevate 403/503 from `transport_error` to `rate_limited`; 429 remains unambiguous.
4. Finalize the minimal JSON report fields and CLI exit codes. Region IDs and cookie-presence booleans are sufficient context evidence; raw headers/bodies are forbidden.
5. Clarify budget accounting before tasks: each stacked slice must stay at or below 400 authored lines, and generalized abstractions or stored fixture suites are not acceptable escape hatches.

## Risks

- The session request/response contract is evidence-dependent and may drift; permissive parsing would create false regional proof, while strict parsing may conservatively increase `context_unresolved`/`parse_error`.
- `Set-Cookie` handling is runtime-specific; comma-splitting a collapsed header can corrupt values, especially around `Expires`, and must be avoided.
- Reusing shared `normalizeProduct` can select the wrong SKU and hide the raw unsafe list price; isolated exact-SKU extraction is safer.
- Any raw axios error or header serialization could leak ephemeral cookies even when the report type appears safe.
- A non-empty but malformed catalog result can create false absence unless inspectability is required.
- The historical 370-430 line estimate is already over budget at the high end; the mandatory Stack 1→2→3 split and compact report types are necessary.
- Current repository context reports Next.js 15 in OpenSpec while `package.json` contains Next.js 16.3.1. This flow should avoid Next.js files entirely, but the metadata drift remains relevant if scope expands.

## Exploration conclusion

The replan is the active authority and preserves the historical product boundary while tightening implementation around a probe-specific exact-SKU extractor, a secret-minimizing transport/report boundary, strict non-match proof, and the mandatory Stack 1→2→3 delivery sequence. No product files or historical evidence were modified during exploration.
