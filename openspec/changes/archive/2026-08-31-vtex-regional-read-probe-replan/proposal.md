# Proposal: VTEX Regional Read Probe Replan

## Intent

Add a narrowly bounded, read-only operator capability that collects live Jumbo VTEX catalog evidence for one exact EAN under the two approved anonymous regional contexts, CP1425 and CP5000. The probe will help operators investigate whether an EAN is present or can be safely confirmed absent without changing ofertaSUPER product state or displacing SEPA as the daily regional baseline.

`vtex-regional-read-probe-replan` is the sole active SDD authority and supersedes `vtex-regional-read-probe` for every future apply, sync, and archive decision. This replan preserves the historical product direction while making the evidence contract more auditable, conservative, and explicit; it does not widen the capability beyond Jumbo, the two fixed postal-code contexts, and one exact EAN per invocation.

## Active authority, historical evidence, and executable base

Old phase content survives only as immutable historical evidence in Engram observations 1472, 1473, 1475, 1477, and 1478, replay manifest 1484, and the provider-owned native ledger. Historical comparisons in this proposal are explicitly non-operational. Before acquire, the parent MUST fetch and re-resolve current `origin/master`, record the exact local/remote relation, revalidate the narrow VTEX contracts, and establish an isolated Stack 1 base. Original candidate `988aeeba076a55e734e1720cc1aad128b6fd5be9` is historical and non-executable; observed candidates are not durable product requirements.

After verified lifecycle completion, only the replan's full new-domain spec may sync to `openspec/specs/vtex-regional-read-probe/spec.md`. The stale original same-domain spec MUST never sync or archive into canonical capability state. The old active OpenSpec directory will be removed without syncing or archiving that stale spec.

## Problem

Jumbo's live VTEX catalog evidence can vary by anonymous regional session. The current SEPA-backed process remains the appropriate daily baseline, but it does not provide a selective operator-facing way to inspect one exact EAN across the two relevant live VTEX contexts.

The original proposal established the right read-only boundary, but left important product behavior underspecified: exact matches hidden below product-level or non-first-SKU structures, malformed non-empty responses that could be mistaken for absence, seller selection for price evidence, stable report and CLI semantics, secret-safe failure handling, and deterministic aggregation when the two targets disagree. Without those rules, operators could receive evidence that is difficult to audit, inconsistent between runs, or unsafe to interpret as absence.

## Users and situations

The direct users are ofertaSUPER operators and maintainers investigating a specific Jumbo EAN. They need the probe when daily baseline evidence needs a selective live comparison, especially when regional differences, suspicious price data, or a possible catalog absence require explanation.

The capability is diagnostic rather than automated. It is invoked manually for one known EAN, returns one self-contained report, and does not publish, stage, schedule, cache, or persist its result.

## Desired outcome

An operator can invoke a single-purpose CLI with one valid EAN and receive auditable, sanitized JSON evidence for both CP1425 and CP5000. The report clearly distinguishes exact catalog presence, strictly proven absence, and fail-closed conditions. It preserves enough stable per-target evidence to explain the result while excluding cookies, raw transport details, unstable error text, and stock or availability interpretations.

The capability succeeds as a product when:

- exact catalog presence is not hidden by regional failures, product/SKU shape, or unusable prices;
- absence is reported only from two accepted, cookie-complete, non-null, distinct regional contexts with structurally trustworthy non-matches;
- every supported probe outcome has deterministic JSON, warning/failure codes, and process semantics;
- the probe has no persistent or product-state side effects; and
- SEPA remains the daily regional baseline.

## Scope

### In scope

- Jumbo only, using the existing Jumbo identity and public VTEX surface.
- Exactly two anonymous session targets: CP1425 and CP5000.
- Exactly one requested EAN, represented as an 8–14 digit string with leading zeros preserved and no checksum enforcement.
- One anonymous context attempt and, when that context is individually usable, one exact-EAN catalog request per target.
- Accepted-postal-code proof, presence proof for all required session cookies, and a non-null `checkout.regionId` for each usable context.
- Distinct-region proof as a mandatory condition for aggregate `confirmed_absent`.
- Exact-EAN catalog presence and compact sanitized evidence for every exact match.
- Jumbo primary/default-seller selling and list price evidence, with fail-safe null values and stable warning codes when prices cannot be trusted.
- Per-target and aggregate classification using only `found`, `confirmed_absent`, `rate_limited`, `transport_error`, `parse_error`, and `context_unresolved`.
- One versioned, deterministic, human-readable JSON report for every supported outcome.
- A read-only CLI with strict argument, output, interruption, timeout, and exit-code behavior.
- Deterministic fake-HTTP tests in later implementation phases, executed under strict TDD with `npm test`.

