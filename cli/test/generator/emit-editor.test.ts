/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-editor.test.ts
 * Purpose: The editor target's two emitters (PR-04 WO11, [UD-4]) held to the
 *          sharing rule: the registry unit spells every enumerator, default and
 *          draw-argument order through the helpers the firmware emitter uses,
 *          covers every loaded manifest, and keeps binding overloads apart; the
 *          scene description is the firmware screen units' content as data —
 *          same objects, parents, rectangles, properties, draw order and guards —
 *          and supplies no subject value. The C++ parity test proves the result
 *          draws identically; these say, by name, which rule broke.
 * Description: Registry cases run against the real framework manifests plus a
 *              project class; scene cases run against the committed compile
 *              fixture, and compare with its committed firmware units.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator/index.js';
import {
  describeScenes,
  emitEditorFiles,
  emitEditorRegistryUnit,
  EDITOR_REGISTRY_UNIT,
  SCENE_FILE,
} from '../../src/core/generator/emit/index.js';
import { drawFunctionOf } from '../../src/core/generator/emit/draw-args.js';
import { INIT_STEPS } from '../../src/core/generator/emit/screen-model.js';
import { FLAG_COMPARISONS } from '../../src/core/schema/widget-node.js';
import { cppValue } from '../../src/core/generator/emit/value.js';
import { isDrawingElement, type ManifestRegistry } from '../../src/core/manifest/index.js';
import { parseWidgetManifestFile } from '../../src/core/parser/index.js';
import { loadProject } from '../../src/node/load-project.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

/** A project class: its own header, an enum with its own emit pattern, a binding. */
const GAUGE = `<widget name="gauge_dial" extends="u8g2gl_obj">
    <api>
        <prop name="needle" type="int" setter="set_needle" default="0" />
        <prop name="mode" type="enum" setter="set_mode" values="fast,slow" default="fast" emit="GAUGE_{VALUE^^}" />
        <bind name="bind_needle" type="int" setter="bind_needle" />
    </api>
</widget>
`;

/** A composite, which must get no registry entry of its own. */
const PANEL = `<widget name="panel">
    <api><prop name="caption" type="string" default="Note" /></api>
    <view><u8g2gl_hline name="edge" x="0" y="0" width="#parent_width" /></view>
</widget>
`;

function registryWithProject(): ManifestRegistry {
  return frameworkRegistry(
    [GAUGE, PANEL].map((xml, index) => parseWidgetManifestFile(xml, `widgets/w${index}/w${index}.xml`).value!),
  );
}

function registryUnit(manifests: ManifestRegistry = registryWithProject()): string {
  return emitEditorRegistryUnit({ manifests, stamp: '// stamp\n' }).content;
}

/** The text of one generated table, `static const <type> <name>[] = { … };`. */
function table(unit: string, name: string): string {
  const start = unit.indexOf(` ${name}[] = {`);
  if (start < 0) {
    throw new Error(`no table ${name}`);
  }
  return unit.slice(start, unit.indexOf('\n};', start));
}

