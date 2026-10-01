#!/usr/bin/env node
// Cloud refresh failure reporting CLI (#547 slice 2). Reads the run context
// from the environment, then creates or updates the single `refresh-failure`
// tracking issue, or closes it after a successful run.
//
// Environment:
//   CLOUD_REFRESH_STAGE    restore|migrate|refresh|upload|commit|resolve
//   CLOUD_REFRESH_LOG      path to the captured step log (optional)
//   CLOUD_REFRESH_RUN_URL  URL of the Actions run (required)
//   CLOUD_REFRESH_DATE     UTC date override (optional)
//   GH_TOKEN               token used by gh (contents/issues write)

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  buildFailureIssueBody,
  buildResolutionComment,
  classifyRefreshFailure,
  FAILURE_ISSUE_LABEL,
  FAILURE_ISSUE_TITLE,
  logExcerpt,
  selectFailureIssue,
  type FailureIssue,
  type RefreshStage,
} from "./lib/cloud-refresh-report";

const STAGES: RefreshStage[] = ["restore", "migrate", "refresh", "upload", "commit", "resolve"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function runGh(args: string[], input?: string) {
  const result = spawnSync("gh", args, { encoding: "utf8", input });
  if (result.error) {
    throw new Error(`gh ${args.join(" ")} could not start: ${result.error.message}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function requireGh(args: string[], input?: string) {
  const result = runGh(args, input);
  if (result.status !== 0) {
    throw new Error(`gh ${args[0]} ${args[1] ?? ""} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result;
}

function readStage(): RefreshStage {
  const raw = process.env.CLOUD_REFRESH_STAGE ?? "unknown";
  return (STAGES as string[]).includes(raw) ? (raw as RefreshStage) : "unknown";
}

function readLog(): string {
  const path = process.env.CLOUD_REFRESH_LOG;
  if (!path) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function listOpenFailureIssues(): FailureIssue[] {
  const result = requireGh([
    "issue",
    "list",
    "--label",
    FAILURE_ISSUE_LABEL,
    "--state",
    "open",
    "--limit",
    "50",
    "--json",
    "number,title,url,state",
  ]);
  return JSON.parse(result.stdout || "[]") as FailureIssue[];
}

// Best effort: `--force` updates an existing label, and a failure here surfaces
// for real when the issue is created with the label.
function ensureLabel() {
  const result = runGh(["label", "create", FAILURE_ISSUE_LABEL, "--color", "B60205", "--description", "Tracking issue for the scheduled cloud catalog refresh", "--force"]);
  if (result.status !== 0) {
    process.stderr.write(`cloud-refresh-report: could not ensure label ${FAILURE_ISSUE_LABEL}: ${result.stderr.trim()}\n`);
  }
}

function reportFailure() {
  ensureLabel();
  const existing = selectFailureIssue(listOpenFailureIssues());
  const stage = readStage();
  const reason = classifyRefreshFailure(stage, readLog());
  const runUrl = requireEnv("CLOUD_REFRESH_RUN_URL");
  const date = process.env.CLOUD_REFRESH_DATE ?? new Date().toISOString().slice(0, 10);
  const body = buildFailureIssueBody({ reason, stage, runUrl, date, logExcerpt: logExcerpt(readLog()) });

  if (existing) {
    const result = requireGh(["issue", "comment", String(existing.number), "--body-file", "-"], body);
    console.log(JSON.stringify({ action: "commented", reason, stage, issue: existing.url ?? result.stdout.trim() }));
    return;
  }

  const result = requireGh(["issue", "create", "--title", FAILURE_ISSUE_TITLE, "--label", FAILURE_ISSUE_LABEL, "--body-file", "-"], body);
  console.log(JSON.stringify({ action: "created", reason, stage, issue: result.stdout.trim() }));
}

function resolveSuccess() {
  const issues = listOpenFailureIssues();
  const comment = buildResolutionComment(requireEnv("CLOUD_REFRESH_RUN_URL"));
  for (const issue of issues) {
    requireGh(["issue", "comment", String(issue.number), "--body-file", "-"], comment);
    requireGh(["issue", "close", String(issue.number), "--reason", "completed"]);
  }
  console.log(JSON.stringify({ action: "resolved", closed: issues.map((issue) => issue.number) }));
}

function main() {
  const command = process.argv[2];
  switch (command) {
    case "fail":
      reportFailure();
      return;
    case "resolve":
      resolveSuccess();
      return;
    default:
      throw new Error("usage: scripts/cloud-refresh-report.ts <fail|resolve>");
  }
}

try {
  main();
} catch (error) {
  console.error(`cloud-refresh-report: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
