import net from "node:net";

type DatabaseEndpoint = {
  host: string;
  port: number;
};

type AvailabilityCache = {
  ok: boolean;
  expiresAt: number;
};

const DATABASE_CHECK_TIMEOUT_MS = 750;
const DATABASE_CHECK_CACHE_MS = 30_000;

let availabilityCache: AvailabilityCache | null = null;

export function getDatabaseEndpoint(databaseUrl = process.env.DATABASE_URL): DatabaseEndpoint | null {
  if (!databaseUrl) {
    return null;
  }

  try {
    const url = new URL(databaseUrl);
    const port = Number(url.port || 5432);

    if (!url.hostname || !Number.isInteger(port) || port <= 0) {
      return null;
    }

    return {
      host: url.hostname,
      port,
    };
  } catch {
    return null;
  }
}

async function canReachDatabase(databaseUrl = process.env.DATABASE_URL) {
  const endpoint = getDatabaseEndpoint(databaseUrl);

  if (!endpoint) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection(endpoint);
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(DATABASE_CHECK_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function isCatalogRuntimeAvailable() {
  const now = Date.now();

  if (availabilityCache && availabilityCache.expiresAt > now) {
    return availabilityCache.ok;
  }

  const ok = await canReachDatabase();
  availabilityCache = {
    ok,
    expiresAt: now + DATABASE_CHECK_CACHE_MS,
  };

  return ok;
}
