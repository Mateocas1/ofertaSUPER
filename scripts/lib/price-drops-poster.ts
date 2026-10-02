import {
  formatDropAmount,
  formatDropPercent,
  storeLabel,
  type PriceDropsPayload,
} from "../../src/lib/price-drops";

// Telegram channel poster for the daily price-drop digest. The channel is
// public and needs no per-user storage: one short message per day, no accounts,
// no database. Everything here is pure or injectable so the no-op path and the
// payload shape are testable without a network.

export const TELEGRAM_API_BASE = "https://api.telegram.org";
export const TELEGRAM_TEXT_LIMIT = 4096;
export const DIGEST_MAX_DROPS = 10;

export type TelegramConfig = {
  token: string | null;
  chatId: string | null;
};

export type PostOutcome =
  | { action: "skipped"; reason: string }
  | { action: "posted"; messageId: number | null }
  | { action: "failed"; reason: string };

function trimmed(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

/** Empty strings are treated as missing, so a half-configured run stays a no-op. */
export function readTelegramConfig(env: Record<string, string | undefined>): TelegramConfig {
  return {
    token: trimmed(env.TELEGRAM_BOT_TOKEN),
    chatId: trimmed(env.TELEGRAM_CHANNEL_ID),
  };
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Short digest: the day, the top drops and where to read the whole list. */
export function buildPriceDropsDigest(
  payload: PriceDropsPayload,
  siteUrl: string,
  maxDrops: number = DIGEST_MAX_DROPS,
): string {
  const heading = `Bajas de precio · ${payload.date}`;
  const base = siteUrl.replace(/\/$/, "");
  if (payload.drops.length === 0) {
    return `${heading}\nSin bajas por encima de los umbrales publicados.`;
  }

  const listed = payload.drops.slice(0, maxDrops);
  const lines = listed.map(
    (drop, index) =>
      `${index + 1}. ${drop.name} (${storeLabel(drop.source)}): ` +
      `${formatDropAmount(drop.previousPrice)} → ${formatDropAmount(drop.currentPrice)} ` +
      `(-${formatDropPercent(drop.percentDrop)})`,
  );
  const footer =
    payload.totalDrops > listed.length
      ? `Top ${listed.length} de ${payload.totalDrops} bajas. Lista completa: ${base}/bajas`
      : `${listed.length} ${listed.length === 1 ? "baja" : "bajas"}: ${base}/bajas`;

  return truncate([heading, "", ...lines, "", footer].join("\n"), TELEGRAM_TEXT_LIMIT);
}

async function sendDigest(
  send: typeof fetch,
  config: TelegramConfig,
  text: string,
): Promise<PostOutcome> {
  try {
    const response = await send(`${TELEGRAM_API_BASE}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) {
      return { action: "failed", reason: `telegram responded ${response.status}` };
    }
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { message_id?: number } }
      | null;
    if (body?.ok !== true) {
      return { action: "failed", reason: "telegram rejected the message" };
    }
    return { action: "posted", messageId: body.result?.message_id ?? null };
  } catch (error) {
    return { action: "failed", reason: error instanceof Error ? error.message : "telegram request failed" };
  }
}

export async function postPriceDropsDigest(options: {
  payload: PriceDropsPayload;
  config: TelegramConfig;
  siteUrl: string;
  fetchImpl?: typeof fetch;
  maxDrops?: number;
}): Promise<PostOutcome> {
  const { config } = options;
  if (config.token === null || config.chatId === null) {
    return { action: "skipped", reason: "skipped: not configured" };
  }
  if (options.payload.drops.length === 0) {
    return { action: "skipped", reason: "skipped: no drops published" };
  }

  const text = buildPriceDropsDigest(options.payload, options.siteUrl, options.maxDrops);
  return sendDigest(options.fetchImpl ?? fetch, config, text);
}
