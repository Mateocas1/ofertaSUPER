// Failure reporting for the cloud daily refresh (#547 slice 2).
//
// The workflow collects one tracking issue labelled `refresh-failure` instead
// of opening a new issue per failed run: it creates the issue when there is
// none open, comments on the existing one otherwise, and closes it on the next
// successful run. Everything here is pure so it can be unit-tested without gh
// or GitHub.

export const FAILURE_ISSUE_LABEL = "refresh-failure";
export const FAILURE_ISSUE_TITLE = "[cloud-refresh] daily refresh failing";
export const FAILURE_ISSUE_MARKER = "<!-- cloud-refresh-failure -->";
export const FAILURE_LOG_EXCERPT_LINES = 40;

export type RefreshStage = "restore" | "migrate" | "refresh" | "upload" | "commit" | "resolve" | "unknown";

export type RefreshFailureReason =
  | "no-state-release"
  | "no-state-asset"
  | "restore-failed"
  | "migrate-failed"
  | "vtex-hash-unavailable"
  | "refresh-gate-failed"
  | "refresh-rejections-exceeded"
  | "refresh-no-admitted-products"
  | "refresh-failed"
  | "state-upload-failed"
  | "snapshot-commit-failed"
  | "unknown";

export type FailureIssue = {
  number: number;
  title: string;
  url?: string;
  state?: string;
};

export type FailureIssueBodyInput = {
  reason: RefreshFailureReason;
  stage: RefreshStage;
  runUrl: string;
  date: string;
  logExcerpt?: string;
};

const REDACTED = "<redacted>";
const CONNECTION_TOKEN = /postgres(?:ql)?:\/\/[^\s"']+/gi;
const SECRET_ASSIGNMENT = /\b(password|passwd|pwd|token|secret|authorization|api[_-]?key)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"',;)]+)/gi;

// Prisma and pg print the datasource URL on failure, so every log line that
// reaches an issue body goes through this first.
export function redactSecrets(text: string): string {
  return text.replace(CONNECTION_TOKEN, `postgresql://${REDACTED}`).replace(SECRET_ASSIGNMENT, (_match, name, separator) => `${name}${separator}${REDACTED}`);
}

export function logExcerpt(log: string, maxLines = FAILURE_LOG_EXCERPT_LINES): string {
  const lines = log.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  return redactSecrets(lines.slice(-maxLines).join("\n"));
}

// Each stage resolves against ordered token -> reason entries (first match
// wins), with a fallback for the stage. Keeping it as data avoids a growing
// branch chain.
const STAGE_FAILURE_TOKENS: Record<RefreshStage, ReadonlyArray<readonly [token: string, reason: RefreshFailureReason]>> = {
  restore: [
    ["NO_STATE_RELEASE:", "no-state-release"],
    ["NO_STATE_ASSET:", "no-state-asset"],
  ],
  migrate: [],
  refresh: [
    ["VTEX_HASH_UNAVAILABLE", "vtex-hash-unavailable"],
    // Isolated rejects are tolerated; these two tokens mean a batch crossed
    // the rule (too many rejects, or nothing admitted).
    ["acquisition_rejected_products", "refresh-rejections-exceeded"],
    ["acquisition_no_admitted_products", "refresh-no-admitted-products"],
    // Only a frozen-plan batch fails on an empty search; a discovered one is
    // tolerated until the empty-batch gate trips (then "gate check failed").
    ["acquisition_no_results", "refresh-no-admitted-products"],
    ["gate check failed", "refresh-gate-failed"],
  ],
  upload: [],
  commit: [],
  resolve: [],
  unknown: [],
};

const STAGE_FALLBACK_REASON: Record<RefreshStage, RefreshFailureReason> = {
  restore: "restore-failed",
  migrate: "migrate-failed",
  refresh: "refresh-failed",
  upload: "state-upload-failed",
  commit: "snapshot-commit-failed",
  resolve: "unknown",
  unknown: "unknown",
};

export function classifyRefreshFailure(stage: RefreshStage, log: string): RefreshFailureReason {
  const matched = STAGE_FAILURE_TOKENS[stage].find(([token]) => log.includes(token));
  return matched ? matched[1] : STAGE_FALLBACK_REASON[stage];
}

export function buildFailureIssueBody({ reason, stage, runUrl, date, logExcerpt: excerpt = "" }: FailureIssueBodyInput): string {
  const sections = [
    FAILURE_ISSUE_MARKER,
    "The scheduled cloud refresh failed. GitHub already notifies the owner by email for scheduled runs.",
    "",
    `- reason: \`${reason}\``,
    `- stage: \`${stage}\``,
    `- date: ${date}`,
    `- run: ${runUrl}`,
  ];
  if (excerpt.length > 0) {
    sections.push("", "<details><summary>Last output (redacted)</summary>", "", "```text", excerpt, "```", "", "</details>");
  }
  return `${sections.join("\n")}\n`;
}

export function buildResolutionComment(runUrl: string): string {
  return `The scheduled cloud refresh succeeded (${runUrl}); closing this tracking issue.`;
}

// Dedupe: the lowest-numbered open issue wins, so a single tracking issue is
// reused run after run.
export function selectFailureIssue(issues: FailureIssue[]): FailureIssue | null {
  const open = issues.filter((issue) => (issue.state ?? "OPEN").toUpperCase() === "OPEN");
  if (open.length === 0) return null;
  return [...open].sort((left, right) => left.number - right.number)[0];
}
