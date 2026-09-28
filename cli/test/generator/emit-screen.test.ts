/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-screen.test.ts
 * Purpose: Pins what a screen's translation unit says (PR-04 WO10, §13.7,
 *          §13.12). The compile-layer fixture proves the output builds and
 *          behaves; these tests pin the individual decisions, each against a
 *          document small enough that a reader can see why the line must be
 *          what it is — and each with the control beside it that would pass if
 *          the decision were wrong the other way.
 * Description: Documents are generated in memory against the real framework
 *              manifests. Covers §13.12's worked example at its own 256-wide
 *              target; rendering through the wrapper and never `obj.render()`;
 *              draw order, guards and hoisting; the binding overload
 *              realisation chose; absolute coordinates inside a container;
 *              composite template parameters; `ui.cpp` and the frame-dirty
 *              observers; the screen descriptor; and the defects only emission
 *              can see, each refused with a diagnostic.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { generate, type GenerateResult } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const DISPLAY_128 = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const DISPLAY_256 = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';

const FONT = 'u8g2_font_6x10_mr';

const GLOBALS = `<globals>
    <subjects>
        <string name="station_name" value="Euston" max_len="16" />
        <string name="service_message" value="" max_len="32" />
        <bool name="wifi_connected" value="true" />
        <time name="system_time" value="0" />
        <int name="level" value="3" />
        <int name="count" value="0" />
        <bool name="flag" value="false" />
    </subjects>
    <styles><style name="note" align="right" /></styles>
    <fonts>
        <builtin name="${FONT}" />
        <builtin name="u8g2_font_5x7_mr" />
    </fonts>
    <images><xbm name="icon_wifi" src="assets/icon_wifi.xbm" /></images>
</globals>
`;

/** An 8x2 XBM, enough for the images unit to emit. */
const XBM = `#define icon_wifi_width 8
#define icon_wifi_height 2
static unsigned char icon_wifi_bits[] = { 0x01, 0x02 };
`;

/** §6.4's composite, fonts swapped for built-ins (PR-04 refuses BDF). */
const STATUS_BAR = `<widget name="status_bar">
    <api>
        <prop name="title_subject" type="subject" default="station_name" />
        <prop name="wifi_subject"  type="subject" default="wifi_connected" />
        <prop name="font"          type="font"    default="${FONT}" />
    </api>
    <view>
        <u8g2gl_label name="location" x="0" y="0" right="52" height="#parent_height"
            bind_text="$title_subject" font="$font" long_mode="scroll" />
        <u8g2gl_xbm name="wifi_icon" right="40" y="0" width="12" height="#parent_height" src="icon_wifi">
            <bind_flag_if_eq subject="$wifi_subject" ref_value="0" flag="hidden" />
        </u8g2gl_xbm>
        <u8g2gl_clock name="clock" right="0" y="0" width="40" height="#parent_height"
            format="hh_mm" font="u8g2_font_5x7_mr" blink="true" bind_time="system_time" />
    </view>
</widget>
`;

/** A composite with two draw calls and an object, placed away from the origin. */
const FRAME = `<widget name="frame">
    <api><prop name="caption" type="string" default="Note" /></api>
    <view>
        <u8g2gl_hline name="top" x="0" y="0" width="#parent_width" />
        <u8g2gl_hline name="under" x="0" y="1" width="#parent_width" />
        <u8g2gl_label name="text" x="2" y="3" width="20" height="10" font="${FONT}" text="$caption" />
        <u8g2gl_hline name="bottom" x="0" y="#parent_height - 1" width="#parent_width" />
    </view>
</widget>
`;

/**
 * A composite whose children are positioned by bindings (ruling 1): one draw
 * call and one object. `x="0"` is written beside `bind_x` because validation's
 * "fully positioned" rule does not yet count a binding as supplying x.
 */