### Non-goals

- Any retailer other than Jumbo or any postal code other than CP1425 and CP5000.
- EAN, SKU, category, product, retailer, or region discovery/enumeration.
- Stock or availability retrieval, interpretation, reporting, or mutation. `found` means exact catalog presence only.
- Database, Redis/cache, ingestion, staging, reconciliation, publication, filesystem-output, or product-state writes.
- Scheduler, cron, queue, workflow, retry/backoff, or automatic execution changes.
- SEPA baseline, provider fallback/rollback, or daily ingestion behavior changes.
- Persistent sessions, cookie jars, real response fixtures, cookie logging, cookie hashing, cookie reporting, or any other retention of cookie values.
- Generalized multi-retailer abstractions or changes to shared ingestion/client/normalizer semantics.
- Package command aliases, target-expansion flags, output-file flags, write flags, or timeout overrides.

## Product and acceptance boundary

### Exact input and fixed execution

- The sole probe argument is exactly one `--ean=<value>` token, where `<value>` matches 8–14 ASCII digits. Leading zeros are significant.
- Spaced values, positional EANs, duplicate `--ean`, unknown flags, target-expansion flags, and write/output forms are invalid usage.
- `--help` is the only non-probe command; it prints readable usage to stdout and exits `0`.
- Every valid probe invocation evaluates both CP1425 and CP5000, even after an early exact match.
- Each target has at most one session request and one catalog request, with no automatic retry. An invocation therefore makes at most four live requests.
- Every live request has a fixed 10-second timeout with no CLI override.

### Regional context proof

- A target is individually usable only when the anonymous session response proves the submitted postal code was accepted, proves the required cookies are present, and provides a non-null regional identifier.
- Cookie values are invocation-local transport secrets. They are never logged, hashed, reported, persisted, included in fixtures, or retained in serializable errors.
- A recognized session response that lacks accepted-postal-code, required-cookie, or non-null-region proof is `context_unresolved` for that target.
- A malformed or structurally unknown successful session response is `parse_error`, not regional proof.
- CP1425 and CP5000 may still be probed when they resolve to the same region. Same-region resolution blocks only `confirmed_absent`; it cannot override an exact `found` result.

### Exact catalog evidence

- `found` means exact catalog presence and does not imply stock or availability.
- Exact-EAN inspection considers all relevant product and SKU evidence rather than relying on payload order or the first SKU.
- A product-level exact EAN is sufficient presence evidence. If it has no inspectable matching SKU, it remains `found`, reports null prices, and includes the mandatory `exact_ean_without_sku_match` warning code; another SKU's price must never be borrowed.
- When an inspectable matching SKU exists, price evidence comes only from Jumbo's primary/default seller for that matching SKU.
- An exact EAN without a usable primary/default-seller price remains `found`; selling and list prices are null as needed and the report carries a closed safe warning code.
- Selling price is reportable only when finite and positive. List price is reportable only when finite, not lower than the trusted selling price, and no more than five times that price. Unsafe values become null with closed warning codes and never downgrade `found`.
- The observed Jumbo case `price=3050` and `listPrice=252066` therefore remains `found`, preserves selling price `3050`, nulls list price, and carries the appropriate closed warning code.
- All exact matches are retained as compact sanitized evidence. Raw products, offers, response bodies, and transport objects are excluded.

### Trustworthy non-match and aggregation

- An empty catalog array is a trustworthy non-match.
- A non-empty catalog result is a trustworthy non-match only when every relevant entry is structurally inspectable for EAN evidence and none contains the requested exact EAN.
- Any opaque or malformed entry blocks absence and produces `parse_error` unless exact positive evidence elsewhere makes the aggregate result `found`.
- Aggregate `found` wins whenever either target supplies exact evidence, including when the other target fails or when both contexts resolve to the same region.
- Aggregate `confirmed_absent` requires both submitted postal codes to be accepted, both required-cookie sets to be present, both regional identifiers to be non-null and distinct, and both catalog results to be trustworthy non-matches.
- When neither `found` nor `confirmed_absent` applies, aggregate precedence is exactly `rate_limited` over `transport_error` over `parse_error` over `context_unresolved`.
- `rate_limited` means HTTP 429 or only narrowly allowlisted anti-bot evidence. Generic 403/503 responses or unstable body text must not be broadened into rate-limit evidence without the later specification/design defining the closed allowlist.

