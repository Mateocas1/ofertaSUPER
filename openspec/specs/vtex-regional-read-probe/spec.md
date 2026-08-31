# VTEX Regional Read Probe Specification

## Purpose

Provide a bounded, read-only operator capability that reports sanitized live Jumbo catalog evidence for one exact EAN under the two approved anonymous regional contexts, without making stock or availability claims, changing ofertaSUPER state, or displacing SEPA as the daily regional baseline.

## Active SDD authority and lifecycle

`vtex-regional-read-probe-replan` is the sole active SDD authority and supersedes `vtex-regional-read-probe` for every future apply, sync, and archive decision. Old phase content survives only as immutable historical evidence in Engram observations 1472, 1473, 1475, 1477, and 1478, replay manifest 1484, and the provider-owned native ledger; any comparison is historical, never an alternate instruction. Before acquire, the parent MUST fetch and re-resolve current `origin/master`, record the exact local/remote relation, revalidate the narrow VTEX contracts, and establish an isolated Stack 1 base. Original candidate `988aeeba076a55e734e1720cc1aad128b6fd5be9` is historical and non-executable; observed candidates are not durable product requirements.

After verified lifecycle completion, only this replan's full new-domain spec may sync to `openspec/specs/vtex-regional-read-probe/spec.md`. The stale original same-domain spec MUST never sync or archive into canonical capability state, and the old active OpenSpec directory will be removed without syncing or archiving that stale spec.

## Requirements

### Requirement: Fixed Retailer, Target, and EAN Scope

The system MUST probe only retailer `jumbo`, exactly the targets `CP1425` and `CP5000`, and exactly one requested EAN per invocation. The EAN MUST be an 8–14 character string of ASCII digits matching `[0-9]{8,14}`; leading zeros MUST remain significant, and the system MUST NOT enforce an EAN checksum. The system MUST NOT discover or accept other retailers, postal codes, EANs, SKUs, products, or categories.

#### Scenario: Valid fixed-scope input

- GIVEN the sole probe token is `--ean=0012345678901`
- WHEN the invocation is accepted
- THEN the requested EAN MUST remain `0012345678901`
- AND the retailer MUST be `jumbo`
- AND the targets MUST be exactly `CP1425` and `CP5000`

#### Scenario: Invalid EAN value

- GIVEN the EAN is shorter than 8 digits, longer than 14 digits, empty, or contains any non-ASCII-digit character
- WHEN usage is validated
- THEN the invocation MUST be rejected as invalid usage
- AND no live request MUST be made

### Requirement: Bounded Two-Target Execution

Every valid probe invocation MUST evaluate both fixed targets, including after an earlier target is found or fails. For each target, the system MUST make at most one anonymous session POST, one session-proof GET, and one exact-EAN catalog GET only after that target's proof is individually usable, in that exact order. Each live request MUST have a fixed 10-second timeout. The system MUST NOT retry, back off, accept a timeout override, or make more than six live requests in one invocation.

#### Scenario: Both usable targets are evaluated

- GIVEN both target session contexts are individually usable
- WHEN a valid probe completes
- THEN exactly one session POST, one session-proof GET, and one catalog GET MAY be made for each target
- AND no more than six live requests MUST be made

#### Scenario: One target fails or finds the EAN

- GIVEN the first evaluated target either fails or supplies exact positive evidence
- WHEN the invocation remains uninterrupted
- THEN the second target MUST still be evaluated
- AND no request MUST be retried

#### Scenario: Unusable context suppresses only its catalog request

- GIVEN one target's session context is not individually usable
- WHEN request execution continues
- THEN no catalog request MUST be made for that target
- AND the other fixed target MUST still be evaluated

### Requirement: Regional Context Proof and Cookie Boundary