const SLIDER = `<widget name="slider">
    <view>
        <u8g2gl_box name="knob" x="0" bind_x="level" y="0" width="4" height="4" />
        <u8g2gl_label name="knob_label" x="0" bind_x="level" y="0" bind_y="count" width="10" height="10"
                      font="${FONT}" text="K" />
    </view>
</widget>
`;

interface Options {
  readonly screens: Readonly<Record<string, string>>;
  readonly display?: string;
  readonly widgets?: readonly string[];
  /** The globals document; {@link GLOBALS} when absent. */
  readonly globals?: string;
}

/** Generates a project in memory against the real framework manifests. */
function generateProject(options: Options): GenerateResult {
  const project = parseProjectFile(
    `<u8g2gl schema="0.4" name="t" version="1.0.0"><targets><target name="primary" setup="${
      options.display ?? DISPLAY_128
    }" /></targets></u8g2gl>`,
    'u8g2gl.xml',
  ).value!;
  const loadDiagnostics: Diagnostic[] = [];
  const screens = Object.entries(options.screens).map(([name, body]) => {
    const parsed = parseScreenFile(`<screen name="${name}"><view>${body}</view></screen>`, `screens/screen_${name}.xml`);
    loadDiagnostics.push(...parsed.diagnostics);
    return parsed.value!;
  });
  const widgets: WidgetManifest[] = (options.widgets ?? []).map((xml, index) => {
    const parsed = parseWidgetManifestFile(xml, `widgets/w${index}/w${index}.xml`);
    loadDiagnostics.push(...parsed.diagnostics);
    return parsed.value!;
  });
  return generate({
    project,
    globals: parseGlobalsFile(options.globals ?? GLOBALS, 'globals.xml').value!,
    screens,
    manifests: frameworkRegistry(widgets),
    catalogue: CATALOGUE,
    loadDiagnostics,
    hasProjectManifest: true,
    generatorVersion: '0.0.0-test',
    assets: new Map([['assets/icon_wifi.xbm', new TextEncoder().encode(XBM)]]),
  });
}

/** One generated file's text, failing the test if it is missing. */
function file(result: GenerateResult, path: string): string {
  const found = result.files.find((candidate) => candidate.path === path);
  if (found === undefined) {
    throw new Error(`${path} was not generated; diagnostics: ${JSON.stringify(result.diagnostics)}`);
  }
  return found.content;
}

/** The body of one generated function: the lines between its signature and its closing brace. */
function body(unit: string, signature: string): string[] {
  const lines = unit.split('\n');
  const start = lines.indexOf(`${signature} {`);
  if (start < 0) {
    throw new Error(`no '${signature}' in:\n${unit}`);
  }
  const end = lines.indexOf('}', start);
  return lines.slice(start + 1, end).filter((line) => !line.trimStart().startsWith('//') && line.trim() !== '');
}

/** The code lines of a render function, trailing comments removed. */
function renderCode(unit: string, screen: string): string[] {
  return body(unit, `void ui_screen_${screen}_render(U8G2& display)`).map((line) => line.replace(/\s+\/\/.*$/, ''));
}

/** Only the diagnostics of one code. */
function withCode(result: GenerateResult, code: string): readonly Diagnostic[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.code === code);
}

const WORKED_EXAMPLE = `
    <status_bar name="bar" x="0" y="0" width="#screen_width" height="11" title_subject="station_name" />
    <u8g2gl_hline name="rule" x="0" y="11" width="#screen_width" />
    <u8g2gl_label name="msg" x="0" y="16" right="0" height="12"
                  bind_text="service_message" font="${FONT}" align="center" />`;

