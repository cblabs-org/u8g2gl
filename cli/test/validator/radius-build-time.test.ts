/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/radius-build-time.test.ts
 * Purpose: Pins §10's radius bound at build time for every element that
 *          declares `radius`: `2*radius <= min(width, height)` is checked
 *          whether the radius is an attribute, an inline `style_radius` or a
 *          named style, and whether the element is a drawing element or an
 *          object. The bound is the one measured against the pinned U8G2
 *          (test/test_rbox_bound.cpp), and the runtime honours an object's outer
 *          radius exactly within it (test/test_radius_honoured.cpp).
 * Description: Real XML is parsed so diagnostics carry real locations, and the
 *              whole validator runs. The box's own cases live in
 *              validator-hardening.test.ts and are not repeated here; the
 *              precedence cases show which source the message names.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const FONT = 'u8g2_font_6x10_mr';

interface Options {
  /** `<style>` elements for globals.xml. */
  readonly globalStyles?: string;
  /** `<style>` elements for the screen's own `<styles>`. */
  readonly screenStyles?: string;
  readonly composites?: readonly WidgetManifest[];
}

/** Every diagnostic `validate` gives for a screen holding `body`. */
function run(body: string, options: Options = {}): readonly Diagnostic[] {
  const globals = parseGlobalsFile(
    `<globals>\n    <subjects><int name="level" value="0" /></subjects>\n` +
      `    <styles>${options.globalStyles ?? ''}</styles>\n    <fonts><builtin name="${FONT}" /></fonts>\n</globals>\n`,
    'globals.xml',
  );
  const screen = parseScreenFile(
    `<screen name="home">\n${options.screenStyles === undefined ? '' : `    <styles>${options.screenStyles}</styles>\n`}` +
      `    <view>\n${body}\n    </view>\n</screen>\n`,
    'screens/screen_home.xml',
  );
  return validate({
    project: { schema: '0.5', name: 'radius', version: '1.0.0', targets: [{ name: 'primary', setup: NARROW }] },
    globals: globals.value!,
    screens: [screen.value!],
    manifests: frameworkRegistry(options.composites ?? []),
    catalogue: CATALOGUE,
  }).diagnostics;
}

