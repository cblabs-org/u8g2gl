/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/builder.test.ts
 * Purpose: Integration tests for the U8G2 display catalogue builder (§5.2, [D-14]).
 * Description: Verifies parsing of authoritative u8x8_display_info_t structs,
 *              driver symbol resolution, constructor class matching, and page-mode mapping.
 *              Gracefully skips when the local U8G2 source tree is unavailable.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildCatalogue, parseDisplayInfoStructs } from '../../src/node/catalogue-builder.js';

function getU8g2Path(): string {
  const envPath = process.env['U8G2_PATH'];
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  const defaultPath = resolve(
    homedir(),
    'Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2'
  );
  return defaultPath;
}

const u8g2Path = getU8g2Path();
const isU8g2Available = existsSync(u8g2Path);

describe.runIf(isU8g2Available)('U8G2 Catalogue Builder Integration (§5.2)', () => {
  it('parses exactly 206 display_info structs across driver files', () => {
    const clibDir = resolve(u8g2Path, 'src', 'clib');
    const structs = parseDisplayInfoStructs(clibDir);
    expect(structs).toHaveLength(206);
  });

  it('builds the full catalogue with expected struct and constructor counts', () => {
    const result = buildCatalogue(u8g2Path);

    // Assert 206 display_info structs found
    expect(result.structCount).toBe(206);

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
