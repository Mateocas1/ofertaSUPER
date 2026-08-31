# Design: VTEX Regional Read Probe Replan

## 1. Design summary

Implement the capability as an isolated Jumbo probe core and a thin buffered CLI. The core will live in `src/lib/vtex/regional-read-probe.ts`; it will reuse only `getSupermarketBySlug("jumbo")` and `buildVtexCatalogSearchRequest({ kind: "ean", value })`. It will not call or modify `fetchVtexDirectProducts`, `normalizeVtexCatalogPayload`, or `normalizeProduct`, because their retries, broad traversal, first-SKU selection, seller choice, and availability fields do not satisfy this probe's closed evidence contract.

The core evaluates CP1425 and then CP5000 sequentially. Each target receives at most one anonymous session request and, only when its own context is usable, one exact-EAN catalog request. All live requests receive the same hard-coded 10,000 ms timeout, no redirects, and no retries. Sequential execution is chosen over concurrency to keep only one target's cookie pair active at a time, make request order deterministic, simplify cancellation, and minimize the secret-bearing lifetime; the accepted tradeoff is a worst-case live duration of about 40 seconds rather than about 20 seconds.

The report is assembled only after both targets finish. Exact catalog presence wins first, strict two-context absence is considered second, and all remaining outcomes use the closed precedence `rate_limited > transport_error > parse_error > context_unresolved`. The CLI buffers the complete serialized report before writing, so cancellation cannot expose partial JSON.

No Next.js surface, package alias, shared VTEX behavior, database/cache path, ingestion/publication path, scheduler, availability logic, or SEPA baseline behavior is changed.

## Active authority, historical evidence, and executable base

`vtex-regional-read-probe-replan` is the sole active SDD authority and supersedes `vtex-regional-read-probe` for every future apply, sync, and archive decision. Old phase content survives only as immutable historical evidence in Engram observations 1472, 1473, 1475, 1477, and 1478, replay manifest 1484, and the provider-owned native ledger; comparisons to it are historical only. Before acquire, the parent MUST fetch and re-resolve current `origin/master`, record the exact local/remote relation, revalidate the narrow VTEX contracts, and establish an isolated Stack 1 base. Original candidate `988aeeba076a55e734e1720cc1aad128b6fd5be9` is historical and non-executable; observed candidates are not durable product requirements.

After verified lifecycle completion, only this replan's full new-domain spec may sync to `openspec/specs/vtex-regional-read-probe/spec.md`. The stale original same-domain spec MUST never sync or archive into canonical capability state. The old active OpenSpec directory will be removed without syncing or archiving that stale spec.

## 2. Architecture decisions

### AD-1: Isolate probe semantics in one core module

**Decision.** Add `src/lib/vtex/regional-read-probe.ts` and keep the default transport, strict session parser, exact-EAN extractor, price rules, report builder, and aggregation there. Reuse the supermarket registry and exact catalog request builder without editing them.

**Rationale.** The capability is intentionally Jumbo-only and has a closed result schema. Extending the shared client or normalizer would introduce no-retry, cookie, seller, warning, and absence-proof semantics into ingestion paths that currently have different goals.

**Rejected.** Reordering `items` and passing shallow copies to `normalizeProduct` was rejected because it still couples correctness to a first-SKU normalizer, reads availability, and requires a second traversal to recover warning evidence.

### AD-2: Keep the core seam high-level and add a testable production-adapter factory

**Decision.** Keep the exported `RegionalProbeHttp` interface as the only core-facing HTTP boundary. Its values contain only parsed JSON payloads or closed safe discriminants; they never contain an Axios config/response/error, status text, response headers, `Set-Cookie` lines, cookie values, raw response bytes, URL, or free-form message. `openSession` may return a target-scoped `readCatalog` closure only when both required cookies are valid. The closure captures those values inside the adapter, and core/report state sees only `requiredCookiesPresent`.

In the same module, add the narrow test-visible factory `createRegionalProbeHttp(request): RegionalProbeHttp`. Its sole injection is one Axios-compatible request function. Production creates a dedicated interceptor-free Axios instance and binds that instance's real `request`; deterministic adapter tests bind a raw transport fake. The default `RegionalProbeHttp` is constructed once from that production binding. This is a factory seam, not a second seam accepted by `probeJumboRegionalEan`, and it does not widen the target-scoped closure boundary.

The injected request function receives only the exact config described in section 5 and resolves an adapter-private raw response `{ status, data, headers }`, where `status` is a number, `data` is `ArrayBuffer` or an `ArrayBufferView`, and `headers["set-cookie"]` may be unknown. It may reject with any unknown value. These raw values are consumed inside the factory: 2xx bytes are strictly UTF-8 decoded and JSON-parsed there; non-2xx bytes are classified and dropped there; all headers are dropped there; and every rejection is collapsed there. Only a parsed `unknown` payload or one of `rate_limited`, `timeout`, `transport_error`, `parse_error`, and `aborted` reaches `RegionalProbeHttp`.

