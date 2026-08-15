import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type RouteProof = { path: string; status: number; visibility: "public" | "protected" };
export type RuntimeProof = { snapshotId: string; routes: RouteProof[] };
export type RolloutDependencies = { cleanup: () => void; switchTo: (release: string) => void };
type Failure = "failure" | "timeout" | "signal";

const digest = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const protectedStatuses = new Set([302, 303, 307, 308, 401, 403]);

function isComplete(proof: RuntimeProof | null) {
	return Boolean(proof?.routes.some((route) => route.visibility === "public" && route.status === 200)
		&& proof?.routes.some((route) => route.visibility === "protected" && protectedStatuses.has(route.status)));
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
	docker(["run", "--detach", "--rm", "--name", name, "--network=none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", "-e", "DATABASE_URL=postgresql://runtime:local-only@invalid:5432/ofertasuper", "-e", "ADMIN_ENABLED=false", "-e", "CLERK_TELEMETRY_DISABLED=1", "-e", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k", "-e", "CLERK_SECRET_KEY=sk_test_placeholder", image]);
	return name;
}

function writeImmutable(path: string, value: unknown) {
	const source = `${JSON.stringify(value, null, 2)}\n`;
	const descriptor = openSync(path, "wx", 0o600);
	writeFileSync(descriptor, source);
	return digest(source);
}

async function smoke() {
	const image = process.env.NEXT16_RUNTIME_IMAGE ?? "ofertas-super:next16";
	const run = `next16-${randomUUID()}`;
	const names = [`${run}-retained`, `${run}-candidate`];
	let cleaned = false;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		for (const name of names) docker(["rm", "--force", name], true, [0, 1]);
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { cleanup(); process.exit(128 + (signal === "SIGINT" ? 2 : 15)); });
	try {
		const imageId = docker(["image", "inspect", "--format", "{{.Id}}", image], true);
		const snapshotId = digest(`${imageId}:${readFileSync("package-lock.json")}`);
		const retained = start(names[0], image);
		await waitFor(retained);
		const candidate = start(names[1], image);
		const publicStatus = await waitFor(candidate);
		const protectedStatus = Number(docker(["exec", candidate, "node", "-e", "fetch('http://127.0.0.1:3000/admin', {redirect:'manual'}).then(response => process.stdout.write(String(response.status)))"], true));
		const runtime = { snapshotId, routes: [
			{ path: "/api/health/live", status: publicStatus, visibility: "public" as const },
			{ path: "/admin", status: protectedStatus, visibility: "protected" as const },
		] };
		const events: string[] = [];
		const result = evaluateRollout({ candidate: names[1], retained: names[0], runtime }, { switchTo: (release) => events.push(release), cleanup });
		if (result.state !== "promoted") throw new Error("runtime proof blocked promotion");
		const records = process.env.NEXT16_ROLLOUT_RECORD_DIR ?? join(process.cwd(), "audit", "next16-rollout", snapshotId, run);
		mkdirSync(records, { recursive: true });
		const runtimeHash = writeImmutable(join(records, "runtime.json"), runtime);
		const handoff = createHandoff(runtime, result.state);
		const handoffHash = writeImmutable(join(records, "handoff.json"), handoff);
		writeImmutable(join(records, "manifest.json"), {
			imageId, snapshotId, status: result.state, tool: "next16-rollout", generatedAt: new Date().toISOString(),
			lineage: process.env.NEXT16_ROLLOUT_LINEAGE ?? "local-rehearsal",
			records: [{ path: "handoff.json", sha256: handoffHash }, { path: "runtime.json", sha256: runtimeHash }],
		});
		console.log(`Next.js runtime rehearsal passed: retained release, public/protected standalone routes, and pending handoff recorded in ${records}.`);
	} finally { cleanup(); }
}

if (process.argv[1]?.endsWith("next16-rollout.ts")) smoke().catch((error) => { console.error(error); process.exitCode = 1; });
