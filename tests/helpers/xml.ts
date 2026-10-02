// Minimal well-formedness checker for the generated Atom feed. The repository
// has no XML parser dependency and none is worth adding for one route, so this
// verifies the parts that make a feed invalid: one closed root, balanced tags,
// quoted attributes, well-formed entities and no raw markup in text.

const ENTITY = /^&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/;
const TAG_NAME = /^[A-Za-z_][\w.:-]*/;
const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"<]*)"/g;

export class XmlWellFormednessError extends Error {}

type Token = { kind: "text" | "tag"; value: string; at: number };
type DocumentState = { stack: string[]; sawRoot: boolean; rootClosed: boolean };

function fail(message: string): never {
  throw new XmlWellFormednessError(message);
}

function checkText(text: string, where: string): void {
  let rest = text;
  while (rest.length > 0) {
    const ampersand = rest.indexOf("&");
    if (ampersand === -1) return;
    const entity = ENTITY.exec(rest.slice(ampersand));
    if (entity === null) fail(`raw '&' in text at ${where}`);
    rest = rest.slice(ampersand + entity[0].length);
  }
}

function checkAttributes(source: string, where: string): void {
  let rest = source;
  ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(source)) !== null) {
    rest = rest.replace(match[0], " ");
  }
  if (rest.trim().length > 0) fail(`malformed attributes at ${where}: ${rest.trim()}`);
}

function tokenize(xml: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < xml.length) {
    const open = xml.indexOf("<", index);
    if (open === -1) {
      tokens.push({ kind: "text", value: xml.slice(index), at: index });
      return tokens;
    }
    if (open > index) tokens.push({ kind: "text", value: xml.slice(index, open), at: index });
    const close = xml.indexOf(">", open);
    if (close === -1) fail(`unterminated tag at offset ${open}`);
    tokens.push({ kind: "tag", value: xml.slice(open + 1, close), at: open });
    index = close + 1;
  }
  return tokens;
}

function startTag(token: string, state: DocumentState): void {
  if (state.rootClosed) fail("element after the root element");
  if (state.stack.length === 0) {
    if (state.sawRoot) fail("more than one root element");
    state.sawRoot = true;
  }

  const selfClosing = token.endsWith("/");
  const body = selfClosing ? token.slice(0, -1) : token;
  const name = TAG_NAME.exec(body)?.[0];
  if (!name) fail(`invalid tag name in <${token}>`);
  checkAttributes(body.slice(name.length), `<${name}>`);

  if (!selfClosing) {
    state.stack.push(name);
  } else if (state.stack.length === 0) {
    state.rootClosed = true;
  }
}

function endTag(token: string, state: DocumentState): void {
  const name = token.slice(1).trim();
  const expected = state.stack.pop();
  if (expected === undefined) fail(`closing </${name}> without an open element`);
  if (name !== expected) fail(`closing </${name}> does not match <${expected}>`);
  if (state.stack.length === 0) state.rootClosed = true;
}

function applyText(token: Token, state: DocumentState): void {
  if (!state.rootClosed) {
    checkText(token.value, `offset ${token.at}`);
    return;
  }
  if (token.value.trim().length > 0) fail("content outside the root element");
}

function applyTag(token: Token, state: DocumentState): void {
  if (token.value.startsWith("?")) {
    if (state.rootClosed) fail("declaration after the root element");
    return;
  }
  if (token.value.startsWith("!")) return;
  if (token.value.startsWith("/")) {
    endTag(token.value, state);
    return;
  }
  startTag(token.value, state);
}

/** Throws XmlWellFormednessError unless `xml` is a single well-formed element tree. */
export function assertWellFormedXml(xml: string): void {
  const state: DocumentState = { stack: [], sawRoot: false, rootClosed: false };
  for (const token of tokenize(xml)) {
    if (token.kind === "text") applyText(token, state);
    else applyTag(token, state);
  }

  if (!state.sawRoot) fail("no root element");
  if (!state.rootClosed) fail(`unclosed element <${state.stack[state.stack.length - 1] ?? "?"}>`);
}