For session responses, only an actual array of separate string `set-cookie` lines is eligible. A missing header, an empty array, a scalar/collapsed string, or any non-string member proves no cookies. Lines are processed in order by taking the cookie-pair before the first semicolon and splitting it at the first equals sign. Names are exact and case-sensitive. Each later exact assignment replaces the earlier one, including an empty or invalid assignment, so the final assignment for both `vtex_session` and `vtex_segment` must match the cookie-octet expression `^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$`; comma, semicolon, backslash, whitespace, control characters, CR/LF, and non-ASCII characters are therefore rejected. The parser never splits on comma. The catalog header is rebuilt exactly as `vtex_session=<final>; vtex_segment=<final>` and is captured by only that session result's closure.

The catch boundary reads only the external signal and, from a plain safely-readable string `code`, `ERR_CANCELED`, `ECONNABORTED`, or `ETIMEDOUT`. External abort or `ERR_CANCELED` becomes `aborted`; the two timeout codes become `timeout`; every other rejection becomes `transport_error`. It never calls `String(error)`, `toJSON`, or an Axios error serializer; never spreads, logs, returns, or retains the rejection; and never reads its message, stack, config, request, response, headers, data, or URL.

**Rationale.** Core fakes prove policy after sanitization, while the injected raw request function deterministically proves the security-critical real adapter behavior that a high-level fake cannot. The factory keeps cookies and secret-bearing Axios failures below the same closure boundary and makes their immediate collapse observable without exposing them to core.

**Rejected.** Injecting Axios directly into core was rejected because raw transport state could enter report construction. Testing only a fake `RegionalProbeHttp` was rejected because it cannot prove separate-header parsing, exact cookie rebuilding, request config, or error collapse. A generic `{ request, response.headers, error }` core adapter and a shared cookie jar remain rejected because they widen secret lifetime and permit cross-target contamination.

### AD-3: Parse only the observed VTEX session envelope

**Decision.** A successful session body is recognized only when it is a plain object with plain-object `namespaces`, `namespaces.public`, and `namespaces.checkout` members. The only accepted proof paths are:

- accepted postal code: `namespaces.public.postalCode.value`;
- region proof: `namespaces.checkout.regionId.value`.

The postal-code value must be the exact submitted string (`"1425"` or `"5000"`) with no trimming, digit extraction, prefix handling, or numeric coercion. The region value must be a non-empty string and is retained and compared exactly. No root-level `public`, `checkout.postalCode`, recursive search, alternate namespace, or unrelated occurrence qualifies.

This allowlist is the narrow form of the `/api/sessions` evidence recorded by the repository artifacts and observation 1470: the request writes `public.postalCode`, while the returned VTEX session namespace supplies `public.postalCode.value` and `checkout.regionId.value`. Shape drift therefore fails closed rather than creating regional proof.

**Rationale.** Fuzzy or recursive parsing can turn an unrelated postal-code occurrence into false context proof. Strict paths make upstream drift visible as `parse_error` or `context_unresolved`.

### AD-4: Traverse catalog evidence directly and structurally

**Decision.** Parse only a top-level JSON array. Traverse products in payload order and `items` in array order. Accepted EAN-candidate paths are exactly product or SKU `ean`, `EAN`, and each `referenceId[].Value` or `referenceId[].value`. Values are compared as strings exactly; there is no trimming, number conversion, checksum logic, prefix matching, or deduplication by numeric value.

A non-empty array is a trustworthy non-match only when every product is a plain object, every present EAN field is a non-empty string, every present `referenceId` is an array of inspectable records with a non-empty string `Value` or `value`, `items` is an array, every SKU is a plain object, every SKU has at least one inspectable EAN candidate, and each product tree has at least one inspectable EAN candidate. Any defect marks the payload uninspectable for absence. An empty top-level array is trustworthy without further inspection.

The traversal does not stop at malformed entries. It records the structural defect and continues so exact evidence elsewhere can still win. If any exact match exists, the target remains `found`; `catalog_payload_uninspectable` is also retained when applicable. Without an exact match, any structural defect produces `parse_error` and cannot contribute to absence.

**Rationale.** This preserves positive evidence while preventing opaque products or SKUs from becoming false absence.

### AD-5: Select only an explicitly default seller and fail price fields safely

**Decision.** For each exact matching SKU, select a seller only when exactly one element of `sellers` is a plain object with `sellerDefault === true`. Do not infer the primary seller from array position, stock, quantity, seller name, or seller ID. The offer is the plain-object `commertialOffer` (the observed VTEX spelling), with `commercialOffer` accepted only when the former is absent. Read only numeric `Price` and `ListPrice`; do not inspect availability fields.

If a unique default seller or applicable offer is unavailable, both prices are null and `primary_default_seller_unavailable` is emitted. If `Price` is not a finite number greater than zero, both prices are null and `selling_price_unusable` is emitted. Otherwise preserve `Price`; preserve `ListPrice` only when it is finite and `Price <= ListPrice <= Price * 5`, or emit null plus `list_price_unusable`. Thus `3050`/`252066` becomes `3050`/null without downgrading `found`.

**Rationale.** Price ambiguity must not hide exact presence, and another seller's offer must not be borrowed.

### AD-6: Buffer output and propagate cancellation distinctly

