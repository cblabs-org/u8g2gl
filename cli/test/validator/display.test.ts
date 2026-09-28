/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/display.test.ts
 * Purpose: Verification tests for Pass 3 display constructor validation (§5.2, §15.1).
 * Description: Asserts that valid displays pass, page-mode (_1 and _2) constructors
 *              trigger U8G2GL_PAGE_MODE_DISPLAY with full-buffer (_F_) suggestions,
 *              and uncatalogued constructors emit U8G2GL_UNKNOWN_DISPLAY.
 */

import { describe, expect, it } from 'vitest';
import { registryOf } from '../helpers/manifest-registry.js';
import { validateDisplay } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';

describe('validateDisplay', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.4',
      name: 'display_test',
      version: '1.0.0',
      targets: [],
    },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: registryOf([]),
    catalogue: CATALOGUE,
  };

  it('valid full-buffer display constructor passes without diagnostics', () => {
    const diagnostics = validateDisplay({
      ...baseInput,
      project: {
        ...baseInput.project,
        targets: [
          {
            name: 'primary',
            setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
          },
        ],
      },
    });

    expect(diagnostics).toHaveLength(0);
  });

  it('page-mode _1 constructor produces U8G2GL_PAGE_MODE_DISPLAY with _F_ suggestion', () => {
    const diagnostics = validateDisplay({
      ...baseInput,
      project: {
        ...baseInput.project,
        targets: [
          {
            name: 'primary',
            setup: 'U8G2_SSD1306_128X64_NONAME_1_HW_I2C',
          },
        ],
      },
    });

    expect(diagnostics).toHaveLength(1);
    const diag = diagnostics[0]!;
    expect(diag.code).toBe(DIAGNOSTIC_CODES.PAGE_MODE_DISPLAY);
    expect(diag.severity).toBe('error');
    expect(diag.offendingText).toBe('U8G2_SSD1306_128X64_NONAME_1_HW_I2C');
    expect(diag.suggestions).toEqual(['U8G2_SSD1306_128X64_NONAME_F_HW_I2C']);
  });

  it('page-mode _2 constructor produces U8G2GL_PAGE_MODE_DISPLAY with _F_ suggestion', () => {
    const diagnostics = validateDisplay({
      ...baseInput,
      project: {
        ...baseInput.project,
        targets: [
          {
            name: 'secondary',
            setup: 'U8G2_SSD1306_128X64_NONAME_2_4W_HW_SPI',
          },
        ],
      },
    });

    expect(diagnostics).toHaveLength(1);
    const diag = diagnostics[0]!;
    expect(diag.code).toBe(DIAGNOSTIC_CODES.PAGE_MODE_DISPLAY);
    expect(diag.severity).toBe('error');
    expect(diag.offendingText).toBe('U8G2_SSD1306_128X64_NONAME_2_4W_HW_SPI');
    expect(diag.suggestions).toEqual(['U8G2_SSD1306_128X64_NONAME_F_4W_HW_SPI']);
  });

  it('unknown display constructor produces U8G2GL_UNKNOWN_DISPLAY with near-match suggestions', () => {
    // Minor typo on a real display constructor (SSD1306 -> SSD1307)
    const typoSetup = 'U8G2_SSD1307_128X64_NONAME_F_HW_I2C';
    const diagnostics = validateDisplay({
      ...baseInput,
      project: {
        ...baseInput.project,
        targets: [
          {
            name: 'primary',
            setup: typoSetup,
          },
        ],
      },
    });

    expect(diagnostics).toHaveLength(1);
    const diag = diagnostics[0]!;
    expect(diag.code).toBe(DIAGNOSTIC_CODES.UNKNOWN_DISPLAY);
    expect(diag.severity).toBe('error');
    expect(diag.offendingText).toBe(typoSetup);
    expect(diag.suggestions).toBeDefined();
    expect(diag.suggestions).toContain('U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
  });
});
