import axios from "axios";
import { getSupermarketBySlug } from "@/lib/supermarkets";
import { buildVtexCatalogSearchRequest } from "@/lib/vtex/encode";
export type RegionalProbeOutcome =
  | "found" | "confirmed_absent" | "rate_limited"
  | "transport_error" | "parse_error" | "context_unresolved";
export type RegionalProbeWarningCode =
  | "exact_ean_without_sku_match" | "primary_default_seller_unavailable"
  | "selling_price_unusable" | "list_price_unusable";
export type RegionalProbeFailureCode =
  | "session_rate_limited" | "catalog_rate_limited"
  | "session_timeout" | "catalog_timeout"
  | "session_transport_failed" | "catalog_transport_failed"
  | "session_payload_uninspectable" | "catalog_payload_uninspectable"
  | "postal_code_unconfirmed" | "required_cookies_unconfirmed"
  | "region_id_unconfirmed" | "regions_not_distinct";
export type RegionalProbeExactMatch = {
  productId: string | null;
  skuId: string | null;
  ean: string;
  price: number | null;
  listPrice: number | null;
  warningCodes: RegionalProbeWarningCode[];
};
export type RegionalProbeTargetReport = {
  postalCode: "CP1425" | "CP5000";
  outcome: RegionalProbeOutcome;
  acceptedPostalCode: boolean | null;
  requiredCookiesPresent: boolean | null;
  regionId: string | null;
  exactMatches: RegionalProbeExactMatch[];
  warningCodes: RegionalProbeWarningCode[];
  failureCodes: RegionalProbeFailureCode[];
};
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
type ClosedFailure = { kind: "rate_limited" | "timeout" | "transport_error" | "parse_error" | "aborted" };
export type ProbePayloadResult = { kind: "payload"; payload: unknown } | ClosedFailure;
export type ProbeSessionResult =
  | {
      kind: "payload";
      payload: unknown;
      requiredCookiesPresent: boolean;
      readCatalog: null | ((input: { ean: string; timeoutMs: 10000; signal: AbortSignal }) => Promise<ProbePayloadResult>);
    }
  | ClosedFailure;
