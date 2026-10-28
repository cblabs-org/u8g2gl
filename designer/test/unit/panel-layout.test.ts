/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/panel-layout.test.ts
 * Purpose: The property panel's layout, from manifests alone ([UD-5]): on the
 *          departures project's framework, project and drawing elements, the
 *          geometry is pinned first in pairs, the element's own props follow in
 *          its declaration order, and what it inherits from u8g2gl_obj is
 *          set apart under *From u8g2gl_obj* ([Q-10]) — except on a drawing
 *          element, which inherits nothing ([D-18]). And the facts the fields
 *          read: attributes as written, each diagnostic on its attribute.
 * Description: The fixture project is read from disk and built into a model
 *              with the designer's own `ProjectModelCache`, so the registry is
 *              the one the panel sees.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseCst } from '@u8g2gl/core/cst/index.js';
import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import { ProjectModelCache } from '../../src/project/project-model';
import { panelLayout, sharedLayout, type PanelLayout } from '../../src/panel/panel-layout';
import { ELEMENT_PROBLEMS, elementFacts, namedCstElements } from '../../src/panel/element-facts';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cli', 'test', 'fixtures', 'departures-project');
const SCREEN = 'screens/screen_departures.xml';

/** Every XML file of the fixture, by project path, skipping generated output. */
function fixtureTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (!entry.startsWith('generated')) walk(path);
      } else if (entry.endsWith('.xml')) {
        texts.set(relative(FIXTURE, path).split(sep).join('/'), readFileSync(path, 'utf8'));
      }
    }
  };
  walk(FIXTURE);
  return texts;
}

const MODEL = new ProjectModelCache().build(fixtureTexts());

/** A tag's layout, as section id → its rows' field keys. */
function layoutOf(tag: string): PanelLayout {
  const manifest = MODEL.manifests.get(tag);
  if (manifest === undefined) throw new Error(`no manifest for ${tag}`);
  return panelLayout(manifest);
}

/** The layout as section id → rows of keys, for exact comparison. */
function keys(layout: PanelLayout): Record<string, string[][]> {
  return Object.fromEntries(layout.sections.map((section) => [section.id, section.rows.map((row) => row.map((spec) => spec.key))]));
}

test('a framework widget: geometry pinned first in pairs, its own props in declaration order, the rest From u8g2gl_obj', () => {
  const layout = layoutOf('u8g2gl_label');
  expect(layout.origin).toBe('framework');
  expect(layout.drawing).toBe(false);
  expect(keys(layout)).toEqual({
    geometry: [
      ['x', 'y'],
      ['width', 'height'],
    ],
    // Declared order: text, font, align, long_mode...; font and align override
    // u8g2gl_obj's, so they are the label's own. bind_text is redeclared too.
    element: [['text'], ['font'], ['align'], ['long_mode'], ['scroll_px_per_sec'], ['initial_delay_ms'], ['static_dwell_ms'], ['bind_text']],
    inherited: [
      ['hidden'],
      ['disabled'],
      ['draw_color'],
      ['invert'],
      ['padding'],
      ['border'],
      ['radius'],
      ['font_mode'],
      ['bitmap_mode'],
      ['bind_x'],
      ['bind_y'],
      ['bind_width'],
      ['bind_height'],
    ],
  });
  expect(layout.sections.find((s) => s.id === 'inherited')?.title).toBe('From u8g2gl_obj');
});

test('a project widget: its own props first, everything from u8g2gl_obj in the inherited group', () => {
  const layout = layoutOf('wd_service_list');
  expect(layout.origin).toBe('project');
  const sections = keys(layout);
  expect(sections.geometry).toEqual([
    ['x', 'y'],
    ['width', 'height'],
  ]);
  expect(sections.element).toEqual([['font'], ['max_rows'], ['max_cols'], ['max_cell_chars'], ['scroll_dwell_ms'], ['scroll_duration_ms']]);
  // Q-10: a project widget inherits text props it may not draw, shown apart.
  expect(sections.inherited?.flat()).toEqual(expect.arrayContaining(['align', 'font_mode', 'bind_text', 'draw_color']));
  expect(sections.inherited?.flat()).not.toContain('font');
  // The author's help, as written ([Q-19]: the panel never endorses it).
  const maxRows = layout.sections.flatMap((s) => s.rows.flat()).find((spec) => spec.key === 'max_rows');
  expect(maxRows).toMatchObject({ type: 'int', default: '16', help: 'Row capacity. Determines allocated RAM.', source: 'wd_service_list' });
});

