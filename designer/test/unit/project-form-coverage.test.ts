/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/project-form-coverage.test.ts
 * Purpose: The UI half of "complete by construction" (ui_spec §2 principle
 *          8): every element and attribute the project-file vocabulary
 *          declares has a control in the form. The CLI's vocabulary test holds
 *          the parsers to the vocabulary; this holds the form to it, so a
 *          schema addition cannot leave the editor behind.
 * Description: A document with one item of every kind is written from the
 *              vocabulary itself, read into a form, and rendered to markup
 *              with React's server renderer, in Node. Every canonical
 *              element's every attribute must be a field of the model and a
 *              `data-field` control in the markup, every repeating kind an
 *              Add button, and every field an ⓘ.
 */

import { expect, test } from '@playwright/test';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROJECT_VOCABULARY, vocabularyChildren, vocabularyRoots, type VocabularyElement, type VocabularyFile } from '@u8g2gl/core/schema/index.js';
import { allNodes, buildFormModel, type FormModel } from '../../src/forms/form-model';
import { NO_OPTIONS } from '../../src/forms/form-options';

/**
 * The form component, loaded at run time: the test runner compiles TSX, and
 * this keeps the designer's Node-side typecheck, which has no JSX setting,
 * from having to read the component's source.
 */
const VIEW_MODULE = '../../src/forms/form-view.tsx';
const { FormView } = (await import(VIEW_MODULE)) as { readonly FormView: FunctionComponent<Record<string, unknown>> };

// writeElement
// An element with every attribute written, and one of each child kind.
function writeElement(element: VocabularyElement): string {
  const attributes = element.attributes.map((attribute) => ` ${attribute.name}="${attribute.type.kind === 'int' ? '1' : attribute.type.kind === 'bool' ? 'true' : attribute.type.kind === 'enum' ? (attribute.type.values[0] ?? '') : 'x'}"`).join('');
  const children = vocabularyChildren(element.id).filter((child) => child.parent === element.id && child.canonical);
  if (children.length === 0) return `<${element.tag}${attributes} />`;
  return `<${element.tag}${attributes}>${children.map(writeElement).join('')}</${element.tag}>`;
}

/** A form of `file` holding one of everything. */
function everything(file: VocabularyFile): FormModel {
  const root = vocabularyRoots().get(file);
  if (root === undefined) throw new Error(file);
  const reading = buildFormModel(file, writeElement(root));
  if (reading.kind !== 'form') throw new Error(reading.problem);
  return reading.model;
}

const NO_ACTIONS = { set: () => undefined, add: () => undefined, remove: () => undefined, move: () => undefined, focusRange: () => undefined };

for (const file of ['u8g2gl.xml', 'globals.xml'] as const) {
  test(`every attribute of every ${file} element is a field of the form, and a control in it`, () => {
    const model = everything(file);
    const markup = renderToStaticMarkup(
      createElement(FormView, { file, state: { model, problems: { byField: new Map(), byNode: new Map() }, options: NO_OPTIONS }, actions: NO_ACTIONS }),
    );
    const fields = new Set(allNodes(model).flatMap((node) => node.fields.map((field) => `${field.elementId}/${field.attribute.name}`)));
    const missingFromModel: string[] = [];
    const missingFromMarkup: string[] = [];
    for (const element of PROJECT_VOCABULARY.filter((e) => e.file === file && e.canonical)) {
      for (const attribute of element.attributes) {
        const id = `${element.id}/${attribute.name}`;
        if (!fields.has(id)) missingFromModel.push(id);
        if (!markup.includes(`data-field="${id}"`)) missingFromMarkup.push(id);
      }
      if (element.repeats) {
        expect(markup, `an Add for ${element.id}`).toContain(`>+ ${element.label}</button>`);
        expect(markup, `an item of ${element.id}`).toContain(`data-element="${element.id}"`);
      }
    }
    expect(missingFromModel).toEqual([]);
    expect(missingFromMarkup).toEqual([]);
    // Every field explains itself behind an ⓘ (principle 6).
    expect(markup.split('class="field-info"').length - 1).toBe(markup.split('class="form-field field"').length - 1);
  });
}

test('every section the vocabulary gives a file is in its form, in order', () => {
  for (const file of ['u8g2gl.xml', 'globals.xml'] as const) {
    const root = vocabularyRoots().get(file);
    const expected = [
      ...(root !== undefined && root.attributes.length > 0 ? [root.label] : []),
      ...vocabularyChildren(root?.id ?? '').filter((c) => !c.repeats && c.canonical).map((c) => c.label),
    ];
    expect(everything(file).sections.map((s) => s.title)).toEqual(expected);
  }
});
