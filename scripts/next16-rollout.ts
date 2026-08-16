import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	createPromotionHandoff,
	evaluatePromotion,
	type PromotionGateReceipt,
} from "../src/lib/production-readiness/next16-promotion";
import { createReleaseSelector, validateDistinctReleaseRefs, type SelectedRelease } from "./next16-release-selector";

type CatalogReceipt = {
	itemCount: number;
	nonEmpty: boolean;
	provenance: string;
	responseShape: string;
	snapshotId: string;
	releaseId: string;
	observedAt: string;
};
type RouteProof = { path: string; status: number; visibility: "public" | "protected"; catalog?: CatalogReceipt };
export type RuntimeProof = { snapshotId: string; releaseId: string; routes: RouteProof[] };
export type RolloutDependencies = { cleanup: () => void; switchTo: (release: string) => void };
type DistinctSelector = { switchTo: (release: SelectedRelease) => boolean };
type Failure = "failure" | "timeout" | "signal";

const digest = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const protectedStatuses = new Set([302, 303, 307, 308, 401, 403]);
const catalogPath = "/api/products?limit=1";
const maxCatalogEvidenceAgeMs = 5 * 60 * 1000;

function isComplete(proof: RuntimeProof | null): proof is RuntimeProof {
	if (!proof || !proof.snapshotId || !proof.releaseId) return false;
	const catalogRoutes = proof.routes.filter((route) => route.path === catalogPath);
	const catalogRoute = catalogRoutes[0];
	const catalog = catalogRoute?.catalog;
	const observedAt = catalog ? Date.parse(catalog.observedAt) : Number.NaN;
	const catalogIsCurrent = Number.isFinite(observedAt) && observedAt <= Date.now() + 60_000
		&& Date.now() - observedAt <= maxCatalogEvidenceAgeMs;
	return Boolean(proof.routes.some((route) => route.path === "/api/health/live" && route.visibility === "public" && route.status === 200)
		&& proof.routes.some((route) => route.path === "/admin" && route.visibility === "protected" && protectedStatuses.has(route.status))
		&& catalogRoutes.length === 1 && catalogRoute.status === 200 && catalogRoute.visibility === "public"
		&& catalog?.responseShape === "product-list/v1" && catalog.itemCount === 1 && catalog.nonEmpty
		&& (catalog.provenance === "database" || catalog.provenance === "demo")
		&& catalog.snapshotId === proof.snapshotId && catalog.releaseId === proof.releaseId && catalogIsCurrent);
}

export function createStandalonePromotionReceipts(proof: RuntimeProof): PromotionGateReceipt[] {
	if (!isComplete(proof)) throw new Error("standalone promotion receipt rejected");
	const route = (path: string) => proof.routes.find((value) => value.path === path)!;
	const receipt = (gate: string, evidence: unknown): PromotionGateReceipt => ({
		gate, status: "passed", snapshotId: proof.snapshotId, releaseId: proof.releaseId,
		observedAt: route(gate === "standalone-liveness" ? "/api/health/live" : gate === "protected-denial" ? "/admin" : catalogPath).catalog?.observedAt ?? new Date().toISOString(),
		evidenceHash: digest(JSON.stringify(evidence)),
	});
	const live = route("/api/health/live");
	const catalog = route(catalogPath);
	const protectedRoute = route("/admin");
	return [
		receipt("standalone-liveness", live),
		receipt("standalone-catalog-provenance", catalog.catalog),
		receipt("protected-denial", protectedRoute),
	];
}

export function evaluateRollout(
	input: { candidate: string; retained: string; runtime: RuntimeProof | null; failure?: Failure },
	dependencies: RolloutDependencies,
) {
	if (!isComplete(input.runtime)) return { activeRelease: input.retained, state: "blocked" as const, switched: false };
	dependencies.switchTo(input.candidate);
	if (input.failure) dependencies.switchTo(input.retained);
	dependencies.cleanup();
	return input.failure
		? { activeRelease: input.retained, state: "rolled_back" as const, switched: true }
		: { activeRelease: input.candidate, state: "promoted" as const, switched: true };
}

