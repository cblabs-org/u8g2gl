/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-value.test.ts
 * Purpose: Pins §13.2's type mapping — the one function that spells a value as
 *          C++ (PR-04 WO9). Every setter call, draw argument and initial value
 *          in every generated file goes through it, and WO10's firmware emission
 *          and WO11's editor target share it, so a defect here is a defect in
 *          all of them at once.
 * Description: One test per row of §13.2's table, plus the escaping rules, plus
 *              the cases the helper must **refuse**: emission runs only on a
 *              validated document, so a value it cannot spell means validation
 *              let something through, and a plausible guess in committed C++ is
 *              the worst available outcome ([D-11]).
 */

import { describe, expect, it } from 'vitest';
import { cppEnumerator, cppStringLiteral, cppValue } from '../../src/core/generator/emit/index.js';
import type { PropDef } from '../../src/core/schema/widget-manifest.js';

/** A minimal prop declaration of the given type. */
function prop(type: PropDef['type'], extra: Partial<PropDef> = {}): PropDef {
  return { name: 'p', type, ...extra };
}

describe('cppValue() — §13.2 type mapping', () => {
  it('spells an int as the literal it resolved to', () => {
    expect(cppValue(prop('int'), '12')).toBe('12');
    expect(cppValue(prop('int'), '-7')).toBe('-7');
    expect(cppValue(prop('int'), ' 20 ')).toBe('20');
  });

  it('spells a bool as true or false', () => {
    expect(cppValue(prop('bool'), 'true')).toBe('true');
    expect(cppValue(prop('bool'), 'false')).toBe('false');
  });

  it('spells an enum through the manifest emit pattern', () => {
    const align = prop('enum', { emit: 'U8G2GL_ALIGN_{VALUE^^}', values: 'left,center,right' });
    expect(cppValue(align, 'center')).toBe('U8G2GL_ALIGN_CENTER');

    const long = prop('enum', { emit: 'U8G2GL_LONG_{VALUE^^}' });
    expect(cppValue(long, 'scroll_circular')).toBe('U8G2GL_LONG_SCROLL_CIRCULAR');
  });

  it('spells the identifier rows through §13.4', () => {
    expect(cppValue(prop('font'), 'small_9')).toBe('ui_font_small_9');
    expect(cppValue(prop('image'), 'icon_wifi')).toBe('ui_image_icon_wifi');
    expect(cppValue(prop('style'), 'header')).toBe('ui_style_header');
  });

  it('spells a subject as its address, because every bind_* takes a pointer', () => {
    expect(cppValue(prop('subject'), 'temperature')).toBe('&ui_subject_temperature');
  });

  it('spells the monochrome colour set (§10)', () => {
    expect(cppValue(prop('color'), '0')).toBe('U8G2GL_COLOR_0');
    expect(cppValue(prop('color'), '1')).toBe('U8G2GL_COLOR_1');
    expect(cppValue(prop('color'), 'xor')).toBe('U8G2GL_COLOR_XOR');
  });
});

describe('cppValue() refuses what validation should have caught', () => {
  it('refuses an unresolved expression rather than emitting it as text', () => {
    // WO8a finding 5: `scroll_px_per_sec="#speed"` used to arrive here as text.
    expect(() => cppValue(prop('int'), '#speed')).toThrow(/not a literal integer/);
    expect(() => cppValue(prop('int'), '4 + 4')).toThrow(/not a literal integer/);
  });

  it('refuses a non-boolean bool rather than guessing (WO8a finding 2)', () => {
    // `filled="yes"` validated and reached emission before WO9.
    expect(() => cppValue(prop('bool'), 'yes')).toThrow(/a bool is 'true' or 'false'/);
  });

  it('refuses an enum whose manifest declares no emit pattern', () => {
    expect(() => cppValue(prop('enum', { values: 'all,upper_left' }), 'all')).toThrow(/no 'emit' pattern/);
  });

  it('refuses a colour outside the monochrome set', () => {
    expect(() => cppValue(prop('color'), 'red')).toThrow(/a colour is one of/);
  });

  it('names the prop, its type and the value, so the validation gap is findable', () => {
    expect(() => cppValue(prop('bool', { name: 'filled' }), 'yes')).toThrow(/prop 'filled' \(type="bool"\)/);
    expect(() => cppValue(prop('bool', { name: 'filled' }), 'yes')).toThrow(/gap in validation/);
  });
});

describe('cppStringLiteral() — §13.2 escaping', () => {
  it('passes printable ASCII through', () => {
    expect(cppStringLiteral('Euston')).toBe('"Euston"');
    expect(cppStringLiteral('')).toBe('""');
  });

  it('escapes a double quote and a backslash', () => {
    expect(cppStringLiteral('say "hi"')).toBe('"say \\"hi\\""');
    expect(cppStringLiteral('a\\b')).toBe('"a\\\\b"');
  });

  it('escapes the whitespace controls with their short forms', () => {
    expect(cppStringLiteral('a\nb\tc\rd')).toBe('"a\\nb\\tc\\rd"');
  });

  it('escapes non-ASCII as octal UTF-8 bytes, so the literal is pure ASCII', () => {
    // é is U+00E9, UTF-8 0xC3 0xA9 -> \303\251.
    expect(cppStringLiteral('café')).toBe('"caf\\303\\251"');
  });

  it('escapes the fixture string exactly: quote, backslash and non-ASCII together', () => {
    expect(cppStringLiteral('Euston "A"\\café')).toBe('"Euston \\"A\\"\\\\caf\\303\\251"');
  });

  it('uses three-digit octal, which cannot run on into a following digit', () => {
    // A two-digit escape followed by a digit would change meaning; \x has no
    // length bound at all, which is why octal is used.
    expect(cppStringLiteral('é1')).toBe('"\\303\\2511"');
    expect(cppStringLiteral('	1')).toBe('"\\t1"');
  });

  it('leaves ? alone — C++17 removed trigraphs', () => {
    expect(cppStringLiteral('what??=')).toBe('"what??="');
  });

  it('escapes a control character numerically', () => {
    expect(cppStringLiteral('')).toBe('"\\001"');
  });
});

describe('cppEnumerator()', () => {
  it('uppercases {VALUE^^} and passes {VALUE} through', () => {
    expect(cppEnumerator('U8G2GL_ALIGN_{VALUE^^}', 'left')).toBe('U8G2GL_ALIGN_LEFT');
    expect(cppEnumerator('prefix_{VALUE}', 'left')).toBe('prefix_left');
  });

  it('refuses a placeholder it does not understand rather than emitting braces', () => {
    expect(() => cppEnumerator('U8G2GL_{VALUE!!}', 'left')).toThrow(/does not understand/);
  });
});