describe('§13.12 — the worked example generates as the spec prints it', () => {
  const result = generateProject({ screens: { home: WORKED_EXAMPLE }, display: DISPLAY_256, widgets: [STATUS_BAR] });
  const unit = file(result, 'ui_screen_home.cpp');

  it('generates without a diagnostic', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('declares the five objects in §13.12 order, the container as a plain u8g2gl_obj', () => {
    const declarations = unit.split('\n').filter((line) => line.startsWith('static u8g2gl_') && line.includes(';'));
    expect(declarations.map((line) => line.replace(/;.*$/, ';'))).toEqual([
      'static u8g2gl_obj ui_obj_bar;',
      'static u8g2gl_label ui_obj_bar_location;',
      'static u8g2gl_xbm ui_obj_bar_wifi_icon;',
      'static u8g2gl_clock ui_obj_bar_clock;',
      'static u8g2gl_label ui_obj_msg;',
    ]);
    expect(unit).toContain('// "rule" is not here: no object required (§13.5)');
  });

  it('emits §13.12 parent table', () => {
    expect(unit).toMatch(
      /static const uint8_t ui_screen_home_parents\[\] = \{\n {4}U8G2GL_NO_PARENT, {2}\/\/ ui_obj_bar\n {4}0, {2}\/\/ ui_obj_bar_location\n {4}0, {2}\/\/ ui_obj_bar_wifi_icon\n {4}0, {2}\/\/ ui_obj_bar_clock\n {4}U8G2GL_NO_PARENT, {2}\/\/ ui_obj_msg\n\};/,
    );
  });

  it('resolves every anchor to §13.12 coordinates against the 256-wide target', () => {
    const init = body(unit, 'void ui_screen_home_init()');
    expect(init).toEqual(
      expect.arrayContaining([
        '    ui_obj_bar.set_coords(0, 0, 256, 11);',
        '    ui_obj_bar_location.set_coords(0, 0, 204, 11);',
        '    ui_obj_bar_wifi_icon.set_coords(204, 0, 12, 11);',
        '    ui_obj_bar_clock.set_coords(216, 0, 40, 11);',
        '    ui_obj_msg.set_coords(0, 16, 256, 12);',
        '    ui_obj_msg.set_align(U8G2GL_ALIGN_CENTER);',
        '    ui_obj_bar_location.set_long_mode(U8G2GL_LONG_SCROLL);',
        '    ui_obj_bar_clock.set_blink(true);',
      ]),
    );
  });

  it('registers §13.12 bindings last, in document order', () => {
    const init = body(unit, 'void ui_screen_home_init()');
    const bindings = [
      '    ui_obj_bar_location.bind_text(&ui_subject_station_name);',
      '    ui_obj_bar_wifi_icon.bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN);',
      '    ui_obj_bar_clock.bind_time(&ui_subject_system_time);',
      '    ui_obj_msg.bind_text(&ui_subject_service_message);',
    ];
    expect(init.slice(-bindings.length)).toEqual(bindings);
  });

  it('renders every object through the wrapper, with "rule" a bare draw call in its document position', () => {
    expect(renderCode(unit, 'home')).toEqual([
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 0);',
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 1);',
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 2);',
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 3);',
      '    u8g2gl_draw_hline(display, 0, 11, 256);',
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 4);',
    ]);
  });

  it('never calls an object\'s render() directly (WO4 F7)', () => {
    // A direct call skips effective visibility and clipping, so a hidden object
    // would draw. Checked over every generated file, not just this screen.
    // Comments are stripped first: the render function's own comment names
    // obj.render() in order to forbid it.
    for (const generated of result.files) {
      const code = generated.content.replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/\b[a-z_][a-z0-9_]*\.render\(/);
    }
    // The control: the pattern does find a direct call where one is written.
    expect('    ui_obj_msg.render(display);').toMatch(/\b[a-z_][a-z0-9_]*\.render\(/);
  });

  it('does not emit a composite template parameter as a container setter', () => {
    // title_subject is status_bar's own <api> prop, substituted by expansion.
    // The container is a plain u8g2gl_obj and has no set_title_subject().
    expect(unit).not.toContain('set_title_subject');
    expect(unit).not.toContain('ui_obj_bar.set_font');
  });

  it('aggregates tick over every object with u8g2gl_min ([D-15])', () => {
    expect(body(unit, 'uint32_t ui_screen_home_tick(uint32_t now_ms)')).toEqual([
      '    uint32_t next = U8G2GL_IDLE;',
      '    next = u8g2gl_min(next, ui_obj_bar.tick(now_ms));',
      '    next = u8g2gl_min(next, ui_obj_bar_location.tick(now_ms));',
      '    next = u8g2gl_min(next, ui_obj_bar_wifi_icon.tick(now_ms));',
      '    next = u8g2gl_min(next, ui_obj_bar_clock.tick(now_ms));',
      '    next = u8g2gl_min(next, ui_obj_msg.tick(now_ms));',
      '    return next;',
    ]);
  });

  it('defines the screen descriptor ui_handler() drives, and ui.hpp declares it', () => {
    expect(unit).toContain(
      [
        'u8g2gl_screen ui_screen_home = {',
        '    ui_screen_home_objs,',
        '    ui_screen_home_parents,',
        '    5,',
        '    ui_screen_home_init,',
        '    ui_screen_home_activate,',
        '    ui_screen_home_deactivate,',
        '    ui_screen_home_tick,',
        '    ui_screen_home_render,',
        '    false,',
        '};',
      ].join('\n'),
    );
    expect(file(result, 'ui.hpp')).toContain('extern u8g2gl_screen ui_screen_home;');
  });
});

