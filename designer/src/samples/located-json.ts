/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/located-json.ts
 * Purpose: Reads a sample set's JSON text into values that remember where they
 *          were written, so each problem a set has can be put on the line and
 *          column of the value at fault, in Problems and as a Monaco marker on
 *          the set's own file. `JSON.parse` gives neither: it keeps no
 *          positions, and the position its error names is worded differently
 *          by each browser engine.
 * Description: A strict RFC 8259 reader, recursive descent, that produces a
 *              tree of `LocatedValue`s, each with the offset of its first
 *              character, and each object member with the offset of its key.
 *              The first syntax error stops the read and is returned with its
 *              offset; `lineColumnAt()` turns any offset into the 1-based line
 *              and column a diagnostic carries. A duplicate key keeps the last
 *              value, as `JSON.parse` does.
 *
 * Exports:
 * - LocatedValue:       A JSON value and where it starts
 * - LocatedMember:      One object member, with its key's offset
 * - LocatedJsonResult:  The value, or the syntax error
 * - readLocatedJson():  Read a text
 * - lineColumnAt():     An offset as a 1-based line and column
 * - plainValue():       A located value as the plain value `JSON.parse` gives
 */

/** One member of a JSON object: its key, where the key starts, and its value. */
export interface LocatedMember {
  readonly key: string;
  readonly keyOffset: number;
  readonly value: LocatedValue;
}

/** A JSON value, with the offset of its first character in the text. */
export type LocatedValue =
  | { readonly kind: 'object'; readonly offset: number; readonly members: readonly LocatedMember[] }
  | { readonly kind: 'array'; readonly offset: number; readonly items: readonly LocatedValue[] }
  | { readonly kind: 'string'; readonly offset: number; readonly value: string }
  | { readonly kind: 'number'; readonly offset: number; readonly value: number }
  | { readonly kind: 'bool'; readonly offset: number; readonly value: boolean }
  | { readonly kind: 'null'; readonly offset: number };

/** What a read gives: the value, or the first syntax error and where it is. */
export type LocatedJsonResult =
  | { readonly ok: true; readonly value: LocatedValue }
  | { readonly ok: false; readonly message: string; readonly offset: number };

/** Thrown inside the reader only, and turned into a result at its edge. */
class SyntaxFault {
  constructor(
    readonly message: string,
    readonly offset: number,
  ) {}
}

/** A JSON number, exactly as RFC 8259 §6 writes it. */
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Nesting deeper than this is refused rather than read: a set is a few levels
 * deep, and an unbounded recursion on hostile text would overflow the stack.
 */
const MAX_DEPTH = 64;

/**
 * @brief Reads JSON text into located values.
 *
 * @param text The whole document. A leading byte-order mark is not expected:
 *             the served file system strips it.
 * @return The value, or the first syntax error with its offset.
 */
