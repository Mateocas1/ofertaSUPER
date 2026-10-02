// Minimal well-formedness checker for the generated Atom feed. The repository
// has no XML parser dependency and none is worth adding for one route, so this
// verifies the parts that make a feed invalid: one closed root, balanced tags,
// quoted attributes, well-formed entities and no raw markup in text.

const ENTITY = /^&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/;
const TAG_NAME = /^[A-Za-z_][\w.:-]*/;
const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"<]*)"/g;

export class XmlWellFormednessError extends Error {}

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

/** Throws XmlWellFormednessError unless `xml` is a single well-formed element tree. */
export function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  let index = 0;
  let sawRoot = false;
  let rootClosed = false;

  const outsideRoot = (text: string) => {
    if (text.trim().length > 0) fail("content outside the root element");
  };

  while (index < xml.length) {
    const open = xml.indexOf("<", index);
    const text = open === -1 ? xml.slice(index) : xml.slice(index, open);
    if (rootClosed) outsideRoot(text);
    else checkText(text, `offset ${index}`);
    if (open === -1) break;

    const close = xml.indexOf(">", open);
    if (close === -1) fail(`unterminated tag at offset ${open}`);
    const tag = xml.slice(open + 1, close);
    index = close + 1;

    if (tag.startsWith("?") || tag.startsWith("!")) {
      if (rootClosed) fail("declaration or comment after the root element");
      continue;
    }

    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      const expected = stack.pop();
      if (expected === undefined) fail(`closing </${name}> without an open element`);
      if (name !== expected) fail(`closing </${name}> does not match <${expected}>`);
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    if (rootClosed) fail("element after the root element");
    if (stack.length === 0) {
      if (sawRoot) fail("more than one root element");
      sawRoot = true;
    }

    const selfClosing = tag.endsWith("/");
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const name = TAG_NAME.exec(body)?.[0];
    if (!name) fail(`invalid tag name in <${tag}>`);
    checkAttributes(body.slice(name.length), `<${name}>`);

    if (selfClosing) {
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push(name);
    }
  }

  if (!sawRoot) fail("no root element");
  if (!rootClosed) fail(`unclosed element <${stack[stack.length - 1] ?? "?"}>`);
}
