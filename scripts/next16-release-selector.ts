import { createServer, request as proxyRequest } from "node:http";

export type SelectedRelease = "retained" | "candidate";

type ReleaseRefs = {
	retained: string;
	candidate: string;
	retainedDigest?: string;
	candidateDigest?: string;
};

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const secretPattern = /(?:sk|pk)_(?:test|live)_[\w-]+|bearer\s+|password=|private key/i;

export function validateDistinctReleaseRefs(input: ReleaseRefs) {
	const values = [input.retained, input.candidate, input.retainedDigest, input.candidateDigest];
	if (!input.retained || !input.candidate || input.retained === input.candidate
		|| values.some((value) => typeof value === "string" && secretPattern.test(value))
		|| (input.retainedDigest !== undefined && !digestPattern.test(input.retainedDigest))
		|| (input.candidateDigest !== undefined && !digestPattern.test(input.candidateDigest))
		|| (input.retainedDigest !== undefined && input.retainedDigest === input.candidateDigest)) throw new Error("release reference rejected");
	return input;
}

export async function createReleaseSelector(input: { retained: string; candidate: string }) {
	const endpoints = Object.fromEntries((Object.entries(input) as [SelectedRelease, string][]).map(([release, value]) => {
		const url = new URL(value);
		if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password) throw new Error("selector endpoint rejected");
		return [release, url];
	})) as Record<SelectedRelease, URL>;
	let selected: SelectedRelease = "retained";
	const events = ["selected:retained"];
	const server = createServer((incoming, outgoing) => {
		const target = endpoints[selected];
		const request = proxyRequest({ hostname: target.hostname, port: target.port, path: incoming.url, method: incoming.method, headers: incoming.headers }, (response) => {
			outgoing.writeHead(response.statusCode ?? 502, response.headers);
			response.pipe(outgoing);
		});
		request.once("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("selected release unavailable"); });
		incoming.pipe(request);
	});
	await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("selector did not bind a loopback port");
	return {
		url: `http://127.0.0.1:${address.port}`,
		events,
		switchTo(release: SelectedRelease) {
			if (selected === release || events.slice(1).includes(`selected:${release}`)) return false;
			selected = release;
			events.push(`selected:${release}`);
			return true;
		},
		close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
	};
}