A successful session POST payload is opaque and MUST NOT prove context; it remains available only to the structural diagnostic. A target context MUST be individually usable only when the POST supplies non-empty `vtex_session` and `vtex_segment` cookies and the invocation-local proof closure returns recognized JSON from exactly `GET /api/sessions?items=public.postalCode,checkout.regionId` that explicitly proves the submitted postal code and a non-null, non-empty `checkout.regionId`. The proof GET MUST send only `vtex_session`; the later catalog GET MUST send both cookies. Fuzzy, recursive, or unrelated occurrences MUST NOT qualify. An unrecognized successful proof envelope MUST be `parse_error`; POST and proof failures both use the existing session-stage outcomes and codes.

Cookie values MUST remain invocation-local transport secrets. For the corresponding target only, `vtex_session` MAY be used for the proof GET and both `vtex_session` and `vtex_segment` MAY be used for the catalog GET. Neither cookie MAY be reused across targets, logged, hashed, reported, persisted, placed in fixtures, included in serializable errors, or retained after the invocation.

#### Scenario: Complete context proof

- GIVEN the session POST supplies non-empty `vtex_session` and `vtex_segment` cookies
- AND the session-proof GET returns a recognized envelope that explicitly accepts the submitted target
- AND `checkout.regionId` is non-null and non-empty
- WHEN the target is classified
- THEN the context MUST be individually usable
- AND its exact-EAN catalog request MAY proceed with only that target's ephemeral cookies

#### Scenario: Recognized but incomplete proof

- GIVEN the session POST supplies both required cookies
- AND the session-proof GET returns a recognized envelope
- BUT the submitted postal code is not explicitly confirmed or `checkout.regionId` is null or empty
- WHEN the target is classified
- THEN its outcome MUST be `context_unresolved`
- AND its catalog request MUST NOT be made

#### Scenario: Unknown successful proof structure

- GIVEN session-proof GET transport succeeds
- BUT its JSON is invalid or its structure is not a recognized proof envelope
- WHEN the target is classified
- THEN its outcome MUST be `parse_error`
- AND the response MUST NOT prove regional context

### Requirement: Same-Region Semantics

Individually usable CP1425 and CP5000 contexts MAY resolve to the same non-null region and MUST still receive their catalog requests. Equal region identifiers MUST block aggregate `confirmed_absent` but MUST NOT override aggregate `found`.

#### Scenario: Same-region non-matches fail closed

- GIVEN both target contexts are individually usable
- AND both region identifiers are equal
- AND both catalog responses are trustworthy non-matches
- WHEN the aggregate is classified
- THEN the aggregate outcome MUST be `context_unresolved`
- AND failure code `regions_not_distinct` MUST be reported

#### Scenario: Same-region exact evidence remains found

- GIVEN both target contexts resolve to the same region
- AND either catalog response contains exact positive evidence
- WHEN the aggregate is classified
- THEN the aggregate outcome MUST be `found`
- AND equal region identifiers MUST NOT downgrade that outcome

### Requirement: Exact Product and SKU Presence Evidence

The system MUST compare EANs as strings without numeric coercion and MUST inspect all relevant product-level and SKU-level EAN evidence, irrespective of product order, SKU order, or first-SKU position. A product-level or SKU-level EAN exactly equal to the requested EAN MUST establish catalog presence. Prefixes, normalized numbers, or different strings MUST NOT match.

The report MUST retain compact sanitized evidence for every exact match. It MUST emit one match record for each exact matching SKU; when a product-level EAN matches but no inspectable SKU matches, it MUST emit one product-only match record with `skuId: null`, null prices, and warning code `exact_ean_without_sku_match`. It MUST NOT borrow price evidence from a nonmatching SKU. Malformed unrelated entries MUST NOT conceal exact positive evidence elsewhere.

#### Scenario: Exact EAN appears below the first SKU

- GIVEN a catalog product has multiple SKUs
- AND a non-first SKU's EAN exactly equals the requested EAN
- WHEN the catalog response is interpreted
- THEN that target's outcome MUST be `found`
- AND the matching SKU MUST be retained as compact evidence

#### Scenario: Product-level match has no matching SKU

- GIVEN a product-level EAN exactly equals the requested EAN
- AND no inspectable SKU has that exact EAN
- WHEN the catalog response is interpreted
- THEN that target's outcome MUST be `found`
- AND the product-only evidence MUST have `skuId: null`, `price: null`, and `listPrice: null`
- AND it MUST contain warning code `exact_ean_without_sku_match`

