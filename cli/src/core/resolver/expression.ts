/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/expression.ts
 * Purpose: The one evaluator for coordinate arithmetic (§7.2, [D-7]). A
 *          coordinate attribute may be an integer expression over literals and
 *          `#constants`; generated code must only ever see the literal it
 *          evaluates to (§13.2). The validator's bounds checks and the
 *          generator's resolved model both go through this module, so the two
 *          can never disagree about what `#screen_width - 8` means — PR-3R's
 *          defects came from exactly that kind of duplicated logic.
 * Description: A tokeniser and recursive-descent parser for
 *              `+ - * /`, unary minus and parentheses, then an evaluator using
 *              integer operations only: division truncates toward zero, every
 *              intermediate is range-checked against `int32_t`, and no rounded
 *              quotient is ever computed (§13.9). `#screen_*` come from the
 *              target's display record, `#parent_*` from the containing element
 *              ([D-20]), and anything else from `globals.xml` `<consts>`. A value
 *              that cannot be known yet — a container of unknown size, or a
 *              composite's `$prop` placeholder before expansion (WO7) — is
 *              *deferred*, not an error. Isomorphic; never throws for user input.
 *
 * Exports:
 * - INT32_MIN, INT32_MAX:   The range build-time arithmetic and `int` properties use (§13.2)
 * - INT16_MIN, INT16_MAX:   The range a resolved coordinate must fit (§13.2)
 * - integerLiteralValue():  The one integer-literal rule for `<int>` constants
 * - BUILTIN_CONSTANTS:      The four constants the resolver supplies itself
 * - ContainerSize:          A width and height, either possibly unknown
 * - EvaluationScope:        Constants, display and container an expression sees
 * - ExpressionSite:         Where an expression was written, for diagnostics
 * - Evaluation:             value | deferred | invalid
 * - buildConstantTable():   `<consts>` by name, first declaration winning
 * - evaluateExpression():   Evaluate one attribute's text
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { ConstDecl, Globals } from '../schema/globals.js';
import type { SourceLocation } from '../schema/source-location.js';
import { findClosest } from '../catalogue/edit-distance.js';

/** Smallest value build-time arithmetic may reach — `int32_t`, the width of an `int` property (§13.2). */
export const INT32_MIN = -2147483648;
/** Largest value build-time arithmetic may reach — `int32_t`, the width of an `int` property (§13.2). */
export const INT32_MAX = 2147483647;
/** Smallest value a resolved coordinate may take — `int16_t`, as `u8g2gl_obj` stores it (§13.2). */
export const INT16_MIN = -32768;
/** Largest value a resolved coordinate may take — `int16_t`, as `u8g2gl_obj` stores it (§13.2). */
export const INT16_MAX = 32767;

/** An integer literal: optional minus, digits. */
const INTEGER_LITERAL = /^-?[0-9]+$/;

/**
 * @brief The value of a constant's text, if it is an integer literal.
 *
 * The one rule for what an `<int>` constant may hold — used where a constant is
 * declared (validate-schema.ts) and where it is used (below), so the two cannot
 * disagree. Leading and trailing whitespace is ignored. Range is not checked.
 *
 * @return The integer, or undefined when the text is not an integer literal.
 */
export function integerLiteralValue(text: string): number | undefined {
  const literal = text.trim();
  return INTEGER_LITERAL.test(literal) ? Number(literal) : undefined;
}

/**
 * Constants the resolver supplies rather than `globals.xml`. These name the
 * layout contract (§7.2, §7.3, [D-20]), not elements, so they are not element
 * knowledge in [D-17]'s sense. They take precedence over a `<const>` of the
 * same name.
 */
export const BUILTIN_CONSTANTS: readonly string[] = [
  'screen_width',
  'screen_height',
  'parent_width',
  'parent_height',
];

/** A width and height in pixels; either is undefined while it cannot be known. */
export interface ContainerSize {
  readonly width?: number;
  readonly height?: number;
}

