import assert from "node:assert/strict";
import test from "node:test";

import { functionSymbols } from "../scripts/complexity/symbols.mjs";

test("regression: typed stable identities tolerate line movement", () => {
	const first = functionSymbols("export function calculate() { return 1; }\n", "src/example.ts");
	const moved = functionSymbols("\n\nexport function calculate() { return 1; }\n", "src/example.ts");
	assert.equal(first[0].functionId, "src/example.ts#function:calculate");
	assert.equal(moved[0].functionId, first[0].functionId);
});

test("structural fingerprints tolerate line movement", () => {
	const first = functionSymbols("export function calculate() { return 1; }\n", "src/example.ts");
	const moved = functionSymbols("\n\nexport function calculate() { return 1; }\n", "src/example.ts");
	assert.equal(first[0].structuralFingerprint, moved[0].structuralFingerprint);
});

test("semantic identity escaping prevents work, work$2, and duplicate work from colliding silently", () => {
	const symbols = functionSymbols("function work() {}\nfunction work$2() {}\n", "src/example.ts");
	assert.deepEqual(symbols.map((symbol) => symbol.functionId), ["src/example.ts#function:work", "src/example.ts#function:work%242"]);
	assert.throws(() => functionSymbols("function work() {}\nfunction work$2() {}\nfunction work() {}\n", "src/example.ts"), /identity collision.*function:work/);
});

test("duplicate semantic callback identities fail closed instead of receiving source-order ordinals", () => {
	assert.throws(() => functionSymbols("items.map((value) => value > 0);\nitems.map((value) => value > 0);\n", "src/example.ts"), /identity collision.*callback:items\.map/);
});

test("a surviving callback retains its identity after an unrelated sibling is removed", () => {
	const source = "first.map((value) => value > 0);\nsecond.map((value) => value < 0);\n";
	const before = functionSymbols(source, "src/example.ts");
	const after = functionSymbols("second.map((value) => value < 0);\n", "src/example.ts");
	assert.equal(before[1].functionId, after[0].functionId);
	assert.equal(before[1].structuralFingerprint, after[0].structuralFingerprint);
});