**Decision.** Core cancellation is not a supported report outcome. An already-aborted signal, adapter cancellation, or abort between targets propagates as a dedicated abort condition and discards all accumulated target state. Timeouts remain `transport_error`; operator aborts do not.

The CLI installs one temporary SIGINT handler, aborts the shared controller, waits for the core to settle, removes the handler, writes nothing, and returns 130. It serializes and writes a supported report only after `probeJumboRegionalEan` has resolved and the signal remains un-aborted.

**Rationale.** Mapping Ctrl-C to transport failure would emit misleading partial evidence. Buffering gives a simple all-or-nothing stdout boundary.

## 3. Future file and module boundaries

| File | Future responsibility | Explicit exclusions |
| --- | --- | --- |
| `src/lib/vtex/regional-read-probe.ts` | Fixed targets, exported report/HTTP contracts, `createRegionalProbeHttp` factory and default Axios binding, immediate raw transport sanitization, session proof, exact traversal, seller/price safety, closed codes, aggregation, cancellation | No DB/cache, shared client/normalizer changes, availability, retries, CLI parsing, logs |
| `tests/vtex-regional-read-probe.test.ts` | Separate table-driven raw-transport adapter tests, high-level `RegionalProbeHttp` core tests, runtime-only synthetic sentinels/bytes, deterministic clock, and later CLI acceptance | No live VTEX, real cookies, stored raw responses, snapshots containing secrets |
| `scripts/probe-vtex-regional-read.ts` | Exact argv grammar, help/usage strings, buffered output, exit mapping, SIGINT wiring | No package alias, timeout flag, target expansion, output file, writes, logging |
| Existing `src/lib/supermarkets.ts` | Read-only Jumbo base URL lookup | No edit |
| Existing `src/lib/vtex/encode.ts` | Read-only exact-EAN catalog path/query construction | No edit |

No other future implementation file is planned. In particular, `src/lib/vtex/client.ts`, `src/lib/vtex/normalize.ts`, `package.json`, and all Next.js files remain untouched.

## 4. Exported and internal contracts

The core exports the report types, deterministic high-level HTTP seam, the narrow same-module adapter factory, and one operation. The timeout is deliberately absent from public options; the Axios-compatible request function is accepted only by the factory, never by the operation.

```ts
export type RegionalProbeOutcome =
  | "found" | "confirmed_absent" | "rate_limited"
  | "transport_error" | "parse_error" | "context_unresolved";

export type RegionalProbeWarningCode =
  | "exact_ean_without_sku_match"
  | "primary_default_seller_unavailable"
  | "selling_price_unusable"
  | "list_price_unusable";

export type RegionalProbeFailureCode =
  | "session_rate_limited" | "catalog_rate_limited"
  | "session_timeout" | "catalog_timeout"
  | "session_transport_failed" | "catalog_transport_failed"
  | "session_payload_uninspectable" | "catalog_payload_uninspectable"
  | "postal_code_unconfirmed" | "required_cookies_unconfirmed"
  | "region_id_unconfirmed" | "regions_not_distinct";

export type ProbePayloadResult =
  | { kind: "payload"; payload: unknown }
  | { kind: "rate_limited" | "timeout" | "transport_error"
      | "parse_error" | "aborted" };

export type ProbeSessionResult =
  | { kind: "payload"; payload: unknown;
      requiredCookiesPresent: boolean;
      readCatalog: null | ((input: {
        ean: string; timeoutMs: 10000; signal: AbortSignal;
      }) => Promise<ProbePayloadResult>); }
  | { kind: "rate_limited" | "timeout" | "transport_error"
      | "parse_error" | "aborted" };

export interface RegionalProbeHttp {
  openSession(input: {
    postalCode: "1425" | "5000";
    timeoutMs: 10000;
    signal: AbortSignal;
  }): Promise<ProbeSessionResult>;
}

// AxiosCompatibleRequest and its raw config/response shapes remain
// module-private; tests satisfy the structural callback type contextually.
export function createRegionalProbeHttp(
  request: AxiosCompatibleRequest,
): RegionalProbeHttp;

export async function probeJumboRegionalEan(options: {
  ean: string;
  signal?: AbortSignal;
  http?: RegionalProbeHttp;
  now?: () => Date;
}): Promise<RegionalProbeReport>;
```

The exact module-private factory callback shapes are:

```ts
type AdapterRequestConfig = {
  method: "POST" | "GET";
  url: string;
  headers: Readonly<Record<string, string>>;
  data?: string;
  timeout: 10000;
  signal: AbortSignal;
  maxRedirects: 0;
  responseType: "arraybuffer";
  transformResponse: readonly [];
  validateStatus: (status: number) => true;
};

type AdapterRawResponse = {
  status: number;
  data: ArrayBuffer | ArrayBufferView;
  headers: Readonly<Record<string, unknown>>;
};

type AxiosCompatibleRequest = (
  config: AdapterRequestConfig,
) => Promise<AdapterRawResponse>; // may throw/reject unknown
```

These types describe the sole raw test surface and are not re-exported. Contextual typing lets the test callback inspect config and return statuses, bytes, and separate `set-cookie` lines; thrown timeout/cancellation/secret-bearing shapes remain `unknown`. The factory may derive only a closed safe kind, parsed JSON value, cookie-presence boolean, and target-scoped closure. It must not copy any raw request/response/error property into the high-level result.