export function readLocatedJson(text: string): LocatedJsonResult {
  let at = 0;

  // skipSpace
  // Past JSON's four whitespace characters.
  const skipSpace = (): void => {
    while (at < text.length) {
      const c = text.charCodeAt(at);
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return;
      at += 1;
    }
  };

  // fault
  // A syntax error at the current position, naming what was there.
  const fault = (expected: string): SyntaxFault =>
    new SyntaxFault(at >= text.length ? `expected ${expected}, but the text ends` : `expected ${expected}, found '${text[at]}'`, at);

  // readString
  // A string literal starting at the current position, escapes decoded.
  const readString = (): string => {
    at += 1; // the opening quote
    let out = '';
    while (at < text.length) {
      const c = text[at] as string;
      if (c === '"') {
        at += 1;
        return out;
      }
      if (c === '\\') {
        const escape = text[at + 1];
        const simple: Readonly<Record<string, string>> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (escape !== undefined && simple[escape] !== undefined) {
          out += simple[escape];
          at += 2;
        } else if (escape === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(at + 2, at + 6))) {
          out += String.fromCharCode(parseInt(text.slice(at + 2, at + 6), 16));
          at += 6;
        } else {
          throw new SyntaxFault('a backslash must start a valid escape', at);
        }
      } else if (c.charCodeAt(0) < 0x20) {
        throw new SyntaxFault('a control character must be escaped inside a string', at);
      } else {
        out += c;
        at += 1;
      }
    }
    throw new SyntaxFault('the string is not closed', text.length);
  };

  // readValue
  // Any value starting at the current position (after space).
  const readValue = (depth: number): LocatedValue => {
    skipSpace();
    const offset = at;
    const c = text[at];
    if (depth > MAX_DEPTH) throw new SyntaxFault(`nested more than ${MAX_DEPTH} levels deep`, offset);
    if (c === '{') {
      at += 1;
      const members: LocatedMember[] = [];
      skipSpace();
      if (text[at] === '}') {
        at += 1;
        return { kind: 'object', offset, members };
      }
      for (;;) {
        skipSpace();
        if (text[at] !== '"') throw fault('a quoted key');
        const keyOffset = at;
        const key = readString();
        skipSpace();
        if (text[at] !== ':') throw fault("':'");
        at += 1;
        const value = readValue(depth + 1);
        // A repeated key keeps its last value, as JSON.parse does.
        const earlier = members.findIndex((m) => m.key === key);
        if (earlier >= 0) members.splice(earlier, 1);
        members.push({ key, keyOffset, value });
        skipSpace();
        if (text[at] === ',') {
          at += 1;
          continue;
        }
        if (text[at] === '}') {
          at += 1;
          return { kind: 'object', offset, members };
        }
        throw fault("',' or '}'");
      }
    }
    if (c === '[') {
      at += 1;
      const items: LocatedValue[] = [];
      skipSpace();
      if (text[at] === ']') {
        at += 1;
        return { kind: 'array', offset, items };
      }
      for (;;) {
        items.push(readValue(depth + 1));
        skipSpace();
        if (text[at] === ',') {
          at += 1;
          continue;
        }
        if (text[at] === ']') {
          at += 1;
          return { kind: 'array', offset, items };
        }
        throw fault("',' or ']'");
      }
    }
    if (c === '"') return { kind: 'string', offset, value: readString() };
    for (const [word, value] of [
      ['true', true],
      ['false', false],
    ] as const) {
      if (text.startsWith(word, at)) {
        at += word.length;
        return { kind: 'bool', offset, value };
      }
    }
    if (text.startsWith('null', at)) {
      at += 4;
      return { kind: 'null', offset };
    }
    NUMBER.lastIndex = at;
    const number = NUMBER.exec(text);
    if (number !== null) {
      at += number[0].length;
      return { kind: 'number', offset, value: Number(number[0]) };
    }
    throw fault('a value');
  };

  try {
    const value = readValue(0);
    skipSpace();
    if (at < text.length) throw fault('the end of the text');
    return { ok: true, value };
  } catch (error) {
    if (error instanceof SyntaxFault) return { ok: false, message: error.message, offset: error.offset };
    throw error;
  }
}

/**
 * @brief An offset in a text as the 1-based line and column a diagnostic carries.
 *
 * @param text   The text the offset is in.
 * @param offset A code-unit offset; one past the end is the end's position.
 */
export function lineColumnAt(text: string, offset: number): { readonly line: number; readonly column: number } {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 0x0a) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

/**
 * @brief A located value as the plain value `JSON.parse` would have given.
 *
 * @param value The located value.
 */
export function plainValue(value: LocatedValue): unknown {
  switch (value.kind) {
    case 'object':
      return Object.fromEntries(value.members.map((m) => [m.key, plainValue(m.value)]));
    case 'array':
      return value.items.map(plainValue);
    case 'null':
      return null;
    default:
      return value.value;
  }
}