#### Scenario: All exact matches are retained

- GIVEN exact EAN evidence occurs in multiple products or matching SKUs
- WHEN the report is produced
- THEN every exact match MUST appear as compact sanitized evidence
- AND no raw product, offer, response body, or transport object MUST appear

### Requirement: Primary Seller and Price Safety

For each exact matching SKU, the system MUST use only seller evidence explicitly identified as Jumbo's primary/default seller. If that seller cannot be identified or its applicable offer is absent, `price` and `listPrice` MUST be null and warning code `primary_default_seller_unavailable` MUST be present.

A selling price MUST be reported only when it is numeric, finite, and greater than zero. Otherwise both prices MUST be null and warning code `selling_price_unusable` MUST be present. A list price MUST be reported only when the selling price is trusted and the list price is numeric, finite, greater than or equal to the selling price, and no greater than five times the selling price. Otherwise the trusted selling price MUST be preserved, the list price MUST be null, and warning code `list_price_unusable` MUST be present. Price warnings MUST NOT downgrade `found`.

#### Scenario: Primary/default seller supplies safe prices

- GIVEN an exact matching SKU has an explicitly identified Jumbo primary/default seller
- AND its selling price is finite and positive
- AND its list price is between the selling price and five times that price, inclusive
- WHEN match evidence is reported
- THEN those selling and list prices MUST be preserved
- AND another seller's prices MUST NOT be substituted

#### Scenario: Primary/default seller is unavailable

- GIVEN an exact matching SKU exists
- BUT a Jumbo primary/default seller and applicable offer cannot be identified
- WHEN match evidence is reported
- THEN the outcome MUST remain `found`
- AND both prices MUST be null
- AND warning code `primary_default_seller_unavailable` MUST be present

#### Scenario: Observed 3050 and 252066 anomaly

- GIVEN an exact matching SKU's trusted primary/default seller has selling price `3050` and list price `252066`
- WHEN match evidence is reported
- THEN the outcome MUST remain `found`
- AND `price` MUST be `3050`
- AND `listPrice` MUST be null
- AND warning code `list_price_unusable` MUST be present

### Requirement: Trustworthy Catalog Non-Match

An empty top-level catalog array MUST be a trustworthy non-match. A non-empty catalog array MUST be a trustworthy non-match only when every relevant product entry, its EAN-bearing fields, its SKU collection, and every relevant SKU EAN field are structurally inspectable, and no product-level or SKU-level EAN exactly equals the request. A non-array envelope, invalid JSON, malformed or opaque entry, malformed SKU collection, or non-string EAN candidate MUST block absence and MUST produce `parse_error` unless exact positive evidence elsewhere produces `found`.

#### Scenario: Empty array is a trustworthy non-match

- GIVEN a usable target's exact-EAN catalog request succeeds with an empty array
- WHEN the target is classified
- THEN its outcome MUST be `confirmed_absent`

#### Scenario: Fully inspectable mismatches are trustworthy

- GIVEN a non-empty catalog array is structurally inspectable throughout
- AND every EAN candidate differs from the requested string
- WHEN the target is classified
- THEN its outcome MUST be `confirmed_absent`

#### Scenario: Opaque entry blocks absence

- GIVEN a non-empty catalog result contains no exact positive evidence
- AND at least one relevant entry or EAN-bearing structure is malformed or opaque
- WHEN the target is classified
- THEN its outcome MUST be `parse_error`
- AND it MUST NOT contribute trustworthy absence evidence

### Requirement: Closed Outcome Classification and Aggregation

Each target and the aggregate MUST use exactly one of: `found`, `confirmed_absent`, `rate_limited`, `transport_error`, `parse_error`, or `context_unresolved`. Target `found` MUST take precedence over defects elsewhere in the same catalog result. Aggregate `found` MUST take precedence whenever either target has exact positive evidence, including when the other target fails.