`now` defaults to `() => new Date()`. It is called exactly once after input validation and before the first request; a non-finite date is an internal error. `toISOString()` produces the single UTC `observedAt`. Tests inject a fixed `Date`; the CLI exposes no clock or timeout controls.

Other internal-only types include fixed target configuration, target working state, parsed session proof, catalog inspection state, and code-order maps. Secret cookie values exist only in the production adapter's target-scoped closure and are not properties of any exported report type.

The exact report contract is:

```ts
export type RegionalProbeReport = {
  schemaVersion: 1;
  observedAt: string;
  retailer: "jumbo";
  ean: string;
  outcome: RegionalProbeOutcome;
  warningCodes: RegionalProbeWarningCode[];
  failureCodes: RegionalProbeFailureCode[];
  targets: [RegionalProbeTargetReport, RegionalProbeTargetReport];
};

type RegionalProbeTargetReport = {
  postalCode: "CP1425" | "CP5000";
  outcome: RegionalProbeOutcome;
  acceptedPostalCode: boolean | null;
  requiredCookiesPresent: boolean | null;
  regionId: string | null;
  exactMatches: RegionalProbeExactMatch[];
  warningCodes: RegionalProbeWarningCode[];
  failureCodes: RegionalProbeFailureCode[];
};

type RegionalProbeExactMatch = {
  productId: string | null;
  skuId: string | null;
  ean: string;
  price: number | null;
  listPrice: number | null;
  warningCodes: RegionalProbeWarningCode[];
};
```

Object literals are constructed in the displayed field order. Targets are always CP1425 then CP5000. Matches preserve product payload order and then SKU order. Duplicate EAN occurrences inside one SKU produce one SKU record; every exact matching SKU across all products produces a record. A product-level exact match produces one product-only record only when no inspectable SKU in that product exactly matches: `skuId`, `price`, and `listPrice` are null and its warning is `exact_ean_without_sku_match`. `productId` comes only from a string `productId`; `skuId` comes only from a string `itemId`; unsafe or absent identifiers become null.

Warning arrays are deduplicated and ordered by the specification vocabulary shown above. Failure arrays are deduplicated and ordered by the twelve-code specification vocabulary shown above. Target warning codes are the ordered union of match warnings; top-level arrays are the ordered union of all target/match codes plus the aggregate-only `regions_not_distinct` when applicable. No free-form message accompanies a code.

## 5. Request and execution flow

```mermaid
sequenceDiagram
  actor Operator
  participant CLI as probe-vtex-regional-read.ts
  participant Core as regional-read-probe.ts
  participant HTTP as RegionalProbeHttp
  participant Adapter as factory-private Axios boundary
  participant VTEX as Jumbo VTEX

  Operator->>CLI: exactly --ean=<8-14 digits>
  CLI->>Core: probeJumboRegionalEan(ean, signal)
  Core->>Core: validate EAN; capture observedAt once
  loop sequentially CP1425 then CP5000
    Core->>HTTP: openSession(postalCode, 10000, signal)
    HTTP->>Adapter: exact POST config
    Adapter->>VTEX: one request, no redirect/retry
    VTEX-->>Adapter: status, bytes, separate Set-Cookie lines
    Adapter->>Adapter: classify/parse; collapse errors; capture final cookies
    Adapter-->>HTTP: parsed payload or closed safe kind
    HTTP-->>Core: payload + cookie-presence + target catalog closure
    Core->>Core: inspect exact session paths
    alt context individually usable
      Core->>HTTP: readCatalog(ean, 10000, signal)
      HTTP->>Adapter: exact GET config with closure cookies
      Adapter->>VTEX: one request, no redirect/retry
      VTEX-->>Adapter: status, bytes or rejection
      Adapter->>Adapter: classify/parse and drop raw state
      Adapter-->>Core: parsed payload or closed safe kind
      Core->>Core: inspect every product/SKU; normalize safe matches
    else context unusable or failed
      Core->>Core: suppress only this target's catalog call
    end
    Core->>HTTP: release target-scoped closure and secret references
  end
  Core->>Core: found-first aggregate; strict absence; closed fallback
  Core-->>CLI: complete secret-free report
  CLI->>CLI: JSON.stringify(report, null, 2) + newline
  CLI-->>Operator: one atomic stdout write and semantic exit
```

The adapter-private request callback sees this exact application config; tests compare it structurally before any real Axios defaults are applied:

- Common fields, in both stages: `timeout: 10000`, the identical caller `signal`, `maxRedirects: 0`, `responseType: "arraybuffer"`, `transformResponse: []`, and a `validateStatus` function that returns true for every integer status. The factory invokes the callback exactly once per stage operation and contains no retry loop, backoff, alternate URL, or redirect fallback. The production binding is a dedicated `axios.create()` instance with no installed interceptors, so application/global retry interceptors cannot enter this path.
- Session: `method: "POST"`; `url: "https://www.jumbo.com.ar/api/sessions"`; headers exactly `accept: "application/json"`, `content-type: "application/json"`, `origin: "https://www.jumbo.com.ar"`, `referer: "https://www.jumbo.com.ar/"`, and `user-agent: "Mozilla/5.0 (compatible; ofertaSUPER regional read probe/1.0)"`; and `data` exactly `{"public":{"country":{"value":"ARG"},"postalCode":{"value":"1425"}}}` for CP1425 or `{"public":{"country":{"value":"ARG"},"postalCode":{"value":"5000"}}}` for CP5000.
- Catalog: `method: "GET"`; `url: "https://www.jumbo.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:<EAN>"`, where `<EAN>` is the unchanged validated digit string produced through `buildVtexCatalogSearchRequest`; no `data`; and headers exactly `accept`, `origin`, `referer`, and `user-agent` with the preceding values plus lowercase key `cookie` whose value is exactly `vtex_session=<target-final>; vtex_segment=<target-final>`.

“Headers exactly” means the application-supplied callback config; protocol-managed fields that the real Axios Node adapter may add after this boundary, such as `content-length`, are not application inputs and are never copied back. No request uses authentication, a persistent jar, redirect following, or retry logic. The factory obtains the Jumbo origin from `getSupermarketBySlug("jumbo")` and the catalog path/query from the existing builder without editing either dependency.

## 6. Production-adapter classification and body handling

The factory, not core, converts raw runtime failures: timeout to `kind: "timeout"`, cancellation to `kind: "aborted"`, and every other Axios/network/DNS/TLS rejection to `kind: "transport_error"`. It returns no error object, message, request config, URL, status text, headers, or raw bytes. Core maps only these safe kinds to the stage-specific closed failure code.

For an adapter-private raw response:

1. Validate `status` as an integer; a missing, non-integer, or otherwise invalid status becomes `transport_error`. Normalize `data` to a local byte view without retaining the response object; an unusable 2xx body becomes `parse_error`, while an unusable non-2xx body cannot create rate evidence.
2. HTTP 429 is immediately `rate_limited`; its body is not inspected or decoded.
3. Only HTTP 403 or 503 is eligible for marker inspection.
4. Inspect exactly bytes `[0, min(body.length, 65_536))`. Fold only byte values 65–90 (`A`–`Z`) by adding 32, and search for the contiguous ASCII byte sequences `captcha`, `access denied`, and `too many requests`.
5. A marker must fit wholly inside that byte range. There is no Unicode decoding, case folding, whitespace/entity normalization, fuzzy matching, header inference, HTML inference, or matching beyond byte 65,535.
6. A qualifying 403/503 is `rate_limited`; any nonqualifying non-2xx response is `transport_error`.
7. Only 2xx bodies are decoded with fatal UTF-8 and JSON-parsed inside the factory. Decode/parse failure becomes `parse_error`; success returns only `{ kind: "payload", payload }` (plus session cookie proof/closure), never the bytes or decoded source text.

The raw response object, byte view, decoded JSON text, marker identity, and any excerpt are factory-local temporaries and are not exposed to high-level fakes, core, reports, errors, logs, hashes, snapshots, or files. Tests generate synthetic bytes at runtime from public literals; they never store live body fixtures.

Stage mapping is exact:

| Condition | Target outcome | Failure code |
| --- | --- | --- |
| Session/catalog 429 or qualifying 403/503 | `rate_limited` | `session_rate_limited` / `catalog_rate_limited` |
| Adapter timeout | `transport_error` | `session_timeout` / `catalog_timeout` |
| Other adapter failure or nonqualifying non-2xx | `transport_error` | `session_transport_failed` / `catalog_transport_failed` |
| Invalid JSON or unrecognized/uninspectable successful payload | `parse_error` | `session_payload_uninspectable` / `catalog_payload_uninspectable` |
| Recognized session missing one or more proofs | `context_unresolved` | Every applicable context-proof code |

A timeout emits the timeout code, not the generic transport code. An abort emits no report or code.

## 7. Context, match, and aggregate algorithms

### Context proof

For a recognized payload returned from a 2xx session response:

- `acceptedPostalCode` is true for an exact value match, false for a different string, and null when the exact path is missing or not a string.
- `requiredCookiesPresent` is the adapter's boolean for both final non-empty named cookie assignments. It is null when no successful session response exists.
- `regionId` is the exact non-empty string or null.
- Add `postal_code_unconfirmed`, `required_cookies_unconfirmed`, and `region_id_unconfirmed` independently for failed proofs.
- Run the catalog request only when all three proofs pass.

For invalid JSON or an unrecognized envelope, target outcome is `parse_error`; context proof fields unavailable from JSON are null. Cookie presence may remain a boolean when the successful response headers were inspectable, but it cannot make the context usable.

### Catalog presence and non-match

The inspector first traverses the entire payload, accumulating exact matches and a structural-defect bit. Exact candidates are compared directly to the requested EAN. For each product:

- emit one record for every SKU with at least one exact candidate;
- if the product itself matches and no SKU matches, emit one product-only record;
- never borrow a nonmatching SKU's identifiers, seller, or prices;
- retain `catalog_payload_uninspectable` if unrelated structure is malformed, while keeping target `found` when matches exist.

