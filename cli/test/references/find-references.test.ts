/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/references/find-references.test.ts
 * Purpose: The reference finder, shape by shape: every way a subject, constant,
 *          style, font or image is referenced is found with the exact text to
 *          replace, and nothing that merely looks like one is. The near misses
 *          matter most, because a rename built on a false match corrupts a
 *          file: `#margin` inside `#margin_top + 1`, and a name that is a
 *          prefix of another.
 * Description: A small project written inline: globals, two screens (one with
 *              a style of its own), and a composite widget manifest kept in a
 *              subfolder, parsed into a registry over the framework's own
 *              manifests as the CLI loads them. Each assertion reads back the
 *              text at a reference's range.
 */

import { describe, expect, it } from 'vitest';
import { findReferences, indexReferences, type Reference, type ReferenceInput } from '../../src/core/references/find-references.js';
import { parseWidgetManifestFile } from '../../src/core/parser/index.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const GLOBALS = `<?xml version="1.0" encoding="UTF-8"?>
<globals>
    <consts>
        <int name="margin" value="4" />
        <int name="margin_top" value="2" />
        <string name="label" value="#margin" />
    </consts>
    <subjects>
        <string name="station" value="Euston" max_len="16" />
        <string name="station_long" value="" max_len="32" />
        <bool name="online" value="true" />
    </subjects>
    <styles>
        <style name="note" font="small" padding="#margin" />
        <style name="loud" align="center" />
    </styles>
    <fonts>
        <builtin name="small" />
        <builtin name="big" />
    </fonts>
    <images>
        <xbm name="logo" src="images/logo.xbm" />
    </images>
</globals>
`;

const HOME = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="home">
    <view>
        <u8g2gl_label name="title" x="#margin" y="#margin_top + 1" width="#screen_width - #margin * 2" height="10"
            font="small" bind_text="station" style="note" focus_style="loud" text="#margin" />
        <u8g2gl_label name="sub" x="0" y="12" width="60" height="10" font="big" style_font="small" bind_text="station_long">
            <style name="note" />
            <bind_flag_if_eq subject="online" value="1" flag="hidden" />
        </u8g2gl_label>
        <u8g2gl_xbm name="mark" x="0" y="30" src="logo" />
        <panel name="box" x="0" y="40" caption="station" heading="station" look="loud" />
        <u8g2gl_label name="prose" x="0" y="50" width="60" height="10" font="big" text="Margin #margin is 4" />
    </view>
</screen>
`;

const AWAY = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="away">
    <styles>
        <style name="note" font="big" />
    </styles>
    <view>
        <u8g2gl_label name="title" x="0" y="0" width="60" height="10" font="big" style="note" bind_text="station" />
        <u8g2gl_label name="other" x="0" y="12" width="60" height="10" font="big" style="loud" />
    </view>
</screen>
`;

const PANEL = `<?xml version="1.0" encoding="UTF-8"?>
<widget name="panel">
    <api>
        <prop name="caption" type="string" default="Note" />
        <prop name="heading" type="subject" default="station" />
        <prop name="look" type="style" default="note" />
        <prop name="inset" type="int" default="#margin" />
    </api>
    <view>
        <u8g2gl_label name="cap" x="#margin" y="0" width="#parent_width" height="10" font="small" text="$caption" bind_text="$heading" style="note" />
        <u8g2gl_label name="far" x="0" y="0" width="10" height="10" font="small" style="$look" />
    </view>