Aggregate `confirmed_absent` MUST require both submitted postal codes to be explicitly accepted, both required-cookie sets to be present, both region identifiers to be non-null and distinct, and both catalog results to be trustworthy non-matches. If neither `found` nor `confirmed_absent` applies, aggregate precedence MUST be exactly `rate_limited` over `transport_error` over `parse_error` over `context_unresolved`.

#### Scenario: Found wins over another target failure

- GIVEN either target contains exact positive evidence
- AND the other target is rate-limited, transport-failed, unparseable, or unresolved
- WHEN the aggregate is classified
- THEN the aggregate outcome MUST be `found`
- AND the other target's sanitized failure evidence MUST remain in its target detail

#### Scenario: Strict two-region absence proof

- GIVEN both contexts prove their respective postal code and required cookies
- AND both have non-null, distinct region identifiers
- AND both catalog responses are trustworthy non-matches
- WHEN the aggregate is classified
- THEN the aggregate outcome MUST be `confirmed_absent`

#### Scenario: Fail-closed precedence

- GIVEN no target is `found`
- AND strict aggregate absence is not proven
- AND multiple target failures have different outcome classes
- WHEN the aggregate is classified
- THEN `rate_limited` MUST outrank `transport_error`
- AND `transport_error` MUST outrank `parse_error`
- AND `parse_error` MUST outrank `context_unresolved`

### Requirement: Rate, Transport, Parse, and Context Boundaries

HTTP 429 at either session or catalog stage MUST unconditionally be `rate_limited`. A non-429 response MUST be `rate_limited` only when its HTTP status is exactly 403 or 503 and one of the contiguous literal markers `captcha`, `access denied`, or `too many requests` occurs wholly within the first 65,536 bytes of its response body under ASCII case-insensitive comparison. ASCII case-insensitive comparison MUST fold only bytes for `A` through `Z`; it MUST NOT normalize whitespace, decode character entities, apply Unicode case folding, use fuzzy or partial matching, or infer a marker from arbitrary HTML or other text. Other statuses, response headers, markers outside the inspection bound, and any text other than those three exact literals MUST NOT qualify as rate-limit evidence.

Body inspection for this classification MUST remain ephemeral and non-serialized. The raw body, inspected body text, and matched bytes or excerpts MUST NOT be reported, logged, hashed, persisted, retained after classification, copied into fixtures, or included in errors. A qualifying response MUST expose only the existing stage-specific `session_rate_limited` or `catalog_rate_limited` failure code; the system MUST NOT add a body-marker-specific warning or failure code.

A request timeout, DNS/TLS/network failure, or non-success HTTP status that does not satisfy the preceding closed rate-limit rule MUST be `transport_error`. Successful bootstrap, proof, or catalog transport with invalid JSON MUST be `parse_error`. A successful session-proof GET with an unrecognized proof envelope, or catalog evidence that cannot be structurally inspected, MUST also be `parse_error`. A recognized proof envelope that lacks required context proof, plus nondistinct regions when absence would otherwise qualify, MUST be `context_unresolved`.

#### Scenario: HTTP 429 is unconditionally rate limited

- GIVEN a session or catalog request returns HTTP 429
- WHEN its target is classified
- THEN the target outcome MUST be `rate_limited`
- AND body content, headers, or marker presence MUST NOT change that classification

#### Scenario: Allowlisted anti-bot marker is rate limited

- GIVEN a catalog request returns HTTP 503
- AND the contiguous literal `AcCeSs DeNiEd` occurs wholly within the first 65,536 response-body bytes
- WHEN its target is classified
- THEN the target outcome MUST be `rate_limited`
- AND failure code `catalog_rate_limited` MUST be reported
- AND no raw body text, matched excerpt, marker-specific code, or derived body value MUST be reported, logged, hashed, persisted, copied into a fixture or error, or retained after classification

#### Scenario: Generic 403 or 503 remains a transport error

- GIVEN a session request returns HTTP 403 or 503
- AND the first 65,536 response-body bytes contain none of the exact ASCII case-insensitive literals `captcha`, `access denied`, or `too many requests`
- WHEN its target is classified
- THEN the target outcome MUST be `transport_error`
- AND failure code `session_transport_failed` MUST be reported
- AND headers, arbitrary HTML indicators, fuzzy matches, and other response text MUST NOT qualify as rate-limit evidence