A target with matches is `found`. A target with no matches and no structural defect is `confirmed_absent`. A target with no matches and any defect is `parse_error`.

### Aggregate result

After both target attempts:

1. If either target is `found`, aggregate `found`.
2. Else, if both targets are individually usable, their exact region IDs differ, and both target catalog outcomes are `confirmed_absent`, aggregate `confirmed_absent`.
3. Else, if both would otherwise prove absence but region IDs are equal, add aggregate-only `regions_not_distinct` and aggregate `context_unresolved`.
4. Else choose the highest target outcome in `rate_limited`, `transport_error`, `parse_error`, `context_unresolved` order.

Equal region IDs never suppress either catalog call and never downgrade `found`. Both fixed targets are attempted even after an earlier `found` or failure, unless the invocation is aborted.

## 8. CLI contract

Invocation is `npx tsx scripts/probe-vtex-regional-read.ts --ean=<value>`. The parser accepts only:

- exactly one token matching `--ean=([0-9]{8,14})`; or
- exactly one token `--help`.

Everything else is invalid, including no tokens, `--ean 12345678`, positional values, empty/duplicate EAN flags, combined help, unknown flags, retailer/postal/SKU/category expansion, output/write flags, and timeout flags.

Exact process behavior:

- Help writes `Usage: npx tsx scripts/probe-vtex-regional-read.ts --ean=<8-14 ASCII digits>\n       npx tsx scripts/probe-vtex-regional-read.ts --help\n` to stdout, leaves stderr empty, makes no request, and exits 0.
- Invalid usage leaves stdout empty, writes exactly `Invalid usage. Run with --help.\n` to stderr, makes no request, and exits 2.
- A supported report writes exactly `JSON.stringify(report, null, 2) + "\n"` to stdout once, leaves stderr empty, and exits 0 for `found`/`confirmed_absent` or 1 otherwise.
- An unexpected non-abort failure leaves stdout empty, writes exactly `Regional probe failed internally.\n` to stderr, and exits 3. Raw errors are never printed.
- Ctrl-C aborts outstanding work, leaves both streams empty, and exits 130.

For deterministic tests, the script exposes a small `runRegionalProbeCli` function accepting argv, a probe function, and an `AbortSignal`; it returns buffered stdout/stderr strings and an exit code. The executable wrapper alone installs SIGINT and writes the returned buffers.

## 9. Security and privacy analysis

- **Cookie confidentiality:** separate `Set-Cookie` lines are visible only to the factory and its injected raw request callback. Only final valid assignments for the two exact names are retained, attributes are discarded, the outbound header has fixed order, and a per-target closure prevents reuse by the other target. Secrets are released after that target and never enter core/report state.
- **Error confidentiality:** Axios-compatible rejections are caught where created and immediately collapsed to `timeout`, `aborted`, or `transport_error`. No rejection identity, `config`, headers, request, response, data, stack, message, URL, or serializer crosses the factory.
- **Body confidentiality:** status and non-2xx body inspection stay inside the factory and emit only a closed kind. Successful bytes are decoded/parsed there, after which core reduces the parsed payload to whitelisted proof and match fields. No raw bytes, source text, marker, or excerpt crosses into core, logging, or persistence.
- **Output allowlist:** report object literals contain only the schema fields. There are no raw headers, cookie names/values/hashes, URLs, free-form errors, offers, products, timing fields, stock, quantity, or availability fields.
- **Side effects:** the capability performs only anonymous session and catalog reads. It has no Prisma, Redis, filesystem-output, queue, scheduler, publication, ingestion, or authenticated dependency.
- **Cancellation:** a partial target array is never serialized. Aborted operations produce no diagnostic text that could accidentally include a secret.

Region IDs and the requested EAN are intentionally reportable evidence, not treated as authentication secrets. Operators must still understand that `found` means catalog presence only and does not establish stock or purchasability.

## 10. Failure handling and deterministic tests

Strict TDD later uses exactly `npm test`. Tests generate cookie, body, and error sentinels at runtime, do not snapshot secret-bearing values, and use assertion messages that contain only case labels. Evidence is divided into three intentionally different layers; no layer may claim another layer's guarantees.

### Production-adapter factory tests

These tests construct `createRegionalProbeHttp(rawRequestFake)`. The fake receives the exact adapter-private config, returns raw `{ status, data, headers }` responses, or throws runtime-only synthetic rejection objects. It must cover:

- both exact session POSTs, including absolute URL, method, complete application header set, byte-for-byte JSON body, same AbortSignal, 10,000 ms timeout, `arraybuffer`, disabled transforms, all-status acceptance, and zero redirects;
- the exact catalog GET URL from an unchanged leading-zero EAN, absence of a request body, complete headers, and exactly one raw callback invocation per operation, proving no retry or alternate request;
- separate `set-cookie` lines with duplicates where the final exact case-sensitive assignment wins, attributes are discarded, and `=` remains valid inside a value;
- missing header, empty array, scalar/collapsed header string, non-string array member, missing name, final empty/invalid value, differently cased name, and comma-containing collapsed forms all yielding `requiredCookiesPresent: false`, a null catalog closure, and no comma splitting;
- exact outbound header order `vtex_session=<value>; vtex_segment=<value>` and target isolation by opening CP1425 and CP5000 with distinct generated sentinels, invoking both closures, and proving neither catalog config contains the other target's values;
- 429 for session and catalog without body inspection; 403 and 503 against all three ASCII-case marker literals; a marker ending exactly at byte index 65,535 as a match; the same marker crossing that boundary, beginning at 65,536, or occurring only later as a nonmatch; generic 403/503 and other non-2xx statuses as transport errors; and invalid bytes/UTF-8/JSON on 2xx as parse errors;
- timeout rejections (`ECONNABORTED`, `ETIMEDOUT`), cancellation (`ERR_CANCELED` and externally aborted signal), and generic/network-shaped rejections. Each thrown object places one unique sentinel in message, stack, config headers/cookie, URL, request, response headers/data, and `toJSON`; the adapter result must be the exact closed safe kind and must neither access `toJSON` nor retain any raw field.

The secrecy assertion is end-to-end within the pre-CLI stage: a factory-backed HTTP instance is wrapped by a core-visible recording proxy, passed to `probeJumboRegionalEan`, and the high-level values plus `JSON.stringify(report)` are checked for every generated sentinel. The recording proxy must observe only parsed payloads/closed kinds and cookie-presence booleans. This proves no error/header/cookie/raw-byte sentinel reaches core or report output; it does not rely on a fake `RegionalProbeHttp`.

### High-level core tests

Core policy tests inject a scripted fake `RegionalProbeHttp`, never an Axios-like fake. It supplies only parsed payloads, cookie-presence booleans, target-scoped closures, and closed failure kinds. These tests cover exact EAN/clock validation; sequential two-target continuation; conditional catalog calls; four-call bound and literal timeout input; exact session paths; context and distinct-region proof; safe-kind-to-stage-code mapping; abort propagation; complete product/SKU traversal; malformed-sibling found-first behavior; structural non-match; default seller and all price boundaries; exact report/code ordering and unions; found-first aggregation against every failure class; and strict confirmed absence. Raw headers, cookie parsing, URLs, status bytes, Axios errors, redirects, and retries are deliberately absent from this fake and are credited only to factory tests.

### CLI tests

The later CLI slice injects a fake probe operation, not either HTTP fake. It covers the full grammar matrix, exact help/usage/internal strings, one pretty JSON document plus newline, exit mapping, no-request help/errors, and pre/during-probe abort returning 130 with empty streams. It also throws a runtime-only secret-bearing sentinel error to prove the fixed internal-failure stderr contains none of it. One factory-backed successful/failing core case is passed through the buffered runner to confirm serialized stdout remains sentinel-free, while all transport mechanics remain owned by the adapter test group. No test makes a live request or stores a real response fixture.

## 11. Rollout, rollback, and operations

The active delivery boundary is exactly three ordered review stacks under canonical `delivery_strategy: auto-chain` and `chain_strategy: stacked-to-main`: Stack 1 is the adapter factory, core-facing seam, and raw-transport security tests; Stack 2 is session/catalog policy, report/aggregation, high-level core tests, and first factory-backed report secrecy evidence; Stack 3 is CLI and CLI tests. In repository branch prose, Stack 1 targets `master`, Stack 2 targets Stack 1, and Stack 3 targets Stack 2. The corrected evidence workload cannot credibly fit either pre-CLI responsibility in one slice, so Stack 1 precedes Stack 2 and neither has an operational caller. Only after both pass `npm test` may Stack 3 add the manually invoked CLI. Each stack has an independent maximum of 400 authored changed lines with no size exception. This is delivery-risk slicing inside the approved core-first boundary, not a new product capability.

There is no feature flag or package script because no application, scheduler, or workflow invokes the probe. Operators run the explicit `npx tsx` command for one EAN and treat fail-closed outcomes as inconclusive.

Rollback proceeds in reverse stack order: remove CLI/tests, then core policy/tests, then factory/adapter tests. No migration, data repair, cache invalidation, cookie revocation, publication rollback, provider rollback, or SEPA change is required. If VTEX changes the allowlisted session shape, stop using or remove the CLI until a separately approved change updates the proof contract; do not add permissive fallback parsing operationally.

## 12. Mandatory line-budget forecast

The former 365–395 forecast is no longer credible: it allowed only 100–115 test lines for all core behavior and had no deterministic raw-adapter evidence. The corrected minimum adds exact config/cookie/error/boundary matrices and a factory-backed secrecy path. Compact table-driven tests reduce repetition but do not erase those assertions.

| Stacked task slice | Authored product lines forecast | Budget controls |
| --- | ---: | --- |
| Stack 1. Adapter factory, core-facing seam types, and deterministic raw-transport tests | Production 165–180; tests 185–205; total 350–385 | One same-module factory, one raw callback fake, generated sentinels/bytes, table-driven cookie/status/error matrices; no core business parser or CLI |
| Stack 2. Session/catalog policy, reports, aggregation, high-level core fake tests, and first factory-backed report secrecy evidence | Production 185–200; tests 185–200; total 370–400 | Continue the same core module/test file, compact payload builders and tables; no raw transport duplication or CLI |
| Stack 3. CLI plus CLI tests | CLI 65–85; test additions 75–100; total 140–185 | One pure buffered runner plus executable wrapper, no package alias or subprocess framework |

