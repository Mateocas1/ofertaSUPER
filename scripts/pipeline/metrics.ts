import "../load-env";

import { pathToFileURL } from "node:url";

import { getAdminIngestionDashboard } from "../../src/lib/admin/ingestion";
import { getFreshnessSnapshot } from "../../src/lib/ingestion/sla";
import { redis } from "../../src/lib/redis";

type PipelineMetricsSourceSummary = {
  slug: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  productsStaged: number;
  productsRejected: number;
  health: {
    isHealthy: boolean;
    hashValid: boolean;
    errorType: string | null;
  };
};

type AlertEvaluation = {
  freshnessPercent: number;
  violatingSources: string[];
  blockedSources: string[];
  degradedSources: string[];
  allHashInvalid: boolean;
  sentAlerts: string[];
};

const DEFAULT_ALERT_COOLDOWN_SECONDS = 60 * 60;

function readDryRunFlag() {
  return process.argv.includes("--dry-run");
}

function readFreshnessThreshold() {
  const raw = process.argv.find((value) => value.startsWith("--freshness-threshold="));

  if (!raw) {
    return 80;
  }

  const parsed = Number(raw.split("=")[1]);
  return Number.isFinite(parsed) ? parsed : 80;
}

async function shouldSendAlert(key: string, cooldownSeconds = DEFAULT_ALERT_COOLDOWN_SECONDS) {
  if (!redis) {
    return true;
  }

  const existing = await redis.get<string>(key);

  if (existing) {
    return false;
  }

  await redis.set(key, new Date().toISOString(), { ex: cooldownSeconds });
  return true;
}

async function sendWebhookAlert(title: string, details: string[], options: { dedupeKey: string; dryRun?: boolean }) {
  const webhookUrl = process.env.SCRAPER_ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  const shouldSend = await shouldSendAlert(options.dedupeKey);

  if (!shouldSend) {
    return false;
  }

  if (options.dryRun) {
    return true;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      content: [title, ...details].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook alert failed with status ${response.status}`);
  }

  return true;
}

export async function evaluateAndSendIngestionAlerts(options: {
  sourceSummaries?: PipelineMetricsSourceSummary[];
  dryRun?: boolean;
  freshnessThresholdPercent?: number;
} = {}): Promise<AlertEvaluation> {
  const freshnessThresholdPercent = options.freshnessThresholdPercent ?? 80;
  const freshness = await getFreshnessSnapshot({
    alertThresholdPercent: freshnessThresholdPercent,
  });
  const sourceSummaries = options.sourceSummaries ?? [];
  const violatingSources = freshness.sources
    .filter((source) => source.isBelowAlertThreshold)
    .map((source) => `${source.slug} [${source.measurementBasis}] (${source.freshnessPercent.toFixed(1)}%)`);
  const blockedSources = sourceSummaries
    .filter((summary) => summary.health.errorType === "blocked")
    .map((summary) => summary.slug);
  const degradedSources = sourceSummaries
    .filter((summary) => summary.productsStaged > 0 && summary.productsRejected / summary.productsStaged > 0.1)
    .map((summary) => `${summary.slug} (${((summary.productsRejected / summary.productsStaged) * 100).toFixed(1)}%)`);
  const allHashInvalid =
    sourceSummaries.length > 0 &&
    sourceSummaries.every((summary) => !summary.health.isHealthy && summary.health.errorType === "hash_invalid");
  const sentAlerts: string[] = [];

  if (allHashInvalid) {
    const sent = await sendWebhookAlert(
      "Ingestion alert: todas las fuentes VTEX fallaron con hash invalido.",
      sourceSummaries.map((summary) => `- ${summary.slug}: ${summary.health.errorType}`),
      {
        dedupeKey: "alerts:ingestion:hash-invalid:all",
        dryRun: options.dryRun,
      },
    );

    if (sent) {
      sentAlerts.push("hash_invalid_all_sources");
    }
  }

  if (blockedSources.length > 0) {
    const sent = await sendWebhookAlert(
      "Ingestion alert: una o mas fuentes quedaron bloqueadas.",
      blockedSources.map((source) => `- ${source}`),
      {
        dedupeKey: `alerts:ingestion:blocked:${blockedSources.sort().join(",")}`,
        dryRun: options.dryRun,
      },
    );

    if (sent) {
      sentAlerts.push("blocked_sources");
    }
  }

  if (degradedSources.length > 0) {
    const sent = await sendWebhookAlert(
      "Ingestion alert: degradacion de calidad detectada (>10% rejected).",
      degradedSources.map((source) => `- ${source}`),
      {
        dedupeKey: `alerts:ingestion:quality:${degradedSources.sort().join(",")}`,
        dryRun: options.dryRun,
      },
    );

    if (sent) {
      sentAlerts.push("quality_degradation");
    }
  }

  if (violatingSources.length > 0) {
    const sent = await sendWebhookAlert(
      "Ingestion alert: freshness por debajo del umbral operativo.",
      [
        `Freshness global: ${freshness.overallFreshnessPercent.toFixed(1)}%`,
        `Base: ${freshness.measurementMode}`,
        ...violatingSources.map((source) => `- ${source}`),
      ],
      {
        dedupeKey: `alerts:ingestion:sla:${violatingSources.sort().join(",")}`,
        dryRun: options.dryRun,
      },
    );

    if (sent) {
      sentAlerts.push("freshness_sla_violation");
    }
  }

  return {
    freshnessPercent: freshness.overallFreshnessPercent,
    violatingSources,
    blockedSources,
    degradedSources,
    allHashInvalid,
    sentAlerts,
  };
}

async function main() {
  const dryRun = readDryRunFlag();
  const freshnessThresholdPercent = readFreshnessThreshold();
  const [dashboard, alerts] = await Promise.all([
    getAdminIngestionDashboard(),
    evaluateAndSendIngestionAlerts({
      dryRun,
      freshnessThresholdPercent,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        dryRun,
        overview: dashboard.overview,
        freshness: dashboard.freshness,
        alerts,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}