#### Scenario: Successful but uninspectable payload

- GIVEN a request transport succeeds
- BUT its required JSON evidence cannot be parsed or structurally interpreted
- WHEN its target is classified
- THEN the target outcome MUST be `parse_error`

### Requirement: Closed Warning and Failure Codes

Report warning codes MUST be limited to the following ordered vocabulary:

1. `exact_ean_without_sku_match`
2. `primary_default_seller_unavailable`
3. `selling_price_unusable`
4. `list_price_unusable`

Report failure codes MUST be limited to the following ordered vocabulary:

1. `session_rate_limited`
2. `catalog_rate_limited`
3. `session_timeout`
4. `catalog_timeout`
5. `session_transport_failed`
6. `catalog_transport_failed`
7. `session_payload_uninspectable`
8. `catalog_payload_uninspectable`
9. `postal_code_unconfirmed`
10. `required_cookies_unconfirmed`
11. `region_id_unconfirmed`
12. `regions_not_distinct`

The system MUST emit every applicable code, MUST NOT emit free-form warning or failure text, and MUST order codes according to these vocabularies after removing duplicates. Stage-specific rate, timeout, transport, and payload codes MUST correspond to the stage that failed. Context proof codes MAY coexist when multiple proofs are absent. `regions_not_distinct` MUST be aggregate-only.

#### Scenario: Missing bootstrap cookies block context proof

- GIVEN either required bootstrap cookie is absent or empty
- WHEN the report is produced
- THEN proof MUST NOT run and `required_cookies_unconfirmed` MUST be reported for that target
- AND `postal_code_unconfirmed` and `region_id_unconfirmed` MUST NOT be reported because their proof is unavailable
- AND no code outside the closed failure vocabulary MUST appear

#### Scenario: Recognized proof lacks postal and region confirmation

- GIVEN both required bootstrap cookies are confirmed
- AND the recognized proof confirms neither the submitted postal code nor a non-null region identifier
- WHEN the report is produced
- THEN `postal_code_unconfirmed` and `region_id_unconfirmed` MUST be reported for that target
- AND `required_cookies_unconfirmed` MUST NOT be reported
- AND no code outside the closed failure vocabulary MUST appear

#### Scenario: Timeout has a stable stage code

- GIVEN the catalog request reaches the fixed timeout
- WHEN the target detail is reported
- THEN its outcome MUST be `transport_error`
- AND its failure codes MUST include `catalog_timeout`
- AND raw timeout or exception text MUST NOT appear

### Requirement: Versioned Deterministic and Secret-Free Report

Every supported outcome MUST produce one JSON report with exactly these top-level fields: `schemaVersion`, `observedAt`, `retailer`, `ean`, `outcome`, `warningCodes`, `failureCodes`, and `targets`. `schemaVersion` MUST equal `1`; `retailer` MUST equal `jumbo`; and `ean` MUST preserve the requested string. `observedAt` MUST be one invocation-scoped, injected ISO-8601 UTC timestamp ending in `Z`; the same invocation MUST NOT report per-request timestamps or timings.

`targets` MUST contain exactly two records in order, CP1425 then CP5000. Each target record MUST contain exactly `postalCode`, `outcome`, `acceptedPostalCode`, `requiredCookiesPresent`, `regionId`, `exactMatches`, `warningCodes`, and `failureCodes`. Unavailable proof values MUST be null rather than inferred. Each exact-match record MUST contain exactly `productId`, `skuId`, `ean`, `price`, `listPrice`, and `warningCodes`; absent safe identifiers or prices MUST be null. Top-level code arrays MUST be the duplicate-free ordered union of all applicable target and match codes plus any aggregate code.

The report MUST NOT contain raw or unstable error text, headers, bodies, transport objects, request URLs, cookie names or values, cookie hashes, token-derived values, raw products or offers, stock or availability fields, or per-request timing data.

#### Scenario: Supported found report shape

