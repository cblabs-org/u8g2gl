/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/builder.test.ts
 * Purpose: Integration tests for the U8G2 display catalogue builder (§5.2, [D-14])
 *          and for the source record that makes the committed catalogue
 *          reproducible (Q-11).
 * Description: Verifies parsing of authoritative u8x8_display_info_t structs,
 *              driver symbol resolution, constructor class matching, page-mode
 *              mapping, both U8G2 source layouts, and that the committed
 *              catalogue-source.json names the commit of the pinned submodule.
 *              Each record's constructor pins are checked against U8G2's own
 *              U8g2lib.h, read here by plain string slicing rather than the
 *              builder's regex, so the two cannot share a mistake; and a
 *              constructor of any other shape is a builder error naming its
 *              class.
 *              Reads U8G2 from extern/u8g2 only, so the suite behaves the same on
 *              every machine; it skips when the submodule is not initialised.
 *              The Arduino release layout is exercised with a synthetic tree.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { CATALOGUE } from '../../src/data/catalogue.js';
import {
  buildCatalogue,
  parseConstructorPins,
  parseConstructors,
  parseDisplayInfoStructs,
  readU8g2Source,
  resolveU8g2Layout,
} from '../../src/node/catalogue-builder.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const u8g2Path = resolve(cliDir, '..', 'extern', 'u8g2');
const isSubmoduleAvailable = existsSync(resolve(u8g2Path, 'cppsrc', 'U8g2lib.h'));

// U8G2 2.36.18's git tag holds 205 u8x8_display_info_t structs. (Its Arduino
// release holds 206, because it still ships u8x8_d_st7301.c beside the renamed
// u8x8_d_st7302.c; the catalogue built from either is identical.)
const PINNED_STRUCT_COUNT = 205;

