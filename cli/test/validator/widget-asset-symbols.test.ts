/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/widget-asset-symbols.test.ts
 * Purpose: The two-route rule for a widget's fonts and images: a widget takes
 *          one through a prop, or owns a U8G2 one in its C++, and never names
 *          a generated project symbol. `U8G2GL_WIDGET_ASSET_SYMBOL` must fire
 *          for each generated family, at the symbol, and never for a comment,
 *          a string, a U8G2 font, or a file that is not widget source.
 * Description: `checkWidgetAssetSymbols()` on small sources, then through the
 *              CLI's `validate` and `generate`, which must refuse the departures
 *              project once one of its widgets names a generated font.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkWidgetAssetSymbols, generatedAssetSymbolOf } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { fontDataIdentifier, fontIdentifier, imageIdentifier } from '../../src/core/resolver/index.js';
import { DEPARTURES_PROJECT } from '../node/design/build/departures-project.js';
import { makeTempDir } from '../node/design/temp-project.js';

/** The built CLI. */
const CLI = resolve(__dirname, '../../dist/node/cli.js');

const check = (text: string, file = 'widgets/w/w.cpp') => checkWidgetAssetSymbols(new Map([[file, text]]));

describe('generatedAssetSymbolOf()', () => {
  it('knows each family by the identifier functions the emitters use', () => {
    expect(generatedAssetSymbolOf(fontIdentifier('u8g2_font_6x10_mr'))).toBe('font');
    expect(generatedAssetSymbolOf(fontDataIdentifier('small'))).toBe('font');
    expect(generatedAssetSymbolOf(imageIdentifier('icon_wifi'))).toBe('image');
  });

  it('ignores U8G2 fonts, the widget\'s own names, other generated symbols and a bare prefix', () => {
    for (const name of ['u8g2_font_6x10_mr', 'my_font', 'ui_style_header', 'ui_subject_time', 'ui_font_', 'ui_image_', 'xui_font_a']) {
      expect(generatedAssetSymbolOf(name), name).toBeUndefined();
    }
  });
});

describe('checkWidgetAssetSymbols()', () => {
  it('reports each symbol kind at its line and column, naming it and the fix', () => {
    const diagnostics = check(
      ['#include "w.hpp"', 'void w::render(U8G2& d) {', '    d.setFont(ui_font_u8g2_font_6x10_mr);', '    d.drawXBMP(0, 0, 8, 8, ui_image_icon);', '    d.setFont(ui_fontdata_small);', '}'].join('\n'),
    );
    expect(diagnostics.map(({ code, severity, line, column, offendingText }) => ({ code, severity, line, column, offendingText }))).toEqual([
      { code: DIAGNOSTIC_CODES.WIDGET_ASSET_SYMBOL, severity: 'error', line: 3, column: 15, offendingText: 'ui_font_u8g2_font_6x10_mr' },
      { code: DIAGNOSTIC_CODES.WIDGET_ASSET_SYMBOL, severity: 'error', line: 4, column: 28, offendingText: 'ui_image_icon' },
      { code: DIAGNOSTIC_CODES.WIDGET_ASSET_SYMBOL, severity: 'error', line: 5, column: 15, offendingText: 'ui_fontdata_small' },
    ]);
    expect(diagnostics[0]!.message).toMatch(/'ui_font_u8g2_font_6x10_mr' is a generated font symbol.*type="font" prop/);
    expect(diagnostics[1]!.message).toMatch(/generated image symbol.*type="image" prop/);
  });

  it('skips comments, string and character literals, raw strings and include paths', () => {
    const source = [
      '// ui_font_a in a line comment',
      '/* ui_image_b',
      '   across lines */',
      'const char* s = "ui_font_c \\" ui_font_d";',
      "char q = '\\''; int n = 1'000; const char* t = \"ui_image_e\";",
      'const char* r = R"x(ui_font_f ")" )x";',
      'const char* u = u8R"(ui_image_g)";',
      '#include "ui_font_h.h"',
      'const uint8_t* own = u8g2_font_6x10_mr; // a font the widget owns',
    ].join('\n');
    expect(check(source)).toEqual([]);
    // And still finds a real use after each construct, on the line it is on.
    const after = check(`${source}\nauto f = ui_font_i;`);
    expect(after.map((d) => [d.line, d.offendingText])).toEqual([[10, 'ui_font_i']]);
  });

  it('reads headers as well as units, and ignores any other file it is given', () => {
    for (const file of ['widgets/w/w.h', 'widgets/w/w.hpp', 'widgets/w/w.cc', 'widgets/w/w.cpp']) {
      expect(check('extern const uint8_t ui_image_x[];', file), file).toHaveLength(1);
    }
    expect(check('ui_image_x', 'widgets/w/w.xml')).toEqual([]);
    expect(check('ui_image_x', 'widgets/w/README.md')).toEqual([]);
  });
});

describe('validate and generate run the rule over widget source only', () => {
  // run
  // The built CLI (vitest's global setup builds it), its exit code and --json report.
  function run(args: string[]): { code: number; report: { diagnostics: Array<{ code: string; file: string }> } } {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { code: result.status ?? -1, report: JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; file: string }> } };
  }

  it('refuses a widget that names a generated font, and leaves application code alone', () => {
    const project = join(makeTempDir('widget-asset'), 'project');
    cpSync(DEPARTURES_PROJECT, project, { recursive: true });
    // Application code beside the project may use generated symbols.
    writeFileSync(join(project, 'app.cpp'), 'const uint8_t* f = ui_font_u8g2_font_6x10_mr;\n');
    expect(run(['validate', project, '--json']).code).toBe(0);

    const widget = join(project, 'widgets', 'wd_probe_box', 'wd_probe_box.cpp');
    writeFileSync(widget, `${readFileSync(widget, 'utf8')}\nconst void* probe_font() { return ui_font_u8g2_font_6x10_mr; }\n`);
    for (const args of [
      ['validate', project, '--json'],
      ['generate', project, '--json', '--out', join(project, '..', 'out')],
    ]) {
      const { code, report } = run(args);
      expect(code, args[0]).toBe(1);
      expect(report.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.WIDGET_ASSET_SYMBOL), args[0]).toEqual([
        expect.objectContaining({ file: 'widgets/wd_probe_box/wd_probe_box.cpp' }),
      ]);
    }
  });
});
