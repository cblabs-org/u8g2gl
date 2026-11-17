/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/static-child-typo.test.ts
 * Purpose: Holds the parser to its handling of a misspelt static child. An
 *          unnamed `<colum>` under a service list is a typo of `<column>`, not
 *          an element that forgot its name: it is reported as such, with the
 *          suggestion, and no name is ever synthesised into it, so
 *          `--fix-names` cannot turn a typo into a new element.
 * Description: Parses a screen against the departures fixture's service list
 *              manifest, under both name policies.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScreenFile, parseWidgetManifestFile, staticChildNamesOf } from '../../src/core/parser/index.js';
import type { SourceEdit } from '../../src/core/parser/name-policy.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';

const MANIFEST_PATH = resolve(__dirname, '../fixtures/departures-project/widgets/wd_service_list/wd_service_list.xml');
const manifest = parseWidgetManifestFile(readFileSync(MANIFEST_PATH, 'utf8'), 'wd_service_list.xml').value!;
const staticChildren = staticChildNamesOf([manifest]);

/** A screen with one service list holding `children`. */
function screen(children: string): string {
  return [
    '<screen name="home">',
    '  <view>',
    '    <wd_service_list name="services" x="0" y="0" width="100" height="20" font="u8g2_font_6x10_mr">',
    children,
    '    </wd_service_list>',
    '  </view>',
    '</screen>',
    '',
  ].join('\n');
}

describe('a misspelt static child', () => {
  it('is one unknown-element error with the static child suggested, not a missing name', () => {
    const result = parseScreenFile(screen('      <colum width="32" align="left" />'), 'screens/screen_home.xml', { staticChildren });
    expect(result.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.UNKNOWN_WIDGET]);
    expect(result.diagnostics[0]?.message).toContain('did you mean the static child <column>?');
    expect(result.diagnostics[0]?.suggestions).toEqual(['column']);
    expect(result.diagnostics[0]?.line).toBe(4);
  });

  it('is never given a synthesised name under the generate policy', () => {
    const nameEdits: SourceEdit[] = [];
    const result = parseScreenFile(screen('      <colum width="32" align="left" />'), 'screens/screen_home.xml', {
      staticChildren,
      missingNamePolicy: 'generate',
      nameEdits,
    });
    expect(nameEdits).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toContain(DIAGNOSTIC_CODES.UNKNOWN_WIDGET);
  });

  it('leaves a correctly spelt static child and a distant unnamed tag alone', () => {
    const ok = parseScreenFile(screen('      <column width="32" align="left" />'), 'screens/screen_home.xml', { staticChildren });
    expect(ok.diagnostics).toEqual([]);
    const other = parseScreenFile(screen('      <u8g2gl_label x="0" y="0" text="x" />'), 'screens/screen_home.xml', { staticChildren });
    expect(other.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.MISSING_NAME]);
  });
});
