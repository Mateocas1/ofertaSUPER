import { z } from "zod";
import { canonicalize, sha256 } from "./canonical";

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const selectorSchema = z.object({
  version: z.literal(2), domain: name, target: z.enum(["preview", "production"]), scope: name,
  deploymentId: z.uuid(), publicationId: z.uuid(), incarnation: z.uuid(),
}).strict().readonly();
const inputPath = z.string().regex(/^(?:\.next\/server\/|node_modules\/|package-lock\.json$)/)
  .refine((path) => !path.includes("..") && !path.includes("\\") && !path.includes("catalog-build-contract"));
const contractSchema = z.object({
  version: z.literal("catalog-build/v1"), selector: selectorSchema.nullable(),
  inputs: z.record(inputPath, digest).refine((inputs) => Boolean(inputs["package-lock.json"])
    && Object.keys(inputs).some((path) => path.startsWith(".next/server/"))),
}).strict();
const sourceExpectation = z.object({
  platformDeploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/),
  projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), repoId: z.string().regex(/^[1-9]\d{0,19}$/),
  ref: name, commitSha: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();
export type ReservationSelector = z.infer<typeof selectorSchema>;
export type BootstrapInput = {
  reservation: unknown; packaged: unknown; expectedBuildDigest: string;
  metadata: unknown; expected: z.infer<typeof sourceExpectation>;
};

/** A reservation is not authority; no future candidate digest or platform ID belongs here. */
export function parseReservationSelector(value: unknown): Readonly<ReservationSelector> {
  return selectorSchema.parse(value);
}

export function createBuildContract(selector: unknown, inputs: Record<string, string>) {
  const parsed = contractSchema.parse({ version: "catalog-build/v1", selector, inputs });
  return Object.freeze({ ...parsed, inputs: Object.freeze(parsed.inputs) });
}

/** Inputs must come from independently retrieved artifacts and platform-origin metadata. */
export function validateBootstrapContract(input: BootstrapInput) {
  const reservation = parseReservationSelector(input.reservation);
  const packaged = contractSchema.parse(input.packaged);
  const buildDigest = sha256(canonicalize(packaged));
  if (canonicalize(reservation) !== canonicalize(packaged.selector) || buildDigest !== digest.parse(input.expectedBuildDigest)) {
    throw new Error("Packaged contract mismatch; enablement blocked");
  }
  const expected = sourceExpectation.parse(input.expected);
  const metadata = z.object({
    id: z.literal(expected.platformDeploymentId), projectId: z.literal(expected.projectId),
    target: z.literal(reservation.target), readyState: z.literal("READY"),
    gitSource: z.object({ type: z.literal("github"), repoId: z.union([z.string(), z.number().int().safe().positive()]),
      ref: z.literal(expected.ref), sha: z.literal(expected.commitSha) }),
  }).safeParse(input.metadata);
  if (!metadata.success || String(metadata.data.gitSource.repoId) !== expected.repoId) {
    throw new Error("Platform provenance mismatch; enablement blocked");
  }
  return Object.freeze({ status: "bootstrap-verified" as const, active: false as const,
    selector: reservation, buildDigest, commitSha: metadata.data.gitSource.sha,
    platformDeploymentId: metadata.data.id });
}
