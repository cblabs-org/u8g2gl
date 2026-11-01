/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/realise.test.ts
 * Purpose: Pins PR-04 WO8b: §13.5's realisation decision, §13.3's flattening and
 *          [D-21]'s generated capacities. The three things this work order must
 *          get right, each recorded in PROJECT.md as nearly lost before, are
 *          tested directly: realisation is a whole-document analysis rather than
 *          a per-element predicate; [D-18]'s amendment is interim, so the rule is
 *          still evaluated underneath it; and a subject's observer count is its
 *          object bindings **plus one** frame-dirty observer when any draw-call
 *          element binds it (the PR-01 constraint).
 * Description: Real XML is parsed and expanded through WO8a's shared pipeline, so
 *              every element carries its real identifier and instantiation chain
 *              and nothing here builds a second model. §13.12's worked example is
 *              reproduced whole, because it is the one place the spec states the
 *              expected object array and parent table outright.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { createScreenPipeline } from '../../src/core/resolver/index.js';
import {
  computeCapacities,
  generate,
  realiseScreens,
  U8G2GL_NO_PARENT,
  walkRealised,
  type ProjectModel,
  type RealisationResult,
  type RealisedElement,
} from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import type { CompileProjectAssetsResult } from '../../src/core/assets/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';
import { xbmCompiledAssets } from '../helpers/compiled-assets.js';

/** §13.12's target: 256x64, so its worked geometry resolves as the spec prints it. */
const WIDE = 'U8G2_SH1122_256X64_F_3W_HW_SPI';
const FONT = 'u8g2_font_6x10_mr';
const SCREEN_FILE = 'screens/screen_home.xml';

const GLOBALS_XML = `<globals>
    <subjects>
        <string name="station_name" value="Euston" max_len="48" />
        <bool name="wifi_connected" value="true" />
        <time name="system_time" />
        <string name="service_message" value="" max_len="64" />
        <int name="level" value="0" />
    </subjects>
    <styles><style name="header" /></styles>
    <fonts><builtin name="${FONT}" /></fonts>
    <images><xbm name="icon_wifi" src="images/wifi.xbm" /></images>
</globals>
`;

const PROJECT_XML = `<u8g2gl schema="0.5" name="realise" version="1.0.0">
    <targets><target name="primary" setup="${WIDE}" /></targets>
</u8g2gl>
`;

function globals(): Globals {
  return parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!;
}

/** A screen whose `<view>` holds `body`. */
function screen(body: string): Screen {
  const parsed = parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, SCREEN_FILE);
  expect(parsed.value).toBeDefined();
  return parsed.value!;
}

