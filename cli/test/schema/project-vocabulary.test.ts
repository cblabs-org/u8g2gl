/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/schema/project-vocabulary.test.ts
 * Purpose: Holds the project-file vocabulary to the parsers, so the designer's
 *          forms, which are built from the vocabulary, can never be missing an
 *          attribute the parsers read (ui_spec §2 principle 8). It fails when
 *          the parsers read an attribute the vocabulary lacks, when an entry
 *          has no help, and when the vocabulary claims a spelling the parsers
 *          do not honour.
 * Description: Four parts:
 *              - shape: ids unique, parents real, every attribute and element
 *                with help, defaults among an enum's values, spellings unique;
 *              - parser side, from the vocabulary: a document written from
 *                every entry parses with no diagnostic, and each attribute,
 *                at every spelling, changes the model, and changes it the same
 *                way as the canonical spelling does;
 *              - parser side, from the source: every attribute name the two
 *                parsers read by a literal is in the vocabulary (a scan, see
 *                `scannedAttributes`);
 *              - the value lists the vocabulary offers agree with what the
 *                validator and the `u8g2gl_obj` manifest accept.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile } from '../../src/core/parser/index.js';
import {
  PROJECT_VOCABULARY,
  ROTATION_DEGREES,
  ROTATION_VALUES,
  attributeSpellings,
  vocabularyChildren,
  vocabularyElement,
  vocabularyRoots,
  type VocabularyAttribute,
  type VocabularyElement,
  type VocabularyFile,
} from '../../src/core/schema/index.js';
import { STYLE_PROPERTIES } from '../../src/core/schema/globals.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { validateSchema } from '../../src/core/validator/validate-schema.js';
import { parseFrameworkManifests } from '../../src/core/manifest/index.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';
import { CATALOGUE } from '../../src/data/catalogue.js';

const PARSER_DIR = resolve(__dirname, '..', '..', 'src', 'core', 'parser');

// --- Writing documents from the vocabulary -----------------------------------

/**
 * A value override: `(element id, attribute spelling) → text`, or undefined to
 * leave it out; `omit(id) → undefined` leaves the element out altogether.
 */
type Values = ReadonlyMap<string, string | undefined>;

const key = (element: string, name: string): string => `${element}/${name}`;
const omit = (element: string): string => `${element}/`;

// sampleValue
// A value the parser accepts for an attribute's type: `variant` 0 and 1 give
// two different ones, so a test can tell whether the value reached the model.
function sampleValue(element: VocabularyElement, attribute: VocabularyAttribute, variant: 0 | 1): string {
  const type = attribute.type;
  switch (type.kind) {
    case 'int':
      return variant === 0 ? '7' : '9';
    case 'bool':
      return variant === 0 ? 'true' : 'false';
    case 'enum':
      return type.values[variant] ?? type.values[0] ?? '';
    default:
      return `${element.id}_${attribute.name}_${variant}`;
  }
}

// writeElement
// One element and its subtree as XML: every canonical attribute with its
// variant-0 value unless `values` says otherwise, an alternative spelling only
// where `values` names it. A non-canonical place (`<bus>`) is written only
// when `values` puts something on it.
function writeElement(element: VocabularyElement, values: Values, depth: number): string {
  const pad = '  '.repeat(depth);
  const attributes: string[] = [];
  const written = new Set<string>();
  const write = (name: string, value: string | undefined): void => {
    if (value === undefined || written.has(name)) return;
    written.add(name);
    attributes.push(`${name}="${value}"`);
  };
  // Canonical attributes, unless overridden (possibly to absent).
  for (const attribute of element.attributes) {
    const k = key(element.id, attribute.name);
    write(attribute.name, values.has(k) ? values.get(k) : sampleValue(element, attribute, 0));
  }
  // Any alternative spelling the test asks for on this element.
  for (const [k, value] of values) {
    const [id, name] = k.split('/') as [string, string];
    if (id === element.id && name !== '') write(name, value);
  }
  const children = vocabularyChildren(element.id)
    // Each child once, under its canonical parent only.
    .filter((child) => child.parent === element.id && !values.has(omit(child.id)))
    .filter((child) => child.canonical || [...values.keys()].some((k) => k.startsWith(`${child.id}/`) && values.get(k) !== undefined));
  const open = `${pad}<${element.tag}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}`;
  if (children.length === 0) return `${open} />`;
  return [`${open}>`, ...children.map((child) => writeElement(child, values, depth + 1)), `${pad}</${element.tag}>`].join('\n');
}

