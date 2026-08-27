import { createHash } from "node:crypto";

import { parse } from "@typescript-eslint/parser";

const FUNCTION_TYPES = new Set([
	"ArrowFunctionExpression",
	"FunctionDeclaration",
	"FunctionExpression",
]);

function keyName(node) {
	if (!node) return null;
	if (node.type === "Identifier" || node.type === "PrivateIdentifier") return node.name;
	if (node.type === "Literal") return String(node.value);
	return null;
}

function escapeSegment(value) {
	return encodeURIComponent(value);
}

function fingerprint(node, tokens) {
	const normalized = tokens
		.filter((token) => token.range[0] >= node.range[0] && token.range[1] <= node.range[1])
		.map((token) => `${token.type}:${token.value}`)
		.join("|");
	return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

function memberCalleeName(callee, tokens) {
	return `${calleeName(callee.object, tokens)}.${keyName(callee.property) ?? "computed"}`;
}

function invokedCalleeName(callee, tokens) {
	return `${calleeName(callee.callee, tokens)}()`;
}

const CALLEE_HANDLERS = Object.freeze({
	MemberExpression: memberCalleeName,
	OptionalMemberExpression: memberCalleeName,
	CallExpression: invokedCalleeName,
	NewExpression: invokedCalleeName,
	ChainExpression: (callee, tokens) => calleeName(callee.expression, tokens),
	ThisExpression: () => "this",
});

function calleeName(callee, tokens) {
	return CALLEE_HANDLERS[callee?.type]?.(callee, tokens) ?? keyName(callee) ?? `${callee?.type ?? "call"}:${fingerprint(callee, tokens)}`;
}

function semanticAnchor(ancestors) {
	return [...ancestors].reverse().find((node) => ["AssignmentExpression", "ExpressionStatement", "Property", "ReturnStatement", "VariableDeclarator"].includes(node.type)) ?? null;
}

function variableSegment(parent) {
	const name = keyName(parent.id);
	return name ? `variable:${escapeSegment(name)}` : null;
}

function propertySegment(parent, tokens) {
	return `${parent.method ? "method" : "property"}:${escapeSegment(keyName(parent.key) ?? "computed")}:${fingerprint(parent, tokens)}`;
}

function methodSegment(parent, tokens) {
	return `method:${escapeSegment(keyName(parent.key) ?? "computed")}:${fingerprint(parent, tokens)}`;
}

const PARENT_SEGMENTS = Object.freeze({
	VariableDeclarator: variableSegment,
	Property: propertySegment,
	MethodDefinition: methodSegment,
	PropertyDefinition: methodSegment,
	ExportDefaultDeclaration: () => "default:default",
});

function parentSegment(parent, tokens) {
	return PARENT_SEGMENTS[parent?.type]?.(parent, tokens) ?? null;
}

function callbackSegment(parent, tokens, ancestors) {
	if (parent?.type !== "CallExpression" && parent?.type !== "NewExpression") return null;
	const anchor = semanticAnchor(ancestors);
	return `callback:${escapeSegment(calleeName(parent.callee, tokens))}:${fingerprint(parent, tokens)}${anchor ? `:${fingerprint(anchor, tokens)}` : ""}`;
}

function functionSegment(node, parent, tokens, ancestors) {
	if (node.id?.name) return `function:${escapeSegment(node.id.name)}`;
	const named = parentSegment(parent, tokens);
	if (named) return named;
	return `${callbackSegment(parent, tokens, ancestors) ?? "anonymous"}:${fingerprint(node, tokens)}`;
}

function children(node) {
	return Object.entries(node)
		.filter(([key, value]) => !["parent", "loc", "range", "tokens", "comments"].includes(key)
			&& value && typeof value === "object")
		.flatMap(([, value]) => Array.isArray(value) ? value : [value])
		.filter((value) => value && typeof value.type === "string");
}

/** Maps parser nodes to typed, escaped semantic identities; positions are never part of an identity. */
export function functionSymbols(source, filePath) {
	const ast = parse(source, {
		comment: true,
		loc: true,
		range: true,
		sourceType: "module",
		tokens: true,
		ecmaFeatures: { jsx: true },
	});
	const symbols = [];
	const identities = new Set();

	function visit(node, parent, hierarchy, ancestors = []) {
		let childHierarchy = ["ClassDeclaration", "ClassExpression"].includes(node.type)
			? [...hierarchy, `class:${escapeSegment(node.id?.name ?? "anonymous")}`]
			: hierarchy;
		if (FUNCTION_TYPES.has(node.type)) {
			const segment = functionSegment(node, parent, ast.tokens, ancestors);
			childHierarchy = [...hierarchy, segment];
			const functionId = `${filePath}#${childHierarchy.join("/")}`;
			if (identities.has(functionId)) {
				throw new Error(`Complexity function identity collision in ${filePath}: ${functionId}; rename the declaration or make the callback body distinct`);
			}
			identities.add(functionId);
			symbols.push({
				functionId,
				structuralFingerprint: fingerprint(node, ast.tokens),
				start: node.range[0],
				reportStart: ["Property", "MethodDefinition", "PropertyDefinition"].includes(parent?.type) ? parent.range[0] : node.range[0],
				end: node.range[1],
			});
		}
		for (const child of children(node)) visit(child, node, childHierarchy, [...ancestors, node]);
	}

	visit(ast, null, []);
	return symbols;
}

export function offsetForLocation(source, line, column) {
	let offset = 0;
	let remaining = line - 1;
	while (remaining > 0) {
		const next = source.indexOf("\n", offset);
		if (next < 0) return source.length;
		offset = next + 1;
		remaining -= 1;
	}
	return offset + Math.max(0, column - 1);
}

export function symbolAtLocation(symbols, offset) {
	return symbols
		.filter((symbol) => (symbol.reportStart ?? symbol.start) <= offset && offset <= symbol.end)
		.sort((left, right) => (left.end - left.start) - (right.end - right.start))[0] ?? null;
}
