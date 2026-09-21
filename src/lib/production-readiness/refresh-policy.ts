import { canonicalize, sha256 } from "./canonical";

export const REFRESH_POLICY_VERSION = "refresh-policy/v1";

export type RefreshPolicy = { version: typeof REFRESH_POLICY_VERSION; bytes: unknown };

export function createRefreshPolicy(input: RefreshPolicy) {
	if (!input || input.version !== REFRESH_POLICY_VERSION) throw new Error("unsupported refresh policy version");
	const bytes = canonicalize(input.bytes);
	return { version: input.version, bytes, digest: sha256(bytes) };
}