// writeFile
// A whole project file from its root.
function writeFile(file: VocabularyFile, values: Values = new Map()): string {
  const root = vocabularyRoots().get(file);
  if (root === undefined) throw new Error(`no root for ${file}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${writeElement(root, values, 0)}\n`;
}

// parseFile
// The model a file parses to, without source locations or the style's
// record of how each property was spelled, so two spellings of one value
// compare equal. Throws with the diagnostics if it does not parse.
function parseFile(file: VocabularyFile, xml: string): unknown {
  const result = file === 'u8g2gl.xml' ? parseProjectFile(xml, file) : parseGlobalsFile(xml, file);
  if (result.value === undefined) throw new Error(`${file} did not parse:\n${xml}\n${JSON.stringify(result.diagnostics, null, 2)}`);
  return JSON.parse(JSON.stringify(result.value, (k: string, v: unknown) => (k === 'loc' || k === 'written' ? undefined : v)));
}

// --- Reading the parser sources ------------------------------------------------

/**
 * The attribute names the parsers read by a literal: every call to raw-xml's
 * attribute readers whose second argument is a string literal. A reader called
 * with a variable is reported separately, so a new dynamic read cannot slip
 * past: the only one allowed is the style loop, which reads through
 * STYLE_PROPERTIES and is covered by the `<style>` entry.
 */
function scannedAttributes(file: string): { readonly literal: ReadonlySet<string>; readonly dynamic: number } {
  const source = readFileSync(resolve(PARSER_DIR, file), 'utf8');
  const call = /\b(?:getAttribute|getAttributeValue|getNumberAttribute|getBooleanAttribute|requireAttribute|hasAttribute|getAttributeLocation)\(\s*[\w.]+\s*,\s*([^,)]+)/g;
  const literal = new Set<string>();
  let dynamic = 0;
  for (const match of source.matchAll(call)) {
    const argument = (match[1] ?? '').trim();
    const quoted = /^'([^']*)'$/.exec(argument);
    if (quoted?.[1] !== undefined) literal.add(quoted[1]);
    else dynamic++;
  }
  return { literal, dynamic };
}

/** Every attribute name, at any spelling, the vocabulary has for a file. */
function vocabularyNames(file: VocabularyFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const element of PROJECT_VOCABULARY.filter((e) => e.file === file)) {
    for (const attribute of element.attributes) {
      for (const spelling of attributeSpellings(element, attribute)) names.add(spelling.name);
    }
  }
  return names;
}

// --- Tests ---------------------------------------------------------------------