describe('draw calls — guards, hoisting and absolute coordinates (§13.5)', () => {
  const result = generateProject({
    screens: {
      home: `
        <frame name="box" x="10" y="20" width="40" height="16" hidden="true" />
        <u8g2gl_box name="bar" x="4" y="50" height="6" bind_width="level" />
        <u8g2gl_pixel name="blip" x="120" y="2">
            <bind_flag_if_gt subject="count" ref_value="3" flag="hidden" />
        </u8g2gl_pixel>`,
    },
    widgets: [FRAME],
  });
  const unit = file(result, 'ui_screen_home.cpp');
  const render = renderCode(unit, 'home');

  it('generates without a diagnostic', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('guards a draw call under a composite with the build-time ancestor check, in device coordinates', () => {
    // frame sits at (10, 20); its children resolve relative to it (§13.6 step
    // 4) and are emitted in absolute coordinates, which is what the runtime draws in.
    expect(render.slice(0, 5)).toEqual([
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 0);',
      '    if (!ui_obj_box.is_hidden()) {',
      '        u8g2gl_draw_hline(display, 10, 20, 40);',
      '        u8g2gl_draw_hline(display, 10, 21, 40);',
      '    }',
    ]);
  });

  it('hoists only adjacent draw calls sharing a guard, and never reorders to make a pair', () => {
    // "bottom" shares "top"'s guard but an object stands between them in
    // document order, so it gets its own block after the object.
    expect(render.slice(5, 9)).toEqual([
      '    u8g2gl_render_object(display, ui_screen_home_objs, ui_screen_home_parents, 1);',
      '    if (!ui_obj_box.is_hidden()) {',
      '        u8g2gl_draw_hline(display, 10, 35, 40);',
      '    }',
    ]);
  });

  it('places an object child at its container\'s absolute corner too', () => {
    expect(unit).toContain('    ui_obj_box_text.set_coords(12, 23, 20, 10);');
    expect(unit).toContain('    ui_obj_box.set_hidden(true);');
  });

  it('reads a bound value from the subject at draw time', () => {
    expect(render).toContain('    u8g2gl_draw_box(display, 4, 50, u8g2gl_coord_bound(0, ui_subject_level.get()), 6, true, 0);');
  });

  it('turns a bound hidden flag into its clearing comparison', () => {
    // hidden when count > 3, so drawn when count <= 3.
    expect(render.slice(-3)).toEqual([
      '    if (ui_subject_count.get() <= 3) {',
      '        u8g2gl_draw_pixel(display, 120, 2);',
      '    }',
    ]);
  });

  it('includes the draw header, and the widget headers, sorted', () => {
    expect(unit).toContain(
      '#include "u8g2gl/u8g2gl_draw.h"\n#include "u8g2gl/u8g2gl_label.h"\n#include "u8g2gl/u8g2gl_obj.h"',
    );
  });

  it('includes the coordinate header beside the draw header, for u8g2gl_coord_bound() (PR-4R WO4)', () => {
    // A bound draw argument is spelled through u8g2gl_coord_bound(), which
    // u8g2gl_draw.h does not declare; the unit includes it itself, sorted.
    expect(unit).toContain('#include "u8g2gl/u8g2gl_coord.h"\n#include "u8g2gl/u8g2gl_draw.h"\n');
  });
});

