type AdminMetadata = Record<string, unknown> | null | undefined;

type AdminAccessInput = {
  emails?: ReadonlyArray<string | null | undefined>;
  allowedEmails?: ReadonlyArray<string | null | undefined>;
  metadata?: AdminMetadata | ReadonlyArray<AdminMetadata>;
};

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function hasAdminRole(metadata: AdminMetadata) {
  if (!metadata) {
    return false;
  }

  const role = metadata.role;
  if (typeof role === "string" && role.toLowerCase() === "admin") {
    return true;
  }

  const roles = metadata.roles;
  return Array.isArray(roles) && roles.some((item) => typeof item === "string" && item.toLowerCase() === "admin");
}

export function parseAdminEmailAllowlist(value = "") {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map(normalizeEmail)
        .filter(Boolean),
    ),
  );
}

export function canAccessAdmin({ emails = [], allowedEmails = [], metadata = [] }: AdminAccessInput) {
  const metadataItems = Array.isArray(metadata) ? metadata : [metadata];

  if (metadataItems.some(hasAdminRole)) {
    return true;
  }

  const allowlist = new Set(allowedEmails.map(normalizeEmail).filter(Boolean));

  if (allowlist.size === 0) {
    return false;
  }

  return emails.map(normalizeEmail).some((email) => email !== "" && allowlist.has(email));
}
