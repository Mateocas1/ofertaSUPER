import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import type { PublicCatalogAuthorityFingerprint } from "../src/lib/public-catalog-authority";

export type GuardOptions = {
  deploymentId: string;
  projectId: string;
  scope: string;
  commitSha: string;
  repoId: string;
  ref: string;
  fingerprint: PublicCatalogAuthorityFingerprint;
  promote: boolean;
};
export type GuardCommand = {
  kind: "metadata" | "proof" | "promote";
  args: string[];
  stdin?: string;
  nonce?: string;
};
type CommandResult = { code: number; stdout: string; httpStatus?: number };
type Dependencies = {
  run: (command: GuardCommand) => Promise<CommandResult>;
  secret: string | undefined;
  nonce?: () => string;
};

const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const sha = /^[a-f0-9]{40}$/;
const repoId = /^[1-9]\d{0,19}$/;
const gitRef = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const digest = /^sha256:[a-f0-9]{64}$/;

function validFingerprint(value: PublicCatalogAuthorityFingerprint) {
  return identifier.test(value.publicationId) && identifier.test(value.promotionId)
    && value.target === "production" && identifier.test(value.deploymentId)
    && sha.test(value.commitSha) && digest.test(value.candidateDigest)
    && !Number.isNaN(Date.parse(value.verifiedAt)) && !Number.isNaN(Date.parse(value.expiresAt));
}

function canonicalRepoId(value: unknown) {
  if (typeof value === "string") return repoId.test(value) ? value : null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

function validSourceExpectation(options: GuardOptions) {
  return canonicalRepoId(options.repoId) !== null && gitRef.test(options.ref) && !options.ref.includes("..");
}

function validGuardIdentifiers(options: GuardOptions) {
  return identifier.test(options.deploymentId) && identifier.test(options.projectId) && identifier.test(options.scope);
}

function validateInputs(options: GuardOptions, secret: string | undefined) {
  if (!validGuardIdentifiers(options) || !sha.test(options.commitSha) || !validSourceExpectation(options)
    || options.commitSha !== options.fingerprint.commitSha || !validFingerprint(options.fingerprint)
    || !secret || secret.length > 4096 || /[\r\n]/.test(secret)) {
    throw new Error("Invalid guard input");
  }
}

function immutableHostname(raw: unknown) {
  if (typeof raw !== "string" || [":", "/", "@"].some((token) => raw.includes(token))) return null;
  try {
    const url = new URL(`https://${raw}`);
    const invalidParts = [url.username, url.password, url.port, url.search, url.hash];
    const validAuthority = url.protocol === "https:" && url.hostname === raw && url.hostname.endsWith(".vercel.app");
    return validAuthority && url.pathname === "/" && invalidParts.every((part) => !part) ? url.hostname : null;
  } catch {
    return null;
  }
}

function exactFingerprint(actual: unknown, expected: PublicCatalogAuthorityFingerprint) {
  if (!actual || typeof actual !== "object") return false;
  const keys = ["publicationId", "promotionId", "target", "deploymentId", "commitSha", "candidateDigest", "verifiedAt", "expiresAt"] as const;
  return keys.every((key) => (actual as Record<string, unknown>)[key] === expected[key])
    && Object.keys(actual).length === keys.length;
}

function parseObject(stdout: string, errorMessage: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(errorMessage);
  }
}

function validGitSource(value: unknown, options: GuardOptions) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return source.type === "github" && canonicalRepoId(source.repoId) === options.repoId
    && source.ref === options.ref && source.sha === options.commitSha;
}

function validMetadata(result: CommandResult, metadata: Record<string, unknown>, options: GuardOptions, hostname: string | null) {
  const meta = metadata.meta && typeof metadata.meta === "object" && !Array.isArray(metadata.meta)
    ? metadata.meta as Record<string, unknown> : undefined;
  return [result.code === 0, metadata.id === options.deploymentId, metadata.projectId === options.projectId,
    metadata.readyState === "READY", metadata.target === "production", meta?.githubCommitSha === options.commitSha,
    validGitSource(metadata.gitSource, options), Boolean(hostname)].every(Boolean);
}

function validProof(result: CommandResult, proof: Record<string, unknown>, nonce: string, expected: PublicCatalogAuthorityFingerprint) {
  return [
    result.code === 0,
    result.httpStatus !== undefined && result.httpStatus >= 200 && result.httpStatus < 300,
    proof.active === true,
    proof.nonce === nonce,
    exactFingerprint(proof.fingerprint, expected),
  ].every(Boolean);
}