/** Everything an expression can refer to. */
export interface EvaluationScope {
  /** `globals.xml` constants by name — see {@link buildConstantTable}. */
  readonly constants: ReadonlyMap<string, ConstDecl>;
  /** The selected target's display, source of `#screen_width` / `#screen_height`. */
  readonly screen: ContainerSize;
  /** The containing element, source of `#parent_width` / `#parent_height`. */
  readonly parent: ContainerSize;
}

/** Where an expression was written. */
export interface ExpressionSite {
  /** The attribute's own location; diagnostics point here. */
  readonly loc?: SourceLocation;
  /** Prose naming the attribute and element, e.g. `'width' on <u8g2gl_label> 'title'`. */
  readonly subject: string;
}

/**
 * The outcome of evaluating one expression.
 *
 * - `value`    — a literal integer within `int32_t`.
 * - `deferred` — well-formed and free of errors, but it names something not yet
 *                known (`symbols`, spelled as written); not a diagnostic.
 * - `invalid`  — at least one diagnostic; no value.
 */
export type Evaluation =
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'deferred'; readonly symbols: readonly string[] }
  | { readonly kind: 'invalid'; readonly diagnostics: readonly Diagnostic[] };

/** A lexical token. `pos` is the 1-based character offset within the text. */
type Token =
  | { readonly kind: 'integer'; readonly text: string; readonly pos: number }
  | { readonly kind: 'constant'; readonly name: string; readonly pos: number }
  | { readonly kind: 'placeholder'; readonly name: string; readonly pos: number }
  | { readonly kind: 'symbol'; readonly text: '+' | '-' | '*' | '/' | '(' | ')'; readonly pos: number };

/** A parsed expression. */
type ExpressionNode =
  | { readonly kind: 'integer'; readonly text: string }
  | { readonly kind: 'constant'; readonly name: string }
  | { readonly kind: 'placeholder'; readonly name: string }
  | { readonly kind: 'negate'; readonly operand: ExpressionNode }
  | { readonly kind: 'binary'; readonly op: '+' | '-' | '*' | '/'; readonly left: ExpressionNode; readonly right: ExpressionNode };

/** Tokenising or parsing either succeeds or names why not. */
type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/y;
const DIGITS = /[0-9]+/y;

/**
 * @brief Indexes `globals.xml` constants by name.
 *
 * The first declaration of a name wins. A duplicate is Pass 7's
 * `U8G2GL_DUPLICATE_NAME`, so it is not diagnosed again here.
 *
 * @param globals Parsed globals.
 * @return Constants keyed by name, without the `#`.
 */
export function buildConstantTable(globals: Globals): ReadonlyMap<string, ConstDecl> {
  const table = new Map<string, ConstDecl>();
  for (const decl of globals.consts) {
    if (decl.name && !table.has(decl.name)) {
      table.set(decl.name, decl);
    }
  }
  return table;
}

// createExpressionDiagnostic
// An error at the expression's attribute location.
function createExpressionDiagnostic(
  code: string,
  message: string,
  site: ExpressionSite,
  offendingText: string,
  suggestions?: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: site.loc?.file ?? '',
    line: site.loc?.line ?? 1,
    column: site.loc?.column ?? 1,
    message,
    offendingText,
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}

// tokenise
// Splits an attribute's text into tokens, skipping whitespace.
//   text — the attribute value as written
function tokenise(text: string): Parsed<Token[]> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const pos = i + 1;

    // --- Step 1: Whitespace separates tokens and is otherwise insignificant ---
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // --- Step 2: Operators and parentheses ---
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ kind: 'symbol', text: ch, pos });
      i++;
      continue;
    }

    // --- Step 3: Integer literals ---
    DIGITS.lastIndex = i;
    const digits = DIGITS.exec(text);
    if (digits) {
      tokens.push({ kind: 'integer', text: digits[0], pos });
      i += digits[0].length;
      continue;
    }

    // --- Step 4: `#constant` and `$placeholder` — the sigil must be followed by a name ---
    if (ch === '#' || ch === '$') {
      IDENTIFIER.lastIndex = i + 1;
      const name = IDENTIFIER.exec(text);
      if (!name) {
        return { ok: false, reason: `'${ch}' at character ${pos} is not followed by a name` };
      }
      tokens.push(ch === '#' ? { kind: 'constant', name: name[0], pos } : { kind: 'placeholder', name: name[0], pos });
      i += 1 + name[0].length;
      continue;
    }

    return { ok: false, reason: `unexpected '${ch}' at character ${pos}` };
  }
  return { ok: true, value: tokens };
}