export function evaluateDistinctReleaseRollout(
	input: { retained: string; candidate: string; retainedDigest: string; candidateDigest: string; preCutover: RuntimeProof | null; postCutover: RuntimeProof | null; criticalFailure?: Failure; cutoverApplied?: boolean },
	selector: DistinctSelector,
) {
	validateDistinctReleaseRefs(input);
	if (!isComplete(input.preCutover) || input.preCutover.releaseId !== input.retainedDigest) return { state: "blocked" as const, finalRelease: "retained" as const, rollbackCount: 0 };
	if (!input.cutoverApplied && !selector.switchTo("candidate")) throw new Error("selector candidate switch rejected");
	if (input.criticalFailure || !isComplete(input.postCutover) || input.postCutover.releaseId !== input.candidateDigest) {
		if (!selector.switchTo("retained")) throw new Error("selector rollback rejected");
		return { state: "rolled_back" as const, finalRelease: "retained" as const, rollbackCount: 1 };
	}
	return { state: "promoted" as const, finalRelease: "candidate" as const, rollbackCount: 0 };
}

export function createHandoff(runtime: RuntimeProof, state: "promoted" | "rolled_back" | "blocked") {
	return {
		productionReadiness: { task: "1.3", state: "pending" as const },
		runtime: { snapshotId: runtime.snapshotId, state },
	};
}