export async function validatePinnedDeployment(options: GuardOptions, dependencies: Dependencies) {
  validateInputs(options, dependencies.secret);
  const metadataResult = await dependencies.run({
    kind: "metadata",
    args: ["api", `/v13/deployments/${options.deploymentId}`, "--scope", options.scope, "--raw", "--non-interactive"],
  });
  const metadata = parseObject(metadataResult.stdout, "Deployment validation failed");
  const hostname = immutableHostname(metadata.url);
  if (!validMetadata(metadataResult, metadata, options, hostname)) throw new Error("Deployment validation failed");

  const nonce = dependencies.nonce?.() ?? randomBytes(24).toString("base64url");
  const proofResult = await dependencies.run({
    kind: "proof", nonce,
    args: ["curl", `/api/internal/catalog-serving-identity-proof?nonce=${nonce}`, "--deployment", options.deploymentId,
      "--scope", options.scope, "--", "--header", "@-", "--max-redirs", "0", "--fail-with-body",
      "--write-out", "\\nVERCEL_GUARD_HTTP_STATUS:%{http_code}"],
    stdin: `Authorization: Bearer ${dependencies.secret}\nCache-Control: no-store\n`,
  });
  const proof = parseObject(proofResult.stdout, "Proof validation failed");
  if (!validProof(proofResult, proof, nonce, options.fingerprint)) throw new Error("Proof validation failed");

  if (!options.promote) return { status: "validated" as const, promotionAttempts: 0 };
  const promoted = await dependencies.run({
    kind: "promote",
    args: ["promote", options.deploymentId, "--scope", options.scope, "--non-interactive"],
  });
  if (promoted.code !== 0) throw new Error("Promotion failed after one attempt; remote outcome is uncertain");
  return { status: "promoted" as const, promotionAttempts: 1 };
}

export async function runGuardCommand(command: GuardCommand): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn("vercel", command.args, { stdio: ["pipe", "pipe", "pipe"], timeout: 30_000, killSignal: "SIGKILL" });
    let stdout = "";
    let settled = false;
    const finish = (result: CommandResult) => { if (!settled) { settled = true; resolve(result); } };
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); if (stdout.length > 1_000_000) { child.kill("SIGKILL"); finish({ code: 1, stdout: "" }); } });
    child.stderr.resume();
    child.stdin.on("error", () => { child.kill("SIGKILL"); finish({ code: 1, stdout: "" }); });
    child.on("error", () => finish({ code: 1, stdout: "" }));
    child.on("close", (code) => {
      if (code !== 0) return finish({ code: code ?? 1, stdout: "" });
      if (command.kind !== "proof") return finish({ code: 0, stdout });
      const match = stdout.match(/\nVERCEL_GUARD_HTTP_STATUS:(\d{3})$/);
      finish(match ? { code: 0, httpStatus: Number(match[1]), stdout: stdout.slice(0, match.index) } : { code: 1, stdout: "" });
    });
    child.stdin.end(command.stdin);
  });
}

function parseArguments(argv: string[]): GuardOptions {
  const values = new Map<string, string>();
  let promote = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--promote") { promote = true; continue; }
    const value = argv[index + 1];
    if (!argv[index].startsWith("--") || !value || value.startsWith("--") || values.has(argv[index])) throw new Error("Invalid guard input");
    values.set(argv[index], value); index += 1;
  }
  const required = (name: string) => values.get(`--${name}`) ?? "";
  return {
    deploymentId: required("deployment-id"), projectId: required("project-id"), scope: required("scope"), commitSha: required("commit-sha"),
    repoId: required("repo-id"), ref: required("ref"), promote,
    fingerprint: {
      publicationId: required("publication-id"), promotionId: required("promotion-id"), target: "production",
      deploymentId: required("domain-deployment-id"), commitSha: required("commit-sha"), candidateDigest: required("candidate-digest"),
      verifiedAt: required("verified-at"), expiresAt: required("expires-at"),
    },
  };
}

async function main() {
  try {
    const result = await validatePinnedDeployment(parseArguments(process.argv.slice(2)), { run: runGuardCommand, secret: process.env.CATALOG_PROMOTION_GUARD_SECRET });
    process.stdout.write(`${result.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Guard failed"}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
