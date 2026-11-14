/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/removed-wiring.test.ts
 * Purpose: Holds the removal of the pin attributes and `<bus>` (schema 0.7,
 *          [D-22]) to its contract: each written one is refused with its own
 *          code, U8G2GL_REMOVED_ATTRIBUTE, at its own line, once, at every
 *          schema version, with a message that says where the wiring belongs
 *          and how to get the board-side code; never the generic
 *          unknown-attribute or unknown-element diagnostic. A project that
 *          writes none still parses at every accepted version.
 * Description: Inline `u8g2gl.xml` documents through `parseProjectFile()`,
 *              which is where the refusal is made, so `validate`, `generate`
 *              and the designer all see it. Each case is checked by code,
 *              location, message and count.
 */

import { describe, expect, it } from 'vitest';
import { parseProjectFile } from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';

const SETUP = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';
const PINS = ['cs', 'dc', 'reset', 'address'] as const;

/** A project file around one target, at a schema version. */
function project(target: string, schema = '0.7'): string {
  return [`<u8g2gl schema="${schema}" name="p" version="1.0.0">`, '  <targets>', target, '  </targets>', '</u8g2gl>', ''].join('\n');
}

/** The 1-based line and column at which `needle` starts in `text`. */
function locate(text: string, needle: string): { readonly line: number; readonly column: number } {
  const at = text.indexOf(needle);
  expect(at, needle).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, at).split('\n');
  return { line: before.length, column: (before[before.length - 1]?.length ?? 0) + 1 };
}

/** The refusals a document gets, and every diagnostic code it gets. */
function refusals(xml: string): { readonly removed: readonly Diagnostic[]; readonly codes: readonly string[] } {
  const result = parseProjectFile(xml, 'u8g2gl.xml');
  return {
    removed: result.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE),
    codes: result.diagnostics.map((d) => d.code),
  };
}

/** The message every refusal of `what` carries, for a target whose setup is known or not. */
function message(what: string, kind: 'attribute' | 'element', setup = SETUP): string {
  return (
    `'${what}' is not a U8G2GL ${kind}: pins and bus are configured by your firmware's board ` +
    `(e.g. \`board.h\`); U8G2GL describes the panel. See \`u8g2gl display ${setup} --snippet\`.`
  );
}

describe('a removed pin attribute is refused at its line, once (schema 0.7)', () => {
  const placements = {
    display: (pin: string) => `    <target name="main">\n      <display setup="${SETUP}" ${pin}="5" />\n    </target>`,
    target: (pin: string) => `    <target name="main" setup="${SETUP}" ${pin}="5" />`,
    bus: (pin: string) => `    <target name="main" setup="${SETUP}">\n      <bus ${pin}="5" />\n    </target>`,
  } as const;

  for (const [where, write] of Object.entries(placements)) {
    it.each(PINS)(`'%s' on <${where}>`, (pin) => {
      const xml = project(write(pin));
      const { removed, codes } = refusals(xml);
      const expected = [{ line: locate(xml, `${pin}="5"`).line, column: locate(xml, `${pin}="5"`).column, message: message(pin, 'attribute') }];
      if (where === 'bus') {
        const bus = locate(xml, '<bus');
        expected.unshift({ line: bus.line, column: bus.column, message: message('<bus>', 'element') });
      }
      expect(removed.map((d) => ({ line: d.line, column: d.column, message: d.message }))).toEqual(expected);
      expect(removed.every((d) => d.severity === 'error')).toBe(true);
      // Only this code: never also the generic unknown-attribute or -element one.
      expect(codes.every((code) => code === DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE)).toBe(true);
    });
  }

  it('refuses every occurrence, each at its own line', () => {
    const xml = project(
      [
        `    <target name="main" setup="${SETUP}" reset="1">`,
        '      <display cs="2"',
        '               dc="3" />',
        '      <bus address="0x3C" />',
        '    </target>',
      ].join('\n'),
    );
    const { removed } = refusals(xml);
    expect(removed.map((d) => [d.offendingText, d.line])).toEqual([
      ['reset', locate(xml, 'reset=').line],
      ['cs', locate(xml, 'cs=').line],
      ['dc', locate(xml, 'dc=').line],
      ['bus', locate(xml, '<bus').line],
      ['address', locate(xml, 'address=').line],
    ]);
  });

  it('refuses a <bus> with no attributes once, at its tag', () => {
    const xml = project(`    <target name="main">\n      <display setup="${SETUP}" />\n      <bus />\n    </target>`);
    const { removed, codes } = refusals(xml);
    expect(removed.map((d) => ({ line: d.line, column: d.column, message: d.message }))).toEqual([
      { ...locate(xml, '<bus'), message: message('<bus>', 'element') },
    ]);
    expect(codes).toEqual([DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE]);
  });

  it('names <setup> in the command when the target has no setup to name', () => {
    const { removed } = refusals(project('    <target name="main" cs="5" setup="" />'));
    expect(removed.map((d) => d.message)).toEqual([message('cs', 'attribute', '<setup>')]);
  });

  it.each(['0.4', '0.5', '0.6', '0.7'])('refuses a pin at schema %s too: a pin never had any effect', (schema) => {
    const { removed } = refusals(project(`    <target name="main" setup="${SETUP}" dc="5" />`, schema));
    expect(removed).toHaveLength(1);
  });
});

describe('a project that writes no pin parses at every accepted version', () => {
  it.each(['0.4', '0.5', '0.6', '0.7'])('schema %s', (schema) => {
    const result = parseProjectFile(project(`    <target name="main" setup="${SETUP}" rotation="R1" />`, schema), 'u8g2gl.xml');
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.targets.map((t) => [t.name, t.setup, t.rotation])).toEqual([['main', SETUP, 'R1']]);
  });
});
