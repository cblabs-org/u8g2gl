/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/rename-plan.test.ts
 * Purpose: Rename planning without a browser: the edits each file gets and
 *          the text they make, the generated symbols that change for every
 *          kind, the screens a style's rename skips, and each refusal of
 *          refusal, which must leave nothing planned.
 * Description: A project written inline, read by the CLI's reference finder
 *              over the designer's own model cache's manifests, as the forms
 *              read it. The planned edits are landed with the CST's
 *              `applyEdits`, as the editor lands them.
 */

import { expect, test } from '@playwright/test';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { indexReferences } from '@u8g2gl/core/references/find-references.js';
import { generatedSymbols, planRename, type RenamePlan, type RenameTarget } from '../../src/forms/rename-plan';
import { ProjectModelCache } from '../../src/project/project-model';

const PROJECT = '<?xml version="1.0" encoding="UTF-8"?>\n<u8g2gl schema="0.7" name="t" version="1.0.0">\n    <targets>\n        <target name="t" setup="U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI" />\n    </targets>\n</u8g2gl>\n';
const GLOBALS = `<?xml version="1.0" encoding="UTF-8"?>
<globals>
    <consts>
        <int name="margin" value="4" />
        <int name="margin_top" value="2" />
    </consts>
    <subjects>
        <string name="station" value="Euston" max_len="16" />
        <int name="level" value="0" />
    </subjects>
    <styles>
        <style name="note" font="u8g2_font_6x10_mr" />
    </styles>
    <fonts>
        <builtin name="u8g2_font_6x10_mr" />
        <bdf name="tiny" src="fonts/tiny.bdf" />
    </fonts>
    <images>
        <xbm name="logo" src="images/logo.xbm" />
    </images>
</globals>
`;
const HOME = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="home">
    <view>
        <u8g2gl_label name="title" x="#margin" y="#margin_top + 1" width="60" height="10" font="u8g2_font_6x10_mr" bind_text="station" style="note" />
        <u8g2gl_label name="sub" x="#margin" y="12" width="60" height="10" font="tiny" bind_text="station" />
    </view>
</screen>
`;
const AWAY = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="away">
    <styles>
        <style name="note" font="tiny" />
    </styles>
    <view>
        <u8g2gl_label name="where" x="0" y="0" width="60" height="10" font="tiny" bind_text="station" style="note" />
    </view>
</screen>
`;

const texts = (extra: Readonly<Record<string, string>> = {}) =>
  new Map([['u8g2gl.xml', PROJECT], ['globals.xml', GLOBALS], ['screens/screen_home.xml', HOME], ['screens/screen_away.xml', AWAY], ...Object.entries(extra)]);

// plan
// The plan for a rename over the project's texts.
function plan(target: RenameTarget, newName: string, documents = texts()): RenamePlan {
  const manifests = new ProjectModelCache().build(documents).manifests;
  return planRename(indexReferences({ documents, manifests }), documents, target, newName);
}

// renamed
// Each file's text after the plan's edits.
function renamed(result: RenamePlan, documents = texts()): Map<string, string> {
  if (!result.ok) throw new Error(result.reason);
  return new Map(result.files.map((part) => [part.file, applyEdits(documents.get(part.file) ?? '', part.edits)]));
}

test('a subject used on two screens: the declaration and both screens, with their counts, and the setter that changes', () => {
  const result = plan({ kind: 'subject', name: 'station' }, 'origin');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.files.map((part) => [part.file, part.edits.length])).toEqual([
    ['globals.xml', 1],
    ['screens/screen_away.xml', 1],
    ['screens/screen_home.xml', 2],
  ]);
  const after = renamed(result);
  expect(after.get('globals.xml')).toBe(GLOBALS.replace('name="station"', 'name="origin"'));
  expect(after.get('screens/screen_home.xml')).toBe(HOME.replaceAll('bind_text="station"', 'bind_text="origin"'));
  expect(result.symbols).toEqual([
    { from: 'ui_set_station()', to: 'ui_set_origin()' },
    { from: 'ui_subject_station', to: 'ui_subject_origin' },
  ]);
  expect(result.skipped).toEqual([]);
});

