/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/resolver/expression.test.ts
 * Purpose: Pins the coordinate evaluator's grammar, integer semantics and
 *          diagnostics (§7.2, §13.2, §13.9, §17.1 "Resolution" layer). The
 *          validator and the generator share this evaluator, so a regression
 *          here is a regression in both.
 * Description: Asserts resolved integers for precedence, associativity, unary
 *              minus and truncating division; the sources of `#screen_*`,
 *              `#parent_*` and `<consts>`; deferral; and the exact code,
 *              location and suggestions of each diagnostic.
 */

import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { ConstDecl, Globals } from '../../src/core/schema/globals.js';
import {
  buildConstantTable,
  evaluateExpression,
  INT32_MAX,
  INT32_MIN,
  type Evaluation,
  type EvaluationScope,
} from '../../src/core/resolver/index.js';

const LOC = { file: 'screens/screen_home.xml', line: 7, column: 21 };
const SITE = { loc: LOC, subject: "'width' on <u8g2gl_label> 'title'" };

const CONSTS: ConstDecl[] = [
  { name: 'header_height', type: 'int', value: '12' },
  { name: 'margin', type: 'int', value: ' -4 ' },
  { name: 'title', type: 'string', value: 'Hello' },
  { name: 'broken', type: 'int', value: '1.5' },
  { name: 'screen_width', type: 'int', value: '999' },
];

function globalsOf(consts: ConstDecl[]): Globals {
  return { consts, subjects: [], styles: [], fonts: [], images: [] };
}

const SCOPE: EvaluationScope = {
  constants: buildConstantTable(globalsOf(CONSTS)),
  screen: { width: 256, height: 64 },
  parent: { width: 40, height: 11 },
};

function evaluate(text: string, scope: EvaluationScope = SCOPE): Evaluation {
  return evaluateExpression(text, scope, SITE);
}

function valueOf(text: string, scope: EvaluationScope = SCOPE): number {
  const result = evaluate(text, scope);
  if (result.kind !== 'value') {
    throw new Error(`'${text}' did not evaluate: ${JSON.stringify(result)}`);
  }
  return result.value;
}

function diagnosticsOf(text: string, scope: EvaluationScope = SCOPE): readonly Diagnostic[] {
  const result = evaluate(text, scope);
  return result.kind === 'invalid' ? result.diagnostics : [];
}

