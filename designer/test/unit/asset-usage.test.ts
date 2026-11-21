/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/asset-usage.test.ts
 * Purpose: The fonts and images sections' facts, without a browser: who uses
 *          each item, the range presets — "Only what this project uses"
 *          derived from the static text, and flagged unsafe for a font a
 *          string-bound element draws in — what each preset costs, and the
 *          refusal that names an item's users.
 * Description: Projects are built from texts through the designer's own model
 *              cache, as the edit loop builds them. Preset costs are bdfconv's
 *              in-page compile of the compile fixture's 4x6.bdf.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBdf } from '@u8g2gl/core/fonts/index.js';
import { fontUsers, imageUsers, projectPreset, RANGE_PRESETS, rangeOf, removeRefusal, usersLine } from '../../src/forms/asset-usage';
import { buildFormModel, type FormNode } from '../../src/forms/form-model';
import { ProjectModelCache } from '../../src/project/project-model';
import { indexReferences } from '@u8g2gl/core/references/find-references.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROJECT = '<?xml version="1.0" encoding="UTF-8"?>\n<u8g2gl schema="0.7" name="t" version="1.0.0">\n    <targets>\n        <target name="t" setup="U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI" />\n    </targets>\n</u8g2gl>\n';
const GLOBALS = `<?xml version="1.0" encoding="UTF-8"?>
<globals>
    <subjects>
        <string name="msg" value="" max_len="16" />
    </subjects>
    <styles>
        <style name="small" font="tiny" />
    </styles>
    <fonts>
        <bdf name="tiny" src="fonts/4x6.bdf" />
        <builtin name="u8g2_font_6x10_mr" />
        <builtin name="u8g2_font_5x7_mr" />
    </fonts>
</globals>
`;
const SCREEN = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="main">
    <view>
        <u8g2gl_label name="title" x="0" y="0" width="60" height="10" font="tiny" text="AB 12" />
        <u8g2gl_label name="temp" x="0" y="10" width="60" height="10" font="tiny" bind_text="msg" bind_text_fmt="%s C" />
        <u8g2gl_label name="other" x="0" y="20" width="60" height="10" font="u8g2_font_6x10_mr" text="x" />
    </view>
