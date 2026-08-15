type SessionClaims = Record<string, unknown>;

function isRecord(value: unknown): value is SessionClaims {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canAccessAdmin(sessionClaims: unknown) {
  if (!isRecord(sessionClaims) || !isRecord(sessionClaims.metadata)) {
    return false;
  }

  return sessionClaims.metadata.role === "admin";
}