export interface RegionalProbeHttp {
  openSession(input: { postalCode: "1425" | "5000"; timeoutMs: 10000; signal: AbortSignal }): Promise<ProbeSessionResult>;
}
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
type AdapterRawResponse = { status: number; data: ArrayBuffer | ArrayBufferView; headers: Readonly<Record<string, unknown>> };
type AxiosCompatibleRequest = (config: AdapterRequestConfig) => Promise<AdapterRawResponse>;
const origin = getSupermarketBySlug("jumbo").baseUrl;
const userAgent = "Mozilla/5.0 (compatible; ofertaSUPER regional read probe/1.0)";
const commonHeaders = { accept: "application/json", origin, referer: `${origin}/`, "user-agent": userAgent };
const commonConfig = (signal: AbortSignal) => ({
  timeout: 10000 as const, signal, maxRedirects: 0 as const,
  responseType: "arraybuffer" as const, transformResponse: [] as const,
  validateStatus: (_status: number) => true as const,
});
function own(value: unknown, key: string): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && "value" in descriptor ? descriptor.value : undefined; }
  catch { return undefined; }
}
function bytesOf(data: unknown): Uint8Array | null {
  try {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } catch { return null; }
  return null;
}
const markers = ["captcha", "access denied", "too many requests"].map((value) =>
  Uint8Array.from(value, (character) => character.charCodeAt(0)),
);
function hasRateMarker(data: Uint8Array): boolean {
  const length = Math.min(data.length, 65_536);
  return markers.some((marker) => {
    for (let start = 0; start + marker.length <= length; start += 1) {
      let match = true;
      for (let index = 0; index < marker.length; index += 1) {
        const byte = data[start + index];
        const folded = byte >= 65 && byte <= 90 ? byte + 32 : byte;
        if (folded !== marker[index]) { match = false; break; }
      }
      if (match) return true;
    }
    return false;
  });
}
function classifyFailure(status: number, bytes: Uint8Array | null): ClosedFailure {
  if (!bytes || (status !== 403 && status !== 503)) return { kind: "transport_error" };
  return { kind: hasRateMarker(bytes) ? "rate_limited" : "transport_error" };
}
function parsePayload(bytes: Uint8Array): ProbePayloadResult {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { kind: "payload", payload: JSON.parse(text) as unknown };
  } catch {
    return { kind: "parse_error" };
  }
}
function classify(raw: unknown): ProbePayloadResult {
  const status = own(raw, "status");
  if (typeof status !== "number" || !Number.isInteger(status)) return { kind: "transport_error" };
  if (status === 429) return { kind: "rate_limited" };
  const bytes = bytesOf(own(raw, "data"));
  if (status < 200 || status > 299) return classifyFailure(status, bytes);
  return bytes ? parsePayload(bytes) : { kind: "parse_error" };
}
function safeCode(error: unknown): string | null {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value : null;
  } catch { return null; }
}
function collapse(error: unknown, signal: AbortSignal): ClosedFailure {
  const code = safeCode(error);
  if (signal.aborted || code === "ERR_CANCELED") return { kind: "aborted" };
  return { kind: code === "ECONNABORTED" || code === "ETIMEDOUT" ? "timeout" : "transport_error" };
}
const cookieOctets = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;
function isCookieHeader(header: unknown): header is string[] {
  try {
    return Array.isArray(header) && header.length > 0 && header.every((line) => typeof line === "string");
  } catch { return false; }
}
function findCookieValues(lines: string[]): [string | null, string | null] {
  let session: string | null = null;
  let segment: string | null = null;
  for (const line of lines) {
    const pair = line.split(";", 1)[0];
    const equals = pair.indexOf("=");
    if (equals < 0) continue;
    const name = pair.slice(0, equals);
    const value = pair.slice(equals + 1);
    if (name === "vtex_session") session = value;
    else if (name === "vtex_segment") segment = value;
  }
  return [session, segment];
}
function readCookies(header: unknown): [string, string] | null {
  if (!isCookieHeader(header)) return null;
  try {
    const [session, segment] = findCookieValues(header);
    return session !== null && segment !== null && cookieOctets.test(session) && cookieOctets.test(segment)
      ? [session, segment] : null;
  } catch { return null; }
}
export function createRegionalProbeHttp(request: AxiosCompatibleRequest): RegionalProbeHttp {
  const perform = async (config: AdapterRequestConfig): Promise<ProbePayloadResult> => {
    if (config.signal.aborted) return { kind: "aborted" };
    try {
      const raw = await request(config);
      return classify(raw);
    } catch (error: unknown) { return collapse(error, config.signal); }
  };
  return {
    async openSession({ postalCode, signal }) {
      if (signal.aborted) return { kind: "aborted" };
      let raw: AdapterRawResponse;
      try {
        raw = await request({
          method: "POST",
          url: `${origin}/api/sessions`,
          headers: { ...commonHeaders, "content-type": "application/json" },
          data: JSON.stringify({ public: { country: { value: "ARG" }, postalCode: { value: postalCode } } }),
          ...commonConfig(signal),
        });
      } catch (error: unknown) { return collapse(error, signal); }
      const result = classify(raw);
      if (result.kind !== "payload") return result;
      const cookiePair = readCookies(own(own(raw, "headers"), "set-cookie"));
      return {
        ...result,
        requiredCookiesPresent: cookiePair !== null,
        readCatalog: cookiePair === null ? null : async ({ ean, signal: catalogSignal }) => {
          const lookup = buildVtexCatalogSearchRequest({ kind: "ean", value: ean });
          return perform({
            method: "GET",
            url: `${origin}${lookup.pathname}?${lookup.search}`,
            headers: { ...commonHeaders, cookie: `vtex_session=${cookiePair[0]}; vtex_segment=${cookiePair[1]}` },
            ...commonConfig(catalogSignal),
          });
        },
      };
    },
  };
}
const productionAxios = axios.create();
const productionRequest = productionAxios.request.bind(productionAxios) as unknown as AxiosCompatibleRequest;
const defaultRegionalProbeHttp = createRegionalProbeHttp(productionRequest);
const warningOrder: RegionalProbeWarningCode[] = [
  "exact_ean_without_sku_match", "primary_default_seller_unavailable",
  "selling_price_unusable", "list_price_unusable",
];
const failureOrder: RegionalProbeFailureCode[] = [
  "session_rate_limited", "catalog_rate_limited",
  "session_timeout", "catalog_timeout",
  "session_transport_failed", "catalog_transport_failed",
  "session_payload_uninspectable", "catalog_payload_uninspectable",
  "postal_code_unconfirmed", "required_cookies_unconfirmed",
  "region_id_unconfirmed", "regions_not_distinct",
];
const ordered = <T extends string>(values: readonly T[], order: readonly T[]): T[] => order.filter((value) => values.includes(value));
function plain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch { return false; }
}
function field(value: unknown, key: string): unknown { return plain(value) ? value[key] : undefined; }
function abort(): never { throw new Error("Regional probe aborted"); }
function failedTarget(
  postalCode: "CP1425" | "CP5000",
  outcome: RegionalProbeOutcome,
  code: RegionalProbeFailureCode,
): RegionalProbeTargetReport {
  return {
    postalCode,
    outcome,
    acceptedPostalCode: null,
    requiredCookiesPresent: null,
    regionId: null,
    exactMatches: [],
    warningCodes: [],
    failureCodes: [code],
  };
}
function failure(
  kind: ClosedFailure["kind"],
  stage: "session" | "catalog",
  postalCode: "CP1425" | "CP5000",
): RegionalProbeTargetReport {
  if (kind === "aborted") abort();
  const prefix = stage === "session" ? "session" : "catalog";
  const outcome: RegionalProbeOutcome = kind === "rate_limited"
    ? "rate_limited"
    : kind === "parse_error" ? "parse_error" : "transport_error";
  const suffix = kind === "rate_limited"
    ? "rate_limited"
    : kind === "timeout"
      ? "timeout"
      : kind === "parse_error" ? "payload_uninspectable" : "transport_failed";
  return failedTarget(
    postalCode,
    outcome,
    `${prefix}_${suffix}` as RegionalProbeFailureCode,
  );
}
function validCandidate(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function collectCandidate(values: string[], value: unknown): boolean { if (!validCandidate(value)) return false; values.push(value); return true; }
function referenceCandidate(record: Record<string, unknown>): string | null { return validCandidate(record.Value) ? record.Value : validCandidate(record.value) ? record.value : null; }
function collectReferences(values: string[], refs: unknown): boolean {
  if (!Array.isArray(refs)) return false; let valid = true;
  for (const ref of refs) { if (!plain(ref)) { valid = false; continue; } const value = referenceCandidate(ref); if (value === null) valid = false; else values.push(value); }
  return valid;
}
function candidates(record: Record<string, unknown>): { values: string[]; valid: boolean } {
  const values: string[] = []; let valid = true;
  for (const key of ["ean", "EAN"]) if (key in record && !collectCandidate(values, record[key])) valid = false;
  if ("referenceId" in record && !collectReferences(values, record.referenceId)) valid = false;
  return { values, valid };
}
function defaultSeller(value: unknown): Record<string, unknown> | null {
  const sellers = Array.isArray(value) ? value.filter((seller) => plain(seller) && seller.sellerDefault === true) as Record<string, unknown>[] : [];
  return sellers.length === 1 ? sellers[0] : null;
}
function commercialOffer(seller: Record<string, unknown>): unknown { return "commertialOffer" in seller ? seller.commertialOffer : seller.commercialOffer; }
function usablePrice(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function usableListPrice(value: unknown, price: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= price && value <= price * 5; }
function priced(productId: string | null, sku: Record<string, unknown>, ean: string): RegionalProbeExactMatch {
  const seller = defaultSeller(sku.sellers); const warnings: RegionalProbeWarningCode[] = []; const offer = seller === null ? null : commercialOffer(seller);
  let price: number | null = null; let listPrice: number | null = null;
  if (seller === null || !plain(offer)) warnings.push("primary_default_seller_unavailable");
  else if (!usablePrice(offer.Price)) warnings.push("selling_price_unusable");
  else { price = offer.Price; if (usableListPrice(offer.ListPrice, price)) listPrice = offer.ListPrice; else warnings.push("list_price_unusable"); }
  return { productId, skuId: typeof sku.itemId === "string" ? sku.itemId : null, ean, price, listPrice, warningCodes: warnings };
}
function unmatchedProduct(productId: string | null, ean: string): RegionalProbeExactMatch { return { productId, skuId: null, ean, price: null, listPrice: null, warningCodes: ["exact_ean_without_sku_match"] }; }
function inspectItems(items: unknown[], productId: string | null, ean: string, treeHasCandidate: boolean) {
  const matches: RegionalProbeExactMatch[] = []; let defect = false; let skuMatch = false;
  for (const rawSku of items) {
    if (!plain(rawSku)) { defect = true; continue; } const sku = candidates(rawSku);
    if (!sku.valid || sku.values.length === 0) defect = true;
    if (sku.values.length > 0) treeHasCandidate = true;
    if (sku.values.includes(ean)) { skuMatch = true; matches.push(priced(productId, rawSku, ean)); }
  }
  return { matches, defect, skuMatch, treeHasCandidate };
}
function inspectProduct(rawProduct: unknown, ean: string) {
  if (!plain(rawProduct)) return { matches: [] as RegionalProbeExactMatch[], defect: true };
  const product = candidates(rawProduct); const productMatch = product.values.includes(ean); const productId = typeof rawProduct.productId === "string" ? rawProduct.productId : null;
  if (!Array.isArray(rawProduct.items)) return { matches: productMatch ? [unmatchedProduct(productId, ean)] : [], defect: true };
  const inspected = inspectItems(rawProduct.items, productId, ean, product.values.length > 0);
  if (!inspected.treeHasCandidate) inspected.defect = true;
  if (productMatch && !inspected.skuMatch) inspected.matches.push(unmatchedProduct(productId, ean));
  return { matches: inspected.matches, defect: !product.valid || inspected.defect };
}
function inspectCatalog(payload: unknown, ean: string, base: RegionalProbeTargetReport): RegionalProbeTargetReport {
  if (!Array.isArray(payload)) return { ...base, outcome: "parse_error", failureCodes: ["catalog_payload_uninspectable"] };
  const matches: RegionalProbeExactMatch[] = []; let defect = false;
  for (const rawProduct of payload) { const inspected = inspectProduct(rawProduct, ean); matches.push(...inspected.matches); if (inspected.defect) defect = true; }
  const warnings = ordered(matches.flatMap((match) => match.warningCodes), warningOrder); const failureCodes = defect ? ["catalog_payload_uninspectable"] as RegionalProbeFailureCode[] : [];
  if (matches.length > 0) return { ...base, outcome: "found", exactMatches: matches, warningCodes: warnings, failureCodes };
  return { ...base, outcome: defect ? "parse_error" : "confirmed_absent", exactMatches: [], warningCodes: [], failureCodes };
}
function contextFailures(acceptedPostalCode: boolean | null, requiredCookiesPresent: boolean, regionId: string | null): RegionalProbeFailureCode[] {
  const failures: RegionalProbeFailureCode[] = [];
  if (acceptedPostalCode !== true) failures.push("postal_code_unconfirmed"); if (!requiredCookiesPresent) failures.push("required_cookies_unconfirmed"); if (regionId === null) failures.push("region_id_unconfirmed");
  return failures;
}
function targetContext(payload: unknown, requiredCookiesPresent: boolean, postalCode: "1425" | "5000", label: "CP1425" | "CP5000") {
  const namespaces = field(payload, "namespaces");
  const publicNamespace = plain(namespaces) ? field(namespaces, "public") : null; const checkoutNamespace = plain(namespaces) ? field(namespaces, "checkout") : null;
  if (!plain(publicNamespace) || !plain(checkoutNamespace)) return { report: { ...failedTarget(label, "parse_error", "session_payload_uninspectable"), requiredCookiesPresent }, canReadCatalog: false };
  const postalValue = field(field(publicNamespace, "postalCode"), "value"); const regionValue = field(field(checkoutNamespace, "regionId"), "value");
  const acceptedPostalCode = typeof postalValue === "string" ? postalValue === postalCode : null; const regionId = typeof regionValue === "string" && regionValue.length > 0 ? regionValue : null;
  const failures = contextFailures(acceptedPostalCode, requiredCookiesPresent, regionId);
  return { report: { postalCode: label, outcome: "context_unresolved" as const, acceptedPostalCode, requiredCookiesPresent, regionId, exactMatches: [], warningCodes: [], failureCodes: failures }, canReadCatalog: failures.length === 0 };
}
async function target(http: RegionalProbeHttp, ean: string, postalCode: "1425" | "5000", signal: AbortSignal): Promise<RegionalProbeTargetReport> {
  const label = `CP${postalCode}` as "CP1425" | "CP5000";
  if (signal.aborted) abort();
  const session = await http.openSession({ postalCode, timeoutMs: 10000, signal });
  if (session.kind !== "payload") return failure(session.kind, "session", label);
  const context = targetContext(session.payload, session.requiredCookiesPresent, postalCode, label);
  if (!context.canReadCatalog || !session.readCatalog) return context.report;
  if (signal.aborted) abort();
  const catalog = await session.readCatalog({ ean, timeoutMs: 10000, signal });
  if (catalog.kind !== "payload") return { ...failure(catalog.kind, "catalog", label), acceptedPostalCode: true, requiredCookiesPresent: true, regionId: context.report.regionId };
  return inspectCatalog(catalog.payload, ean, context.report);
}
function hasTargetOutcome(targets: readonly RegionalProbeTargetReport[], outcome: RegionalProbeOutcome): boolean { return targets.some((item) => item.outcome === outcome); }
function confirmedAbsenceOutcome(targets: readonly RegionalProbeTargetReport[], first: RegionalProbeTargetReport, second: RegionalProbeTargetReport): RegionalProbeOutcome | null {
  if (!targets.every((item) => item.outcome === "confirmed_absent")) return null;
  return first.regionId !== second.regionId ? "confirmed_absent" : "context_unresolved";
}
function fallbackOutcome(targets: readonly RegionalProbeTargetReport[]): RegionalProbeOutcome {
  return (["rate_limited", "transport_error", "parse_error", "context_unresolved"] as const).find((candidate) => hasTargetOutcome(targets, candidate)) ?? "context_unresolved";
}
export async function probeJumboRegionalEan(options: { ean: string; signal?: AbortSignal; http?: RegionalProbeHttp; now?: () => Date }): Promise<RegionalProbeReport> {
  if (!/^[0-9]{8,14}$/.test(options.ean)) throw new Error("Invalid EAN");
  const date = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid clock");
  const signal = options.signal ?? new AbortController().signal; const http = options.http ?? defaultRegionalProbeHttp;
  const first = await target(http, options.ean, "1425", signal); const second = await target(http, options.ean, "5000", signal);
  if (signal.aborted) abort();
  const targets: [RegionalProbeTargetReport, RegionalProbeTargetReport] = [first, second];
  const absenceOutcome = confirmedAbsenceOutcome(targets, first, second);
  const outcome = hasTargetOutcome(targets, "found") ? "found" : absenceOutcome ?? fallbackOutcome(targets);
  const aggregateFailures = absenceOutcome === "context_unresolved" ? ["regions_not_distinct"] as RegionalProbeFailureCode[] : [];
  return { schemaVersion: 1, observedAt: date.toISOString(), retailer: "jumbo", ean: options.ean, outcome,
    warningCodes: ordered(targets.flatMap((item) => item.warningCodes), warningOrder),
    failureCodes: ordered([...targets.flatMap((item) => item.failureCodes), ...aggregateFailures], failureOrder), targets };
}
