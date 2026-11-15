/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/snippet.test.ts
 * Purpose: Holds `constructorSnippet()` to its contract: the board-side sample
 *          that replaces the pin attributes ([D-22]) names every pin the
 *          wiring takes, invents none, and spells the rotation only as the
 *          contract macro, so it stays right when the project changes.
 * Description: One committed golden per wiring family (snippets/*.txt, listed
 *              in snippets/cases.json and rewritten only by
 *              refresh-snippets.mjs), compared byte for byte; then the
 *              properties each golden must have whatever its exact wording.
 *              Three of the goldens are also compiled against the real U8G2
 *              headers by the C++ suite (test/snippet_compile/).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { constructorSnippet, pinMacro, PIN_PLACEHOLDER } from '../../src/core/catalogue/index.js';
import type { DisplayRecord } from '../../src/core/schema/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';

const snippetsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'snippets');

/** One golden: the file, and the inputs it was rendered from. */
interface SnippetCase {
  readonly file: string;
  readonly setup: string;
  readonly rotation: string | null;
  readonly target: string;
}

const CASES = JSON.parse(readFileSync(resolve(snippetsDir, 'cases.json'), 'utf8')) as readonly SnippetCase[];

/** The catalogue record a setup names; a missing one is a broken case list. */
function record(setup: string): DisplayRecord {
  const found = CATALOGUE.find((r) => r.setup === setup);
  if (found === undefined) {
    throw new Error(`${setup} is not in the catalogue`);
  }
  return found;
}

describe('constructorSnippet() goldens, one per wiring family', () => {
  it('covers 4W HW SPI, 4W SW SPI, 3W SW SPI, HW I2C, SW I2C, 8080 and the bus-less KS0108', () => {
    expect(CASES.map((c) => record(c.setup).bus.raw)).toEqual([
      '4W_HW_SPI',
      '4W_SW_SPI',
      '3W_SW_SPI',
      'HW_I2C',
      'SW_I2C',
      '8080',
      'PARALLEL',
    ]);
  });

  it.each(CASES)('$file matches', (c) => {
    const golden = readFileSync(resolve(snippetsDir, c.file), 'utf8');
    expect(constructorSnippet(record(c.setup), c.rotation ?? undefined, c.target)).toBe(golden);
  });
});

describe('constructorSnippet() properties', () => {
  it.each(CASES)('$file defines every pin as the placeholder, and passes them in U8G2 order', (c) => {
    const display = record(c.setup);
    const text = constructorSnippet(display, c.rotation ?? undefined, c.target);
    for (const pin of display.bus.pins) {
      const define = new RegExp(`^#define ${pinMacro(pin.name)} +${PIN_PLACEHOLDER} +// (.*)$`, 'm').exec(text);
      expect(define, pin.name).not.toBeNull();
      expect(define?.[1]?.includes('U8X8_PIN_NONE'), pin.name).toBe(pin.optional);
    }
    // No digit is ever a pin: the only numbers are in names and the I2C example.
    expect(text).not.toMatch(/#define DISPLAY_\w+ +\d/);
    const args = ['U8G2GL_TARGET_ROTATION', ...display.bus.pins.map((pin) => pinMacro(pin.name))];
    const call = text.slice(text.indexOf(`${display.setup} display(`));
    const passed = call.slice(call.indexOf('(') + 1, call.indexOf(')')).split(',').map((arg) => arg.trim());
    expect(passed).toEqual(args);
  });

  it('spells the rotation only as the contract macro, naming its expansion in a comment', () => {
    const display = record('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI');
    const r1 = constructorSnippet(display, '90', 'main');
    const r0 = constructorSnippet(display, undefined, 'main');
    expect(r1).toContain('at this target\'s rotation it is U8G2_R1.');
    expect(r0).toContain('at this target\'s rotation it is U8G2_R0.');
    // Only that comment line differs: the code is the same at every rotation.
    const differing = r1.split('\n').filter((line, i) => line !== r0.split('\n')[i]);
    expect(differing).toHaveLength(1);
    expect(differing[0]).toMatch(/^\/\/ U8G2GL_TARGET_ROTATION comes from ui\.hpp/);
  });

  it('leaves the expansion out for a rotation the schema does not accept', () => {
    const text = constructorSnippet(record('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI'), 'R9', 'main');
    expect(text).toContain('// U8G2GL_TARGET_ROTATION comes from ui.hpp.\n');
  });

  it('shows the I2C address only for I2C wirings, commented out', () => {
    const i2c = constructorSnippet(record('U8G2_SSD1306_128X64_NONAME_F_HW_I2C'), 'R0', 'main');
    const spi = constructorSnippet(record('U8G2_SSD1306_128X64_NONAME_F_4W_HW_SPI'), 'R0', 'main');
    expect(i2c).toContain('    // display.setI2CAddress(0x3C * 2);\n');
    expect(i2c.indexOf('setI2CAddress')).toBeLessThan(i2c.indexOf('display.begin();'));
    expect(spi).not.toContain('setI2CAddress');
  });

  it('boots in order: begin(), the contract check naming the target, then ui_init()', () => {
    const text = constructorSnippet(record('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI'), 'R0', 'portrait');
    const begin = text.indexOf('display.begin();');
    const check = text.indexOf('if (!ui_display_matches(display)) {');
    const init = text.indexOf('ui_init();');
    expect(begin).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(begin);
    expect(init).toBeGreaterThan(check);
    expect(text).toContain("/* the panel or rotation differs from target 'portrait' */");
    expect(text).toContain('#include <U8g2lib.h>\n#include "ui.hpp"');
  });
});
