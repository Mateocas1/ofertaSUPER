import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  probeJumboRegionalEan,
  type RegionalProbeReport,
} from "@/lib/vtex/regional-read-probe";

type ProbeOperation = (options: {
  ean: string;
  signal: AbortSignal;
}) => Promise<RegionalProbeReport>;
export type RegionalProbeCliResult = {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2 | 3 | 130;
};
const help = "Usage: npx tsx scripts/probe-vtex-regional-read.ts --ean=<8-14 ASCII digits>\n       npx tsx scripts/probe-vtex-regional-read.ts --help\n";
const invalid: RegionalProbeCliResult = {
  stdout: "", stderr: "Invalid usage. Run with --help.\n", exitCode: 2,
};
const interrupted: RegionalProbeCliResult = { stdout: "", stderr: "", exitCode: 130 };
const successfulOutcomes = new Set([
  "found", "confirmed_absent",
]);
type RegionalProbeCliInput = { ean: string } | RegionalProbeCliResult;

function parseRegionalProbeCliInput(argv: readonly string[]): RegionalProbeCliInput {
  if (argv.length !== 1) return invalid;
  if (argv[0] === "--help") return { stdout: help, stderr: "", exitCode: 0 };
  const match = /^--ean=([0-9]{8,14})$/.exec(argv[0]);
  return match ? { ean: match[1] } : invalid;
}

export async function runRegionalProbeCli(
  argv: readonly string[],
  probe: ProbeOperation = probeJumboRegionalEan,
  signal: AbortSignal,
): Promise<RegionalProbeCliResult> {
  const input = parseRegionalProbeCliInput(argv);
  if ("exitCode" in input) return input;
  if (signal.aborted) return interrupted;
  try {
    const report = await probe({ ean: input.ean, signal });
    if (signal.aborted) return interrupted;
    return {
      stdout: `${JSON.stringify(report, null, 2)}\n`,
      stderr: "",
      exitCode: successfulOutcomes.has(report.outcome) ? 0 : 1,
    };
  } catch {
    return signal.aborted ? interrupted : {
      stdout: "", stderr: "Regional probe failed internally.\n", exitCode: 3,
    };
  }
}

type CliRuntime = {
  argv: string[];
  exitCode?: NodeJS.Process["exitCode"];
  once(event: "SIGINT", handler: () => void): unknown;
  off(event: "SIGINT", handler: () => void): unknown;
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
};
export async function executeRegionalProbeCli(
  runtime: CliRuntime = process,
  probe: ProbeOperation = probeJumboRegionalEan,
): Promise<void> {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  runtime.once("SIGINT", interrupt);
  let result: RegionalProbeCliResult;
  try {
    result = await runRegionalProbeCli(runtime.argv.slice(2), probe, controller.signal);
  } finally {
    runtime.off("SIGINT", interrupt);
  }
  if (result.stdout) runtime.stdout.write(result.stdout);
  if (result.stderr) runtime.stderr.write(result.stderr);
  runtime.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void executeRegionalProbeCli();
}