</widget>
`;

const DOCUMENTS = new Map([
  ['globals.xml', GLOBALS],
  ['screens/screen_home.xml', HOME],
  ['screens/screen_away.xml', AWAY],
  ['widgets/panel/panel.xml', PANEL],
]);

// input
// The project, with the panel's manifest registered over the framework's.
function input(documents: ReadonlyMap<string, string> = DOCUMENTS): ReferenceInput {
  const panel = parseWidgetManifestFile(documents.get('widgets/panel/panel.xml') ?? PANEL, 'widgets/panel/panel.xml').value;
  return { documents, manifests: frameworkRegistry(panel === undefined ? [] : [panel]) };
}

// text
// What a reference's range covers in its file.
function text(reference: Reference, documents: ReadonlyMap<string, string> = DOCUMENTS): string {
  return (documents.get(reference.file) ?? '').slice(reference.range.start, reference.range.end);
}

// where
// A reference as `file element.attribute shape`, for compact assertions.
function where(reference: Reference): string {
  return `${reference.file} ${reference.element ?? reference.style ?? reference.tag}.${reference.attribute} ${reference.shape}`;
}

describe('subjects', () => {
  it('finds the declaration, bind_* attributes, <bind_flag_if_*> subject= and subject-typed props and defaults', () => {
    const station = findReferences(input(), 'subject', 'station');
    expect(station.declarations.map(where)).toEqual(['globals.xml string.name declaration']);
    expect(station.uses.map(where)).toEqual([
      'screens/screen_away.xml title.bind_text binding',
      'screens/screen_home.xml title.bind_text binding',
      'screens/screen_home.xml box.heading prop',
      'widgets/panel/panel.xml prop.default prop-default',
    ]);
    for (const reference of [...station.declarations, ...station.uses]) expect(text(reference)).toBe('station');
    expect(findReferences(input(), 'subject', 'online').uses.map(where)).toEqual(['screens/screen_home.xml sub.subject flag-binding']);
  });

  it('a name that is a prefix of another matches neither way, and a string prop is not a subject', () => {
    expect(findReferences(input(), 'subject', 'station_long').uses.map(where)).toEqual(['screens/screen_home.xml sub.bind_text binding']);
    // `caption="station"` is a string prop: text, not a subject.
    expect(findReferences(input(), 'subject', 'station').uses.some((r) => r.attribute === 'caption')).toBe(false);
  });

  it('a $prop in a template is not a name', () => {
    expect(indexReferences(input()).names('subject')).not.toContain('$heading');
  });
});

describe('constants', () => {
  it('finds #name tokens through the expression tokeniser, with the name alone as the range', () => {
    const margin = findReferences(input(), 'const', 'margin');
    expect(margin.declarations).toHaveLength(1);
    expect(margin.uses.map(where)).toEqual([
      'globals.xml note.padding constant',
      'screens/screen_home.xml title.x constant',
      'screens/screen_home.xml title.width constant',
      'screens/screen_home.xml title.text constant',
      'widgets/panel/panel.xml prop.default constant',
      'widgets/panel/panel.xml cap.x constant',
    ]);
    for (const reference of margin.uses) expect(text(reference)).toBe('margin');
  });

  it('#margin inside #margin_top + 1 is not a reference to margin, and prose is not an expression', () => {
    const margin = findReferences(input(), 'const', 'margin');
    expect(margin.uses.some((r) => r.attribute === 'y')).toBe(false);
    expect(margin.uses.some((r) => r.element === 'prose')).toBe(false);
    expect(findReferences(input(), 'const', 'margin_top').uses.map(where)).toEqual(['screens/screen_home.xml title.y constant']);
  });

  it('a constant\'s own value is a literal, and #screen_* and #parent_* are not constants', () => {
    // `<string name="label" value="#margin" />` refers to nothing.
    expect(findReferences(input(), 'const', 'margin').uses.some((r) => r.file === 'globals.xml' && r.attribute === 'value')).toBe(false);
    const names = indexReferences(input()).names('const');
    expect(names).not.toContain('screen_width');
    expect(names).not.toContain('parent_width');
  });

  it('a range is exact past an entity reference earlier in the value', () => {
    const documents = new Map([...DOCUMENTS, ['screens/screen_home.xml', HOME.replace('y="#margin_top + 1"', 'y="1 &#43; #margin_top"')]]);
    const [use] = findReferences(input(documents), 'const', 'margin_top').uses;
    expect(use === undefined ? '' : text(use, documents)).toBe('margin_top');
  });
});

describe('styles', () => {
  it('finds <style name> children, style= and focus_style=, style-typed props and defaults, and templates', () => {
    const note = findReferences(input(), 'style', 'note');
    expect(note.declarations.map(where)).toEqual(['globals.xml style.name declaration']);
    expect(note.uses.map(where)).toEqual([
      'screens/screen_home.xml title.style style-attribute',
      'screens/screen_home.xml sub.name style-child',
      'widgets/panel/panel.xml prop.default prop-default',
      'widgets/panel/panel.xml cap.style style-attribute',
    ]);
    for (const reference of note.uses) expect(text(reference)).toBe('note');
    expect(findReferences(input(), 'style', 'loud').uses.map(where)).toEqual([
      'screens/screen_away.xml other.style style-attribute',
      'screens/screen_home.xml title.focus_style focus-style',
      'screens/screen_home.xml box.look prop',
    ]);
  });

  it('a screen\'s own style of the same name shadows the global one there, and is reported apart', () => {
    const note = findReferences(input(), 'style', 'note');
    expect(note.shadowed.map(where)).toEqual(['screens/screen_away.xml title.style style-attribute']);
    expect(note.shadowingFiles).toEqual(['screens/screen_away.xml']);
    expect(note.uses.some((r) => r.file === 'screens/screen_away.xml')).toBe(false);
    // The template's references are global's wherever it is placed.
    expect(note.uses.some((r) => r.file === 'widgets/panel/panel.xml')).toBe(true);
    expect(indexReferences(input()).localStyles.get('screens/screen_away.xml')).toEqual(new Set(['note']));
    expect(findReferences(input(), 'style', 'loud').shadowingFiles).toEqual([]);
  });
});

describe('fonts and images', () => {
  it('finds font props, style_font overrides, and the font of global and screen-local styles', () => {
    const small = findReferences(input(), 'font', 'small');
    expect(small.uses.map(where)).toEqual([
      'globals.xml note.font style-declaration-font',
      'screens/screen_home.xml title.font prop',
      'screens/screen_home.xml sub.style_font style-font',
      'widgets/panel/panel.xml cap.font prop',
      'widgets/panel/panel.xml far.font prop',
    ]);
    const local = findReferences(input(), 'font', 'big').uses.find((r) => r.shape === 'style-declaration-font');
    expect(local).toMatchObject({ file: 'screens/screen_away.xml', style: 'note', localStyle: true, screen: 'away' });
    for (const reference of small.uses) expect(text(reference)).toBe('small');
  });

  it('finds an image through the prop its manifest types image', () => {
    const logo = findReferences(input(), 'image', 'logo');
    expect(logo.declarations).toHaveLength(1);
    expect(logo.uses.map(where)).toEqual(['screens/screen_home.xml mark.src prop']);
  });
});

describe('the file scope', () => {
  it('reads a widget manifest wherever it lives, by its root, and names its screen and widget', () => {
    const uses = findReferences(input(), 'font', 'small').uses;
    expect(uses.find((r) => r.file === 'widgets/panel/panel.xml')).toMatchObject({ widget: 'panel', element: 'cap' });
    expect(uses.find((r) => r.file === 'screens/screen_home.xml')).toMatchObject({ screen: 'home', element: 'title' });
  });

  it('an element\'s range covers the element, for selecting it', () => {
    const [use] = findReferences(input(), 'subject', 'online').uses;
    const range = use?.elementRange;
    expect(range === undefined ? '' : HOME.slice(range.start, range.end)).toMatch(/^<u8g2gl_label name="sub"[\s\S]*<\/u8g2gl_label>$/);
  });

  it('a file that is not well-formed is listed, and the same texts give the same index', () => {
    const documents = new Map([...DOCUMENTS, ['screens/screen_bad.xml', '<screen name="bad"><view><u8g2gl_label font="small"></view>']]);
    const index = indexReferences(input(documents));
    expect(index.unreadable).toEqual(['screens/screen_bad.xml']);
    expect(indexReferences(input()).unreadable).toEqual([]);
    expect(JSON.stringify(indexReferences(input()).of('font', 'small'))).toBe(JSON.stringify(indexReferences(input()).of('font', 'small')));
  });

  it('a name nobody declares or uses has no references', () => {
    expect(findReferences(input(), 'subject', 'nothing')).toEqual({ declarations: [], uses: [], shadowed: [], shadowingFiles: [] });
  });
});
