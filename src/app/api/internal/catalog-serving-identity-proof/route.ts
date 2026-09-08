import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { resolvePublicCatalogRuntimeAuthority } from "@/lib/public-catalog-runtime.server";

const responseHeaders = { "Cache-Control": "private, no-store" };
const validNonce = /^[A-Za-z0-9_-]{12,128}$/;

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

function sameSecret(actual: string, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CATALOG_PROMOTION_GUARD_SECRET;
  if (!configuredSecret || /[\r\n]/.test(configuredSecret)) {
    return json({ error: "Proof service unavailable" }, 503);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!sameSecret(authorization.slice(7), configuredSecret)) {
    return json({ error: "Forbidden" }, 403);
  }

  const nonce = new URL(request.url).searchParams.get("nonce") ?? "";
  if (!validNonce.test(nonce)) {
    return json({ error: "Invalid proof request" }, 400);
  }

  const fingerprint = await resolvePublicCatalogRuntimeAuthority();
  if (!fingerprint) {
    return json({ active: false, nonce }, 409);
  }

  return json({ active: true, nonce, fingerprint }, 200);
}
