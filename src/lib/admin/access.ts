import { NextResponse } from "next/server";

import { canAccessAdmin } from "@/lib/admin/access-policy";

type ClerkAuth = typeof import("@clerk/nextjs/server").auth;
type AdminAuthState = Awaited<ReturnType<ClerkAuth>>;

async function getClerkAuth() {
  const { auth } = await import("@clerk/nextjs/server");
  return auth();
}

export function evaluateAdminPageAccess(authState: AdminAuthState) {
  if (!authState.isAuthenticated) {
    return {
      status: "unauthenticated" as const,
      redirectToSignIn: authState.redirectToSignIn,
    };
  }

  if (!canAccessAdmin(authState.sessionClaims)) {
    return {
      status: "forbidden" as const,
    };
  }

  return {
    status: "authorized" as const,
  };
}

export function evaluateAdminApiAccess(authState: AdminAuthState) {
  if (!authState.isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessAdmin(authState.sessionClaims)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function requireAdminPageAccess() {
  return evaluateAdminPageAccess(await getClerkAuth());
}

export async function requireAdminApiAccess() {
  return evaluateAdminApiAccess(await getClerkAuth());
}
