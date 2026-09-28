/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/validator-alignment.test.ts
 * Purpose: Pins PR-04 WO8c: the 254-object ceiling is enforced against
 *          realisation's exact count, in both journeys; realisation's refusal
 *          obeys decision 1's warning/error split; and there is exactly **one**
 *          object count and **one** reserved-prefix list in the codebase.
 * Description: The defect this closes was not a missing check but a wrong one. A
 *              project of 128 composite instances reaches 256 objects — past the
 *              structural limit — and before this work order both `validate` and
 *              `generate` exited 0 with no diagnostic, because Pass 1's
 *              structural count predated [D-18]: it skipped composite containers
 *              and counted `draw=`-only elements. So the tests here run the
 *              boundary from **both** sides: 256 must fail and 254 must pass, and
 *              a screen of 300 drawing elements must **not** fail — that last one
 *              is what a reinstated structural count would break, and it is the
 *              reason the count has to be realisation's rather than a second
 *              opinion about it.
 *
 *              Real XML throughout, parsed and run through the whole validator,
 *              so each diagnostic carries a real location and no test builds a
 *              model of its own.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { generate, type GenerateResult, type ProjectModel } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const SCREEN_FILE = 'screens/screen_home.xml';
const FONT = 'u8g2_font_6x10_mr';

const PROJECT_XML = `<u8g2gl schema="0.4" name="alignment" version="1.0.0">
    <targets>
        <target name="primary" setup="${NARROW}" />
    </targets>
</u8g2gl>
`;

function globals(): Globals {
  return parseGlobalsFile(
    `<globals>\n    <subjects><int name="level" value="0" /></subjects>\n` +
      `    <fonts><builtin name="${FONT}" /></fonts>\n</globals>\n`,
    'globals.xml',
  ).value!;
}

/** A screen whose `<view>` holds `body`. */
function screen(body: string): Screen {
  const parsed = parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, SCREEN_FILE);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.value!;
}

/** A composite at widgets/<name>/<name>.xml. */
function composite(name: string, view: string): WidgetManifest {
  const parsed = parseWidgetManifestFile(
    [`<widget name="${name}">`, '    <api />', '    <view>', view, '    </view>', '</widget>'].join('\n'),
    `widgets/${name}/${name}.xml`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

function projectModel(body: string, composites: readonly WidgetManifest[] = []): ProjectModel {
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: globals(),
    screens: [screen(body)],
    manifests: frameworkRegistry(composites),
    catalogue: CATALOGUE,
    loadDiagnostics: [],
    hasProjectManifest: true,
  };
}

/** Every diagnostic `validate` gives for a screen holding `body`. */
function validated(body: string, composites: readonly WidgetManifest[] = []): readonly Diagnostic[] {
  const model = projectModel(body, composites);
  return validate({
    project: model.project,
    globals: model.globals,
    screens: model.screens,
    manifests: model.manifests,
    catalogue: model.catalogue,
  }).diagnostics;
}

/** What `generate` does with the same screen. */
function generated(body: string, composites: readonly WidgetManifest[] = []): GenerateResult {
  return generate({ ...projectModel(body, composites), generatorVersion: '9.9.9' });
}

const withCode = (diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.code === code);

// --- The object ceiling, from both sides of the boundary -------------------
// `parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` consumes one of its
// values ([A-3], [D-21]), so 254 is the last representable screen.

/** A composite holding one label: an instance of it is **two** objects. */
const CELL = composite(
  'cell',
  `        <u8g2gl_label name="t" x="0" y="0" width="4" height="4" font="${FONT}" text="x" />`,
);

/** `count` instances of `cell`, so the screen realises 2 x `count` objects. */
function cells(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `        <cell name="c${i}" x="0" y="0" width="8" height="8" />`,
  ).join('\n');
}

describe('the 254-object ceiling is realisation’s exact count (WO8b finding 1)', () => {
  it('accepts 127 composite instances — exactly 254 objects, the last that fits', () => {
    expect(withCode(validated(cells(127), [CELL]), DIAGNOSTIC_CODES.TOO_MANY_OBJECTS)).toEqual([]);
  });

  it('refuses 128 composite instances — 256 objects, which passed silently before', () => {
    const found = withCode(validated(cells(128), [CELL]), DIAGNOSTIC_CODES.TOO_MANY_OBJECTS);

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('error');
    expect(found[0]?.offendingText).toBe('home');
    expect(found[0]?.message).toContain("Screen 'home'");
    expect(found[0]?.message).toContain('256 objects');
    expect(found[0]?.message).toContain('254');
    expect(found[0]?.message).toContain('uint8_t');
  });

  it('generate refuses the 256-object screen too, writing nothing', () => {
    const result = generated(cells(128), [CELL]);

    expect(result.files).toEqual([]);
    expect(result.errors).toBeGreaterThan(0);
    const found = withCode(result.diagnostics, DIAGNOSTIC_CODES.TOO_MANY_OBJECTS);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('256 objects');
  });

  it('generate still builds the 254-object screen', () => {
    const result = generated(cells(127), [CELL]);

    expect(withCode(result.diagnostics, DIAGNOSTIC_CODES.TOO_MANY_OBJECTS)).toEqual([]);
    expect(result.errors).toBe(0);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.realised?.[0]?.objects).toHaveLength(254);
  });

  it('counts the composite container itself, which the structural count skipped ([D-18])', () => {
    // One instance is two objects: the container and its child. The retired
    // count recursed into the template and counted the child alone, which is
    // how 128 instances came to 256 objects and were reported as 128.
    const result = generated(cells(1), [CELL]);
    expect(result.realised?.[0]?.objects.map((object) => object.identifier)).toEqual(['c0', 'c0_t']);
  });

  it('does not count drawing elements, which the structural count did ([D-18])', () => {
    // 300 pixels are 300 nodes and **zero** objects: each compiles to a free
    // `u8g2gl_draw_*` call with no object slot. A second, structural count
    // reinstated anywhere would flag this screen and fail here — which is the
    // point of the test.
    const pixels = Array.from(
      { length: 300 },
      (_, i) => `        <u8g2gl_pixel name="p${i}" x="${i % 128}" y="${i % 64}" />`,
    ).join('\n');

    expect(withCode(validated(pixels), DIAGNOSTIC_CODES.TOO_MANY_OBJECTS)).toEqual([]);
    const result = generated(pixels);
    expect(result.errors).toBe(0);
    expect(result.realised?.[0]?.objects).toEqual([]);
  });
});

