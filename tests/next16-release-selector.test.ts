import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createReleaseSelector, validateDistinctReleaseRefs } from "../scripts/next16-release-selector";

async function backend(label: string) {
	const server = createServer((request, response) => {
		if (request.url === "/api/products?limit=1") return void response.end(JSON.stringify({ label, items: [{ id: label }] }));
		if (request.url === "/admin") return void response.writeHead(307, { location: "/sign-in" }).end();
		response.end(label);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("backend did not bind a loopback port");
	return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("routes bounded loopback traffic to retained then switches exactly once to candidate", async () => {
	const retained = await backend("retained");
	const candidate = await backend("candidate");
	const selector = await createReleaseSelector({ retained: retained.url, candidate: candidate.url });
	try {
		assert.deepEqual(await (await fetch(`${selector.url}/api/products?limit=1`)).json(), { label: "retained", items: [{ id: "retained" }] });
		assert.equal(selector.switchTo("candidate"), true);
		assert.equal(selector.switchTo("candidate"), false);
		assert.deepEqual(await (await fetch(`${selector.url}/api/products?limit=1`)).json(), { label: "candidate", items: [{ id: "candidate" }] });
		assert.equal((await fetch(`${selector.url}/admin`, { redirect: "manual" })).status, 307);
		assert.equal(selector.switchTo("retained"), true);
		assert.equal(selector.switchTo("retained"), false);
		assert.deepEqual(await (await fetch(`${selector.url}/api/products?limit=1`)).json(), { label: "retained", items: [{ id: "retained" }] });
		assert.deepEqual(selector.events, ["selected:retained", "selected:candidate", "selected:retained"]);
	} finally {
		await selector.close();
		await retained.close();
		await candidate.close();
	}
});

test("rejects ambiguous, equal-digest, malformed, and secret-bearing release references", () => {
	for (const input of [
		{ retained: "", candidate: "local/candidate" },
		{ retained: "local/retained", candidate: "local/retained" },
		{ retained: "local/retained", candidate: "local/candidate", retainedDigest: "sha256:same", candidateDigest: "sha256:same" },
		{ retained: "sk_test_example", candidate: "local/candidate" },
	]) assert.throws(() => validateDistinctReleaseRefs(input), /release reference rejected/);
});