/**
 * Parses already made, by text. A parse depends on nothing but the text, and
 * its tree is only ever read, so one is reused across runs: the designer
 * resolves every coordinate of the project on every frame of a drag, and
 * re-parsing the same few dozen expressions each time was a steady source of
 * garbage (E-2b ruling 8). Bounded, so a long session cannot grow it without
 * limit: when full it is emptied and refills with what is in use.
 */
const PARSE_CACHE = new Map<string, Parsed<ExpressionNode>>();
const PARSE_CACHE_LIMIT = 1024;

// parsedExpression
// The tokenised and parsed form of `text`, from the cache when it has one.
//   text — the attribute value as written
function parsedExpression(text: string): Parsed<ExpressionNode> {
  const cached = PARSE_CACHE.get(text);
  if (cached !== undefined) return cached;
  const tokens = tokenise(text);
  const parsed = tokens.ok ? parse(tokens.value) : tokens;
  if (PARSE_CACHE.size >= PARSE_CACHE_LIMIT) PARSE_CACHE.clear();
  PARSE_CACHE.set(text, parsed);
  return parsed;
}

// parse
// Recursive descent over the grammar, lowest precedence first:
//   expression := term    (('+' | '-') term)*
//   term       := unary   (('*' | '/') unary)*
//   unary      := '-' unary | primary
//   primary    := INTEGER | '#' NAME | '$' NAME | '(' expression ')'
// Binary operators are left-associative, so `10 - 4 - 3` is 3 and `20 / 2 / 5` is 2.
//   tokens — output of tokenise()
function parse(tokens: readonly Token[]): Parsed<ExpressionNode> {
  let index = 0;
  let failure: string | undefined;

  const peek = (): Token | undefined => tokens[index];
  const describe = (token: Token | undefined): string => {
    if (token === undefined) {
      return 'end of expression';
    }
    switch (token.kind) {
      case 'integer':
        return `'${token.text}' at character ${token.pos}`;
      case 'constant':
        return `'#${token.name}' at character ${token.pos}`;
      case 'placeholder':
        return `'$${token.name}' at character ${token.pos}`;
      case 'symbol':
        return `'${token.text}' at character ${token.pos}`;
    }
  };
  const isSymbol = (token: Token | undefined, ...symbols: string[]): token is Token & { kind: 'symbol' } =>
    token !== undefined && token.kind === 'symbol' && symbols.includes(token.text);

  function primary(): ExpressionNode | undefined {
    const token = peek();
    if (token === undefined) {
      failure = 'an operand is missing at the end';
      return undefined;
    }
    if (token.kind === 'integer') {
      index++;
      return { kind: 'integer', text: token.text };
    }
    if (token.kind === 'constant') {
      index++;
      return { kind: 'constant', name: token.name };
    }
    if (token.kind === 'placeholder') {
      index++;
      return { kind: 'placeholder', name: token.name };
    }
    if (token.text === '(') {
      index++;
      const inner = expression();
      if (inner === undefined) {
        return undefined;
      }
      if (!isSymbol(peek(), ')')) {
        failure = `expected ')' but found ${describe(peek())}`;
        return undefined;
      }
      index++;
      return inner;
    }
    failure = `expected an operand but found ${describe(token)}`;
    return undefined;
  }

  function unary(): ExpressionNode | undefined {
    if (isSymbol(peek(), '-')) {
      index++;
      const operand = unary();
      return operand === undefined ? undefined : { kind: 'negate', operand };
    }
    return primary();
  }

  function term(): ExpressionNode | undefined {
    let left = unary();
    while (left !== undefined) {
      const token = peek();
      if (!isSymbol(token, '*', '/')) {
        break;
      }
      index++;
      const right = unary();
      if (right === undefined) {
        return undefined;
      }
      left = { kind: 'binary', op: token.text as '*' | '/', left, right };
    }
    return left;
  }

  function expression(): ExpressionNode | undefined {
    let left = term();
    while (left !== undefined) {
      const token = peek();
      if (!isSymbol(token, '+', '-')) {
        break;
      }
      index++;
      const right = term();
      if (right === undefined) {
        return undefined;
      }
      left = { kind: 'binary', op: token.text as '+' | '-', left, right };
    }
    return left;
  }

  if (tokens.length === 0) {
    return { ok: false, reason: 'the expression is empty' };
  }
  const root = expression();
  if (root === undefined) {
    return { ok: false, reason: failure ?? 'the expression is incomplete' };
  }
  if (index < tokens.length) {
    return { ok: false, reason: `unexpected ${describe(peek())}` };
  }
  return { ok: true, value: root };
}