</screen>
`;

const texts = (globals = GLOBALS, screen = SCREEN) => new Map([['u8g2gl.xml', PROJECT], ['globals.xml', globals], ['screens/screen_main.xml', screen]]);
const model = (globals = GLOBALS) => new ProjectModelCache().build(texts(globals));
// refs
// The references in the project, as the forms read them.
const refs = (globals = GLOBALS, screen = SCREEN) => indexReferences({ documents: texts(globals, screen), manifests: model(globals).manifests });

// item
// The globals form's item for a font or image of a name.
function item(name: string): FormNode {
  const reading = buildFormModel('globals.xml', GLOBALS);
  if (reading.kind !== 'form') throw new Error('unreadable');
  let found: FormNode | undefined;
  const visit = (node: FormNode): void => {
    if (node.fields.some((f) => f.attribute.name === 'name' && f.value === name) && node.element.id.startsWith('font-')) found = node;
    node.parts.forEach(visit);
    node.lists.forEach((list) => list.items.forEach(visit));
  };
  for (const section of reading.model.sections) {
    if (section.node !== undefined) visit(section.node);
    section.list?.items.forEach(visit);
  }
  if (found === undefined) throw new Error(name);
  return found;
}

test('who uses a font: elements through any font prop, and styles; nobody for an unused one', () => {
  const users = fontUsers(refs());
  expect(users.get('tiny')).toEqual({ elements: ['main.title', 'main.temp'], styles: ['small'] });
  expect(users.get('u8g2_font_6x10_mr')).toEqual({ elements: ['main.other'], styles: [] });
  expect(users.get('u8g2_font_5x7_mr')).toBeUndefined();
  expect(imageUsers(refs()).size).toBe(0);
  expect(usersLine(users.get('tiny'))).toBe('2 elements, 1 style');
  expect(usersLine(undefined)).toBe('not used');
});

test('"Only what this project uses" is the static text and format literals in that font, as hex runs', () => {
  expect(rangeOf([0x20, 0x31, 0x32, 0x41, 0x42, 0x43])).toBe('0x20,0x31-0x32,0x41-0x43');
  const { preset, unsafeFor } = projectPreset(model(), 'tiny');
  // "AB 12" and the literal " C" of "%s C".
  expect(preset?.range).toBe('0x20,0x31-0x32,0x41-0x43');
  // temp is bound to the string subject msg: unsafe, and named.
  expect(unsafeFor).toEqual(['main.temp']);
  expect(projectPreset(model(), 'u8g2_font_5x7_mr').preset).toBeUndefined();
  expect(RANGE_PRESETS.map((p) => p.label)).toEqual(['All', 'Printable ASCII', 'Latin-1', 'Digits and time']);
  expect(RANGE_PRESETS[0]!.range).toBeUndefined();
});

test('each preset\'s cost is bdfconv\'s compiled size, smaller for a narrower range', async () => {
  const bdf = new Uint8Array(readFileSync(join(ROOT, 'test', 'generated_fixture', 'assets', 'fonts', '4x6.bdf')));
  const sizes = new Map<string, number>();
  for (const preset of [...RANGE_PRESETS, projectPreset(model(), 'tiny').preset!]) {
    const result = await compileBdf({ bdf, identifier: 'x', ...(preset.range !== undefined ? { range: preset.range } : {}) });
    expect(result.ok, preset.id).toBe(true);
    if (result.ok) sizes.set(preset.id, result.declaredLength);
  }
  expect(sizes.get('ascii')!).toBeLessThan(sizes.get('all')!);
  expect(sizes.get('time')!).toBeLessThan(sizes.get('ascii')!);
  expect(sizes.get('project')!).toBeLessThan(sizes.get('ascii')!);
  expect(sizes.get('latin1')!).toBeGreaterThan(sizes.get('ascii')!);
});

test('Remove is refused for a used font, naming its users, and allowed for an unused one', () => {
  expect(removeRefusal(refs(), item('tiny'))).toBe("Font 'tiny' is still used by main.title, main.temp, style small. Change them first, then remove it.");
  expect(removeRefusal(refs(), item('u8g2_font_5x7_mr'))).toBeUndefined();
  expect(removeRefusal(undefined, item('tiny'))).toBeUndefined();
});

test('a style_font override uses its font, so the font cannot be removed while it does', () => {
  const screen = SCREEN.replace('text="x" />', 'text="x" style_font="u8g2_font_5x7_mr" />');
  expect(fontUsers(refs(GLOBALS, screen)).get('u8g2_font_5x7_mr')).toEqual({ elements: ['main.other'], styles: [] });
  expect(removeRefusal(refs(GLOBALS, screen), item('u8g2_font_5x7_mr'))).toBe("Font 'u8g2_font_5x7_mr' is still used by main.other. Change it first, then remove it.");
});

test('a screen\'s own style counts as a user of its font, named by its screen, before the global styles', () => {
  const screen = SCREEN.replace('<view>', '<styles>\n        <style name="mine" font="tiny" />\n    </styles>\n    <view>');
  expect(fontUsers(refs(GLOBALS, screen)).get('tiny')?.styles).toEqual(['main.mine', 'small']);
});

test('Remove is refused for a subject still bound, naming the bindings by screen and element', () => {
  const reading = buildFormModel('globals.xml', GLOBALS);
  if (reading.kind !== 'form') throw new Error('unreadable');
  const msg = reading.model.sections.find((section) => section.key === 'globals.xml>subjects')?.list?.items[0];
  if (msg === undefined) throw new Error('no subject');
  expect(removeRefusal(refs(), msg)).toBe("Subject 'msg' is still used by main.temp. Change it first, then remove it.");
  expect(removeRefusal(refs(GLOBALS, SCREEN.replace(' bind_text="msg"', '')), msg)).toBeUndefined();
});