### Report and process contract

- Every report has `schemaVersion: 1`, the requested EAN, retailer identity, one aggregate outcome, one sanitized detail for each fixed target, compact exact-match evidence, and applicable warnings/failures.
- The report uses closed, specification-defined warning and failure code vocabularies. It contains no raw or unstable error text, raw headers, raw bodies, cookies, cookie hashes, or token-derived values.
- One injected `observedAt` value records the invocation as an ISO-8601 UTC timestamp. Per-request timings are not reported.
- Every supported outcome emits exactly one pretty-printed JSON document followed by one newline on stdout and leaves stderr empty.
- Process exit `0` means trustworthy `found` or `confirmed_absent` evidence. Exit `1` means a supported fail-closed outcome with its JSON report. Exit `2` means invalid usage, with sanitized stderr and no probe report. Exit `3` means an unexpected internal failure, reported without raw/unstable error details.
- Ctrl-C exits `130` and emits no partial JSON report.

## Proposed approach

At proposal granularity, the capability will be separated into two responsibilities:

1. An isolated core probe owns the fixed Jumbo/two-target policy, anonymous context proof, secret-minimizing transport boundary, exact-EAN evidence interpretation, safe seller/price evidence, per-target details, and deterministic aggregate result.
2. A thin read-only CLI owns the exact invocation grammar, one-document output contract, semantic exit codes, help/usage behavior, and interruption handling.

These are product responsibilities, not two delivery slices: Stack 1 owns the adapter/seam/raw-transport boundary, Stack 2 owns the remaining core policy/report evidence, and Stack 3 owns the CLI.

The core will accept deterministic fake HTTP behavior for tests so later implementation can prove context, parsing, classification, timeout, request-count, evidence, and secrecy rules without live VTEX calls. This proposal intentionally leaves concrete HTTP adapter APIs, exact observed session paths, parser organization, type layouts, and the complete closed code vocabulary to later specification and design, subject to the fixed product boundaries above.

Delivery uses exactly three mandatory ordered review stacks: (1) adapter factory + core-facing seam + raw-transport security tests; (2) session/catalog policy + report/aggregation + high-level core tests and first factory-backed report secrecy evidence; and (3) CLI + CLI tests. The human branch relationships are Stack 1 → `master`, Stack 2 → Stack 1, and Stack 3 → Stack 2. Each stack independently remains at or below 400 authored changed lines with no size exception, uses strict TDD with exact `npm test`, and follows canonical `delivery_strategy: auto-chain` and `chain_strategy: stacked-to-main`.

## Historical comparison: preserved product rules

- Jumbo-only, read-only exact-EAN probing under anonymous CP1425 and CP5000 VTEX sessions.
- Accepted postal code, required cookie presence, non-null regional identity, and distinct-region proof before confirming absence.
- Outcomes limited to `found`, `confirmed_absent`, `rate_limited`, `transport_error`, `parse_error`, and `context_unresolved`.
- Positive exact evidence wins over failure in the other target.
- Selling/list price handling fails safely, including the `3050`/`252066` anomaly.
- Cookies are ephemeral and never logged, hashed, reported, fixtured with real values, or persisted.
- No DB/cache/staging/publication/scheduler/availability/discovery/multi-retailer changes.
- SEPA remains the daily baseline; the probe remains a selective live evidence overlay.
- Deterministic fake HTTP, strict TDD with `npm test`, and exactly three ordered auto-chain review stacks, each at or below the 400-line ceiling.

## Historical comparison: replan improvements

Without widening scope, this replan:

- defines a stable auditable report and CLI contract, including schema version, observation time, exact stdout/stderr behavior, closed codes, semantic exits, strict argument form, timeout, and Ctrl-C behavior;
- probes both targets on every valid invocation and caps the live footprint at four requests with no retries;
- inspects exact EAN evidence directly across product and SKU structures instead of depending on first-SKU payload ordering;
- treats product-level exact EAN without a matching SKU as presence while prohibiting borrowed SKU prices;
- fixes Jumbo primary/default seller as the only seller source for matching-SKU price evidence;
- includes all exact matches as compact sanitized evidence and explicitly excludes availability interpretation;
- defines trustworthy non-match structurally so opaque/malformed entries cannot produce false absence;
- separates secret-bearing transport internals from whitelisted serializable report data and sanitizes failures before reporting;
- distinguishes explicit observed session structures from fuzzy/recursive discovery; and
- makes the Stack 1→2→3 review sequence mandatory rather than conditional on a late line-budget checkpoint.

