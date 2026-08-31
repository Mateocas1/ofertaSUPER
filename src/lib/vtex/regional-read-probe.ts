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
export type RegionalProbeExactMatch = { productId: string | null; skuId: string | null; ean: string; price: number | null; listPrice: number | null; warningCodes: RegionalProbeWarningCode[] };
export type RegionalProbeTargetReport = { postalCode: "CP1425" | "CP5000"; outcome: RegionalProbeOutcome; acceptedPostalCode: boolean | null; requiredCookiesPresent: boolean | null; regionId: string | null; exactMatches: RegionalProbeExactMatch[]; warningCodes: RegionalProbeWarningCode[]; failureCodes: RegionalProbeFailureCode[] };
export type RegionalProbeReport = { schemaVersion: 1; observedAt: string; retailer: "jumbo"; ean: string; outcome: RegionalProbeOutcome; warningCodes: RegionalProbeWarningCode[]; failureCodes: RegionalProbeFailureCode[]; targets: [RegionalProbeTargetReport, RegionalProbeTargetReport] };
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
void defaultRegionalProbeHttp;