describe('bindings are emitted from the overload realisation chose (WO5a finding 4)', () => {
  it('passes the format of an int bind_text, and the string overload takes none', () => {
    const result = generateProject({
      screens: {
        home: `
          <u8g2gl_label name="n" x="0" y="0" width="40" height="10" font="${FONT}"
                        bind_text="count" bind_text_fmt="%d trains" />
          <u8g2gl_label name="s" x="0" y="12" width="40" height="10" font="${FONT}"
                        bind_text="station_name" />`,
      },
    });
    const init = body(file(result, 'ui_screen_home.cpp'), 'void ui_screen_home_init()');
    expect(init).toContain('    ui_obj_n.bind_text(&ui_subject_count, "%d trains");');
    expect(init).toContain('    ui_obj_s.bind_text(&ui_subject_station_name);');
  });

  it('spells a bool comparison value as a bool, and an int one as an int', () => {
    const result = generateProject({
      screens: {
        home: `
          <u8g2gl_label name="a" x="0" y="0" width="40" height="10" font="${FONT}" text="A">
              <bind_flag_if_eq subject="flag" ref_value="true" flag="hidden" />
          </u8g2gl_label>
          <u8g2gl_label name="b" x="0" y="12" width="40" height="10" font="${FONT}" text="B">
              <bind_flag_if_not_eq subject="count" ref_value="-2" flag="disabled" />
          </u8g2gl_label>`,
      },
    });
    const init = body(file(result, 'ui_screen_home.cpp'), 'void ui_screen_home_init()');
    expect(init).toContain('    ui_obj_a.bind_flag_if_eq(&ui_subject_flag, true, U8G2GL_FLAG_HIDDEN);');
    expect(init).toContain('    ui_obj_b.bind_flag_if_not_eq(&ui_subject_count, -2, U8G2GL_FLAG_DISABLED);');
  });
});

describe('styles are applied before properties, and bindings last (§13.7, ruling 3)', () => {
  const result = generateProject({
    screens: {
      home: `<u8g2gl_label name="l" x="0" y="0" width="40" height="10" font="${FONT}"
                           text="L" style="note" style_invert="true" bind_x="level" />`,
    },
  });
  const init = body(file(result, 'ui_screen_home.cpp'), 'void ui_screen_home_init()');

  it('orders named styles, then inline overrides, then set properties, then bindings', () => {
    const index = (line: string): number => init.indexOf(line);
    expect(index('    ui_obj_l.apply_style(ui_style_note);')).toBeGreaterThanOrEqual(0);
    expect(index('    ui_obj_l.set_invert(true);')).toBeGreaterThan(index('    ui_obj_l.apply_style(ui_style_note);'));
    expect(index('    ui_obj_l.set_text("L");')).toBeGreaterThan(index('    ui_obj_l.set_invert(true);'));
    expect(index('    ui_obj_l.bind_x(&ui_subject_level, 0);')).toBeGreaterThan(index('    ui_obj_l.set_text("L");'));
  });

  it("sets an element's own font after its named style's, so its own wins (§10)", () => {
    // The Chief Architect's precedence rule: the setter that runs last wins, so
    // the style must be merged before the element's own font= is set.
    const own = generateProject({
      globals: GLOBALS.replace('<style name="note" align="right" />', '<style name="note" font="u8g2_font_5x7_mr" />'),
      screens: {
        home: `<u8g2gl_label name="l" x="0" y="0" width="40" height="10" font="${FONT}" text="L" style="note" />`,
      },
    });
    const lines = body(file(own, 'ui_screen_home.cpp'), 'void ui_screen_home_init()');
    const style = lines.indexOf('    ui_obj_l.apply_style(ui_style_note);');
    const font = lines.indexOf(`    ui_obj_l.set_font(ui_font_${FONT});`);
    expect(style).toBeGreaterThanOrEqual(0);
    expect(font).toBeGreaterThan(style);
  });

  it('names the steps in that order in the unit, so a reader sees the rule', () => {
    const unit = file(result, 'ui_screen_home.cpp');
    expect(unit).toContain('// --- init: construct, apply styles, set properties, register bindings (§13.7) ---');
    expect(unit.indexOf('// --- Step 2: Apply styles (§10) ---')).toBeLessThan(unit.indexOf('// --- Step 3: Set properties ---'));
  });
});

