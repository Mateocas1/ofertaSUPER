import { createHash } from "node:crypto";

export type CanonicalOptions = { decimalPaths?: string[] };

export class CanonicalizationError extends Error {}

/** Restricted UTF-8 JSON for os03-c14n/v1; domain decimals are strings. */
export function canonicalize(value: unknown, options: CanonicalOptions = {}) {
	const decimalPaths = new Set(options.decimalPaths);
	return encode(value, "", decimalPaths);
}

export function sha256Canonical(value: unknown, options?: CanonicalOptions) {
	return canonicalProof(value, options).digest;
}

/** Strings retain a detached immutable snapshot; parsed copies cannot alter this proof. */
export function canonicalProof(value: unknown, options?: CanonicalOptions) {
	const bytes = canonicalize(value, options);
	return Object.freeze({ bytes, digest: sha256(bytes) });
}

export function sha256(bytes: string) {
	return `sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
}

function encode(value: unknown, path: string, decimalPaths: Set<string>): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return `[${value.map((item, index) => encode(item, `${path}/${index}`, decimalPaths)).join(",")}]`;
	if (isPlainObject(value)) return encodeObject(value, path, decimalPaths);
	return encodeScalar(value, path, decimalPaths);
}

function encodeScalar(value: unknown, path: string, decimalPaths: Set<string>) {
	if (typeof value === "string") {
		assertUnicode(value);
		if (decimalPaths.has(path) && !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) throw new CanonicalizationError(`noncanonical decimal at ${path}`);
		return JSON.stringify(value);
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
	if (typeof value === "number") throw new CanonicalizationError(`unsafe number at ${path}; use a decimal string`);
	throw new CanonicalizationError(`unsupported canonical value at ${path || "/"}`);
}

function encodeObject(value: Record<string, unknown>, path: string, decimalPaths: Set<string>) {
	return `{${Object.keys(value).sort().map((key) => {
		assertUnicode(key);
		return `${JSON.stringify(key)}:${encode(value[key], `${path}/${escapePointer(key)}`, decimalPaths)}`;
	}).join(",")}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function assertUnicode(value: string) {
	if (/[\x00-\x1F]/.test(value) || /[\ud800-\udfff]/.test(value)) throw new CanonicalizationError("invalid Unicode string");
}

function escapePointer(value: string) { return value.replace(/~/g, "~0").replace(/\//g, "~1"); }