describe('the editor registry unit (WO11, [UD-4])', () => {
  const manifests = registryWithProject();
  const unit = registryUnit(manifests);

  it('gives every loaded manifest its entry: classes constructed, drawings drawn, composites none', () => {
    for (const tag of manifests.tags) {
      const manifest = manifests.get(tag)!;
      if (isDrawingElement(manifest.declared)) {
        expect(unit, tag).toContain(`static const u8g2gl_editor_param ui_editor_${tag}_params[] = {`);
        expect(unit, tag).not.toContain(`::new (storage) ${tag}()`);
      } else if (manifest.declared.view !== undefined) {
        expect(unit, tag).not.toContain(`{"${tag}",`);
      } else {
        expect(unit, tag).toContain(`::new (storage) ${tag}()`);
        expect(unit, tag).toContain(`sizeof(${tag}), alignof(${tag})`);
      }
    }
  });

  it('includes a project class by its own header, as the firmware screen unit does (§6.5)', () => {
    expect(unit).toContain('#include "gauge_dial.hpp"');
    expect(unit).toContain('static_cast<gauge_dial*>(obj)->set_needle(value.integer);');
  });

  it('spells every enum branch with the firmware value helper', () => {
    for (const tag of ['u8g2gl_label', 'gauge_dial']) {
      for (const prop of manifests.get(tag)!.api.props.filter((candidate) => candidate.type === 'enum')) {
        for (const value of (prop.values ?? '').split(',')) {
          expect(unit, `${tag}.${prop.name}=${value}`).toContain(
            `if (u8g2gl_editor_is(value, "${value}")) { self->${prop.setter}(${cppValue(prop, value)}); return true; }`,
          );
        }
      }
    }
    expect(unit).toContain('self->set_mode(GAUGE_SLOW)');
  });

  it('keeps bind_text for a string and for an int as two entries, keyed by subject type', () => {
    const bindings = table(unit, 'ui_editor_u8g2gl_label_bindings');
    expect(bindings.match(/\{"bind_text",/g)).toHaveLength(2);
    expect(bindings).toContain('static_cast<u8g2gl_subject_string_base*>(subject)');
    expect(bindings).toContain('static_cast<u8g2gl_subject_int_base*>(subject)');
    expect(bindings).toMatch(/U8G2GL_SUBJECT_STRING\},[\s\S]*U8G2GL_SUBJECT_INT\}/);
  });

  it('passes a format only where the runtime overload takes one, and refuses one where the manifest declares none', () => {
    const bindings = table(unit, 'ui_editor_u8g2gl_label_bindings');
    // bind_text declares fmt=: the compiler decides per overload, so the string
    // overload (no format parameter) refuses a format instead of dropping it.
    expect(bindings.match(/u8g2gl_editor_bind_call\(/g)).toHaveLength(2);
    expect(bindings).toContain('decltype(s->bind_text(sub, f))');
    // bind_x declares no format: a format is refused outright.
    expect(bindings).toMatch(
      /\{"bind_x",\n\s*\[\]\(u8g2gl_obj\* obj, void\* subject, const char\* fmt, int16_t origin\) -> bool \{\n\s*if \(fmt != nullptr\) \{ return false; \}/,
    );
    expect(table(unit, 'ui_editor_gauge_dial_bindings')).toContain(
      'static_cast<gauge_dial*>(obj)->bind_needle(static_cast<u8g2gl_subject_int_base*>(subject));',
    );
  });

  it('passes the container origin to a position binding and refuses one anywhere else (§7.2)', () => {
    const bindings = table(unit, 'ui_editor_u8g2gl_label_bindings');
    // bind_x and bind_y take the origin, exactly as firmware's literal.
    expect(bindings).toContain('->bind_x(static_cast<u8g2gl_subject_int_base*>(subject), origin);');
    expect(bindings).toContain('->bind_y(static_cast<u8g2gl_subject_int_base*>(subject), origin);');
    // A size, a text and a widget's own binding take none: an origin there is
    // refused, never dropped — once per such entry.
    const refusals = bindings.match(/if \(origin != 0\) \{ return false; \}/g) ?? [];
    expect(refusals).toHaveLength(4); // bind_text x2, bind_width, bind_height
    expect(table(unit, 'ui_editor_gauge_dial_bindings')).toContain('if (origin != 0) { return false; }');
  });

  it('draws each drawing element with the firmware draw function and argument order', () => {
    for (const tag of manifests.tags.filter((candidate) => isDrawingElement(manifests.get(candidate)!.declared))) {
      const { fn, props } = drawFunctionOf(manifests.get(tag)!);
      const params = table(unit, `ui_editor_${tag}_params`);
      expect([...params.matchAll(/\{"([^"]+)", U8G2GL_EDITOR_/g)].map((m) => m[1]), tag).toEqual(
        props.map((prop) => prop.name),
      );
      expect(unit, tag).toContain(`${fn}(display, ${props.map((_, i) => `a${i}`).join(', ')});`);
    }
  });

  it('takes each absent argument from the manifest default, spelled as firmware spells it', () => {
    const box = manifests.get('u8g2gl_box')!;
    const filled = box.api.props.find((prop) => prop.name === 'filled')!;
    expect(unit).toContain(`const bool a4 = args[4].type == U8G2GL_EDITOR_NONE ? ${cppValue(filled, filled.default!)} : args[4].boolean;`);
    // No default: absent refuses, as firmware refuses the element.
    expect(unit).toContain('if (args[0].type == U8G2GL_EDITOR_NONE) { return false; }');
    // An enum default through cppValue too.
    expect(unit).toContain('decltype(U8G2GL_DRAW_SEGMENT_ALL) a4 = U8G2GL_DRAW_SEGMENT_ALL;');
  });

  it('has one directive entry per runtime overload, with the firmware guard comparison', () => {
    const directives = table(unit, 'ui_editor_directives');
    for (const [method, comparison] of Object.entries(FLAG_COMPARISONS)) {
      for (const type of comparison.subjectTypes) {
        expect(directives, `${method}/${type}`).toContain(
          `// ${method} (${type} subject): the flag is clear when get() ${comparison.clearWhen} ref`,
        );
      }
    }
    expect(table(unit, 'ui_editor_flags')).toBe(
      ' ui_editor_flags[] = {\n    {"hidden", U8G2GL_FLAG_HIDDEN},\n    {"disabled", U8G2GL_FLAG_DISABLED},',
    );
  });

  it('compiles to nothing without U8G2GL_EDITOR, and is deterministic', () => {
    const guard = unit.indexOf('#ifdef U8G2GL_EDITOR');
    expect(guard).toBeGreaterThan(0);
    expect(unit.indexOf('#include')).toBeGreaterThan(guard);
    expect(unit.endsWith('#endif  // U8G2GL_EDITOR\n')).toBe(true);
    expect(registryUnit()).toBe(unit);
  });
});

// --- The scene description, against the committed fixture -----------------

const fixtureDir = resolve(__dirname, '../../../test/generated_fixture');

interface SceneElement {
  readonly name: string;
  readonly realisation: 'object' | 'draw_calls';
  readonly [key: string]: unknown;
}
interface SceneScreen {
  readonly name: string;
  readonly objects: number;
  readonly parents: readonly (number | null)[];
  readonly elements: readonly SceneElement[];
}

function fixtureScene(): { readonly scene: Record<string, unknown>; readonly result: ReturnType<typeof generate> } {
  const loaded = loadProject(fixtureDir);
  const result = generate({ ...loaded.model, generatorVersion: '0.0.0-golden', assets: loaded.assets });
  const scene = describeScenes({
    project: {
      project: loaded.model.project,
      globals: loaded.model.globals,
      screens: loaded.model.screens,
      capacities: result.capacities!,
      manifests: loaded.model.manifests,
      assets: loaded.assets,
      stamp: '',
    },
    realised: result.realised!,
    resolved: result.resolved!,
    manifests: loaded.model.manifests,
    generated: { source: 'u8g2gl.xml', schema: '0.4', generator: '0.0.0-golden', target: 'host' },
  });
  return { scene: scene as Record<string, unknown>, result };
}

function element(screen: SceneScreen, name: string): SceneElement {
  const found = screen.elements.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`no element ${name}`);
  }
  return found;
}

describe('the scene description (WO11, ui_spec §4.1 step 6)', () => {
  const { scene, result } = fixtureScene();
  const screens = scene.screens as readonly SceneScreen[];
  const byName = (name: string): SceneScreen => screens.find((screen) => screen.name === name)!;

  it('describes every subject and supplies no value', () => {
    const subjects = scene.subjects as readonly Record<string, unknown>[];
    expect(subjects.map((subject) => subject.name)).toEqual([
      'station_name',
      'service_message',
      'wifi_connected',
      'system_time',
      'level',
      'show_panel',
      'knob_x',
      'temperature',
    ]);
    for (const subject of subjects) {
      expect(subject).not.toHaveProperty('value');
    }
    expect(subjects[0]).toEqual({ name: 'station_name', type: 'string', max_len: 16 });
  });

  it('carries the firmware init order from the one constant both targets read', () => {
    expect(scene.init).toEqual([...INIT_STEPS]);
  });

  it('lists every element in realisation’s draw order, with its object index and parent table', () => {
    for (const realised of result.realised!) {
      const screen = byName(realised.screen.name);
      expect(screen.elements.map((e) => e.name)).toEqual(realised.drawOrder.map((step) => step.element.identifier));
      expect(screen.objects).toBe(realised.objects.length);
      expect(screen.parents).toEqual(realised.parents.map((parent) => (parent === 255 ? null : parent)));
      for (const object of realised.objects) {
        expect(element(screen, object.identifier).object).toBe(object.objectIndex);
      }
    }
  });

  it('gives each object exactly the rectangle and setter calls its firmware unit makes', () => {
    for (const screen of screens) {
      const unit = readFileSync(join(fixtureDir, 'generated', `ui_screen_${screen.name}.cpp`), 'utf-8');
      for (const e of screen.elements.filter((candidate) => candidate.realisation === 'object')) {
        const rect = new RegExp(`^    ui_obj_${e.name}\\.set_coords\\((.*)\\);`, 'm').exec(unit);
        expect(rect, e.name).not.toBeNull();
        expect((e.rect as number[]).join(', '), e.name).toBe(rect![1]);
        const setters = [...unit.matchAll(new RegExp(`^    ui_obj_${e.name}\\.set_(?!coords)`, 'gm'))];
        // An inline style_* override is a setter call too, made in the styles step.
        const calls = (e.properties as unknown[]).length + (e.style_overrides as unknown[]).length;
        expect(calls, e.name).toBe(setters.length);
      }
    }
    expect(element(byName('gauges'), 'ghost').properties).toEqual([
      { name: 'hidden', value: true },
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'text', value: 'Ghost' },
    ]);
  });

  it('names a bound draw argument’s subject instead of a value, and leaves defaults to the registry', () => {
    expect(element(byName('gauges'), 'level_bar').arguments).toEqual([
      { name: 'x', value: 4 },
      { name: 'y', value: 20 },
      { name: 'width', subject: 'level', subject_type: 'int' },
      { name: 'height', value: 6 },
    ]);
  });

  it('describes a draw call’s guard as the terms firmware spells into its if', () => {
    expect(element(byName('gauges'), 'panel_edge').visibility).toEqual([{ ancestor: 0 }]);
    expect(element(byName('gauges'), 'blip').visibility).toEqual([
      { directive: 'bind_flag_if_eq', subject: 'wifi_connected', subject_type: 'bool', ref: false },
    ]);
  });

  it('types a directive’s ref as firmware does: a bool subject’s true/false as a bool, 0 as an int', () => {
    expect(element(byName('gauges'), 'panel').flags).toEqual([
      { directive: 'bind_flag_if_eq', subject: 'show_panel', subject_type: 'bool', ref: false, flag: 'hidden' },
    ]);
    expect(element(byName('home'), 'bar_wifi_icon').flags).toEqual([
      { directive: 'bind_flag_if_eq', subject: 'wifi_connected', subject_type: 'bool', ref: 0, flag: 'hidden' },
    ]);
  });

  it('describes attribute bindings by the overload realisation chose', () => {
    expect(element(byName('home'), 'msg').bindings).toEqual([
      { name: 'bind_text', subject: 'service_message', subject_type: 'string' },
    ]);
    expect(element(byName('home'), 'bar_clock').bindings).toEqual([
      { name: 'bind_time', subject: 'system_time', subject_type: 'time' },
    ]);
  });

  it('describes each style by the element props it sets, in the firmware’s applied order', () => {
    expect(scene.styles).toEqual([
      { name: 'note', properties: [{ name: 'align', value: 'right' }] },
      {
        name: 'loud',
        properties: [
          { name: 'font', value: 'u8g2_font_5x7_mr' },
          { name: 'align', value: 'center' },
          { name: 'font_mode', value: 'transparent' },
        ],
      },
    ]);
    expect(element(byName('gauges'), 'panel_note').styles).toEqual(['note']);
  });

  it('gives a position binding its container origin, as firmware passes it (§7.2)', () => {
    // track sits at (40, 10): its object child's bind_x and its draw-call child's
    // bound x both carry 40; dot, on the screen, carries 0.
    expect(element(byName('bounds'), 'track_readout').bindings).toEqual([
      { name: 'bind_x', subject: 'knob_x', subject_type: 'int', origin: 40 },
    ]);
    expect(element(byName('bounds'), 'track_knob').arguments).toContainEqual({
      name: 'x',
      subject: 'knob_x',
      subject_type: 'int',
      origin: 40,
    });
    expect(element(byName('bounds'), 'dot').arguments).toContainEqual({
      name: 'x',
      subject: 'knob_x',
      subject_type: 'int',
      origin: 0,
    });
    // A binding that sets no position carries none.
    expect(element(byName('bounds'), 'temp').bindings).toEqual([
      { name: 'bind_text', subject: 'temperature', subject_type: 'int', fmt: '%d°C' },
    ]);
    expect(scene.version).toBe(2);
  });

  it('is emitted as ui_scene.json beside the registry, deterministically', () => {
    const loaded = loadProject(fixtureDir);
    const input = {
      project: loaded.model.project,
      globals: loaded.model.globals,
      screens: loaded.model.screens,
      realised: result.realised!,
      resolved: result.resolved!,
      manifests: loaded.model.manifests,
      capacities: result.capacities!,
      assets: loaded.assets,
      generatorVersion: '0.0.0-golden',
      target: 'host',
    };
    const files = emitEditorFiles(input).files;
    expect(files.map((f) => f.path)).toEqual([EDITOR_REGISTRY_UNIT, SCENE_FILE]);
    expect(JSON.parse(files[1]!.content)).toEqual({ ...scene });
    expect(emitEditorFiles(input).files).toEqual(files);
  });
});