describe('bound positions are container-relative (§7.2, [D-20] amendment, ruling 1)', () => {
  const result = generateProject({
    screens: {
      home: `
        <slider name="box" x="40" y="20" width="40" height="16" />
        <u8g2gl_box name="dot" x="0" bind_x="level" y="50" width="2" height="2" />
        <u8g2gl_label name="free" x="0" bind_x="level" y="0" bind_y="count" width="20" height="10"
                      font="${FONT}" text="F" />`,
    },
    widgets: [SLIDER],
  });
  const unit = file(result, 'ui_screen_home.cpp');
  const render = renderCode(unit, 'home');
  const init = body(unit, 'void ui_screen_home_init()');

  it('generates without a diagnostic', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it("adds a draw call's container origin into its bound argument", () => {
    // The composite's knob is bound inside a container at (40, 20).
    expect(render).toContain('        u8g2gl_draw_box(display, u8g2gl_coord_bound(40, ui_subject_level.get()), 20, 4, 4, true, 0);');
  });

  it("passes an object's container origin to bind_x and bind_y as a literal", () => {
    expect(init).toContain('    ui_obj_box_knob_label.bind_x(&ui_subject_level, 40);');
    expect(init).toContain('    ui_obj_box_knob_label.bind_y(&ui_subject_count, 20);');
  });

  it('spells a screen-level bound position with origin 0 — the control', () => {
    expect(render).toContain('    u8g2gl_draw_box(display, u8g2gl_coord_bound(0, ui_subject_level.get()), 50, 2, 2, true, 0);');
    expect(init).toContain('    ui_obj_free.bind_x(&ui_subject_level, 0);');
    expect(init).toContain('    ui_obj_free.bind_y(&ui_subject_count, 0);');
  });
});

describe('ui.cpp — ui_init() and one frame-dirty observer per subject a draw call reads (§13.5)', () => {
  const result = generateProject({
    screens: {
      one: `<u8g2gl_box name="a" x="0" y="0" height="4" bind_width="level" />
            <u8g2gl_box name="b" x="0" y="8" height="4" bind_width="level" />`,
      two: `<u8g2gl_box name="c" x="0" y="0" height="4" bind_width="level" />
            <u8g2gl_label name="l" x="0" y="10" width="40" height="10" font="${FONT}" bind_text="station_name" />`,
    },
  });
  const init = body(file(result, 'ui.cpp'), 'void ui_init()');

  it('initialises subjects, then styles, then every screen in document order', () => {
    expect(init.slice(0, 4)).toEqual([
      '    ui_subjects_init();',
      '    ui_styles_init();',
      '    ui_screen_one_init();',
      '    ui_screen_two_init();',
    ]);
  });

  it('registers one frame-dirty observer for level, read by three draw calls on two screens', () => {
    const observers = init.filter((line) => line.includes('u8g2gl_frame_dirty_observer'));
    expect(observers).toEqual(['    ui_subject_level.add_observer(nullptr, u8g2gl_frame_dirty_observer);']);
  });

  it('registers none for a subject only an object observes (the control)', () => {
    expect(init.join('\n')).not.toContain('ui_subject_station_name.add_observer');
  });

  it('sizes level for exactly that one observer ([D-21])', () => {
    expect(file(result, 'ui.hpp')).toContain('extern u8g2gl_subject_int_n<1> ui_subject_level;');
  });
});

describe('a screen with no objects', () => {
  const result = generateProject({ screens: { home: '<u8g2gl_hline name="rule" x="0" y="0" width="10" />' } });
  const unit = file(result, 'ui_screen_home.cpp');

  it('emits no object tables, since a zero-length array is ill-formed C++', () => {
    expect(unit).not.toContain('ui_screen_home_objs');
    expect(unit).toContain('    nullptr,\n    nullptr,\n    0,');
  });

  it('ticks nothing and returns U8G2GL_IDLE without an unused-parameter warning', () => {
    expect(body(unit, 'uint32_t ui_screen_home_tick(uint32_t now_ms)')).toEqual([
      '    (void)now_ms;',
      '    return U8G2GL_IDLE;',
    ]);
  });
});

describe('defects only emission sees are refused, never guessed', () => {
  const LABEL = `x="0" y="0" width="40" height="10" font="${FONT}" text="L"`;

  it('refuses a flag directive with no ref_value', () => {
    const result = generateProject({
      screens: { home: `<u8g2gl_label name="l" ${LABEL}><bind_flag_if_eq subject="count" flag="hidden" /></u8g2gl_label>` },
    });
    expect(result.files).toEqual([]);
    expect(withCode(result, DIAGNOSTIC_CODES.MISSING_REQUIRED).map((d) => d.offendingText)).toEqual(['ref_value']);
  });

  it('refuses a comparison the runtime has no overload for — gt on a bool', () => {
    const result = generateProject({
      screens: {
        home: `<u8g2gl_label name="l" ${LABEL}><bind_flag_if_gt subject="flag" ref_value="0" flag="hidden" /></u8g2gl_label>`,
      },
    });
    expect(result.files).toEqual([]);
    expect(withCode(result, DIAGNOSTIC_CODES.TYPE_MISMATCH)).toHaveLength(1);
  });

  it('accepts eq on the same bool subject (the control)', () => {
    const result = generateProject({
      screens: {
        home: `<u8g2gl_label name="l" ${LABEL}><bind_flag_if_eq subject="flag" ref_value="0" flag="hidden" /></u8g2gl_label>`,
      },
    });
    expect(result.errors).toBe(0);
  });

  it('refuses a style_* override for a property the element does not declare', () => {
    const result = generateProject({ screens: { home: `<u8g2gl_label name="l" ${LABEL} style_sparkle="true" />` } });
    expect(result.files).toEqual([]);
    expect(withCode(result, DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE).map((d) => d.offendingText)).toEqual([
      'style_sparkle',
    ]);
  });

  it('refuses a style_* override whose value its type cannot spell', () => {
    const result = generateProject({ screens: { home: `<u8g2gl_label name="l" ${LABEL} style_invert="maybe" />` } });
    expect(result.files).toEqual([]);
    expect(withCode(result, DIAGNOSTIC_CODES.TYPE_MISMATCH).map((d) => d.offendingText)).toEqual(['maybe']);
  });

  it('refuses a style on an element with no object to apply it to', () => {
    const result = generateProject({ screens: { home: '<u8g2gl_hline name="r" x="0" y="0" width="10" style="note" />' } });
    expect(result.files).toEqual([]);
    // Refused by Pass 4 since PR-04 WO11b, before emission: same code, with the
    // caret on the style rather than on the element's name.
    expect(withCode(result, DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE).map((d) => d.offendingText)).toEqual(['style']);
  });

});