describe.runIf(isSubmoduleAvailable)('U8G2 Catalogue Builder Integration (§5.2)', () => {
  it('parses every display_info struct across driver files', () => {
    const structs = parseDisplayInfoStructs(resolveU8g2Layout(u8g2Path).clibDir);
    expect(structs).toHaveLength(PINNED_STRUCT_COUNT);
  });

  it('builds the full catalogue with expected struct and constructor counts', () => {
    const result = buildCatalogue(u8g2Path);

    expect(result.structCount).toBe(PINNED_STRUCT_COUNT);

    // Assert the number of full-buffer constructors is reasonable (>= 700)
    expect(result.fullBufferCount).toBeGreaterThanOrEqual(700);
    expect(result.catalogue.length).toBe(result.fullBufferCount);

    // Assert page-mode constructors are mapped to full-buffer equivalents
    expect(result.pageModeCount).toBeGreaterThanOrEqual(1400);
  });

  it('contains known display U8G2_SSD1306_128X64_NONAME_F_HW_I2C with exact geometry', () => {
    const result = buildCatalogue(u8g2Path);
    const display = result.catalogue.find(
      (d) => d.setup === 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C'
    );

    expect(display).toBeDefined();
    if (!display) {
      return;
    }

    expect(display.controller).toBe('SSD1306');
    expect(display.width).toBe(128);
    expect(display.height).toBe(64);
    expect(display.tiles.width).toBe(16);
    expect(display.tiles.height).toBe(8);
    expect(display.framebufferBytes).toBe(1024);
    expect(display.bus.family).toBe('i2c');
    expect(display.bus.raw).toBe('HW_I2C');
    expect(display.bus.wiring).toBe('hardware');
    expect(display.xOffset.default).toBe(0);
    expect(display.xOffset.flipmode).toBe(0);
    expect(display.driver).toBe('u8x8_d_ssd1306_128x64_noname');
  });

  it('maps page-mode constructor to full-buffer equivalent in pageModeMap', () => {
    const result = buildCatalogue(u8g2Path);
    const pageModeName = 'U8G2_SSD1306_128X64_NONAME_1_HW_I2C';
    const fullBufferEquivalent = result.pageModeMap[pageModeName];

    expect(fullBufferEquivalent).toBe('U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
  });
});

describe.runIf(isSubmoduleAvailable)('U8G2 source layout and provenance (Q-11)', () => {
  it('resolves the git repository layout of the pinned submodule', () => {
    const layout = resolveU8g2Layout(u8g2Path);
    expect(layout.clibDir).toBe(resolve(u8g2Path, 'csrc'));
    expect(layout.headerPath).toBe(resolve(u8g2Path, 'cppsrc', 'U8g2lib.h'));
  });

  it('rejects a directory that is not a U8G2 source tree', () => {
    expect(() => resolveU8g2Layout(testDir)).toThrow(/Not a U8G2 source tree/);
  });

  it('reads the pinned submodule as U8G2 2.36.18 at a full commit hash', () => {
    const source = readU8g2Source(u8g2Path);
    expect(source.tag).toBe('2.36.18');
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('records no commit for a directory that is not the top of its own checkout', () => {
    // cli/test sits inside the U8G2GL checkout. Asking git there would answer
    // with U8G2GL's commit, which identifies no U8G2 source at all.
    expect(readU8g2Source(testDir)).toEqual({ tag: null, commit: null });
  });

  it('the committed catalogue-source.json names the commit extern/u8g2 is checked out at', () => {
    const recordPath = resolve(cliDir, 'src', 'data', 'catalogue-source.json');
    const record: unknown = JSON.parse(readFileSync(recordPath, 'utf8'));
    expect(record).toEqual({ u8g2: readU8g2Source(u8g2Path) });
  });
});

describe('U8G2 Arduino release layout', () => {
  it('resolves src/clib and src/U8g2lib.h in a synthetic release tree', () => {
    // A synthetic tree, so the layout is tested identically on every machine.
    const root = mkdtempSync(join(tmpdir(), 'u8g2gl-release-layout-'));
    try {
      mkdirSync(join(root, 'src', 'clib'), { recursive: true });
      writeFileSync(join(root, 'src', 'U8g2lib.h'), '', 'utf8');

      const layout = resolveU8g2Layout(root);
      expect(layout.clibDir).toBe(join(root, 'src', 'clib'));
      expect(layout.headerPath).toBe(join(root, 'src', 'U8g2lib.h'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * @brief A class's constructor parameters as U8g2lib.h writes them, found by
 *        plain string search: the text between `public: <class>(` and `)`.
 *
 * Deliberately independent of the builder's regular expressions, so a fault
 * in those cannot hide behind a test that reuses them.
 */
function headerParameters(header: string, className: string): string[] {
  const opener = `public: ${className}(`;
  const start = header.indexOf(opener);
  if (start < 0) {
    throw new Error(`${className} has no constructor in U8g2lib.h`);
  }
  const from = start + opener.length;
  return header
    .slice(from, header.indexOf(')', from))
    .split(',')
    .map((param) => param.trim());
}

describe.runIf(isSubmoduleAvailable)("Constructor pins match U8G2's U8g2lib.h", () => {
  const header = readFileSync(resolveU8g2Layout(u8g2Path).headerPath, 'utf8');

  it('the committed catalogue gives every record its pins', () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
    for (const record of CATALOGUE) {
      expect(Array.isArray(record.bus.pins), record.setup).toBe(true);
    }
  });

  it('the committed catalogue is what the builder makes from extern/u8g2', () => {
    expect(buildCatalogue(u8g2Path).catalogue).toEqual(CATALOGUE);
  });

  // Every distinct wiring, so a wiring the catalogue gains is checked without
  // this list being edited: at U8G2 2.36.18 that is fourteen, from HW_I2C to
  // the bus-less PARALLEL.
  const wirings = [...new Set(CATALOGUE.map((record) => record.bus.raw))].sort();

  it('covers the fourteen wirings U8G2 2.36.18 has', () => {
    expect(wirings).toHaveLength(14);
  });

  it.each(wirings)('every %s record lists its constructor parameters in order', (raw) => {
    for (const record of CATALOGUE.filter((r) => r.bus.raw === raw)) {
      const [rotation, ...params] = headerParameters(header, record.setup);
      expect(rotation, record.setup).toBe('const u8g2_cb_t *rotation');
      const expected = params.map((param) => {
        const [declaration = '', defaulted] = param.split('=').map((part) => part.trim());
        expect(declaration.startsWith('uint8_t '), `${record.setup}: ${param}`).toBe(true);
        if (defaulted !== undefined) {
          expect(defaulted, `${record.setup}: ${param}`).toBe('U8X8_PIN_NONE');
        }
        return { name: declaration.slice('uint8_t '.length).trim(), optional: defaulted !== undefined };
      });
      expect(record.bus.pins, record.setup).toEqual(expected);
    }
  });

  it("names the demo's SSD1322 pins, and marks only reset optional", () => {
    const record = CATALOGUE.find((r) => r.setup === 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI');
    expect(record?.bus.pins).toEqual([
      { name: 'cs', optional: false },
      { name: 'dc', optional: false },
      { name: 'reset', optional: true },
    ]);
  });

  it('marks clock and data optional on HW I2C, where U8G2 defaults them', () => {
    const record = CATALOGUE.find((r) => r.setup === 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
    expect(record?.bus.pins).toEqual([
      { name: 'reset', optional: true },
      { name: 'clock', optional: true },
      { name: 'data', optional: true },
    ]);
  });
});

describe('A constructor of any other shape is a builder error naming its class', () => {
  /** Builds a synthetic release-layout tree whose U8g2lib.h holds one class. */
  function withHeader(classText: string, body: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'u8g2gl-ctor-shape-'));
    try {
      mkdirSync(join(root, 'src', 'clib'), { recursive: true });
      writeFileSync(join(root, 'src', 'U8g2lib.h'), classText, 'utf8');
      body(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  /** One U8G2 display class with the given constructor parameters. */
  function displayClass(params: string): string {
    return [
      'class U8G2_TEST_128X64_F_4W_HW_SPI : public U8G2 {',
      `  public: U8G2_TEST_128X64_F_4W_HW_SPI(${params}) : U8G2() {`,
      '    u8g2_Setup_test_128x64_f(&u8g2, rotation, u8x8_byte_arduino_hw_spi, u8x8_gpio_and_delay_arduino);',
      '  }',
      '};',
      '',
    ].join('\n');
  }

  it('reads a well-formed constructor into its pins', () => {
    withHeader(displayClass('const u8g2_cb_t *rotation, uint8_t cs, uint8_t reset = U8X8_PIN_NONE'), (root) => {
      expect(parseConstructors(root)).toEqual([
        {
          className: 'U8G2_TEST_128X64_F_4W_HW_SPI',
          setupFunction: 'u8g2_Setup_test_128x64_f',
          pins: [
            { name: 'cs', optional: false },
            { name: 'reset', optional: true },
          ],
        },
      ]);
    });
  });

  it.each([
    ['a pin of another type', 'const u8g2_cb_t *rotation, uint16_t cs, uint8_t dc'],
    ['a default other than U8X8_PIN_NONE', 'const u8g2_cb_t *rotation, uint8_t cs, uint8_t reset = 5'],
    ['no rotation first', 'uint8_t cs, uint8_t dc'],
    ['a pointer parameter', 'const u8g2_cb_t *rotation, TwoWire *wire'],
  ])('refuses %s', (_label, params) => {
    withHeader(displayClass(params), (root) => {
      expect(() => parseConstructors(root)).toThrow(/^U8G2_TEST_128X64_F_4W_HW_SPI: /);
    });
  });

  it('parseConstructorPins names the class in its error', () => {
    expect(() => parseConstructorPins('U8G2_X_F_HW_I2C', 'const u8g2_cb_t *rotation, int reset')).toThrow(
      "U8G2_X_F_HW_I2C: constructor parameter 'int reset'"
    );
  });
});
