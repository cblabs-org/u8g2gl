/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/generate-resolve.test.ts
 * Purpose: Pins how `generate()` uses the resolver (PR-04 WO6): geometry is
 *          resolved against the target actually built, not the first one
 *          `validate` checks, and a resolution error on that target refuses the
 *          build (§7.3, §13.11 step 3).
 * Description: Builds a two-target project — 256-wide first, 128-wide second —
 *              from inline XML with the core parsers.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile, parseScreenFile } from '../../src/core/parser/index.js';
import { checkProject, generate, type ProjectModel } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const PROJECT_XML = `<u8g2gl schema="0.5" name="gen" version="1.0.0">
    <targets>
        <target name="wide" setup="U8G2_SH1122_256X64_F_3W_HW_SPI" />
        <target name="narrow" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`;

const GLOBALS_XML = `<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>
`;

function model(title: string): ProjectModel {
  const screen = parseScreenFile(
    `<screen name="home">
    <view>
        <u8g2gl_label name="clock" right="0" y="0" width="40" height="11" font="u8g2_font_6x10_mr" text="12:00" />
        ${title}
    </view>
</screen>
`,
    'screens/screen_home.xml',
  );
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: [screen.value!],
    manifests: frameworkRegistry(),
    catalogue: CATALOGUE,
    loadDiagnostics: screen.diagnostics,
    hasProjectManifest: true,
  };
}

describe('generate() resolves against the built target (PR-04 WO6)', () => {
  it('returns the resolved screens, which differ by target', () => {
    const input = model('');
    const wide = generate({ ...input, generatorVersion: '9.9.9' });
    const narrow = generate({ ...input, target: 'narrow', generatorVersion: '9.9.9' });

    expect(wide.errors).toBe(0);
    expect(narrow.errors).toBe(0);
    expect(wide.resolved?.[0]?.elements[0]?.geometry.x?.value).toBe(216);
    expect(narrow.resolved?.[0]?.elements[0]?.geometry.x?.value).toBe(88);
  });

  it("refuses a build whose expression fails only on the chosen target's display", () => {
    const input = model(
      '<u8g2gl_label name="title" x="0" y="12" width="64 / (#screen_width - 128)" height="10" font="u8g2_font_6x10_mr" text="Hi" />',
    );

    // `validate` checks the first target, 256 wide, where the width is 64 / 128 = 0.
    expect(checkProject(input, 'warning').errors).toBe(0);
    expect(generate({ ...input, generatorVersion: '9.9.9' }).errors).toBe(0);

    const narrow = generate({ ...input, target: 'narrow', generatorVersion: '9.9.9' });
    expect(narrow.files).toEqual([]);
    expect(narrow.resolved).toBeUndefined();
    expect(narrow.target).toBe('narrow');
    expect(narrow.errors).toBe(1);
    expect(narrow.diagnostics.find((d) => d.severity === 'error')).toMatchObject({
      code: DIAGNOSTIC_CODES.DIVISION_BY_ZERO,
      file: 'screens/screen_home.xml',
      line: 4,
    });
  });
});
