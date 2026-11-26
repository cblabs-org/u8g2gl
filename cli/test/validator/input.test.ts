/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/input.test.ts
 * Purpose: Pins Pass 11 — what the validator says about focus rings and events
 *          (§12): an error for what the build cannot emit, a warning for what
 *          is valid but can never do anything, each naming the element and,
 *          where there is one, the target; and the generated-name collision
 *          check covering callbacks. Membership is never inferred, so nothing
 *          here ever adds an element to a ring.
 * Description: Documents are built from strings: a project, globals with one
 *              style and one bool subject, and screens written per case. Each
 *              case runs the whole validator, under both refusal policies where
 *              the severity matters, so both journeys are seen to agree.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate, type ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const PROJECT_XML = `<u8g2gl schema="0.7" name="input" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`;

const GLOBALS_XML = `<globals>
    <subjects><bool name="wifi" value="false" /></subjects>
    <styles><style name="selected" border="true" /></styles>
    <fonts><builtin name="u8g2_font_6x10_mr" /></fonts>
</globals>
`;

const FONT = 'font="u8g2_font_6x10_mr"';

/** A screen named `name` whose view holds `body`. */
function screenXml(name: string, body: string): string {
  return `<screen name="${name}">\n    <view>\n${body}\n    </view>\n</screen>\n`;
}

/** A button at row `row`, with `children` inside it. */
function button(name: string, row: number, children = ''): string {
  return `        <u8g2gl_button name="${name}" x="0" y="${row * 14}" width="60" height="12" ${FONT} text="${name}">${children}</u8g2gl_button>`;
}

/** A ring of `names`, in order. */
function ring(names: readonly string[], wrap = true): string {
  return `        <focus_ring wrap="${wrap}">${names.map((n) => `<focus name="${n}" />`).join('')}</focus_ring>`;
}

/** The project with these screens (name, body) and extra project manifests. */
function inputWith(screens: ReadonlyArray<readonly [string, string]>, extra: readonly WidgetManifest[] = []): ValidateInput {
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: screens.map(([name, body]) => parseScreenFile(screenXml(name, body), `screens/screen_${name}.xml`).value!),
    manifests: frameworkRegistry(extra),
    catalogue: CATALOGUE,
  };
}

/** The codes Pass 11 reports, and the collision check a callback joins. */
const INPUT_CODES: readonly string[] = [
  DIAGNOSTIC_CODES.DUPLICATE_FOCUS_ENTRY,
  DIAGNOSTIC_CODES.UNKNOWN_SCREEN,
  DIAGNOSTIC_CODES.INVALID_CALLBACK,
  DIAGNOSTIC_CODES.UNKNOWN_TRIGGER,
  DIAGNOSTIC_CODES.VALUE_CHANGED_UNREACHABLE,
  DIAGNOSTIC_CODES.INERT_FOCUS_STOP,
  DIAGNOSTIC_CODES.PRESS_UNREACHABLE,
  DIAGNOSTIC_CODES.GENERATED_NAME_COLLISION,
];

/** The whole validator's diagnostics with those codes, under a refusal policy. */
function inputDiagnostics(project: ValidateInput, policy: 'warning' | 'error' = 'warning'): Diagnostic[] {
  return validate({ ...project, refusalPolicy: policy }).diagnostics.filter((d) => INPUT_CODES.includes(d.code));
}

/** The same, as `severity code offendingText`. */
function summary(project: ValidateInput, policy: 'warning' | 'error' = 'warning'): string[] {
  return inputDiagnostics(project, policy).map((d) => `${d.severity} ${d.code} ${d.offendingText ?? ''}`);
}

const SETTINGS_OK = [
  button('go', 0, '<screen_load_event trigger="press" screen="other" />'),
  `        <u8g2gl_switch name="sw" x="70" y="0" width="24" height="12" bind_value="wifi"><event_cb trigger="value_changed" callback="on_wifi" /></u8g2gl_switch>`,
  button('reset', 1, '<event_cb trigger="press" callback="on_reset" /><event_cb trigger="long_press" callback="onFactoryReset" />'),
  ring(['go', 'sw', 'reset']),
].join('\n');
const OTHER_OK = [button('back', 0, '<screen_back_event trigger="press" />'), ring(['back'], false)].join('\n');