describe('evaluateExpression (PR-04 WO6)', () => {
  describe('grammar', () => {
    it.each([
      ['42', 42],
      [' 7 ', 7],
      ['0', 0],
      ['2 + 3 * 4', 14],
      ['(2 + 3) * 4', 20],
      ['2 * (3 + (4 - 1))', 12],
      ['10 - 4 - 3', 3],
      ['20 / 2 / 5', 2],
      ['-5', -5],
      ['-(3 - 10)', 7],
      ['4 - -2', 6],
      ['--3', 3],
      ['2*3+1', 7],
    ])('%s = %i', (text, expected) => {
      expect(valueOf(text)).toBe(expected);
    });
  });

  describe('integer division truncates toward zero', () => {
    it.each([
      ['7 / 2', 3],
      ['-7 / 2', -3],
      ['7 / -2', -3],
      ['-7 / -2', 3],
      ['1 / 3', 0],
      ['-1 / 3', 0],
      ['#screen_width / 3', 85],
    ])('%s = %i', (text, expected) => {
      expect(valueOf(text)).toBe(expected);
    });

    it('never yields -0', () => {
      // toBe uses Object.is, so -0 would fail these.
      expect(valueOf('1 / -3')).toBe(0);
      expect(valueOf('-0')).toBe(0);
    });

    it('agrees with C truncation for every small operand pair and yields only integers', () => {
      for (let a = -9; a <= 9; a++) {
        for (let b = -4; b <= 4; b++) {
          if (b === 0) {
            continue;
          }
          const value = valueOf(`${a} / ${b}`);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBe(Math.trunc(a / b) + 0);
        }
      }
    });
  });

  describe('constants', () => {
    it('takes #screen_* from the display and #parent_* from the container', () => {
      expect(valueOf('#screen_width - 8')).toBe(248);
      expect(valueOf('#screen_height')).toBe(64);
      expect(valueOf('#parent_width / 2')).toBe(20);
      expect(valueOf('#parent_height + 1')).toBe(12);
    });

    it('takes other names from globals.xml <consts>, trimming the literal', () => {
      expect(valueOf('#header_height + 2')).toBe(14);
      expect(valueOf('#margin')).toBe(-4);
    });

    it('gives the built-ins precedence over a <const> of the same name', () => {
      expect(valueOf('#screen_width')).toBe(256);
    });

    it('keeps the first of duplicate <const> declarations', () => {
      const table = buildConstantTable(
        globalsOf([
          { name: 'gap', type: 'int', value: '2' },
          { name: 'gap', type: 'int', value: '9' },
        ]),
      );
      expect(table.get('gap')?.value).toBe('2');
    });
  });

  describe('deferral', () => {
    const unknownContainer: EvaluationScope = { ...SCOPE, screen: {}, parent: {} };

    it('defers a built-in whose size is not known, without a diagnostic', () => {
      expect(evaluate('#parent_width / 2', unknownContainer)).toEqual({ kind: 'deferred', symbols: ['#parent_width'] });
      expect(evaluate('#screen_width', unknownContainer)).toEqual({ kind: 'deferred', symbols: ['#screen_width'] });
    });

    it('defers a composite $prop placeholder until expansion', () => {
      expect(evaluate('$offset + #parent_height', unknownContainer)).toEqual({
        kind: 'deferred',
        symbols: ['$offset', '#parent_height'],
      });
    });

    it('reports errors in preference to deferring', () => {
      const result = evaluate('#parent_width + #nope', unknownContainer);
      expect(result.kind).toBe('invalid');
      expect(diagnosticsOf('#parent_width + #nope', unknownContainer).map((d) => d.code)).toEqual([
        DIAGNOSTIC_CODES.UNKNOWN_CONSTANT,
      ]);
    });
  });

  describe('diagnostics', () => {
    it('unknown constant: at the attribute, with #-spelled suggestions', () => {
      const diagnostics = diagnosticsOf('#hedaer_height + 2');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: DIAGNOSTIC_CODES.UNKNOWN_CONSTANT,
        severity: 'error',
        file: LOC.file,
        line: LOC.line,
        column: LOC.column,
        offendingText: '#hedaer_height',
      });
      expect(diagnostics[0]?.suggestions).toContain('#header_height');
      expect(diagnostics[0]?.message).toContain("'width' on <u8g2gl_label> 'title'");
    });

    it('reports every unknown constant in one expression', () => {
      expect(diagnosticsOf('#a + #b').map((d) => d.offendingText)).toEqual(['#a', '#b']);
    });

    it('non-integer constant: a <string>, or an <int> whose value is not an integer', () => {
      const text = diagnosticsOf('#title');
      expect(text).toHaveLength(1);
      expect(text[0]).toMatchObject({ code: DIAGNOSTIC_CODES.NON_INTEGER_CONSTANT, offendingText: '#title', line: 7 });
      expect(text[0]?.message).toContain('<string>');

      const broken = diagnosticsOf('#broken + 1');
      expect(broken[0]?.code).toBe(DIAGNOSTIC_CODES.NON_INTEGER_CONSTANT);
      expect(broken[0]?.message).toContain("'1.5' is not an integer");
    });

    it('division by zero, including a zero that is itself computed', () => {
      const diagnostics = diagnosticsOf('10 / (#parent_width - 40)');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: DIAGNOSTIC_CODES.DIVISION_BY_ZERO,
        offendingText: '10 / (#parent_width - 40)',
        column: LOC.column,
      });
    });

    it.each(['', '10 +', '(3', '3 )', '* 2', 'abc', '#', '$', '1.5', '10 % 3', '2 3', '()', '# screen_width'])(
      'malformed expression: %j',
      (text) => {
        const diagnostics = diagnosticsOf(text);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          code: DIAGNOSTIC_CODES.MALFORMED_EXPRESSION,
          severity: 'error',
          file: LOC.file,
          line: LOC.line,
          offendingText: text,
        });
      },
    );

    it('says what is malformed', () => {
      expect(diagnosticsOf('(3')[0]?.message).toContain("expected ')' but found end of expression");
      expect(diagnosticsOf('10 % 3')[0]?.message).toContain("unexpected '%' at character 4");
    });

    it('overflow: every intermediate must stay within int32_t', () => {
      expect(valueOf(`${INT32_MAX}`)).toBe(INT32_MAX);
      expect(valueOf('-2147483647 - 1')).toBe(INT32_MIN);
      for (const text of [`${INT32_MAX} + 1`, '65536 * 65536', '2147483648', '-2147483647 - 2']) {
        expect(diagnosticsOf(text).map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.INTEGER_OVERFLOW]);
      }
    });
  });
});
