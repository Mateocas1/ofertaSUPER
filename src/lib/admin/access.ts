import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { canAccessAdmin, parseAdminEmailAllowlist } from "@/lib/admin/access-policy";

type ClerkLikeUser = Awaited<ReturnType<typeof currentUser>>;

function getUserEmails(user: ClerkLikeUser) {
  const emails = new Set<string>();

  if (user?.primaryEmailAddress?.emailAddress) {
    emails.add(user.primaryEmailAddress.emailAddress);
  }

  for (const email of user?.emailAddresses ?? []) {
    if (email.emailAddress) {
      emails.add(email.emailAddress);
    }
  }

  return Array.from(emails);
}

function userCanAccessAdmin(user: ClerkLikeUser) {
  return canAccessAdmin({
    emails: getUserEmails(user),
    allowedEmails: parseAdminEmailAllowlist(process.env.ADMIN_EMAILS),
    metadata: [user?.publicMetadata, user?.privateMetadata, user?.unsafeMetadata],
  });
}

export async function requireAdminPageAccess() {
  const authState = await auth();

  if (!authState.isAuthenticated) {
    return {
      status: "unauthenticated" as const,
      redirectToSignIn: authState.redirectToSignIn,
    };
  }

  const user = await currentUser();

  if (!userCanAccessAdmin(user)) {
    return {
      status: "forbidden" as const,
    };
  }

  return {
    status: "authorized" as const,
    user,
  };
}

export async function requireAdminApiAccess() {
  const authState = await auth();

  if (!authState.isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();

  if (!userCanAccessAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