describe('the project-file vocabulary: shape', () => {
  it('has unique ids, one root per file, and parents that exist in the same file', () => {
    const ids = PROJECT_VOCABULARY.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...vocabularyRoots().keys()].sort()).toEqual(['globals.xml', 'u8g2gl.xml']);
    for (const element of PROJECT_VOCABULARY) {
      for (const parent of [element.parent, ...(element.alternativeParents ?? [])]) {
        if (parent === undefined) continue;
        expect(vocabularyElement(parent)?.file, `${element.id}'s parent ${parent}`).toBe(element.file);
      }
      // A parent comes before its children, so a form can be built in one pass.
      if (element.parent !== undefined) expect(ids.indexOf(element.parent)).toBeLessThan(ids.indexOf(element.id));
    }
  });

  it('gives every element and every attribute help', () => {
    for (const element of PROJECT_VOCABULARY) {
      expect(element.help.trim(), element.id).not.toBe('');
      expect(element.label.trim(), element.id).not.toBe('');
      for (const attribute of element.attributes) {
        expect(attribute.help.trim().length, `${element.id}/${attribute.name}`).toBeGreaterThan(10);
      }
    }
  });

  it('keeps defaults among an enum\'s values, bus families real, and every spelling read from one attribute only', () => {
    const seen = new Map<string, string>();
    for (const element of PROJECT_VOCABULARY) {
      const names = element.attributes.map((attribute) => attribute.name);
      expect(new Set(names).size, element.id).toBe(names.length);
      for (const attribute of element.attributes) {
        if (attribute.type.kind === 'enum') {
          expect(attribute.type.values.length).toBeGreaterThan(0);
          if (attribute.default !== undefined) expect(attribute.type.values).toContain(attribute.default);
        }
        for (const family of attribute.busFamilies ?? []) expect(['spi', 'i2c', 'parallel']).toContain(family);
        for (const spelling of attributeSpellings(element, attribute)) {
          expect(vocabularyElement(spelling.element)?.file, `${element.id}/${attribute.name} → ${spelling.element}`).toBe(element.file);
          const at = key(spelling.element, spelling.name);
          expect(seen.get(at), `${at} is claimed twice`).toBeUndefined();
          seen.set(at, `${element.id}/${attribute.name}`);
        }
      }
    }
  });

  it('folds in every §10 style property by reference, with its aliases as alternatives', () => {
    const style = vocabularyElement('style');
    expect(style).toBeDefined();
    for (const property of STYLE_PROPERTIES) {
      const attribute = style?.attributes.find((a) => a.name === property.attribute);
      expect(attribute, property.attribute).toBeDefined();
      expect((attribute?.alternatives ?? []).map((a) => a.name)).toEqual(property.aliases ?? []);
    }
    expect(style?.attributes.length).toBe(STYLE_PROPERTIES.length + 1);
  });

  it('puts a <bus> child before the display in reading order, as the parser does', () => {
    const display = vocabularyElement('display');
    const cs = display?.attributes.find((a) => a.name === 'cs');
    expect(display !== undefined && cs !== undefined ? attributeSpellings(display, cs).map((s) => s.element) : []).toEqual(['bus', 'display', 'target']);
  });
});