- GIVEN either target supplies exact positive evidence
- WHEN the report is serialized
- THEN all required top-level and per-target fields MUST be present
- AND the target order MUST be CP1425 followed by CP5000
- AND the outcome MUST be `found`
- AND only compact exact-match evidence and closed codes MUST be present

#### Scenario: Secret sentinel is excluded

- GIVEN invocation-local cookie values, raw response text, and raw error text contain unique sentinels
- WHEN any supported report is serialized
- THEN none of those sentinels MUST occur in the report
- AND cookie presence MAY appear only as the non-secret `requiredCookiesPresent` proof value

### Requirement: Catalog Presence Is Not Availability

`found` MUST mean exact catalog presence only. The system MUST NOT retrieve, infer, transform, report, or claim stock, inventory, available quantity, fulfillment availability, or purchase availability.

#### Scenario: Exact match has no availability semantics

- GIVEN an exact EAN match is reported as `found`
- WHEN an operator reads the report
- THEN the report MUST provide no stock or availability field or claim
- AND `found` MUST NOT imply that the item can be purchased

### Requirement: CLI Grammar, Output, and Exit Semantics

The probe command MUST accept exactly one token of the form `--ean=<value>` and no other token for a probe invocation. A spaced value, positional EAN, duplicate `--ean`, unknown option, target-expansion option, output-file option, write option, or timeout override MUST be invalid usage. Exactly one token `--help` MUST be the only non-probe command; combined help and probe tokens MUST be invalid.

Help MUST write readable usage describing only `--ean=<8-14 ASCII digits>` and `--help` to stdout, end with one newline, leave stderr empty, make no live request, and exit `0`. Invalid usage MUST leave stdout empty, write exactly one fixed sanitized usage message ending in one newline to stderr, make no live request, and exit `2`.

Every supported outcome MUST write exactly one two-space-indented JSON document followed by exactly one newline to stdout and MUST leave stderr empty. `found` and `confirmed_absent` MUST exit `0`; `rate_limited`, `transport_error`, `parse_error`, and `context_unresolved` MUST exit `1`. An unexpected internal failure MUST leave stdout empty, write exactly one fixed sanitized internal-failure message ending in one newline to stderr without raw or unstable details, and exit `3`.

If interrupted by Ctrl-C before report completion, the command MUST stop outstanding work, emit no partial or complete JSON, leave stdout and stderr empty, and exit `130`.

#### Scenario: Strict valid probe token

- GIVEN the command receives exactly one valid `--ean=<value>` token
- WHEN the probe reaches a supported outcome
- THEN stdout MUST contain exactly one pretty-printed JSON report and one trailing newline
- AND stderr MUST be empty
- AND the exit code MUST reflect the report outcome

#### Scenario: Spaced or additional argument is invalid

- GIVEN the command receives `--ean 12345678`, a positional EAN, duplicate `--ean`, or any additional token
- WHEN arguments are validated
- THEN stdout MUST be empty
- AND stderr MUST contain only the fixed sanitized usage message
- AND the exit code MUST be `2`
- AND no live request MUST be made

#### Scenario: Ctrl-C prevents partial JSON

- GIVEN a probe is active and has not completed its report
- WHEN Ctrl-C interrupts it
- THEN no JSON MUST be emitted
- AND both output streams MUST be empty
- AND the exit code MUST be `130`

### Requirement: Read-Only and Baseline Boundary

The capability MUST be manually invoked and evidence-only. It MUST NOT create, update, delete, cache, stage, ingest, reconcile, publish, schedule, enqueue, automate, or persist product, EAN, SKU, retailer, region, availability, database, Redis/cache, filesystem-output, session, or cookie state. It MUST NOT alter shared ingestion/client/normalizer semantics, provider fallback or rollback behavior, or SEPA's role and behavior as the daily regional baseline.

#### Scenario: Any outcome has no side effects

- GIVEN the probe completes with any supported outcome or failure
- WHEN system state is compared before and after the invocation
- THEN no persistent or product state MUST have changed
- AND no output file, cookie jar, cache entry, scheduled work, or queued work MUST have been created
- AND SEPA baseline behavior MUST remain unchanged