// truncatingDivide
// C/C++ integer division: the quotient truncated toward zero, which is what the
// generated `int32_t` arithmetic a reader might write by hand would give, and so
// `-7 / 2` is -3, not -4. JavaScript's `%` takes the sign of the dividend, so
// `a - a % b` is the exact multiple of `b` nearest zero and the final division is
// exact. `Math.trunc(a / b)` is deliberately not used: it computes a rounded
// floating-point quotient first, and §13.9 allows no floating point on the path
// to output. Precondition: b !== 0, both operands within int32.
function truncatingDivide(a: number, b: number): number {
  return (a - (a % b)) / b;
}

/** Mutable accumulator threaded through one evaluation. */
interface EvaluationState {
  readonly text: string;
  readonly scope: EvaluationScope;
  readonly site: ExpressionSite;
  readonly diagnostics: Diagnostic[];
  readonly deferred: string[];
}

// checkRange
// The value, or undefined with an INTEGER_OVERFLOW diagnostic if it leaves int32.
// Checked after every operation so no intermediate ever exceeds the range
// JavaScript numbers hold exactly (a product of two int32 values is below 2^62,
// and its magnitude is still reliably out of range even where it is inexact).
function checkRange(value: number, state: EvaluationState): number | undefined {
  if (value >= INT32_MIN && value <= INT32_MAX) {
    // `+ 0` turns -0 into 0. Truncation (`1 / -3`) and negation (`-0`) both
    // produce -0, which is not an integer an emitter or a strict equality
    // check should ever see.
    return value + 0;
  }
  state.diagnostics.push(
    createExpressionDiagnostic(
      DIAGNOSTIC_CODES.INTEGER_OVERFLOW,
      `Expression '${state.text}' in ${state.site.subject} leaves the int32_t range ` +
        `(${INT32_MIN}..${INT32_MAX}) that build-time arithmetic is checked in (§13.2).`,
      state.site,
      state.text,
    ),
  );
  return undefined;
}

// resolveConstant
// The value of `#name`, or undefined having recorded a diagnostic or a deferral.
//   name  — constant name without '#'
//   state — evaluation accumulator
function resolveConstant(name: string, state: EvaluationState): number | undefined {
  const { scope, site } = state;

  // --- Step 1: Built-ins, supplied by the target and the containing element ---
  const builtin: Readonly<Record<string, number | undefined>> = {
    screen_width: scope.screen.width,
    screen_height: scope.screen.height,
    parent_width: scope.parent.width,
    parent_height: scope.parent.height,
  };
  if (BUILTIN_CONSTANTS.includes(name)) {
    const value = builtin[name];
    if (value === undefined) {
      state.deferred.push(`#${name}`);
    }
    return value;
  }

  // --- Step 2: globals.xml constants; unknown names get near-match suggestions ---
  const decl = scope.constants.get(name);
  if (decl === undefined) {
    const candidates = [...BUILTIN_CONSTANTS, ...scope.constants.keys()];
    state.diagnostics.push(
      createExpressionDiagnostic(
        DIAGNOSTIC_CODES.UNKNOWN_CONSTANT,
        `Unknown constant '#${name}' in ${site.subject}. Declare it in globals.xml <consts>.`,
        site,
        `#${name}`,
        findClosest(name, candidates).map((candidate) => `#${candidate}`),
      ),
    );
    return undefined;
  }

  // --- Step 3: Only an <int> whose value is an integer literal takes part in arithmetic ---
  // A constant's own value is a literal, not an expression: §7.2 gives
  // expressions to coordinate attributes, and a literal-only rule means
  // constants can never form a cycle.
  const literal = integerLiteralValue(decl.value);
  if (decl.type !== 'int' || literal === undefined) {
    const what = decl.type === 'int' ? `an <int> whose value '${decl.value}' is not an integer` : `a <${decl.type}>`;
    state.diagnostics.push(
      createExpressionDiagnostic(
        DIAGNOSTIC_CODES.NON_INTEGER_CONSTANT,
        `Constant '#${name}' used in ${site.subject} is ${what}; coordinate arithmetic is integer-only (§7.2).`,
        site,
        `#${name}`,
      ),
    );
    return undefined;
  }
  return checkRange(literal, state);
}

