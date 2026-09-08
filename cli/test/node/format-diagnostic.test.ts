/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/format-diagnostic.test.ts
 * Purpose: Unit tests for compiler diagnostic formatting matching design_spec §15.1.
 * Description: Verifies human-readable rendering of diagnostics: severity headers,
 *              line number gutters, context lines, caret underlines, and suggestions.
 */

import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/core/schema/diagnostic.js';
import {
  formatDiagnostic,
  formatDiagnostics,
} from '../../src/node/format-diagnostic.js';

describe('formatDiagnostic (§15.1)', () => {
  it('formats unknown font error matching the exact §15.1 example layout', () => {
    const diagnostic: Diagnostic = {
      code: 'U8G2GL_UNKNOWN_FONT',
      severity: 'error',
      file: 'screens/screen_home.xml',
      line: 14,
      column: 32,
      message: "unknown font 'small_9'",
      offendingText: 'small_9',
      suggestions: ['small_09'],
    };

    const sourceContent = [
      '<?xml version="1.0"?>',
      '<screen name="home">',
      '  <view>',
      '    <!-- line 4 -->',
      '    <!-- line 5 -->',
      '    <!-- line 6 -->',
      '    <!-- line 7 -->',
      '    <!-- line 8 -->',
      '    <!-- line 9 -->',
      '    <!-- line 10 -->',
      '    <!-- line 11 -->',
      '    <!-- line 12 -->',
      '    <!-- line 13 -->',
      '    <u8g2gl_label font="small_9" ... />',
      '  </view>',
      '</screen>',
    ].join('\n');

    const formatted = formatDiagnostic(diagnostic, sourceContent, { color: false });
    const lines = formatted.split('\n');

    expect(lines[0]).toBe('error: screens/screen_home.xml:14:32');
    expect(lines[1]).toBe("   unknown font 'small_9'");
    expect(lines[2]).toBe('   |');
    expect(lines[3]).toBe('14 |     <u8g2gl_label font="small_9" ... />');
    expect(lines[4]).toContain('^^^^^^^');
    expect(lines[5]).toBe("   = did you mean 'small_09'?");
  });

  it('formats multiple suggestions cleanly', () => {
    const diagnostic: Diagnostic = {
      code: 'U8G2GL_UNKNOWN_DISPLAY',
      severity: 'error',
      file: 'u8g2gl.xml',
      line: 5,
      column: 10,
      message: 'Unknown display setup constructor',
      offendingText: 'SSD1306',
      suggestions: ['SSD1306_128X64', 'SSD1306_128X32'],
    };

    const formatted = formatDiagnostic(diagnostic, undefined, { color: false });
    expect(formatted).toContain("= did you mean one of: 'SSD1306_128X64', 'SSD1306_128X32'?");
  });

  it('formats pre-formatted notes within suggestions', () => {
    const diagnostic: Diagnostic = {
      code: 'U8G2GL_UNKNOWN_FONT',
      severity: 'error',
      file: 'screens/screen_home.xml',
      line: 14,
      column: 32,
      message: "unknown font 'small_9'",
      offendingText: 'small_9',
      suggestions: [
        '= 3 fonts are declared in globals.xml: small_09, tall_12, clock_small_7',
        'small_09',
      ],
    };

    const formatted = formatDiagnostic(diagnostic, undefined, { color: false });
    expect(formatted).toContain(
      '= 3 fonts are declared in globals.xml: small_09, tall_12, clock_small_7',
    );
    expect(formatted).toContain("= did you mean 'small_09'?");
  });

  it('includes ANSI escape codes when color is enabled', () => {
    const diagnostic: Diagnostic = {
      code: 'U8G2GL_UNKNOWN_FONT',
      severity: 'error',
      file: 'screens/screen_home.xml',
      line: 14,
      column: 32,
      message: "unknown font 'small_9'",
      offendingText: 'small_9',
      suggestions: ['small_09'],
    };

    const sourceContent = 'line 1\n'.repeat(13) + '    <u8g2gl_label font="small_9" ... />\n';
    const formatted = formatDiagnostic(diagnostic, sourceContent, { color: true });

    // Should contain ANSI red escape sequence for error
    expect(formatted).toContain('\x1b[1;31merror\x1b[0m');
    // Should contain ANSI blue for gutter pipe
    expect(formatted).toContain('\x1b[34m|\x1b[0m');
    // Should contain ANSI cyan for suggestion marker
    expect(formatted).toContain('\x1b[36m=\x1b[0m');
  });

  it('sorts diagnostics deterministically in formatDiagnostics', () => {
    const diagnostics: Diagnostic[] = [
      {
        code: 'ERR_Z',
        severity: 'error',
        file: 'b.xml',
        line: 10,
        column: 1,
        message: 'second file',
      },
      {
        code: 'ERR_A',
        severity: 'warning',
        file: 'a.xml',
        line: 20,
        column: 1,
        message: 'first file line 20',
      },
      {
        code: 'ERR_B',
        severity: 'info',
        file: 'a.xml',
        line: 5,
        column: 1,
        message: 'first file line 5',
      },
    ];

    const formatted = formatDiagnostics(diagnostics, undefined, { color: false });
    const blocks = formatted.split('\n\n');

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain('a.xml:5:1');
    expect(blocks[1]).toContain('a.xml:20:1');
    expect(blocks[2]).toContain('b.xml:10:1');
  });
});