function docker(args: string[], capture = false, acceptedStatuses = [0]) {
	const result = spawnSync("docker", args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
	if (result.error || !acceptedStatuses.includes(result.status ?? 1)) throw new Error(`docker ${args.join(" ")} failed: ${result.stderr ?? result.error?.message}`);
	return (result.stdout ?? "").trim();
}

async function waitFor(url: string) {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		try {
			const status = Number(docker(["exec", url, "node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(response => process.stdout.write(String(response.status)))"], true));
			if (status === 200) return status;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`runtime did not become live: ${url}`);
}

function start(name: string, image: string) {
	docker(["run", "--detach", "--rm", "--name", name, "--publish", "127.0.0.1::3000", "-e", "DATABASE_URL=postgresql://runtime:local-only@invalid:5432/ofertasuper", "-e", "ADMIN_ENABLED=false", "-e", "CLERK_TELEMETRY_DISABLED=1", "-e", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k", "-e", "CLERK_SECRET_KEY=sk_test_placeholder", image]);
	return name;
}

function endpoint(container: string) {
	const port = docker(["inspect", "--format", "{{(index (index .NetworkSettings.Ports \"3000/tcp\") 0).HostPort}}", container], true);
	if (!/^\d+$/.test(port)) throw new Error("container loopback port was unavailable");
	return `http://127.0.0.1:${port}`;
}

function buildRelease(base: string, tag: string, release: SelectedRelease) {
	const directory = mkdtempSync(join(tmpdir(), "next16-release-"));
	try {
		writeFileSync(join(directory, "Dockerfile"), `FROM ${base}\nLABEL local.next16.release=${release}\n`, { mode: 0o600 });
		docker(["build", "--pull=false", "--tag", tag, directory]);
		return docker(["image", "inspect", "--format", "{{.Id}}", tag], true);
	} finally { rmSync(directory, { recursive: true, force: true }); }
}

function writeImmutable(path: string, value: unknown) {
	const source = `${JSON.stringify(value, null, 2)}\n`;
	const temporary = `${path}.${process.pid}.tmp`;
	const descriptor = openSync(temporary, "wx", 0o600);
	writeFileSync(descriptor, source);
	closeSync(descriptor);
	renameSync(temporary, path);
	return digest(source);
}

async function smoke() {
	const image = process.env.NEXT16_RUNTIME_IMAGE ?? "ofertas-super:next16";
	const run = `next16-${randomUUID()}`;
	const names = [`${run}-retained`, `${run}-candidate`];
	const tags = [`${run}-retained-image`, `${run}-candidate-image`];
	let cleaned = false;
	let selector: Awaited<ReturnType<typeof createReleaseSelector>> | undefined;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		for (const name of names) docker(["rm", "--force", name], true, [0, 1]);
		for (const tag of tags) docker(["image", "rm", "--force", tag], true, [0, 1]);
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { cleanup(); process.exit(128 + (signal === "SIGINT" ? 2 : 15)); });
	try {
		const retainedDigest = buildRelease(image, tags[0], "retained");
		const candidateDigest = buildRelease(image, tags[1], "candidate");
		validateDistinctReleaseRefs({ retained: tags[0], candidate: tags[1], retainedDigest, candidateDigest });
		const snapshotId = digest(`${retainedDigest}:${candidateDigest}:${readFileSync("package-lock.json")}`);
		const retained = start(names[0], tags[0]);
		await waitFor(retained);
		const candidate = start(names[1], tags[1]);
		await waitFor(candidate);
		const activeSelector = await createReleaseSelector({ retained: endpoint(retained), candidate: endpoint(candidate) });
		selector = activeSelector;
		const prove = async (releaseId: string): Promise<RuntimeProof> => {
			const live = await fetch(`${activeSelector.url}/api/health/live`);
			const response = await fetch(`${activeSelector.url}${catalogPath}`);
			const body = await response.json() as { items?: unknown[]; dataSource?: string; degraded?: boolean };
			const protectedRoute = await fetch(`${activeSelector.url}/admin`, { redirect: "manual" });
			if (live.status !== 200 || response.status !== 200 || !Array.isArray(body.items) || body.items.length !== 1 || !((body.dataSource === "demo" && body.degraded === true) || (body.dataSource === "database" && body.degraded === false)) || !protectedStatuses.has(protectedRoute.status)) throw new Error("selector smoke failed");
			return { snapshotId, releaseId, routes: [{ path: "/api/health/live", status: 200, visibility: "public" }, { path: catalogPath, status: 200, visibility: "public", catalog: { itemCount: 1, nonEmpty: true, provenance: body.dataSource, responseShape: "product-list/v1", snapshotId, releaseId, observedAt: new Date().toISOString() } }, { path: "/admin", status: protectedRoute.status, visibility: "protected" }] };
		};
		const preCutover = await prove(retainedDigest);
		const switched = activeSelector.switchTo("candidate");
		if (!switched || activeSelector.switchTo("candidate")) throw new Error("selector ambiguity rejected");
		const postCutover = await prove(candidateDigest);
		docker(["kill", "--signal", "SIGKILL", candidate]);
		const rollout = evaluateDistinctReleaseRollout({ retained: tags[0], candidate: tags[1], retainedDigest, candidateDigest, preCutover, postCutover, criticalFailure: "signal", cutoverApplied: true }, activeSelector);
		const recovered = await prove(retainedDigest);
		const records = process.env.NEXT16_ROLLOUT_RECORD_DIR ?? join(process.cwd(), "audit", "next16-rollout", snapshotId, run);
		mkdirSync(records, { recursive: true });
		const runtimeHash = writeImmutable(join(records, "pre-switch.json"), preCutover);
		const postHash = writeImmutable(join(records, "post-switch.json"), postCutover);
		const recoveryHash = writeImmutable(join(records, "recovery.json"), recovered);
		const selectorHash = writeImmutable(join(records, "selector.json"), { events: activeSelector.events, rollbackCount: rollout.rollbackCount, finalRelease: rollout.finalRelease });
		const promotion = evaluatePromotion(
			{ snapshotId, releaseId: candidateDigest, receipts: createStandalonePromotionReceipts(postCutover), intent: "promotion" },
			(state) => { writeImmutable(join(records, "promotion-state.json"), state); },
		);
		if (promotion.state !== "blocked" || rollout.state !== "rolled_back" || rollout.rollbackCount !== 1) throw new Error("incomplete local rehearsal advanced unexpectedly");
		const handoff = createPromotionHandoff(promotion);
		const handoffHash = writeImmutable(join(records, "handoff.json"), handoff);
		writeImmutable(join(records, "manifest.json"), {
			snapshotId, releaseDigests: { retained: retainedDigest, candidate: candidateDigest }, status: rollout.state, finalRelease: rollout.finalRelease, rollbackCount: rollout.rollbackCount, promotionRecordHash: promotion.recordHash, tool: "next16-rollout", generatedAt: new Date().toISOString(),
			lineage: process.env.NEXT16_ROLLOUT_LINEAGE ?? "local-rehearsal",
			failure: { kind: "signal", target: "candidate", detectedBy: "post-cutover smoke" }, cleanup: "containers-and-release-images-removed",
			records: [{ path: "handoff.json", sha256: handoffHash }, { path: "pre-switch.json", sha256: runtimeHash }, { path: "post-switch.json", sha256: postHash }, { path: "recovery.json", sha256: recoveryHash }, { path: "selector.json", sha256: selectorHash }],
		});
		await activeSelector.close();
		selector = undefined;
		console.log(`Next.js distinct-release rehearsal rolled back locally as expected; incomplete promotion handoff remains pending in ${records}.`);
	} finally { await selector?.close(); cleanup(); }
}

if (process.argv[1]?.endsWith("next16-rollout.ts")) smoke().catch((error) => { console.error(error); process.exitCode = 1; });