// evaluateNode
// Post-order evaluation. Returns undefined whenever a sub-expression produced a
// diagnostic or a deferral; both sides of a binary operator are always
// evaluated, so every unknown constant in one expression is reported at once.
function evaluateNode(node: ExpressionNode, state: EvaluationState): number | undefined {
  switch (node.kind) {
    case 'integer':
      return checkRange(Number(node.text), state);
    case 'constant':
      return resolveConstant(node.name, state);
    case 'placeholder':
      // A composite's `$prop` has no value until expansion substitutes it (WO7).
      state.deferred.push(`$${node.name}`);
      return undefined;
    case 'negate': {
      const operand = evaluateNode(node.operand, state);
      return operand === undefined ? undefined : checkRange(-operand, state);
    }
    case 'binary': {
      const left = evaluateNode(node.left, state);
      const right = evaluateNode(node.right, state);
      if (left === undefined || right === undefined) {
        return undefined;
      }
      switch (node.op) {
        case '+':
          return checkRange(left + right, state);
        case '-':
          return checkRange(left - right, state);
        case '*':
          return checkRange(left * right, state);
        case '/':
          if (right === 0) {
            state.diagnostics.push(
              createExpressionDiagnostic(
                DIAGNOSTIC_CODES.DIVISION_BY_ZERO,
                `Division by zero in '${state.text}' (${state.site.subject}).`,
                state.site,
                state.text,
              ),
            );
            return undefined;
          }
          return checkRange(truncatingDivide(left, right), state);
      }
    }
  }
}

/**
 * @brief Evaluates one coordinate attribute to an integer.
 *
 * Accepts integer literals, `#constants`, `$placeholders`, unary minus, the
 * binary operators `+ - * /` (usual precedence, left-associative) and
 * parentheses. Division truncates toward zero. Every intermediate must stay
 * within `int32_t`.
 *
 * @param text  The attribute value as written.
 * @param scope Constants, display and containing element in effect.
 * @param site  Attribute location and prose for diagnostics.
 * @return `value`; `deferred` (no diagnostic) when the expression names a
 *         built-in whose size is not known here, or a `$placeholder`; or
 *         `invalid` with one or more diagnostics — errors take precedence over
 *         deferral. Never throws.
 */
export function evaluateExpression(text: string, scope: EvaluationScope, site: ExpressionSite): Evaluation {
  // --- Step 1: Tokenise and parse; a syntax error is the only diagnostic ---
  const parsed = parsedExpression(text);
  if (!parsed.ok) {
    return {
      kind: 'invalid',
      diagnostics: [
        createExpressionDiagnostic(
          DIAGNOSTIC_CODES.MALFORMED_EXPRESSION,
          `Malformed expression '${text}' in ${site.subject}: ${parsed.reason}. ` +
            `Coordinates accept integers, #constants, + - * / and parentheses (§7.2).`,
          site,
          text,
        ),
      ],
    };
  }

  // --- Step 2: Evaluate ---
  const state: EvaluationState = { text, scope, site, diagnostics: [], deferred: [] };
  const value = evaluateNode(parsed.value, state);

  // --- Step 3: Errors, then deferrals, then the value ---
  if (state.diagnostics.length > 0) {
    return { kind: 'invalid', diagnostics: state.diagnostics };
  }
  if (value === undefined) {
    return { kind: 'deferred', symbols: state.deferred };
  }
  return { kind: 'value', value };
}