// --- Realisation's refusal obeys the journey split (decision 1) ------------

describe('U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT warns in validate and errors in generate', () => {
  // A `draw=`-only element a focus ring names: there is no class to focus.
  const FOCUSED_RULE = [
    '        <u8g2gl_hline name="rule" x="0" y="11" width="100" />',
    '        <focus_ring>',
    '            <entry name="rule" />',
    '        </focus_ring>',
  ].join('\n');

  it('validate reports it as a warning, so the document is not shown as broken', () => {
    const found = withCode(validated(FOCUSED_RULE), DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT);

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('warning');
    expect(found[0]?.offendingText).toBe('rule');
    expect(found[0]?.message).toContain('<focus_ring> names it');
    expect(found[0]?.message).toContain('no class to instantiate');
  });

  it('generate reports the same code at the same location, as an error, and writes nothing', () => {
    const warned = withCode(validated(FOCUSED_RULE), DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT)[0]!;
    const result = generated(FOCUSED_RULE);
    const refused = withCode(result.diagnostics, DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT);

    expect(refused).toHaveLength(1);
    expect(refused[0]?.severity).toBe('error');
    expect(result.files).toEqual([]);
    // Same code, same place, same words — only the severity differs.
    expect({ ...refused[0]!, severity: 'warning' }).toEqual(warned);
  });

  it('says nothing about a drawing element nothing refers to', () => {
    const plain = '        <u8g2gl_hline name="rule" x="0" y="11" width="100" />';
    expect(withCode(validated(plain), DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT)).toEqual([]);
  });
});

// --- One count, one list --------------------------------------------------
// Both defects this work order closes were duplication: two object counts that
// disagreed, and two copies of §13.4's prefix list. These scan the source, so a
// second copy fails the suite rather than waiting to drift.

describe('the codebase holds exactly one object count and one reserved-prefix list', () => {
  const coreDir = resolve(__dirname, '../../src/core');

  /** Every `.ts` file under `src/core`, with its text. */
  function coreFiles(dir = coreDir): ReadonlyArray<readonly [string, string]> {
    const out: Array<readonly [string, string]> = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...coreFiles(path));
      } else if (entry.name.endsWith('.ts')) {
        out.push([path, readFileSync(path, 'utf-8')] as const);
      }
    }
    return out;
  }

  it('declares the object ceiling once', () => {
    const declaring = coreFiles().filter(([, text]) => /export const MAX_OBJECTS_PER_SCREEN|const MAX_OBJECTS_PER_SCREEN/.test(text));
    expect(declaring.map(([path]) => path.slice(coreDir.length + 1))).toEqual([
      'realise/model.ts',
    ]);
  });

  it('raises U8G2GL_TOO_MANY_OBJECTS from one module', () => {
    // The code's own declaration in diagnostic.ts is not a raiser.
    const raising = coreFiles()
      .filter(([path]) => !path.endsWith('schema/diagnostic.ts'))
      .filter(([, text]) => text.includes('TOO_MANY_OBJECTS'));
    expect(raising.map(([path]) => path.slice(coreDir.length + 1))).toEqual([
      'validator/validate-realisation.ts',
    ]);
  });

  it('declares §13.4’s reserved prefixes once, and no second list spells them again', () => {
    const declaring = coreFiles().filter(([, text]) => /const RESERVED_[A-Z_]*PREFIXES/.test(text));
    expect(declaring.map(([path]) => path.slice(coreDir.length + 1))).toEqual(['resolver/mangle.ts']);

    // The literal pair, written anywhere but that one declaration, is a copy.
    const spelling = coreFiles()
      .filter(([path]) => !path.endsWith('resolver/mangle.ts'))
      .filter(([, text]) => /'u8g2gl_',\s*'ui_'/.test(text));
    expect(spelling.map(([path]) => path.slice(coreDir.length + 1))).toEqual([]);
  });
});