describe('the project-file vocabulary: the parsers read all of it', () => {
  for (const file of ['u8g2gl.xml', 'globals.xml'] as const) {
    it(`a ${file} written from every entry parses with no diagnostic`, () => {
      const xml = writeFile(file);
      const result = file === 'u8g2gl.xml' ? parseProjectFile(xml, file) : parseGlobalsFile(xml, file);
      expect(result.diagnostics).toEqual([]);
      expect(result.value).toBeDefined();
      if (file === 'globals.xml') {
        const globals = parseGlobalsFile(xml, file).value;
        expect(globals?.styles.every((style) => style.unknownAttributes === undefined)).toBe(true);
      }
    });
  }

  for (const element of PROJECT_VOCABULARY) {
    for (const attribute of element.attributes) {
      it(`${element.file} <${element.tag}> ${attribute.name}: the value reaches the model, at every spelling`, () => {
        const canonical = key(element.id, attribute.name);
        const reference = parseFile(element.file, writeFile(element.file, new Map([[canonical, sampleValue(element, attribute, 1)]])));
        // --- The value changes the model ---
        expect(reference).not.toEqual(parseFile(element.file, writeFile(element.file)));
        // --- Every alternative spelling, alone, means the same ---
        for (const spelling of attribute.alternatives ?? []) {
          const values = new Map<string, string | undefined>([
            [canonical, undefined],
            [key(spelling.element, spelling.name), sampleValue(element, attribute, 1)],
          ]);
          // A place read only while another element is absent: every value
          // of that element moves to this place, and the element goes.
          if (spelling.unlessPresent !== undefined) {
            const absent = vocabularyElement(spelling.unlessPresent);
            values.set(omit(spelling.unlessPresent), undefined);
            for (const moved of absent?.attributes ?? []) {
              if (moved === attribute) continue;
              const there = moved.alternatives?.find((a) => a.element === spelling.element);
              values.set(key(absent?.id ?? '', moved.name), undefined);
              if (there !== undefined) values.set(key(there.element, there.name), sampleValue(element, moved, 0));
            }
          }
          // A <bus> child supplies every bus value, so the others move with it.
          if (spelling.element === 'bus') {
            for (const sibling of element.attributes.filter((a) => a.busFamilies !== undefined && a !== attribute)) {
              values.set(key(element.id, sibling.name), undefined);
              values.set(key('bus', sibling.name), sampleValue(element, sibling, 0));
            }
          }
          expect(parseFile(element.file, writeFile(element.file, values)), `${spelling.element}/${spelling.name}`).toEqual(reference);
        }
      });
    }
  }

  it('reads <target> directly under <u8g2gl> as it reads it under <targets>', () => {
    const target = vocabularyElement('target');
    expect(target?.alternativeParents).toEqual(['project']);
    const nested = parseProjectFile(writeFile('u8g2gl.xml'), 'u8g2gl.xml').value;
    const direct = parseProjectFile(
      '<u8g2gl schema="0.6" name="p" version="1"><target name="t" setup="S" /></u8g2gl>',
      'u8g2gl.xml',
    ).value;
    expect(nested?.targets).toHaveLength(1);
    expect(direct?.targets.map((t) => [t.name, t.setup])).toEqual([['t', 'S']]);
  });

  for (const [file, parser] of [
    ['u8g2gl.xml', 'parse-project.ts'],
    ['globals.xml', 'parse-globals.ts'],
  ] as const) {
    it(`every attribute ${parser} reads by name is in the vocabulary`, () => {
      const { literal, dynamic } = scannedAttributes(parser);
      expect(literal.size).toBeGreaterThan(0);
      const known = vocabularyNames(file);
      expect([...literal].filter((name) => !known.has(name)).sort()).toEqual([]);
      // parse-globals.ts reads the style properties through STYLE_PROPERTIES,
      // with a variable: the probe, the text, its location and the integer read.
      expect(dynamic, `${parser} reads an attribute through a variable: add it to the vocabulary and to this count`).toBe(
        parser === 'parse-globals.ts' ? 4 : 0,
      );
    });
  }
});

describe('the project-file vocabulary: its value lists agree with the validator and the manifests', () => {
  const registry = frameworkRegistry();
  const projectWithRotation = (rotation: string): readonly string[] => {
    const project = parseProjectFile(
      `<u8g2gl schema="0.6" name="p" version="1"><targets><target name="t"><display setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="${rotation}" /></target></targets></u8g2gl>`,
      'u8g2gl.xml',
    ).value;
    if (project === undefined) throw new Error('did not parse');
    const globals = parseGlobalsFile('<globals />', 'globals.xml').value;
    if (globals === undefined) throw new Error('did not parse');
    return validateSchema({ project, globals, screens: [], manifests: registry, catalogue: CATALOGUE }).map((d) => d.code);
  };

  it('offers exactly the rotations the validator accepts, each with its angle', () => {
    for (const rotation of ROTATION_VALUES) {
      expect(projectWithRotation(rotation), rotation).not.toContain(DIAGNOSTIC_CODES.INVALID_ENUM_VALUE);
      expect(ROTATION_DEGREES[rotation], rotation).toBeDefined();
    }
    expect(projectWithRotation('R4')).toContain(DIAGNOSTIC_CODES.INVALID_ENUM_VALUE);
  });

  it("offers each enumerated style property the values u8g2gl_obj's prop of that name declares", () => {
    const obj = parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests.find((m) => m.name === 'u8g2gl_obj');
    const style = vocabularyElement('style');
    for (const attribute of style?.attributes ?? []) {
      if (attribute.type.kind !== 'enum') continue;
      const prop = obj?.api.props.find((p) => p.name === attribute.name);
      expect(prop, attribute.name).toBeDefined();
      if (prop?.type === 'color') continue;
      expect(attribute.type.values, attribute.name).toEqual(String(prop?.values ?? '').split(','));
    }
  });
});
