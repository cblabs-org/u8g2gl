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
 *              Reads U8G2 from extern/u8g2 only, so the suite behaves the same on
 *              every machine; it skips when the submodule is not initialised.
 *              The Arduino release layout is exercised with a synthetic tree.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildCatalogue,
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
