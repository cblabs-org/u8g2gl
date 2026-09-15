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
 *              Runs against extern/u8g2 (or U8G2_PATH), and skips when neither is
 *              present — for example a clone made without
 *              `git submodule update --init`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
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
const submodulePath = resolve(cliDir, '..', 'extern', 'u8g2');

// An Arduino library release of U8G2 — the layout PlatformIO installs — where
// one happens to exist on this machine. Only the layout test uses it.
const releasePath = resolve(
  homedir(),
  'Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2'
);

function getU8g2Path(): string {
  const envPath = process.env['U8G2_PATH'];
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  return submodulePath;
}

const u8g2Path = getU8g2Path();
const isU8g2Available = existsSync(u8g2Path);

/**
 * @brief The number of u8x8_display_info_t structs the tree at u8g2Path holds.
 *
 * The 2.36.18 Arduino release still ships u8x8_d_st7301.c beside its rename,
 * u8x8_d_st7302.c, so it holds one duplicate struct more than the git tag the
 * submodule pins. Both produce the identical catalogue; only this count differs.
 */
function expectedStructCount(): number {
  return resolveU8g2Layout(u8g2Path).clibDir.endsWith('csrc') ? 205 : 206;
}
const isSubmoduleAvailable = existsSync(resolve(submodulePath, 'cppsrc', 'U8g2lib.h'));

describe.runIf(isU8g2Available)('U8G2 Catalogue Builder Integration (§5.2)', () => {
  it('parses every display_info struct across driver files (205 git tag, 206 release)', () => {
    const structs = parseDisplayInfoStructs(resolveU8g2Layout(u8g2Path).clibDir);
    expect(structs).toHaveLength(expectedStructCount());
  });

  it('builds the full catalogue with expected struct and constructor counts', () => {
    const result = buildCatalogue(u8g2Path);

    expect(result.structCount).toBe(expectedStructCount());

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
    const layout = resolveU8g2Layout(submodulePath);
    expect(layout.clibDir).toBe(resolve(submodulePath, 'csrc'));
    expect(layout.headerPath).toBe(resolve(submodulePath, 'cppsrc', 'U8g2lib.h'));
  });

  it('rejects a directory that is not a U8G2 source tree', () => {
    expect(() => resolveU8g2Layout(testDir)).toThrow(/Not a U8G2 source tree/);
  });

  it('reads the pinned submodule as U8G2 2.36.18 at a full commit hash', () => {
    const source = readU8g2Source(submodulePath);
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
    expect(record).toEqual({ u8g2: readU8g2Source(submodulePath) });
  });
});

describe.runIf(existsSync(resolve(releasePath, 'src', 'clib')))(
  'U8G2 Arduino release layout',
  () => {
    it('resolves src/clib and src/U8g2lib.h', () => {
      const layout = resolveU8g2Layout(releasePath);
      expect(layout.clibDir).toBe(resolve(releasePath, 'src', 'clib'));
      expect(layout.headerPath).toBe(resolve(releasePath, 'src', 'U8g2lib.h'));
    });
  }
);
