import "./load-env";

import { redis } from "../src/lib/redis";

type ScraperJobStatus = "success" | "failure";

const ALERT_THRESHOLD = 2;
const ALERT_COOLDOWN_SECONDS = 60 * 30;

function getRequiredStatus(rawStatus: string | undefined): ScraperJobStatus | null {
  if (rawStatus === "success" || rawStatus === "failure") {
    return rawStatus;
  }

  return null;
}

function getRunUrl() {
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;

  if (!repository || !runId) {
    return null;
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

async function sendWebhookAlert(webhookUrl: string, payload: { title: string; details: string[] }) {
  const content = [payload.title, ...payload.details].join("\n");
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`Webhook alert failed with status ${response.status}`);
  }
}

async function main() {
  const jobName = process.env.SCRAPER_JOB_NAME ?? "update-prices";
  const status = getRequiredStatus(process.env.SCRAPER_JOB_STATUS);

  if (!status) {
    console.log("Skipping scraper status report because SCRAPER_JOB_STATUS is not success or failure.");
    return;
  }

  if (!redis) {
    console.log("Skipping scraper status report because Redis is not configured.");
    return;
  }

  const baseKey = `monitor:scraper:${jobName}`;
  const failureCountKey = `${baseKey}:consecutive-failures`;
  const lastAlertAtKey = `${baseKey}:last-alert-at`;
  const lastRunKey = `${baseKey}:last-run`;
  const nowIso = new Date().toISOString();

  if (status === "success") {
    await Promise.all([
      redis.set(failureCountKey, 0),
      redis.set(lastRunKey, { status, timestamp: nowIso }),
    ]);
    console.log(`Recorded successful scraper run for ${jobName}.`);
    return;
  }

  const previousFailures = Number((await redis.get<number>(failureCountKey)) ?? 0);
  const failureCount = previousFailures + 1;

  await Promise.all([
    redis.set(failureCountKey, failureCount),
    redis.set(lastRunKey, { status, timestamp: nowIso, runUrl: getRunUrl() }),
  ]);

  if (failureCount < ALERT_THRESHOLD) {
    console.log(`Failure ${failureCount}/${ALERT_THRESHOLD} recorded for ${jobName}; alert not sent yet.`);
    return;
  }

  const webhookUrl = process.env.SCRAPER_ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log("Alert threshold reached, but SCRAPER_ALERT_WEBHOOK_URL is not configured.");
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lastAlertAt = Number((await redis.get<number>(lastAlertAtKey)) ?? 0);

  if (lastAlertAt > 0 && nowSeconds - lastAlertAt < ALERT_COOLDOWN_SECONDS) {
    console.log("Alert threshold reached, but cooldown is still active.");
    return;
  }

  const runUrl = getRunUrl();
  const details = [
    `Trabajo: ${jobName}`,
    `Fallos consecutivos: ${failureCount}`,
    `Timestamp: ${nowIso}`,
  ];

  if (runUrl) {
    details.push(`Run: ${runUrl}`);
  }

  await sendWebhookAlert(webhookUrl, {
    title: `Scraper alert: ${jobName} fallo ${failureCount} veces seguidas.`,
    details,
  });

  await redis.set(lastAlertAtKey, nowSeconds);
  console.log(`Sent scraper alert for ${jobName}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});