/** A composite at widgets/<name>/<name>.xml. */
function composite(name: string, props: string, view: string): WidgetManifest {
  const parsed = parseWidgetManifestFile(
    [`<widget name="${name}">`, `    <api>${props}</api>`, '    <view>', view, '    </view>', '</widget>'].join('\n'),
    `widgets/${name}/${name}.xml`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

const bounds = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS);

const button = (attributes: string): string =>
  `        <u8g2gl_button name="b" x="0" y="0" width="20" height="6" font="${FONT}" ${attributes} />`;
const sw = (attributes: string): string => `        <u8g2gl_switch name="s" x="0" y="0" width="20" height="6" ${attributes} />`;
const label = (attributes: string): string =>
  `        <u8g2gl_label name="l" x="0" y="0" width="20" height="6" font="${FONT}" ${attributes} />`;
const ROUND = '<style name="round" radius="10" />';

describe('a radius known at build time is refused past 2*radius <= min(width, height), on an object too', () => {
  it('a button with a literal radius', () => {
    const found = bounds(run(button('radius="10"')));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', file: 'screens/screen_home.xml', line: 3, offendingText: '10' });
    expect(found[0]?.message).toContain("<u8g2gl_button> 'b' has radius=10, too large for its height=6");
    expect(found[0]?.message).toContain('2*radius = 20 <= height');
    expect(found[0]?.message).toContain('Use radius <= 3');
    expect(found[0]?.message).not.toContain('(from');
  });

  it('a button with style_radius, located at the override and named as such', () => {
    const found = bounds(run(button('style_radius="10"')));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('has radius=10 (from style_radius), too large for its height=6');
    expect(found[0]).toMatchObject({ line: 3, offendingText: '10' });
    // The column is the override's own attribute, not the element's.
    expect(found[0]?.column).toBeGreaterThan(40);
  });

  it('a switch with a named style, located at the style reference', () => {
    const found = bounds(run(sw('style="round"'), { globalStyles: ROUND }));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("has radius=10 (from style 'round'), too large for its height=6");
    expect(found[0]).toMatchObject({ file: 'screens/screen_home.xml', line: 3, offendingText: 'round' });
  });

  it('a switch with a <style> child names it too', () => {
    const body = `        <u8g2gl_switch name="s" x="0" y="0" width="20" height="6">\n            <style name="round" />\n        </u8g2gl_switch>`;
    const found = bounds(run(body, { globalStyles: ROUND }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 4, offendingText: 'round' });
  });

  it('a label, which draws no rounded shape but declares radius (ruling 2)', () => {
    const found = bounds(run(label('radius="10"')));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("<u8g2gl_label> 'l' has radius=10");
  });

  it('is reported against each side too small for it', () => {
    const found = bounds(run(`        <u8g2gl_switch name="s" x="0" y="0" width="8" height="6" radius="10" />`));
    expect(found).toHaveLength(2);
  });
});

describe('what is accepted, with no diagnostic of any severity', () => {
  it('the same elements at radius 3: 2*3 == 6, a capsule', () => {
    const diagnostics = run(
      [
        button('radius="3"').replace('name="b"', 'name="b1"'),
        button('style_radius="3"').replace('name="b"', 'name="b2"').replace('y="0"', 'y="10"'),
        sw('style="small"').replace('y="0"', 'y="20"'),
        label('radius="3"').replace('y="0"', 'y="30"'),
      ].join('\n'),
      { globalStyles: '<style name="small" radius="3" />' },
    );
    expect(diagnostics).toEqual([]);
  });

  it('a bound width is the runtime clamp’s, not judged here', () => {
    expect(
      run(`        <u8g2gl_switch name="s" x="0" y="0" bind_width="level" height="40" radius="10" />`),
    ).toEqual([]);
  });

  it('a switch with no radius: its h / 2 default is the runtime’s, not the author’s', () => {
    expect(run(sw(''))).toEqual([]);
  });

  it('a style that declares a radius is not reported on its own', () => {
    expect(run(sw(''), { globalStyles: ROUND })).toEqual([]);
  });

  it('radius 0 constrains nothing', () => {
    expect(run(button('radius="0"'))).toEqual([]);
  });
});

describe('the precedence: attribute > style_radius > the last named style in scope > none', () => {
  const sizes = (found: readonly Diagnostic[]): string[] =>
    found.map((d) => /has radius=(\d+)( \([^)]*\))?/.exec(d.message)?.slice(1, 3).join('') ?? '');

  it('each source alone', () => {
    expect(sizes(bounds(run(sw('radius="10"'))))).toEqual(['10']);
    expect(sizes(bounds(run(sw('style_radius="10"'))))).toEqual(['10 (from style_radius)']);
    expect(sizes(bounds(run(sw('style="round"'), { globalStyles: ROUND })))).toEqual(["10 (from style 'round')"]);
    expect(bounds(run(sw('')))).toEqual([]);
  });

  it('the attribute beats a style in either direction', () => {
    expect(bounds(run(sw('radius="3" style_radius="10" style="round"'), { globalStyles: ROUND }))).toEqual([]);
    expect(sizes(bounds(run(sw('radius="10" style_radius="3" style="small"'), { globalStyles: '<style name="small" radius="3" />' })))).toEqual(['10']);
  });

  it('style_radius beats a named style in either direction', () => {
    expect(bounds(run(sw('style_radius="3" style="round"'), { globalStyles: ROUND }))).toEqual([]);
    expect(
      sizes(bounds(run(sw('style_radius="10" style="small"'), { globalStyles: '<style name="small" radius="3" />' }))),
    ).toEqual(['10 (from style_radius)']);
  });

  it('the later of two named styles wins, and only a style that declares radius takes part', () => {
    const both = '<style name="big" radius="10" /><style name="small" radius="3" /><style name="plain" border="true" />';
    const lateSmall = sw('style="big"').replace('/>', '><style name="small" /></u8g2gl_switch>');
    expect(bounds(run(lateSmall, { globalStyles: both }))).toEqual([]);
    const lateBig = sw('style="small"').replace('/>', '><style name="big" /></u8g2gl_switch>');
    expect(sizes(bounds(run(lateBig, { globalStyles: both })))).toEqual(["10 (from style 'big')"]);
    // `plain` declares no radius, so it does not hide the one before it.
    const lateOther = sw('style="big"').replace('/>', '><style name="plain" /></u8g2gl_switch>');
    expect(sizes(bounds(run(lateOther, { globalStyles: both })))).toEqual(["10 (from style 'big')"]);
  });

  it('a screen’s own style overrides a global one of the same name', () => {
    expect(bounds(run(sw('style="round"'), { globalStyles: ROUND, screenStyles: '<style name="round" radius="3" />' }))).toEqual([]);
    expect(
      sizes(bounds(run(sw('style="round"'), { globalStyles: '<style name="round" radius="3" />', screenStyles: ROUND }))),
    ).toEqual(["10 (from style 'round')"]);
  });

  it('a composite’s template sees the globals only', () => {
    const tile = composite('tile', '', sw('style="round"').replace('name="s"', 'name="inner"'));
    // The screen's `round` (radius 3) is not in the template's scope: the
    // global one (radius 10) is, so the template is at fault — once.
    const found = bounds(
      run('        <tile name="t" x="0" y="0" width="30" height="10" />', {
        globalStyles: ROUND,
        screenStyles: '<style name="round" radius="3" />',
        composites: [tile],
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'widgets/tile/tile.xml' });
    // And the reverse: the screen's 10 is invisible to the template.
    expect(
      bounds(
        run('        <tile name="t" x="0" y="0" width="30" height="10" />', {
          globalStyles: '<style name="round" radius="3" />',
          screenStyles: ROUND,
          composites: [tile],
        }),
      ),
    ).toEqual([]);
  });
});

describe('a composite instance', () => {
  it('names the instance when the size comes from its argument', () => {
    const tile = composite(
      'tile',
      '<prop name="w" type="int" /><prop name="h" type="int" />',
      '        <u8g2gl_switch name="inner" x="0" y="0" width="$w" height="$h" style="round" />',
    );
    const found = bounds(
      run('        <tile name="t" x="0" y="0" width="30" height="10" w="20" h="6" />', { globalStyles: ROUND, composites: [tile] }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("(from style 'round')");
    expect(found[0]?.message).toContain("in instance 't' of <tile>");
    expect(found[0]?.file).toBe('widgets/tile/tile.xml');
  });
});
