import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalize } from "../src/lib/production-readiness/canonical";
import { createBuildContract, parseReservationSelector } from "../src/lib/production-readiness/build-contract";

const reservationPath = ".next/cache/catalog-reservation.json";
const contractPath = ".next/catalog-build-contract.json";

export function prepareBuild(root: string, raw: string | undefined) {
  const selector = raw === undefined ? null : parseReservationSelector(JSON.parse(raw));
  mkdirSync(dirname(join(root, reservationPath)), { recursive: true });
  writeFileSync(join(root, reservationPath), canonicalize(selector));
}

export function packageBuild(root: string) {
  const inputs: Record<string, string> = {};
  const capture = (path: string) => {
    inputs[path] = `sha256:${createHash("sha256").update(readFileSync(join(root, path))).digest("hex")}`;
  };
  const walk = (path: string) => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) capture(child);
      else throw new Error("Unsupported packaged input");
    }
  };
  walk(".next/server");
  capture("package-lock.json");
  // Bind installed dependency versions as well as lockfile resolution, never environment provenance.
  for (const dependency of ["next", "react", "react-dom", "@prisma/client"]) {
    const path = `node_modules/${dependency}/package.json`;
    capture(path);
  }
  const selector = JSON.parse(readFileSync(join(root, reservationPath), "utf8"));
  const contract = createBuildContract(selector, inputs);
  writeFileSync(join(root, contractPath), canonicalize(contract));
  if (existsSync(join(root, ".next/standalone/.next"))) {
    writeFileSync(join(root, ".next/standalone", contractPath), canonicalize(contract));
  }
  return contract;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv[2] === "prebuild") prepareBuild(process.cwd(), process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON);
  else if (process.argv[2] === "package") packageBuild(process.cwd());
  else throw new Error("Expected prebuild or package");
}
