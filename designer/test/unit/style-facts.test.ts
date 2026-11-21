/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/style-facts.test.ts
 * Purpose: A style's card and a constant's references without a browser: the
 *          radius bound (the smallest literal-sized user sets it, a user with
 *          a size written another way or a radius of its own does not, and
 *          with none there is no bound); the preview's project, which must
 *          validate and apply the style; each place a constant is used; and
 *          the removal guard for styles and constants.
 * Description: A project written inline, read by the CLI's reference finder
 *              over the designer's own model cache, as the forms read it.
 */

import { expect, test } from '@playwright/test';
import { indexReferences } from '@u8g2gl/core/references/find-references.js';
import { removeRefusal } from '../../src/forms/asset-usage';
import { buildFormModel, type FormNode } from '../../src/forms/form-model';
import { constUses, radiusBound, styleSampleTexts } from '../../src/forms/style-facts';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const PROJECT = '<?xml version="1.0" encoding="UTF-8"?>\n<u8g2gl schema="0.7" name="t" version="1.0.0">\n    <targets>\n        <target name="t" setup="U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI" />\n    </targets>\n</u8g2gl>\n';
const GLOBALS = `<?xml version="1.0" encoding="UTF-8"?>
<globals>
    <consts>
        <int name="gap" value="2" />
        <int name="unused" value="9" />
    </consts>
    <styles>
        <style name="boxed" border="true" radius="3" />
        <style name="plain" align="center" />
    </styles>
    <fonts>
        <builtin name="u8g2_font_6x10_mr" />
    </fonts>
</globals>
`;
const SCREEN = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="main">
    <view>
        <u8g2gl_label name="wide" x="0" y="0" width="60" height="20" font="u8g2_font_6x10_mr" text="a" style="boxed" />
        <u8g2gl_label name="small" x="#gap + 1" y="30" width="16" height="10" font="u8g2_font_6x10_mr" text="b">
            <style name="boxed" />
        </u8g2gl_label>
        <u8g2gl_label name="tiny_own" x="0" y="44" width="4" height="4" font="u8g2_font_6x10_mr" text="c" style="boxed" radius="0" />
        <u8g2gl_label name="placed" x="0" y="50" width="#screen_width - #gap" height="4" font="u8g2_font_6x10_mr" text="d" style="plain" />
    </view>
</screen>
`;

const texts = (screen = SCREEN) => new Map([['u8g2gl.xml', PROJECT], ['globals.xml', GLOBALS], ['screens/screen_main.xml', screen]]);
const refs = (screen = SCREEN) => indexReferences({ documents: texts(screen), manifests: new ProjectModelCache().build(texts(screen)).manifests });

// item
// The globals form's item of a kind and name.
function item(kind: string, name: string): FormNode {
  const reading = buildFormModel('globals.xml', GLOBALS);
  if (reading.kind !== 'form') throw new Error('unreadable');
  const found = reading.model.sections.flatMap((section) => section.list?.items ?? []).find((node) => node.element.id === kind && node.fields.some((f) => f.attribute.name === 'name' && f.value === name));
  if (found === undefined) throw new Error(name);
  return found;
}

test('the radius bound is half the smallest literal-sized user, named; a user with its own radius does not count', () => {
  expect(radiusBound(refs(), texts(), 'boxed')).toEqual({ radius: 5, element: 'main.small', width: 16, height: 10 });
});

test('with no literal-sized user there is no bound', () => {
  expect(radiusBound(refs(), texts(), 'plain')).toBeUndefined();
  expect(radiusBound(refs(), texts(), 'nobody')).toBeUndefined();
});

test('the preview is a label in the style over the project\'s own globals, which validates and draws', () => {
  const preview = styleSampleTexts(GLOBALS, 'boxed', 'u8g2_font_6x10_mr', undefined);
  expect(preview.get('globals.xml')).toBe(GLOBALS);
  const assets = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set<string>(), failedImages: new Set<string>() };
  const run = runTextPipeline({ texts: preview, cache: new ProjectModelCache(), assets, activeFile: 'screens/screen_fonts_view.xml', targetName: 'view' });
  expect(run.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(run.scene).toBeDefined();
  // A style with a font of its own: the label names none, so the style's applies.
  expect(styleSampleTexts(GLOBALS, 'x', 'u8g2_font_6x10_mr', 'u8g2_font_6x10_mr').get('screens/screen_fonts_view.xml')).not.toContain(' font=');
});

test('a constant lists every reference by file and attribute, one inside an expression included', () => {
  expect(constUses(refs(), 'gap').map((use) => use.label)).toEqual(['screens/screen_main.xml: small.x', 'screens/screen_main.xml: placed.width']);
  expect(constUses(refs(), 'unused')).toEqual([]);
});

test('Remove is refused for a style or constant still used, naming its users', () => {
  expect(removeRefusal(refs(), item('style', 'boxed'))).toBe("Style 'boxed' is still used by main.wide, main.small, main.tiny_own. Change them first, then remove it.");
  expect(removeRefusal(refs(), item('const-int', 'gap'))).toBe("Constant 'gap' is still used by main.small, main.placed. Change them first, then remove it.");
  expect(removeRefusal(refs(), item('const-int', 'unused'))).toBeUndefined();
  // A screen's own style of the same name holds that screen's uses, not the global's.
  const shadowed = SCREEN.replace('<view>', '<styles>\n        <style name="plain" />\n    </styles>\n    <view>');
  expect(removeRefusal(refs(shadowed), item('style', 'plain'))).toBeUndefined();
});
