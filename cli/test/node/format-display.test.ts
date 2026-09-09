/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/format-display.test.ts
 * Purpose: Unit tests for display query result formatting matching design_spec §5.2.
 * Description: Tests identify, source, compare, and catalogue summary formatters,
 *              verifying tabular output, RAM classifications, and negative messages.
 */

import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../src/data/catalogue.js';
import {
  identifyDisplay,
  sourceDisplay,
  compareDisplays,
  enumerateDisplays,
} from '../../src/core/catalogue/query.js';
import {
  formatIdentifyResult,
  formatSourceResult,
  formatCompareResult,
  formatCatalogueSummary,
} from '../../src/node/format-display.js';

describe('format-display (§5.2)', () => {
  describe('formatIdentifyResult', () => {
    it('formats matching displays with geometry, bus, framebuffer and notes', () => {
      const result = identifyDisplay(CATALOGUE, 'SSD1306 128x64 i2c');
      const formatted = formatIdentifyResult(result, { color: false });

      expect(formatted).toContain('Found');
      expect(formatted).toContain('matching display');
      expect(formatted).toContain('128x64');
      expect(formatted).toContain('I2C');
      expect(formatted).toContain('framebuffer: 1024 bytes (16x8 tiles)');
    });

    it('formats negative search results with clear guidance and suggestions', () => {
      const result = identifyDisplay(CATALOGUE, 'NONEXISTENT_CONTROLLER_XYZ');
      const formatted = formatIdentifyResult(result, { color: false });

      expect(formatted).toContain('No matching displays found');
    });
  });

  describe('formatSourceResult', () => {
    it('formats source constraints without fits target', () => {
      const result = sourceDisplay(CATALOGUE, { minWidth: 128, maxWidth: 128, height: 64, bus: 'i2c' });
      const formatted = formatSourceResult(result, { color: false });

      expect(formatted).toContain('SETUP');
      expect(formatted).toContain('GEOMETRY');
      expect(formatted).toContain('BUS');
      expect(formatted).toContain('RAM');
    });

    it('formats source constraints with fits target and headroom classification', () => {
      const result = sourceDisplay(CATALOGUE, { fitsTarget: { boardRam: 520 * 1024 } });
      const formatted = formatSourceResult(result, { color: false });

      expect(formatted).toContain('HEADROOM');
      expect(formatted).toContain('comfortable');
      expect(formatted).toContain('internal SRAM');
    });

    it('handles empty results gracefully', () => {
      const result = sourceDisplay(CATALOGUE, { minWidth: 9999 });
      const formatted = formatSourceResult(result, { color: false });

      expect(formatted).toBe('No displays match the specified constraints.');
    });
  });

  describe('formatCompareResult', () => {
    it('formats difference table for two variants', () => {
      const result = compareDisplays(CATALOGUE, [
        'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        'U8G2_SSD1306_128X64_NONAME_F_SW_I2C',
      ]);
      const formatted = formatCompareResult(result, { color: false });

      expect(formatted).toContain('Comparison of 2 displays');
      expect(formatted).toContain('FIELD');
      expect(formatted).toContain('bus.wiring');
      expect(formatted).toContain('hardware');
      expect(formatted).toContain('software');
    });

    it('handles identical displays gracefully', () => {
      const result = compareDisplays(CATALOGUE, [
        'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
      ]);
      const formatted = formatCompareResult(result, { color: false });

      expect(formatted).toBe('Selected displays have identical catalogued attributes.');
    });
  });

  describe('formatCatalogueSummary', () => {
    it('formats summary table across controllers', () => {
      const displays = enumerateDisplays(CATALOGUE);
      const formatted = formatCatalogueSummary(displays, { color: false });

      expect(formatted).toContain('U8G2 Display Catalogue');
      expect(formatted).toContain('CONTROLLER');
      expect(formatted).toContain('GEOMETRIES');
      expect(formatted).toContain('BUSES');
      expect(formatted).toContain('TOTAL');
      expect(formatted).toContain('SSD1306');
    });
  });
});
