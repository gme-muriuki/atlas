/**
 * Tokenizer for the signature strings produced by atlas-index.
 *
 * The formatter in items.rs emits predictable shapes, so a handwritten
 * scanner is enough — no need for a full parser.
 */

export type TokenKind =
  | 'kw'       // fn, struct, mut, dyn, impl, …
  | 'name'     // the function / item name
  | 'param'    // parameter name
  | 'type'     // type identifiers and primitives
  | 'punct'    // : , ( ) [ ] < > = ! +
  | 'arrow'    // ->
  | 'ref'      // & *
  | 'lifetime' // 'a
  | 'dim';     // whitespace and everything else

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

const TYPE_KEYWORDS = /^(mut|dyn|impl|unsafe|extern|for|const|static|move|async|self|where)\b/;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function tokenizeSignature(sig: string): Token[] {
  if (sig.startsWith('fn ')) return tokenizeFn(sig);
  return tokenizeSimple(sig);
}

// ---------------------------------------------------------------------------
// Simple signatures: struct/enum/trait/type/const/static/macro_rules!
// ---------------------------------------------------------------------------

function tokenizeSimple(sig: string): Token[] {
  const spaceIdx = sig.indexOf(' ');
  if (spaceIdx === -1) return [{ text: sig, kind: 'dim' }];

  const kw = sig.slice(0, spaceIdx);
  const rest = sig.slice(spaceIdx + 1);
  const tokens: Token[] = [
    { text: kw, kind: 'kw' },
    { text: ' ', kind: 'dim' },
  ];

  // "type Name = Type"
  const assignIdx = rest.indexOf(' = ');
  if (assignIdx !== -1) {
    tokens.push({ text: rest.slice(0, assignIdx), kind: 'name' });
    tokens.push({ text: ' = ', kind: 'punct' });
    tokens.push(...tokenizeType(rest.slice(assignIdx + 3)));
    return tokens;
  }

  // "const NAME: Type" / "static NAME: Type"
  const colonIdx = rest.indexOf(': ');
  if (colonIdx !== -1) {
    tokens.push({ text: rest.slice(0, colonIdx), kind: 'name' });
    tokens.push({ text: ': ', kind: 'punct' });
    tokens.push(...tokenizeType(rest.slice(colonIdx + 2)));
    return tokens;
  }

  tokens.push({ text: rest, kind: 'name' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Function signatures: fn name(params) -> ReturnType
// ---------------------------------------------------------------------------

function tokenizeFn(sig: string): Token[] {
  const tokens: Token[] = [{ text: 'fn', kind: 'kw' }, { text: ' ', kind: 'dim' }];
  const body = sig.slice(3); // strip "fn "

  const openIdx = body.indexOf('(');
  if (openIdx === -1) {
    tokens.push({ text: body, kind: 'name' });
    return tokens;
  }

  tokens.push({ text: body.slice(0, openIdx), kind: 'name' });
  tokens.push({ text: '(', kind: 'punct' });

  const after = body.slice(openIdx + 1);
  const closeIdx = findClose(after, '(', ')');
  const paramsStr = after.slice(0, closeIdx);
  const tail = after.slice(closeIdx + 1);

  if (paramsStr.trim()) {
    const params = splitAtDepth0(paramsStr, ',');
    params.forEach((param, i) => {
      tokens.push(...tokenizeParam(param.trim()));
      if (i < params.length - 1) tokens.push({ text: ', ', kind: 'punct' });
    });
  }

  tokens.push({ text: ')', kind: 'punct' });

  const arrowMatch = tail.match(/^\s*->\s*([\s\S]*)$/);
  if (arrowMatch) {
    tokens.push({ text: ' -> ', kind: 'arrow' });
    tokens.push(...tokenizeType(arrowMatch[1].trim()));
  }

  return tokens;
}

function tokenizeParam(param: string): Token[] {
  // &self, &mut self, self, ... → colour as types/refs
  if (param === '...' || param === 'self' || param.startsWith('&')) {
    return tokenizeType(param);
  }
  const colonIdx = param.indexOf(':');
  if (colonIdx === -1) return tokenizeType(param);
  return [
    { text: param.slice(0, colonIdx), kind: 'param' },
    { text: ': ', kind: 'punct' },
    ...tokenizeType(param.slice(colonIdx + 1).trim()),
  ];
}

// ---------------------------------------------------------------------------
// Type expression tokenizer — called recursively via the main scan loop
// ---------------------------------------------------------------------------

function tokenizeType(s: string): Token[] {
  const tokens: Token[] = [];
  let rest = s;

  while (rest.length > 0) {
    // Lifetime  'a
    const ltMatch = rest.match(/^'[a-z_]+/);
    if (ltMatch) {
      tokens.push({ text: ltMatch[0], kind: 'lifetime' });
      rest = rest.slice(ltMatch[0].length);
      continue;
    }
    // Reference / raw pointer
    if (rest[0] === '&' || rest[0] === '*') {
      tokens.push({ text: rest[0], kind: 'ref' });
      rest = rest.slice(1);
      continue;
    }
    // Keywords (mut, dyn, impl, …)
    const kwMatch = rest.match(TYPE_KEYWORDS);
    if (kwMatch) {
      tokens.push({ text: kwMatch[0], kind: 'kw' });
      rest = rest.slice(kwMatch[0].length);
      continue;
    }
    // Identifier
    const identMatch = rest.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (identMatch) {
      tokens.push({ text: identMatch[0], kind: 'type' });
      rest = rest.slice(identMatch[0].length);
      continue;
    }
    // Whitespace
    if (/^\s/.test(rest[0])) {
      tokens.push({ text: rest[0], kind: 'dim' });
      rest = rest.slice(1);
      continue;
    }
    // Punctuation and everything else
    tokens.push({ text: rest[0], kind: 'punct' });
    rest = rest.slice(1);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the matching close character, tracking nesting depth.
 * `after` starts immediately after the opening character.
 */
function findClose(s: string, open: string, close: string): number {
  let depth = 1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length;
}

/**
 * Split `s` at `sep` only at nesting depth 0 (ignores `<>`, `()`, `[]`).
 */
function splitAtDepth0(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '(' || c === '[') depth++;
    else if (c === '>' || c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.filter((p) => p.trim().length > 0);
}