## Affected areas and implications

Future implementation is expected to affect only an isolated VTEX regional probe core, a focused deterministic test surface, and a thin operator CLI. Existing retailer metadata and exact-EAN request construction may be reused without changing their semantics.

Operationally, maintainers gain a stable diagnostic artifact that can be compared across invocations by schema and codes, but it remains manual and non-authoritative for publication or availability. Conservative parsing may increase `parse_error` or `context_unresolved` when VTEX changes shape; this is intentional because uncertainty must not become false absence.

Security and support implications are limited by the no-persistence boundary. Operators can share sanitized reports for diagnosis, while raw sessions, cookies, response bodies, and unstable transport messages remain outside the product artifact. Documentation and support must continue to explain that `found` is catalog presence, not stock, and that fail-closed outcomes are inconclusive rather than absence.

## Risks and tradeoffs

- **VTEX contract drift:** strict observed-path parsing may conservatively fail after upstream response changes. Permissive parsing would be easier to keep running but could falsely prove regional context, so this proposal favors safety.
- **False absence:** malformed non-empty catalog responses or incomplete EAN structures could look like non-matches. Structural inspectability and found-first aggregation mitigate this risk.
- **Secret leakage:** raw headers, request objects, response bodies, or transport errors can contain cookies. Immediate sanitization and report-field allowlisting are required boundaries.
- **Seller and price ambiguity:** matching products may omit a usable primary/default seller or expose extreme prices. Presence is preserved while unsafe price fields become null with stable warnings.
- **Anti-bot ambiguity:** broad detection could misclassify ordinary upstream failures as rate limiting. Only 429 and a later closed, narrowly evidenced allowlist qualify.
- **Operator over-interpretation:** live evidence may be mistaken for stock or a replacement for SEPA. The report and documentation must keep catalog presence and baseline roles explicit.
- **Delivery pressure:** exact auditability and edge-case coverage require three focused review stacks. The mandatory Stack 1→2→3 sequence preserves the 400-line ceiling without deleting product rules or introducing generalized abstractions.

The principal tradeoff is conservative conclusiveness: the probe may produce more fail-closed results rather than risk a false `confirmed_absent` or expose sensitive transport data.

## Rollback plan

Rollback removes or disables Stack 3 CLI/tests, then Stack 2 policy/report/tests, then Stack 1 adapter/seam/raw-transport tests in reverse stacked order. Because the capability is manually invoked, read-only, and has no database, cache, publication, scheduler, queue, filesystem-output, availability, provider, SEPA, or persistent-cookie effects, rollback requires no migration, data repair, cache invalidation, cookie revocation, or baseline/provider rollback.

If only Stack 3 is rolled back, the unexposed tested core can remain without operational side effects. If an upstream contract drift causes unsafe ambiguity, operators should stop invoking the probe or remove the CLI until a separately approved change updates the closed evidence rules.

## Success criteria

- A valid invocation probes both CP1425 and CP5000 for exactly one 8–14 digit EAN and performs no more than four fixed-timeout requests without retries.
- Every supported result is one newline-terminated pretty JSON document with `schemaVersion: 1`, one UTC `observedAt`, stable per-target details, closed codes, and no stderr output.
- Exact evidence from either target always produces `found`, includes all compact exact matches, and never reports or interprets stock/availability.
- Product-level exact EAN and unusable/missing matching-SKU or primary-seller prices preserve `found` with null price fields and the required safe warning behavior.
- `confirmed_absent` is impossible unless both contexts prove accepted postal codes, required cookie presence, non-null distinct regions, and structurally trustworthy non-matches.
- Fail-closed aggregation follows the confirmed precedence and never exposes raw errors, headers, bodies, cookie values, hashes, or unstable text.
- CLI help, invalid usage, supported outcomes, unexpected failures, and interruption obey their confirmed output and exit-code contracts.
- Later implementation proves the behavior with deterministic fake HTTP under strict TDD using `npm test`.
- No product state, persistent operational state, cookies, stock/availability semantics, or SEPA baseline behavior changes.
- The three mandatory ordered stacks are delivered as auto-chain / stacked-to-main slices mapped to `master` → Stack 1 → Stack 2, each within 400 authored changed lines.
