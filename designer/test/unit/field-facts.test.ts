/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/field-facts.test.ts
 * Purpose: The facts line of a property's tooltip (ui_spec §9.2): the type,
 *          an enum's members or a binding's subject types, and the default,
 *          each only when the manifest gives it.
 * Description: `fieldFacts` over hand-made field specs, one rule each, then
 *              over the framework's own `u8g2gl_label`, so the line is seen
 *              on a manifest as the panel reads it.
 */

import { expect, test } from '@playwright/test';
import { fieldFacts } from '../../src/panel/field-facts';
import { panelLayout, type FieldSpec } from '../../src/panel/panel-layout';
import { ProjectModelCache } from '../../src/project/project-model';

/** A prop field of `type`, with nothing else declared. */
function prop(type: FieldSpec['type'], extra: Partial<FieldSpec> = {}): FieldSpec {
  return { key: 'k', kind: 'prop', type, subjectTypes: [], options: [], default: undefined, required: false, help: 'Help.', source: 'u8g2gl_obj', ...extra };
}

test('an enum lists its members and its default', () => {
  const spec = prop('enum', { options: ['clip', 'dots', 'scroll', 'scroll_circular'], default: 'clip' });
  expect(fieldFacts(spec)).toBe('enum · clip | dots | scroll | scroll_circular · default clip');
});

test('a plain prop shows its type and its default', () => {
  expect(fieldFacts(prop('int', { default: '16' }))).toBe('int · default 16');
});

test('a prop with no default shows its type alone', () => {
  expect(fieldFacts(prop('string'))).toBe('string');
});

test('an empty default is shown quoted, never as a bare "default"', () => {
  expect(fieldFacts(prop('string', { default: '' }))).toBe('string · default ""');
});

test('a colour does not list the draw colours its control already offers', () => {
  expect(fieldFacts(prop('color', { options: ['0', '1', '2'], default: '1' }))).toBe('color · default 1');
});

test('a binding shows its subject types', () => {
  const spec = prop('subject', { kind: 'binding', subjectTypes: ['string', 'int'], key: 'bind_text' });
  expect(fieldFacts(spec)).toBe('subject · string | int');
});

test('the framework label’s long_mode reads as the manifest declares it: user help, then its facts', () => {
  const manifest = new ProjectModelCache().build(new Map()).manifests.get('u8g2gl_label');
  if (manifest === undefined) throw new Error('no u8g2gl_label manifest');
  const longMode = panelLayout(manifest)
    .sections.flatMap((section) => section.rows.flat())
    .find((spec) => spec.key === 'long_mode');
  expect(longMode === undefined ? undefined : fieldFacts(longMode)).toBe('enum · clip | dots | scroll | scroll_circular · default clip');
  // Help spans lines in the XML; the tooltip shows it with its whitespace collapsed.
  expect(longMode?.help?.replace(/\s+/g, ' ')).toBe(
    'Overflow behaviour when text exceeds the widget width: clip hard-clips at the bounds; dots truncates with an ellipsis; ' +
      'scroll and scroll_circular marquee the text. Labels are single-line, so there is no wrap.',
  );
});
