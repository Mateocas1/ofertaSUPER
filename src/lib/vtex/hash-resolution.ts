import { probeVtexHash } from "./client";
import { discoverVtexHash } from "./hash-discovery";

export type VtexHashSource = "explicit" | "last_known" | "discovered";

export type ResolvedVtexHash = {
  hash: string;
  source: VtexHashSource;
};

export type VtexHashResolutionDependencies = {
  probe?: (hash: string) => Promise<boolean>;
  discover?: () => Promise<string | null>;
};

// Thrown when neither configuration, the last known run hash, nor storefront
// discovery yields a hash that answers the product search query. The message is
// greppable so scripts/cron-refresh.sh logs it and skips publishing.
export class VtexHashUnavailableError extends Error {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    super(`VTEX_HASH_UNAVAILABLE: no valid VTEX persisted-query hash for ${baseUrl}`);
    this.name = "VtexHashUnavailableError";
    this.baseUrl = baseUrl;
  }
}

async function isValidHash(
  hash: string | null | undefined,
  probe: (hash: string) => Promise<boolean>,
) {
  return Boolean(hash) && (await probe(hash as string));
}

export async function resolveVtexHash({
  baseUrl,
  explicitHash = null,
  lastKnownHash = null,
  dependencies = {},
}: {
  baseUrl: string;
  explicitHash?: string | null;
  lastKnownHash?: string | null;
  dependencies?: VtexHashResolutionDependencies;
}): Promise<ResolvedVtexHash> {
  const probe = dependencies.probe ?? (async (hash: string) => {
    const result = await probeVtexHash({ baseUrl, hash, count: 3 });
    return result.isHealthy && result.productSuggestionsFound;
  });
  const discover = dependencies.discover ?? (async () => {
    const candidate = await discoverVtexHash({ baseUrl });
    return candidate?.hash ?? null;
  });

  if (await isValidHash(explicitHash, probe)) {
    return { hash: explicitHash as string, source: "explicit" };
  }

  if (lastKnownHash !== explicitHash && (await isValidHash(lastKnownHash, probe))) {
    return { hash: lastKnownHash as string, source: "last_known" };
  }

  const discovered = await discover();
  if (discovered) {
    return { hash: discovered, source: "discovered" };
  }

  throw new VtexHashUnavailableError(baseUrl);
}

// The refresh runs several sources in one process, so the last known hash is
// read per source instead of reusing another store's value.
export async function resolveVtexHashForSource({
  source,
  baseUrl,
  explicitHash = null,
  readLastKnownHash,
  dependencies,
}: {
  source: string;
  baseUrl: string;
  explicitHash?: string | null;
  readLastKnownHash: (source: string) => Promise<string | null>;
  dependencies?: VtexHashResolutionDependencies;
}): Promise<ResolvedVtexHash> {
  return resolveVtexHash({
    baseUrl,
    explicitHash,
    lastKnownHash: await readLastKnownHash(source),
    dependencies,
  });
}

export function vtexHashUnavailableMessage(baseUrl: string) {
  return new VtexHashUnavailableError(baseUrl).message;
}

// Reuses the existing SCRAPER_ALERT_WEBHOOK_URL channel; best-effort so a broken
// alert never hides the run failure.
export async function sendVtexHashUnavailableAlert({
  baseUrl,
  details = [],
  webhookUrl,
  fetchImpl = fetch,
}: {
  baseUrl: string;
  details?: string[];
  webhookUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const target = webhookUrl ?? process.env.SCRAPER_ALERT_WEBHOOK_URL;
  if (!target) {
    return false;
  }

  try {
    const response = await fetchImpl(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: [vtexHashUnavailableMessage(baseUrl), ...details].join("\n"),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function handleVtexHashUnavailable(
  error: VtexHashUnavailableError,
  dependencies: {
    log: (message: string) => void;
    alert: (message: string) => Promise<boolean>;
  },
): Promise<number> {
  dependencies.log(error.message);
  try {
    await dependencies.alert(error.message);
  } catch {
    // The failure itself is the signal; the alert channel is best-effort.
  }
  return 1;
}
