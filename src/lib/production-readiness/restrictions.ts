const facts = new Set(["commercial-data", "authority-evidence"]);
const surfaces = new Set(["catalog", "search", "product", "history"]);

/** U13a boundary vocabulary; U13b owns resolver enforcement. */
export function isKnownRestrictionBoundary(fact: string, surface: string) {
	return facts.has(fact) && surfaces.has(surface);
}
