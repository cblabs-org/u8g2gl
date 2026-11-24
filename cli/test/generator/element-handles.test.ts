/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/element-handles.test.ts
 * Purpose: Named element handles (design_spec §9.2): every named object
 *          written in a screen is reachable from firmware through a typed
 *          reference `ui.hpp` declares, while the object itself stays `static`
 *          in its screen's unit. A drawing element has no object and no
 *          handle, and neither has an element expanded out of a composite's
 *          template. A handle's composed name that collides with another
 *          generated identifier is an error naming both sources, in `generate`
 *          and in `validate` alike.
 * Description: Projects built in memory against the real framework manifests,
 *              generated through `generate()` and validated through
 *              `checkProject()`, the two journeys' own entry points.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { checkProject, type ProjectModel } from '../../src/core/generator/check-project.js';
import { generate, type GenerateResult } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const FONT = 'u8g2_font_6x10_mr';

const GLOBALS = `<globals>
    <subjects><string name="station_name" value="Euston" max_len="16" /></subjects>
    <fonts><builtin name="${FONT}" /></fonts>
</globals>
`;

/** A composite: a container with one label of its own. */
const BADGE = `<widget name="badge">
    <view>
        <u8g2gl_label name="caption" x="0" y="0" width="20" height="10" font="${FONT}" text="B" />
    </view>
</widget>
`;

/** A project model built in memory: `screens` maps a screen name to its view's body. */
function model(screens: Readonly<Record<string, string>>, widgets: readonly string[] = []): ProjectModel {
  const project = parseProjectFile(
    '<u8g2gl schema="0.7" name="t" version="1.0.0"><targets><target name="primary" ' +
      'setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets></u8g2gl>',
    'u8g2gl.xml',
  ).value!;
  const loadDiagnostics: Diagnostic[] = [];
  const parsed = Object.entries(screens).map(([name, body]) => {
    const screen = parseScreenFile(`<screen name="${name}"><view>${body}</view></screen>`, `screens/screen_${name}.xml`);
    loadDiagnostics.push(...screen.diagnostics);
    return screen.value!;
  });
  const manifests: WidgetManifest[] = widgets.map((xml, index) => parseWidgetManifestFile(xml, `widgets/w${index}/w${index}.xml`).value!);
  return {
    project,
    globals: parseGlobalsFile(GLOBALS, 'globals.xml').value!,
    screens: parsed,
    manifests: frameworkRegistry(manifests),
    catalogue: CATALOGUE,
    loadDiagnostics,
    hasProjectManifest: true,
  };
}

/** Generates a model, as the CLI's `generate` does. */
function build(input: ProjectModel): GenerateResult {
  return generate({ ...input, generatorVersion: '0.0.0-test' });
}

/** One generated file's text. */
function file(result: GenerateResult, path: string): string {
  const found = result.files.find((candidate) => candidate.path === path);
  if (found === undefined) throw new Error(`${path} was not generated: ${JSON.stringify(result.diagnostics)}`);
  return found.content;
}

const LABEL = (name: string, y = 0): string =>
  `<u8g2gl_label name="${name}" x="0" y="${y}" width="40" height="10" font="${FONT}" text="T" />`;

describe('a named object gets a handle in ui.hpp (§9.2)', () => {
  const result = build(model({ home: `${LABEL('title')}<u8g2gl_hline name="rule" x="0" y="12" width="40" />` }));

  it('generates cleanly', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('declares a typed reference beside its screen, its class forward-declared', () => {
    const header = file(result, 'ui.hpp');
    expect(header).toContain('class u8g2gl_label;');
    expect(header).toContain('extern u8g2gl_label& ui_home_title;');
  });

  it('defines it in the screen unit, bound to the static object, which stays static', () => {
    const unit = file(result, 'ui_screen_home.cpp');
    expect(unit).toContain('static u8g2gl_label ui_obj_title;');
    expect(unit).toContain('u8g2gl_label& ui_home_title = ui_obj_title;');
  });

  it('gives a drawing element none: it has no object (§13.5)', () => {
    expect(file(result, 'ui.hpp')).not.toContain('ui_home_rule');
    expect(file(result, 'ui_screen_home.cpp')).not.toContain('ui_home_rule');
  });
});

describe('a composite instance gets a handle; its template children do not', () => {
  const result = build(model({ home: '<badge name="tag" x="0" y="0" width="40" height="10" />' }, [BADGE]));

  it('declares the instance as the plain u8g2gl_obj container it is', () => {
    expect(result.diagnostics).toEqual([]);
    expect(file(result, 'ui.hpp')).toContain('extern u8g2gl_obj& ui_home_tag;');
  });

  it('exports no element the widget wrote rather than the screen', () => {
    expect(file(result, 'ui_screen_home.cpp')).toContain('static u8g2gl_label ui_obj_tag_caption;');
    expect(file(result, 'ui.hpp')).not.toContain('ui_home_tag_caption');
  });
});

describe('a handle that collides with another generated identifier is an error naming both', () => {
  /** The collisions a model raises, in both journeys. */
  function collisions(input: ProjectModel): { generate: readonly Diagnostic[]; validate: readonly Diagnostic[] } {
    const pick = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
      diagnostics.filter((diagnostic) => diagnostic.code === DIAGNOSTIC_CODES.GENERATED_NAME_COLLISION);
    return { generate: pick(build(input).diagnostics), validate: pick(checkProject(input, 'warning').diagnostics) };
  }

  it('against another handle: screen a_b element c and screen a element b_c are both ui_a_b_c', () => {
    const input = model({ a_b: LABEL('c'), a: LABEL('b_c') });
    const found = collisions(input);
    expect(found.generate).toHaveLength(1);
    expect(found.generate[0]).toMatchObject({ severity: 'error', file: 'screens/screen_a.xml', offendingText: 'ui_a_b_c' });
    expect(found.generate[0]?.message).toContain("the handle of <u8g2gl_label> 'c' on screen 'a_b'");
    expect(found.generate[0]?.message).toContain("the handle of <u8g2gl_label> 'b_c' on screen 'a'");
    expect(build(input).files).toEqual([]);
  });

  it('in validate too, at the same severity, so authoring sees what the build refuses', () => {
    const found = collisions(model({ a_b: LABEL('c'), a: LABEL('b_c') }));
    expect(found.validate).toEqual(found.generate);
  });

  it("against a screen function: screen screen's x_init is screen x's init", () => {
    const found = collisions(model({ x: LABEL('t'), screen: LABEL('x_init') }));
    expect(found.generate).toHaveLength(1);
    expect(found.generate[0]?.message).toContain("'ui_screen_x_init'");
    expect(found.generate[0]?.message).toContain("screen 'x'");
  });

  it("against a subject's setter: screen set's station_name is ui_set_station_name", () => {
    const found = collisions(model({ set: LABEL('station_name') }));
    expect(found.generate).toHaveLength(1);
    expect(found.generate[0]?.message).toContain("subject 'station_name'");
  });

  it("against another screen's static object: screen obj's title is screen home's ui_obj_title", () => {
    const found = collisions(model({ home: LABEL('title'), obj: LABEL('title') }));
    expect(found.generate.map((diagnostic) => diagnostic.offendingText)).toEqual(['ui_obj_title']);
  });

  it('never for a project whose composed names are distinct', () => {
    expect(collisions(model({ home: `${LABEL('a')}${LABEL('b', 12)}`, menu: LABEL('a') })).generate).toEqual([]);
  });
});