describe('Pass 11: focus rings and events (§12)', () => {
  it('says nothing about a ring and events that can all fire, under either policy', () => {
    const project = inputWith([
      ['settings', SETTINGS_OK],
      ['other', OTHER_OK],
    ]);
    expect(summary(project)).toEqual([]);
    expect(summary(project, 'error')).toEqual([]);
    expect(validate({ ...project, refusalPolicy: 'error' }).errors).toBe(0);
  });

  it('refuses the same element twice in one ring, at the second, naming it', () => {
    const project = inputWith([['s', [button('a', 0, '<event_cb trigger="press" callback="on_a" />'), ring(['a', 'a'])].join('\n')]]);
    const [duplicate] = inputDiagnostics(project);
    expect(summary(project)).toEqual(['error U8G2GL_DUPLICATE_FOCUS_ENTRY a']);
    expect(duplicate?.message).toContain("'a' appears twice in screen 's'");
    expect(duplicate?.column).toBeGreaterThan(40);  // the second <focus>, not the first
  });

  it('refuses a load naming no screen in the project, with the target and suggestions', () => {
    const project = inputWith([
      ['home', [button('go', 0, '<screen_load_event trigger="press" screen="setings" />'), ring(['go'])].join('\n')],
      ['settings', OTHER_OK],
    ]);
    const [unknown] = inputDiagnostics(project);
    expect(summary(project, 'error')).toEqual(['error U8G2GL_UNKNOWN_SCREEN setings']);
    expect(unknown?.message).toContain("<u8g2gl_button> 'go' loads screen 'setings'");
    expect(unknown?.suggestions).toEqual(['settings']);
  });

  it('refuses a load with no screen at all', () => {
    const project = inputWith([['home', [button('go', 0, '<screen_load_event trigger="press" />'), ring(['go'])].join('\n')]]);
    expect(summary(project)).toEqual(['error U8G2GL_UNKNOWN_SCREEN screen_load_event']);
  });

  it('refuses a callback that is not a C identifier, a keyword, missing, or in the runtime namespace', () => {
    const body = (callback: string): string =>
      [button('a', 0, `<event_cb trigger="press"${callback} />`), ring(['a'])].join('\n');
    for (const [written, why] of [
      [' callback="on-reset"', 'is not a C identifier'],
      [' callback="2go"', 'is not a C identifier'],
      [' callback="delete"', 'is a C++ keyword'],
      [' callback="u8g2gl_dispatch"', "runtime's u8g2gl_ namespace"],
      ['', 'is missing'],
    ] as const) {
      const diagnostics = inputDiagnostics(inputWith([['s', body(written)]]));
      expect(diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual(['error U8G2GL_INVALID_CALLBACK']);
      expect(diagnostics[0]?.message).toContain(why);
      expect(diagnostics[0]?.message).toContain("<u8g2gl_button> 'a'");
    }
    // A C identifier keeps C's rule, not §13.4's lowercase one: the function is the application's.
    expect(summary(inputWith([['s', body(' callback="onReset_2"')]]))).toEqual([]);
  });

  it('refuses an unknown trigger, with suggestions', () => {
    const project = inputWith([['s', [button('a', 0, '<event_cb trigger="long-press" callback="on_a" />'), ring(['a'])].join('\n')]]);
    const [trigger] = inputDiagnostics(project);
    expect(summary(project)).toEqual(['error U8G2GL_UNKNOWN_TRIGGER long-press']);
    expect(trigger?.suggestions).toEqual(['long_press']);
  });

  it('warns of value_changed where input never changes the value, and not on a switch', () => {
    const project = inputWith([
      [
        's',
        [
          button('a', 0, '<event_cb trigger="value_changed" callback="on_a" />'),
          `        <u8g2gl_switch name="sw" x="70" y="0" width="24" height="12"><event_cb trigger="value_changed" callback="on_sw" /></u8g2gl_switch>`,
          ring(['a', 'sw']),
        ].join('\n'),
      ],
    ]);
    // `a` has an event, so it is not an inert stop, though that event cannot fire.
    expect(summary(project)).toEqual(['warning U8G2GL_VALUE_CHANGED_UNREACHABLE value_changed']);
    expect(inputDiagnostics(project)[0]?.message).toContain("<u8g2gl_button> 'a'");
  });

  it('counts a widget extending the switch as producing value_changed, as its C++ does', () => {
    const toggle = parseWidgetManifestFile(
      '<widget name="wd_toggle" extends="u8g2gl_switch"><api /></widget>',
      'widgets/wd_toggle/wd_toggle.xml',
    ).value!;
    const project = inputWith(
      [['s', [`        <wd_toggle name="t" x="0" y="0" width="24" height="12"><event_cb trigger="value_changed" callback="on_t" /></wd_toggle>`, ring(['t'])].join('\n')]],
      [toggle],
    );
    expect(summary(project)).toEqual([]);
  });

  it('warns of a ring member with no events that is not a switch, and not of a switch', () => {
    const project = inputWith([
      [
        's',
        [
          `        <u8g2gl_label name="about" x="0" y="0" width="60" height="12" ${FONT} text="About" focus_style="selected" />`,
          `        <u8g2gl_switch name="sw" x="70" y="0" width="24" height="12" />`,
          ring(['about', 'sw']),
        ].join('\n'),
      ],
    ]);
    expect(summary(project)).toEqual(['warning U8G2GL_INERT_FOCUS_STOP about']);
    expect(summary(project, 'error')).toEqual(['warning U8G2GL_INERT_FOCUS_STOP about']);
    expect(inputDiagnostics(project)[0]?.message).toContain('highlight-only stop');
  });

  it('warns of a press on an element no ring lists, and never adds it to the ring', () => {
    const project = inputWith([
      ['s', [button('a', 0, '<event_cb trigger="press" callback="on_a" />'), button('b', 1, '<screen_back_event trigger="long_press" />')].join('\n')],
    ]);
    expect(summary(project)).toEqual([
      'warning U8G2GL_PRESS_UNREACHABLE press',
      'warning U8G2GL_PRESS_UNREACHABLE long_press',
    ]);
    expect(inputDiagnostics(project)[0]?.message).toContain("<u8g2gl_button> 'a'");
  });

  it("warns of a press in a composite's template, which no ring can list", () => {
    const card = parseWidgetManifestFile(
      `<widget name="wd_card"><api /><view>${button('inner', 0, '<event_cb trigger="press" callback="on_inner" />')}</view></widget>`,
      'widgets/wd_card/wd_card.xml',
    ).value!;
    const project = inputWith([['s', '        <wd_card name="c" x="0" y="0" width="64" height="20" />']], [card]);
    const diagnostics = inputDiagnostics(project);
    expect(diagnostics.map((d) => `${d.code} ${d.file}`)).toEqual(['U8G2GL_PRESS_UNREACHABLE widgets/wd_card/wd_card.xml']);
  });

  it('reports a callback colliding with a generated identifier, naming both', () => {
    // `ui_s_a` is the handle ui.hpp declares for element `a` on screen `s` (§9.2).
    const project = inputWith([['s', [button('a', 0, '<event_cb trigger="press" callback="ui_s_a" />'), ring(['a'])].join('\n')]]);
    const collisions = inputDiagnostics(project, 'error').filter((d) => d.code === DIAGNOSTIC_CODES.GENERATED_NAME_COLLISION);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.message).toContain("the <event_cb> callback 'ui_s_a'");
    expect(collisions[0]?.message).toContain("the handle of <u8g2gl_button> 'a'");
  });

  it('declares a callback shared by many events once, so sharing is not a collision', () => {
    const project = inputWith([
      [
        's',
        [
          button('a', 0, '<event_cb trigger="press" callback="on_any" />'),
          button('b', 1, '<event_cb trigger="press" callback="on_any" /><event_cb trigger="long_press" callback="on_any" />'),
          ring(['a', 'b']),
        ].join('\n'),
      ],
    ]);
    expect(summary(project, 'error')).toEqual([]);
  });

  it('refuses a callback named ui_dispatch, which the generator declares itself', () => {
    const project = inputWith([['s', [button('a', 0, '<event_cb trigger="press" callback="ui_dispatch" />'), ring(['a'])].join('\n')]]);
    expect(summary(project, 'error').some((line) => line.includes('ui_dispatch'))).toBe(true);
  });
});