### Requirement: Deterministic Acceptance and Stacked Delivery

Conformance MUST be demonstrated with deterministic fake-HTTP tests under strict TDD using exactly `npm test`; tests MUST NOT depend on live VTEX requests or real cookie fixtures. Delivery MUST use exactly three ordered review stacks: Stack 1 adapter factory + core-facing seam + raw-transport security tests; Stack 2 session/catalog policy + report/aggregation + high-level core tests and first factory-backed report secrecy evidence; Stack 3 CLI + CLI tests. Canonical `delivery_strategy: auto-chain` and `chain_strategy: stacked-to-main` apply; human branch relationships are Stack 1 targeting `master`, Stack 2 targeting Stack 1, and Stack 3 targeting Stack 2. Every stack MUST remain at or below 400 authored changed lines with no size exception. The change MUST NOT add a package command alias merely to expose the probe.

#### Scenario: Stack 1 and Stack 2 acceptance evidence

- GIVEN Stack 1 is implemented
- WHEN its acceptance tests run with `npm test`
- THEN raw-transport security evidence MUST cover the adapter factory and core-facing seam
- AND GIVEN Stack 2 follows accepted Stack 1
- WHEN its acceptance tests run with `npm test`
- THEN high-level fake HTTP evidence MUST cover context proof, request bounds, classification, exact matching, price safety, absence proof, report aggregation, and first factory-backed report secrecy evidence
- AND no live VTEX request or real cookie value MUST be required

#### Scenario: Mandatory Stack 3 CLI boundary

- GIVEN Stack 2 is complete and accepted
- WHEN Stack 3 CLI behavior is delivered
- THEN it MUST target Stack 2 after Stack 1 targeted `master` and Stack 2 targeted Stack 1
- AND every stack MUST remain at or below 400 authored changed lines with no size exception

### Requirement: Session Envelope Diagnostic

The system MUST provide a separate manually invoked Jumbo session-envelope diagnostic with no input arguments. It MUST issue exactly two sequential anonymous session POSTs in the fixed order CP1425 then CP5000, with the existing safe regional transport and 10-second timeout, and MUST remain bootstrap-only: it MUST NOT invoke a session-proof closure or make any catalog request, retry, or other request. It MUST inspect only the literal paths `namespaces`, `public`, `postalCode`, `value`, `checkout`, `regionId`, and `value`, without enumerating keys or retaining unknown values.

The diagnostic MUST emit only `{ schemaVersion: 1, targets: [Target, Target] }`, ordered as `schemaVersion,targets`; each target MUST be ordered `postalCode,rootKind,facts`; and facts MUST be ordered `namespacesKind,namespacesPublicKind,namespacesPublicPostalCodeKind,namespacesPublicPostalCodeValueKind,namespacesPublicPostalCodeValueMatchesTarget,namespacesCheckoutKind,namespacesCheckoutRegionIdKind,namespacesCheckoutRegionIdValueKind,namespacesCheckoutRegionIdValueIsNonEmptyString`. Kinds are limited to JSON object, array, string, finite number, boolean, null, or missing for paths. A target without a parsed payload MUST have `rootKind: null` and `facts: null`.

The dedicated CLI MUST accept no arguments or exactly `--help`; all other arguments MUST produce fixed usage and exit 2. A completed diagnostic MUST emit one buffered two-space JSON document and exit 0; an internal failure MUST emit only a fixed message and exit 3; Ctrl-C MUST emit nothing, exit 130, and remove its SIGINT handler. The report MUST NOT contain bodies, excerpts, headers, cookies or their presence, hashes, URLs, errors, categories, statuses, IDs, timestamps, EAN, retailer, counts, or timings.

#### Scenario: Fixed, secret-free diagnostic output

- GIVEN injected fake session operations for both fixed targets
- WHEN the diagnostic completes
- THEN it MUST make exactly two session operations in CP1425 then CP5000 order
- AND it MUST make no catalog operation
- AND serialized output MUST contain only the ordered diagnostic schema and literal-path facts
