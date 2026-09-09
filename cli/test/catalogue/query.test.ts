/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/query.test.ts
 * Purpose: Unit and query engine tests for the four catalogue search modes (§5.2).
 * Description: Verifies identify (exact, fuzzy, negative, disambiguation),
 *              source (constraints and RAM classification), compare (differing fields),
 *              and enumerate modes using the pre-compiled CATALOGUE dataset.
 */

import { describe, it, expect } from 'vitest';
import { CATALOGUE } from '../../src/data/catalogue.js';
import {
  identifyDisplay,
  sourceDisplay,
  compareDisplays,
  enumerateDisplays,
} from '../../src/core/catalogue/query.js';

describe('Catalogue Query Engine (§5.2)', () => {
  describe('(a) Identify mode', () => {
    it('returns relevant results for "SSD1306 128x64 i2c"', () => {
      const result = identifyDisplay(CATALOGUE, 'SSD1306 128x64 i2c');

      expect(result.matches.length).toBeGreaterThan(0);
      const topMatch = result.matches[0];
      expect(topMatch).toBeDefined();
      if (!topMatch) {
        return;
      }

      expect(topMatch.controller).toBe('SSD1306');
      expect(topMatch.width).toBe(128);
      expect(topMatch.height).toBe(64);
      expect(topMatch.bus.family).toBe('i2c');

      // Should include hardware I2C variant near top
      const hwI2c = result.matches.find(
        (m) => m.setup === 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C'
      );
      expect(hwI2c).toBeDefined();
    });

    it('fuzzy-matches "SSD1036" to SSD1306 entries', () => {
      const result = identifyDisplay(CATALOGUE, 'SSD1036');

      expect(result.matches.length).toBeGreaterThan(0);
      const controllers = new Set(result.matches.map((m) => m.controller));
      expect(controllers.has('SSD1306')).toBe(true);
    });

    it('handles negative query for nonexistent controller with message', () => {
      const result = identifyDisplay(CATALOGUE, 'NONEXISTENT_9999');

      expect(result.matches).toHaveLength(0);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('No matching displays found for "NONEXISTENT_9999"');
    });

    it('handles negative query for supported controller with unsupported geometry', () => {
      // SSD1309 is supported at 128x64, not at 128x32
      const result = identifyDisplay(CATALOGUE, 'SSD1309 128x32');

      expect(result.matches).toHaveLength(0);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('SSD1309 is supported at');
      expect(result.message).toContain('but not at 128x32');
    });

    it('provides disambiguation notes for SH1106 128x64 electrical variants', () => {
      const result = identifyDisplay(CATALOGUE, '1.3 inch SH1106 128x64 i2c');

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.notes.length).toBeGreaterThan(0);
      expect(result.notes[0]).toContain('SH1106 128x64 has 4 electrical variants');
    });
  });

  describe('(b) Source mode', () => {
    it('returns only matching records for minWidth and bus family', () => {
      const result = sourceDisplay(CATALOGUE, { minWidth: 128, bus: 'i2c' });

      expect(result.matches.length).toBeGreaterThan(0);
      for (const item of result.matches) {
        expect(item.record.width).toBeGreaterThanOrEqual(128);
        expect(item.record.bus.family).toBe('i2c');
      }
    });

    it('classifies framebuffer sizes against 520KB board RAM', () => {
      const boardRam = 520 * 1024; // 532,480 bytes
      const result = sourceDisplay(CATALOGUE, {
        minWidth: 128,
        fitsTarget: { boardRam },
      });

      expect(result.matches.length).toBeGreaterThan(0);

      // SSD1306 128x64 has 1024 bytes -> ~0.19% -> comfortable
      const ssd1306 = result.matches.find(
        (m) => m.record.setup === 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C'
      );
      expect(ssd1306).toBeDefined();
      expect(ssd1306?.classification).toBe('comfortable');

      // Test a very constrained board RAM (e.g. 2KB ATmega328P = 2048 bytes)
      const atmegaResult = sourceDisplay(CATALOGUE, {
        fitsTarget: { boardRam: 2048 },
      });
      // 1024 bytes is 50% of 2048 -> check (> 25%)
      const atmegaSsd1306 = atmegaResult.matches.find(
        (m) => m.record.setup === 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C'
      );
      expect(atmegaSsd1306?.classification).toBe('check');
    });

    it('filters by controllerFamily prefix and maxFramebuffer budget', () => {
      const result = sourceDisplay(CATALOGUE, {
        controllerFamily: 'SSD13',
        maxFramebuffer: 1024,
      });

      expect(result.matches.length).toBeGreaterThan(0);
      for (const item of result.matches) {
        expect(item.record.controller.startsWith('SSD13')).toBe(true);
        expect(item.record.framebufferBytes).toBeLessThanOrEqual(1024);
      }
    });
  });

  describe('(c) Compare mode', () => {
    it('comparing two SSD1306 variants shows only differing fields', () => {
      const setups = [
        'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        'U8G2_SSD1306_128X64_VCOMH0_F_HW_I2C',
      ];
      const result = compareDisplays(CATALOGUE, setups);

      expect(result.records).toHaveLength(2);
      expect(result.notFound).toHaveLength(0);

      // Common fields like controller, width, height, bus, tiles must NOT be in differences
      expect(result.differences['controller']).toBeUndefined();
      expect(result.differences['width']).toBeUndefined();
      expect(result.differences['height']).toBeUndefined();
      expect(result.differences['bus.family']).toBeUndefined();

      // Differing fields: setup and variant
      expect(result.differences['setup']).toBeDefined();
      expect(result.differences['variant']).toBeDefined();
    });

    it('records unknown setup names in notFound', () => {
      const result = compareDisplays(CATALOGUE, [
        'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        'U8G2_FAKE_SETUP_NAME_F_I2C',
      ]);

      expect(result.records).toHaveLength(1);
      expect(result.notFound).toEqual(['U8G2_FAKE_SETUP_NAME_F_I2C']);
    });
  });

  describe('(d) Enumerate mode', () => {
    it('returns all records in the catalogue', () => {
      const all = enumerateDisplays(CATALOGUE);
      expect(all.length).toBe(CATALOGUE.length);
      expect(all).toBe(CATALOGUE);
    });
  });
});