Every stack has an independent hard maximum of 400 authored changed lines and no exception. `sdd-tasks` must therefore preserve the order `Stack 1 -> Stack 2 -> Stack 3`; combining Stack 1 and Stack 2 would forecast 720–785 lines and is noncompliant. If a RED test makes either pre-CLI stack exceed its forecast, stop apply and return to the parent for an artifact revision that preserves exactly three stacks before implementation continues; do not add a fourth stack, omit assertions, shift transport secrets into core, edit shared modules, widen scope, or request a size exception.

## 13. Historical comparison: improvements over the original design

The following comparison is historical evidence only. This design improves the historical direction without widening product scope:

1. It replaces a generic raw-header HTTP response and serializable failure shape with a target-scoped cookie closure, a testable Axios-compatible factory seam, factory-local status/body handling, and immediate error sanitization.
2. It removes the public timeout override and fixes timeout, redirect, retry, ordering, and cancellation behavior.
3. It replaces fuzzy public-or-checkout postal parsing with the two exact observed session proof paths.
4. It replaces product reordering plus `normalizeProduct` with one direct all-product/all-SKU traversal that does not read availability.
5. It defines product-level presence, every-match retention, structural non-match proof, and found-with-malformed-sibling behavior precisely.
6. It replaces first/available seller behavior with exactly one explicitly default seller and the closed warning vocabulary.
7. It narrows anti-bot detection from generic blocked HTML to three exact ASCII markers, two statuses, and a 65,536-byte boundary.
8. It removes unstable messages, HTTP statuses, durations, names, brands, seller IDs, URLs, and availability from the report in favor of the corrected exact schema.
9. It fixes help/stdout behavior, invalid/internal messages, Ctrl-C exit 130, and all-or-nothing output.
10. It preserves the mandatory Stack 1→2→3 order: adapter/seam/raw security first, policy/report/high-level tests plus factory-backed report secrecy second, and CLI/tests third.

## 14. Requirement-to-design traceability

| Specification requirement | Design realization |
| --- | --- |
| Fixed retailer, targets, and EAN | Fixed target tuple; Jumbo registry lookup; exact CLI/core regex; no discovery inputs |
| Bounded two-target execution | Sequential CP1425 then CP5000; one session plus conditional catalog each; 10,000 ms; no redirects/retries; both continue |
| Regional proof and cookie boundary | Exact namespace paths; high-level core seam; injected-request factory tests for separate Set-Cookie handling; target-scoped catalog closure |
| Same-region semantics | Both catalogs still run; found wins; equal regions add `regions_not_distinct` only on otherwise-valid absence |
| Exact product and SKU evidence | Direct complete traversal; exact strings; every matching SKU; product-only fallback; no borrowed price |
| Primary/default seller and price safety | Exactly one `sellerDefault === true`; offer allowlist; finite positive selling and 1x–5x list rules |
| Trustworthy non-match | Empty array trusted; strict inspectability for every non-empty product/SKU tree; malformed data blocks absence |
| Closed outcomes and aggregation | Target classifier plus found-first, strict absence, then fixed four-class precedence |
| Rate/transport/parse/context boundaries | Factory-local status/byte/error handling; sanitized core kinds; strict JSON/envelope/context split; boundary tests on the real adapter path |
| Closed warning/failure codes | Literal unions, vocabulary-order arrays, duplicate-free target/top-level unions, no messages |
| Versioned deterministic report | Exact schema, fixed field/target/match order, injected one-shot clock, whitelisted literals only |
| Presence is not availability | No availability request, traversal, type, report field, or claim |
| CLI grammar/output/exits | Exact token parser, fixed strings, buffered pretty JSON, exits 0/1/2/3/130 |
| Read-only and baseline boundary | Only anonymous VTEX reads; no application/persistence integrations; no shared semantics or SEPA changes |
| Deterministic acceptance and stacking | Raw request fake for factory, high-level HTTP fake for core, fake operation for CLI, injected clock, exact `npm test`, and three ordered sub-400-line stacks with CLI last |

## 15. Residual risks

- VTEX may change the exact session namespace paths or stop returning separate cookie lines; the intentional result is conservative `parse_error` or `context_unresolved`, not inferred context.
- Sequential execution increases wall-clock duration, but bounds secret overlap and preserves deterministic evidence; cancellation limits operator impact.
- A real Jumbo payload may identify its default seller differently than `sellerDefault === true`; prices will become null with a warning while exact presence remains intact.
- Strict SKU inspectability may produce more `parse_error` outcomes for sparse payloads; this is safer than false `confirmed_absent`.
- JavaScript cannot guarantee physical zeroization of strings or response buffers; the design minimizes references and lifetime and prevents serialization/persistence instead.
- The corrected adapter evidence makes a single core slice noncredible; both pre-CLI task stacks remain close enough to the ceiling that table-driven tests and an early authored-line checkpoint are mandatory.