test('a drawing element: no inherited group, its own props in declaration order', () => {
  const box = layoutOf('u8g2gl_box');
  expect(box.drawing).toBe(true);
  expect(keys(box)).toEqual({
    geometry: [
      ['x', 'y'],
      ['width', 'height'],
    ],
    element: [['filled'], ['radius'], ['bind_x'], ['bind_y'], ['bind_width'], ['bind_height']],
  });
  // A line declares none of the geometry props, so it has no geometry section.
  expect(keys(layoutOf('u8g2gl_line'))).toEqual({ element: [['x1'], ['y1'], ['x2'], ['y2']] });
});

test('field specs carry what the editors need: enum members, draw colours, a binding’s subject types', () => {
  const fields = new Map(layoutOf('u8g2gl_label').sections.flatMap((s) => s.rows.flat()).map((spec) => [spec.key, spec]));
  expect(fields.get('long_mode')).toMatchObject({ type: 'enum', options: ['clip', 'dots', 'scroll', 'scroll_circular'], default: 'clip' });
  expect(fields.get('draw_color')).toMatchObject({ type: 'color', options: ['0', '1', 'xor'], source: 'u8g2gl_obj' });
  expect(fields.get('font')).toMatchObject({ type: 'font', required: true, source: 'u8g2gl_label' });
  expect(fields.get('bind_text')).toMatchObject({ kind: 'binding', type: 'subject', subjectTypes: ['string', 'int'] });
  expect(fields.get('bind_x')).toMatchObject({ kind: 'binding', subjectTypes: ['int'], source: 'u8g2gl_obj' });
});

test('several elements share only the fields every one has, in the first one’s order', () => {
  const shared = sharedLayout([layoutOf('u8g2gl_label'), layoutOf('u8g2gl_clock')]);
  const all = shared.sections.flatMap((s) => s.rows.flat()).map((spec) => spec.key);
  expect(all).toContain('font');
  expect(all).toContain('x');
  expect(all).not.toContain('text');
  expect(all).not.toContain('format');
  // A label and a box share geometry only; the box's radius is an int too, so it is shared.
  const mixed = sharedLayout([layoutOf('u8g2gl_label'), layoutOf('u8g2gl_box')]);
  expect(keys(mixed)).toEqual({ geometry: [['x', 'y'], ['width', 'height']], inherited: [['radius'], ['bind_x'], ['bind_y'], ['bind_width'], ['bind_height']] });
});

test('the facts: attributes as written, by name, and each diagnostic on the attribute it points at', () => {
  const text = fixtureTexts().get(SCREEN) ?? '';
  const { cst } = parseCst(text, SCREEN);
  expect([...namedCstElements(cst).keys()]).toEqual(['plat_box', 'plat_label', 'plat_num', 'header_sep', 'row0', 'message_bar', 'formation', 'services', 'sys_clock']);
  const at = (needle: string): { line: number; column: number } => cst.lines.locate(text.indexOf(needle));
  const diagnostics: Diagnostic[] = [
    { code: 'X', severity: 'error', file: SCREEN, ...at('font="u8g2_font_6x10_mr" max_rows="1"'), message: 'bad font' },
    { code: 'Y', severity: 'warning', file: SCREEN, ...at('<wd_service_list name="row0"'), message: 'about the element' },
    { code: 'Z', severity: 'error', file: 'elsewhere.xml', line: 1, column: 1, message: 'another file' },
  ];
  const [row0] = elementFacts(cst, ['row0'], diagnostics, new Map([['row0', { x: 32, y: 0, width: 224, height: 16 }]]));
  expect(row0?.tag).toBe('wd_service_list');
  expect(row0?.attributes.get('max_rows')).toBe('1');
  expect(row0?.attributes.has('max_cols')).toBe(false);
  expect(row0?.problems.get('font')).toEqual([{ severity: 'error', message: 'bad font' }]);
  expect(row0?.problems.get(ELEMENT_PROBLEMS)).toEqual([{ severity: 'warning', message: 'about the element' }]);
  expect(row0?.placed).toEqual({ x: 32, y: 0, width: 224, height: 16 });
  // A name not in the text is left out, in selection order otherwise.
  expect(elementFacts(cst, ['sys_clock', 'gone', 'plat_box'], [], new Map()).map((f) => f.name)).toEqual(['sys_clock', 'plat_box']);
});