test('a constant renames each #name token and nothing that only starts with it', () => {
  const after = renamed(plan({ kind: 'const', name: 'margin' }, 'gap'));
  expect(after.get('screens/screen_home.xml')).toBe(HOME.replaceAll('x="#margin"', 'x="#gap"'));
  expect(after.get('screens/screen_home.xml')).toContain('y="#margin_top + 1"');
  expect(after.get('globals.xml')).toContain('<int name="gap" value="4" />');
  expect(after.get('globals.xml')).toContain('<int name="margin_top" value="2" />');
  expect(generatedSymbols({ kind: 'const', name: 'margin' })).toEqual([]);
});

test('a global style skips the screen whose own style of that name shadows it, and says which', () => {
  const result = plan({ kind: 'style', name: 'note' }, 'quiet');
  if (!result.ok) throw new Error(result.reason);
  expect(result.files.map((part) => part.file)).toEqual(['globals.xml', 'screens/screen_home.xml']);
  expect(result.skipped).toEqual(['screens/screen_away.xml']);
  expect(result.symbols).toEqual([{ from: 'ui_style_note', to: 'ui_style_quiet' }]);
});

test('fonts and images: every user, the style\'s font included, and the symbols each kind generates', () => {
  const bdf = plan({ kind: 'font', name: 'tiny', builtin: false }, 'small');
  if (!bdf.ok) throw new Error(bdf.reason);
  // globals.xml's declaration, away's own style and element, home's sub.
  expect(bdf.files.map((part) => [part.file, part.edits.length])).toEqual([
    ['globals.xml', 1],
    ['screens/screen_away.xml', 2],
    ['screens/screen_home.xml', 1],
  ]);
  expect(bdf.symbols).toEqual([
    { from: 'ui_font_tiny', to: 'ui_font_small' },
    { from: 'ui_fontdata_tiny', to: 'ui_fontdata_small' },
  ]);
  const builtin = plan({ kind: 'font', name: 'u8g2_font_6x10_mr', builtin: true }, 'u8g2_font_5x7_mr');
  if (!builtin.ok) throw new Error(builtin.reason);
  expect(renamed(builtin).get('globals.xml')).toContain('<style name="note" font="u8g2_font_5x7_mr" />');
  expect(builtin.symbols).toEqual([{ from: 'ui_font_u8g2_font_6x10_mr', to: 'ui_font_u8g2_font_5x7_mr' }]);
  expect(generatedSymbols({ kind: 'image', name: 'logo' })).toEqual(['ui_image_logo']);
});

test('refused before any write: an invalid name, a taken one, a built-in U8G2 lacks, and a file that does not parse', () => {
  const refusal = (result: RenamePlan): string => (result.ok ? 'planned' : result.reason);
  expect(refusal(plan({ kind: 'subject', name: 'station' }, 'Bad'))).toMatch(/Invalid name 'Bad' for subject/);
  expect(refusal(plan({ kind: 'subject', name: 'station' }, 'ui_x'))).toMatch(/reserved prefix/);
  expect(refusal(plan({ kind: 'subject', name: 'station' }, 'level'))).toBe("A subject called 'level' already exists. Renaming to it would merge the two.");
  expect(refusal(plan({ kind: 'subject', name: 'station' }, 'station'))).toBe("It is already called 'station'.");
  expect(refusal(plan({ kind: 'font', name: 'u8g2_font_6x10_mr', builtin: true }, 'no_such_font'))).toMatch(/not a font U8G2 bundles/);
  expect(refusal(plan({ kind: 'style', name: 'note' }, 'note2', texts({ 'screens/screen_x.xml': AWAY.replace('name="away"', 'name="x"').replaceAll('"note"', '"note2"') })))).toBe(
    "screens/screen_x.xml declares a style of its own called 'note2', which would shadow this one there.",
  );
  const broken = texts({ 'screens/screen_bad.xml': '<screen name="bad"><view><u8g2gl_label bind_text="station"></view>' });
  expect(refusal(plan({ kind: 'subject', name: 'station' }, 'origin', broken))).toBe('screens/screen_bad.xml is not well-formed XML, so its references cannot be renamed safely. Fix it first.');
  // A broken file that never mentions the name does not stand in the way.
  expect(plan({ kind: 'subject', name: 'level' }, 'depth', broken).ok).toBe(true);
});
