import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  diagnoseJumboSessionEnvelopes,
  type SessionEnvelopeDiagnosticReport,
} from "@/lib/vtex/regional-read-probe";

type DiagnosticOperation = (options: { signal: AbortSignal }) => Promise<SessionEnvelopeDiagnosticReport>;
export type VtexSessionEnvelopeDiagnosticCliResult = {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2 | 3 | 130;
};
type CliRuntime = {
  argv: string[];
  exitCode?: NodeJS.Process["exitCode"];
  once(event: "SIGINT", handler: () => void): unknown;
  off(event: "SIGINT", handler: () => void): unknown;
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
};
const help = "Usage: npx tsx scripts/diagnose-vtex-session-envelope.ts\n       npx tsx scripts/diagnose-vtex-session-envelope.ts --help\n";
const invalid: VtexSessionEnvelopeDiagnosticCliResult = {
  stdout: "", stderr: "Invalid usage. Run with --help.\n", exitCode: 2,
};
const interrupted: VtexSessionEnvelopeDiagnosticCliResult = { stdout: "", stderr: "", exitCode: 130 };

export async function runVtexSessionEnvelopeDiagnosticCli(
  argv: readonly string[],
  diagnose: DiagnosticOperation = diagnoseJumboSessionEnvelopes,
  signal: AbortSignal,
): Promise<VtexSessionEnvelopeDiagnosticCliResult> {
  if (argv.length === 1 && argv[0] === "--help") return { stdout: help, stderr: "", exitCode: 0 };
  if (argv.length !== 0) return invalid;
  if (signal.aborted) return interrupted;
  try {
    const report = await diagnose({ signal });
    return signal.aborted ? interrupted : { stdout: `${JSON.stringify(report, null, 2)}\n`, stderr: "", exitCode: 0 };
  } catch {
    return signal.aborted ? interrupted : {
      stdout: "", stderr: "VTEX session envelope diagnostic failed internally.\n", exitCode: 3,
    };
  }
}

export async function executeVtexSessionEnvelopeDiagnosticCli(
  runtime: CliRuntime = process,
  diagnose: DiagnosticOperation = diagnoseJumboSessionEnvelopes,
): Promise<void> {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  runtime.once("SIGINT", interrupt);
  let result: VtexSessionEnvelopeDiagnosticCliResult;
  try {
    result = await runVtexSessionEnvelopeDiagnosticCli(runtime.argv.slice(2), diagnose, controller.signal);
  } finally {
    runtime.off("SIGINT", interrupt);
  }
  if (result.stdout) runtime.stdout.write(result.stdout);
  if (result.stderr) runtime.stderr.write(result.stderr);
  runtime.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void executeVtexSessionEnvelopeDiagnosticCli();
}