/** A composite at widgets/<name>/<name>.xml. `attrs` goes on the `<widget>` tag. */
function composite(name: string, props: string, view: string, attrs = ''): WidgetManifest {
  const parsed = parseWidgetManifestFile(
    [`<widget name="${name}"${attrs}>`, `    <api>${props}</api>`, '    <view>', view, '    </view>', '</widget>'].join('\n'),
    `widgets/${name}/${name}.xml`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

/**
 * Realises a screen through WO8a's shared pipeline — one expansion, built for
 * the target being generated, exactly as `generate()` does it.
 */
function realise(body: string, composites: readonly WidgetManifest[] = []): RealisationResult {
  const manifests = frameworkRegistry(composites);
  const display = CATALOGUE.find((record) => record.setup === WIDE);
  const pipeline = createScreenPipeline({
    globals: globals(),
    screens: [screen(body)],
    manifests,
    ...(display ? { display } : {}),
  });
  return realiseScreens({ globals: globals(), manifests, expansion: pipeline.expansion });
}

/** The realised element with this identifier, wherever it sits in the tree. */
function byIdentifier(result: RealisationResult, identifier: string): RealisedElement {
  let found: RealisedElement | undefined;
  for (const realisedScreen of result.screens) {
    walkRealised(realisedScreen.elements, (element) => {
      if (element.identifier === identifier) {
        found = element;
      }
    });
  }
  expect(found, `no realised element '${identifier}'`).toBeDefined();
  return found!;
}

// --- §13.12's worked example, whole ---------------------------------------
// The spec prints the object array and the parent table outright, which makes
// this the one case where the expected flattening is not the test's own opinion.

const STATUS_BAR = composite(
  'status_bar',
  '<prop name="title_subject" type="subject" required="true" />',
  [
    `        <u8g2gl_label name="location" x="0" y="0" right="52" height="11" font="${FONT}"`,
    '                      bind_text="$title_subject" long_mode="scroll" />',
    '        <u8g2gl_xbm name="wifi_icon" right="40" y="0" width="12" height="11" src="icon_wifi">',
    '            <bind_flag_if_eq subject="wifi_connected" value="0" flag="hidden" />',
    '        </u8g2gl_xbm>',
    `        <u8g2gl_clock name="clock" right="0" y="0" width="40" height="11" font="${FONT}"`,
    '                      bind_time="system_time" />',
  ].join('\n'),
);

const WORKED_EXAMPLE = [
  '        <status_bar name="bar" x="0" y="0" width="#screen_width" height="11" title_subject="station_name" />',
  '        <u8g2gl_hline name="rule" x="0" y="11" width="#screen_width" />',
  '        <u8g2gl_label name="msg" x="0" y="16" right="0" height="12"',
  `                      bind_text="service_message" font="${FONT}" align="center" />`,
].join('\n');

describe('realisation — §13.12 worked example', () => {
  it('emits the object array the spec prints, in that order', () => {
    const result = realise(WORKED_EXAMPLE, [STATUS_BAR]);
    expect(result.diagnostics).toEqual([]);
    expect(result.screens[0]?.objects.map((object) => object.identifier)).toEqual([
      'bar',
      'bar_location',
      'bar_wifi_icon',
      'bar_clock',
      'msg',
    ]);
  });

  it('emits the parent table the spec prints', () => {
    const result = realise(WORKED_EXAMPLE, [STATUS_BAR]);
    expect(result.screens[0]?.parents).toEqual([U8G2GL_NO_PARENT, 0, 0, 0, U8G2GL_NO_PARENT]);
  });

  it("realises 'rule' as draw calls — nothing refers to it (§13.5)", () => {
    const rule = byIdentifier(realise(WORKED_EXAMPLE, [STATUS_BAR]), 'rule');
    expect(rule.realisation).toBe('draw_calls');
    expect(rule.objectIndex).toBeUndefined();
    expect(rule.reasons).toEqual([]);
  });

  it('keeps draw calls in document order, interleaved with the objects ([D-4])', () => {
    const result = realise(WORKED_EXAMPLE, [STATUS_BAR]);
    expect(result.screens[0]?.drawOrder.map((step) => `${step.kind}:${step.element.identifier}`)).toEqual([
      'object:bar',
      'object:bar_location',
      'object:bar_wifi_icon',
      'object:bar_clock',
      'draw_calls:rule',
      'object:msg',
    ]);
  });

  it('gives the composite container both the reasons that hold of it', () => {
    const bar = byIdentifier(realise(WORKED_EXAMPLE, [STATUS_BAR]), 'bar');
    expect(bar.reasons).toEqual(['class_backed', 'composite', 'has_children']);
    expect(bar.requiredByRule).toBe(true);
  });
});

// --- The realisation rule, condition by condition --------------------------

describe('realisation — the rule is evaluated whole, not short-circuited', () => {
  it('makes a static label with no references an object, on the amendment alone', () => {
    // [D-18]'s 2026-09-13 amendment: a class-backed element is always an object
    // for now. The rule alone would demote this one, and `requiredByRule` is
    // what says so — §18 must report that demotion is not yet delivered.
    const label = byIdentifier(
      realise(`        <u8g2gl_label name="static" x="0" y="0" width="40" height="10" font="${FONT}" text="Hi" />`),
      'static',
    );
    expect(label.realisation).toBe('object');
    expect(label.reasons).toEqual(['class_backed']);
    expect(label.requiredByRule).toBe(false);
  });

  it('records a binding as a reason only where the class must observe (§13.5)', () => {
    const result = realise(
      [
        `        <u8g2gl_label name="lbl" x="0" y="0" width="40" height="10" font="${FONT}" bind_text="level" />`,
        '        <u8g2gl_box name="bx" x="0" y="20" width="10" height="10" bind_width="level" />',
      ].join('\n'),
    );
    // The label's class observes the subject, so the binding earns an object.
    expect(byIdentifier(result, 'lbl').reasons).toEqual(['class_backed', 'binding']);
    // The box compiles the binding into its draw call instead, so `binding`
    // does not hold — the condition is a conjunction, as the spec writes it.
    const box = byIdentifier(result, 'bx');
    expect(box.realisation).toBe('draw_calls');
    expect(box.reasons).toEqual([]);
    expect(box.bindings.map((binding) => binding.attribute)).toEqual(['bind_width']);
  });

  it('records focus-ring membership, a condition PR-09 has not enabled yet', () => {
    const result = realise(
      [
        `        <u8g2gl_label name="lbl" x="0" y="0" width="40" height="10" font="${FONT}" text="Hi" />`,
        '        <focus_ring wrap="true"><entry name="lbl" /></focus_ring>',
      ].join('\n'),
    );
    expect(byIdentifier(result, 'lbl').reasons).toContain('focus_ring_member');
  });

  it('records an event, a condition PR-09 has not enabled yet', () => {
    const result = realise(
      [
        '        <u8g2gl_button name="btn" x="0" y="0" width="40" height="10">',
        '            <event_cb trigger="press" callback="on_press" />',
        '        </u8g2gl_button>',
      ].join('\n'),
    );
    expect(byIdentifier(result, 'btn').reasons).toContain('event');
  });

  it("records a composite's typed child pointer, a condition PR-08 has not enabled yet", () => {
    // A composite that also declares a C++ class of its own holds typed member
    // pointers to its children ([D-6] as [D-18] amends it). Refused until PR-08,
    // and modelled here so the reason is true the day it is allowed.
    const classed = composite(
      'fancy_bar',
      '',
      `        <u8g2gl_label name="inner" x="0" y="0" width="20" height="10" font="${FONT}" text="x" />`,
      ' extends="u8g2gl_obj"',
    );
    const result = realise(
      '        <fancy_bar name="fb" x="0" y="0" width="40" height="11" />',
      [classed],
    );
    expect(byIdentifier(result, 'fb_inner').reasons).toContain('typed_child_pointer');
    // Its plain sibling composite gets no such reason.
    expect(byIdentifier(realise(WORKED_EXAMPLE, [STATUS_BAR]), 'bar_location').reasons).not.toContain(
      'typed_child_pointer',
    );
  });

  it('refuses an element with no class that something needs an object of', () => {
    // A drawing element compiles to a free u8g2gl_draw_* call and has no class,
    // so there is nothing to nest children inside.
    const result = realise(
      [
        '        <u8g2gl_box name="bx" x="0" y="0" width="40" height="40">',
        `            <u8g2gl_label name="inner" x="0" y="0" width="20" height="10" font="${FONT}" text="x" />`,
        '        </u8g2gl_box>',
      ].join('\n'),
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT,
      severity: 'error',
      file: SCREEN_FILE,
    });
    expect(result.diagnostics[0]?.message).toContain('nested children');
  });
});

// --- Build-time ancestor visibility (§13.5) --------------------------------

describe('realisation — a draw-call element resolves its visibility at build time', () => {
  it('conjoins ancestor hidden checks with the element own bound flags', () => {
    const bar = composite(
      'guard_bar',
      '',
      [
        '        <u8g2gl_hline name="rule" x="0" y="0" width="10">',
        '            <bind_flag_if_eq subject="wifi_connected" value="0" flag="hidden" />',
        '        </u8g2gl_hline>',
      ].join('\n'),
    );
    const rule = byIdentifier(
      realise('        <guard_bar name="bar" x="0" y="0" width="40" height="11" />', [bar]),
      'bar_rule',
    );
    expect(rule.realisation).toBe('draw_calls');
    // The container is an object, so its hidden check is the outer conjunct;
    // the element's own bound flag is the inner one — §13.5's
    // `if (!bar.is_hidden() && ui_subject_wifi.value)`.
    expect(rule.visibility).toEqual([
      { kind: 'ancestor_visible', objectIndex: 0, identifier: 'bar' },
      { kind: 'flag_clear', directive: expect.anything(), subject: 'wifi_connected' },
    ]);
    expect(rule.parentIndex).toBe(0);
  });

  it('leaves a view-level draw-call element unconditional', () => {
    const rule = byIdentifier(realise(WORKED_EXAMPLE, [STATUS_BAR]), 'rule');
    expect(rule.visibility).toEqual([]);
    expect(rule.parentIndex).toBe(U8G2GL_NO_PARENT);
  });
});

// --- Binding overload selection (WO5a finding 4) ---------------------------

describe('realisation — the overload is chosen by the subject type', () => {
  it('records the int declaration for a bind_text to an int subject', () => {
    // `bind_text` is declared once per accepted subject type (§8.4). The string
    // overload is declared first, so an emitter selecting by name alone would
    // take it and spell the wrong call.
    const label = byIdentifier(
      realise(`        <u8g2gl_label name="lbl" x="0" y="0" width="40" height="10" font="${FONT}" bind_text="level" />`),
      'lbl',
    );
    const binding = label.bindings[0];
    expect(binding?.attribute).toBe('bind_text');
    expect(binding?.subjectType).toBe('int');
    expect(binding?.declaration?.type).toBe('int');
  });

  it('records the string declaration for the same attribute on a string subject', () => {
    const label = byIdentifier(
      realise(
        `        <u8g2gl_label name="lbl" x="0" y="0" width="40" height="10" font="${FONT}" bind_text="station_name" />`,
      ),
      'lbl',
    );
    expect(label.bindings[0]?.declaration?.type).toBe('string');
  });
});

// --- Capacities ([D-21]) ---------------------------------------------------

describe('capacities — counted from what was realised ([D-21])', () => {
  it('counts the worked example against WO2 one-binding-one-slot-one-observer', () => {
    const result = realise(WORKED_EXAMPLE, [STATUS_BAR]);
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    expect(capacities.maxObjectsPerScreen).toBe(5);
    expect(capacities.busiestScreen).toBe('home');
    // One binding each on bar_location, bar_wifi_icon, bar_clock and msg; the
    // container binds nothing, and `rule` has no object to bind on.
    expect(capacities.maxBindingsPerObject).toBe(1);
    expect(capacities.totalBindings).toBe(4);
    expect(capacities.styles).toBe(1);
  });

  it('totals bindings as the true sum, never objects x max', () => {
    const result = realise(
      [
        `        <u8g2gl_label name="busy" x="0" y="0" width="40" height="10" font="${FONT}"`,
        '                      bind_text="station_name" bind_x="level" bind_width="level" />',
        `        <u8g2gl_label name="one" x="0" y="20" width="40" height="10" font="${FONT}" bind_text="service_message" />`,
        `        <u8g2gl_label name="none" x="0" y="40" width="40" height="10" font="${FONT}" text="Hi" />`,
      ].join('\n'),
    );
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    expect(capacities.maxObjectsPerScreen).toBe(3);
    expect(capacities.maxBindingsPerObject).toBe(3);
    expect(capacities.busiestObject).toBe('busy');
    // The sum is 4. The product — which [D-21] rejects — would be 9.
    expect(capacities.totalBindings).toBe(4);
    expect(capacities.totalBindings).not.toBe(
      capacities.maxObjectsPerScreen * capacities.maxBindingsPerObject,
    );
  });

  it('counts a composite container as an object, which the validator conservative count does not', () => {
    // Two instances, one child each. Pass 1 counts the template children only
    // (2); the exact model counts each container too (4). Recorded as a finding.
    const one = composite(
      'one_child',
      '',
      `        <u8g2gl_label name="inner" x="0" y="0" width="10" height="10" font="${FONT}" text="x" />`,
    );
    const result = realise(
      [
        '        <one_child name="a" x="0" y="0" width="40" height="11" />',
        '        <one_child name="b" x="0" y="20" width="40" height="11" />',
      ].join('\n'),
      [one],
    );
    expect(result.screens[0]?.objects.map((object) => object.identifier)).toEqual([
      'a',
      'a_inner',
      'b',
      'b_inner',
    ]);
  });
});

// --- Per-subject observer counts, the PR-01 constraint ---------------------

describe('capacities — per-subject observer counts drive the _n<N> types', () => {
  it('counts one object binding plus exactly one frame-dirty observer', () => {
    // Two draw-call elements and one object, all bound to `level`: the object
    // binding is one observer, and the two draw-call elements share **one**
    // frame-dirty observer between them (§13.5) — not one each, and not none.
    const result = realise(
      [
        '        <u8g2gl_box name="b1" x="0" y="0" width="10" height="10" bind_width="level" />',
        '        <u8g2gl_box name="b2" x="0" y="20" width="10" height="10" bind_width="level" />',
        `        <u8g2gl_label name="lbl" x="0" y="40" width="50" height="10" font="${FONT}" bind_text="level" />`,
      ].join('\n'),
    );
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    const level = capacities.subjects.find((entry) => entry.subject.name === 'level');
    expect(level).toMatchObject({ objectBindings: 1, frameDirty: true, observers: 2 });
    // Only the object's binding consumes a pool slot.
    expect(capacities.totalBindings).toBe(1);
  });

  it('adds no frame-dirty observer when only objects bind the subject', () => {
    const result = realise(
      [
        `        <u8g2gl_label name="a" x="0" y="0" width="40" height="10" font="${FONT}" bind_text="station_name" />`,
        `        <u8g2gl_label name="b" x="0" y="20" width="40" height="10" font="${FONT}" bind_text="station_name" />`,
      ].join('\n'),
    );
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    expect(capacities.subjects.find((entry) => entry.subject.name === 'station_name')).toMatchObject({
      objectBindings: 2,
      frameDirty: false,
      observers: 2,
    });
  });

  it('adds exactly one observer for a subject only draw-call elements bind', () => {
    const result = realise(
      [
        '        <u8g2gl_box name="b1" x="0" y="0" width="10" height="10" bind_width="level" />',
        '        <u8g2gl_box name="b2" x="0" y="20" width="10" height="10" bind_height="level" />',
      ].join('\n'),
    );
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    expect(capacities.subjects.find((entry) => entry.subject.name === 'level')).toMatchObject({
      objectBindings: 0,
      frameDirty: true,
      observers: 1,
    });
    expect(capacities.totalBindings).toBe(0);
  });

  it('carries max_len for a string subject (§8.2)', () => {
    const result = realise(WORKED_EXAMPLE, [STATUS_BAR]);
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    expect(capacities.subjects.find((entry) => entry.subject.name === 'station_name')?.maxLen).toBe(48);
    expect(capacities.subjects.find((entry) => entry.subject.name === 'level')?.maxLen).toBeUndefined();
  });

  it('reports every declared subject, in declaration order (§13.9)', () => {
    const result = realise(WORKED_EXAMPLE, [STATUS_BAR]);
    const capacities = computeCapacities({ globals: globals(), screens: result.screens });
    expect(capacities.subjects.map((entry) => entry.subject.name)).toEqual([
      'station_name',
      'wifi_connected',
      'system_time',
      'service_message',
      'level',
    ]);
  });
});

// --- The generator wiring --------------------------------------------------

describe('generate() carries the realised model and the capacities', () => {
  /**
   * The bytes of the `icon_wifi` asset `GLOBALS_XML` declares.
   *
   * Supplied because PR-04 WO9 compiles an `<xbm>` into the generated code
   * (§14.2): a declared image whose bytes are absent is now a diagnostic, where
   * before nothing read the declaration at all. Emitting nothing for it instead
   * would put an undefined `ui_image_*` symbol into generated code and turn a
   * clear diagnostic into a link error.
   */
  const ASSETS = xbmCompiledAssets({
    icon_wifi: ['#define wifi_width 8', '#define wifi_height 8', 'static unsigned char wifi_bits[] = {',
      '   0x00, 0x18, 0x24, 0x42, 0x00, 0x18, 0x00, 0x00 };', ''].join('\n'),
  });

  function model(
    body: string,
    composites: readonly WidgetManifest[],
  ): ProjectModel & { readonly compiledAssets: CompileProjectAssetsResult } {
    return {
      project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
      globals: globals(),
      screens: [screen(body)],
      manifests: frameworkRegistry(composites),
      catalogue: CATALOGUE,
      loadDiagnostics: [],
      hasProjectManifest: true,
      compiledAssets: ASSETS,
    };
  }

  it('realises the model it validated, for the target it built', () => {
    const result = generate({ ...model(WORKED_EXAMPLE, [STATUS_BAR]), generatorVersion: '9.9.9' });
    expect(result.errors).toBe(0);
    expect(result.realised?.[0]?.objects.map((object) => object.identifier)).toEqual([
      'bar',
      'bar_location',
      'bar_wifi_icon',
      'bar_clock',
      'msg',
    ]);
    expect(result.capacities).toMatchObject({ maxObjectsPerScreen: 5, totalBindings: 4 });
    // The resolved and realised views are of one expanded tree, in one order.
    expect(result.resolved?.[0]?.elements).toHaveLength(result.realised?.[0]?.elements.length ?? -1);
  });

  it('refuses the build when realisation finds an element with no class to instantiate', () => {
    const result = generate({
      ...model(
        [
          '        <u8g2gl_box name="bx" x="0" y="0" width="40" height="40">',
          `            <u8g2gl_label name="inner" x="0" y="0" width="20" height="10" font="${FONT}" text="x" />`,
          '        </u8g2gl_box>',
        ].join('\n'),
        [],
      ),
      generatorVersion: '9.9.9',
    });
    expect(result.files).toEqual([]);
    expect(result.realised).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT)).toBe(true);
    expect(result.errors).toBeGreaterThan(0);
  });
});
