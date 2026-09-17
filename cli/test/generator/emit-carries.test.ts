/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-carries.test.ts
 * Purpose: Pins the four value-completeness gaps WO8a found and WO9 closed, and
 *          the `<output prefix>` decision. Each gap let a value reach emission
 *          that §13.2's value helper cannot spell — so each was a route to
 *          wrong C++ in a committed file ([D-11]) rather than a diagnostic.
 * Description: Every case has its control beside it, so the test discriminates
 *              behaviour rather than merely asserting that something is
 *              reported. All five fail at this work order's base.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { buildManifestRegistry, parseFrameworkManifests } from '../../src/core/manifest/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';

const PROJECT_XML = `<u8g2gl schema="0.4" name="carries" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`;

const GLOBALS_XML = `<globals>
    <consts><int name="gap" value="12" /></consts>
    <subjects><string name="station" value="Euston" max_len="16" /></subjects>
    <styles><style name="header" font="u8g2_font_6x10_mr" /></styles>
    <fonts><builtin name="u8g2_font_6x10_mr" /></fonts>
</globals>
`;

/** Validates one screen, and any project composites, against the real manifests. */
function diagnosticsFor(options: {
  readonly screenBody?: string;
  readonly widgets?: readonly string[];
  readonly projectXml?: string;
}): readonly Diagnostic[] {
  const project = parseProjectFile(options.projectXml ?? PROJECT_XML, 'u8g2gl.xml').value!;
  const globals = parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!;
  const screen = parseScreenFile(
    `<screen name="home"><view>${options.screenBody ?? ''}</view></screen>`,
    'screens/screen_home.xml',
  );
  const projectManifests: WidgetManifest[] = [];
  for (const [index, widget] of (options.widgets ?? []).entries()) {
    const parsed = parseWidgetManifestFile(widget, `widgets/w${index}/w${index}.xml`);
    if (parsed.value) {
      projectManifests.push(parsed.value);
    }
  }
  return validate({
    project,
    globals,
    screens: screen.value ? [screen.value] : [],
    manifests: buildManifestRegistry({
      framework: parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests,
      project: projectManifests,
    }),
    catalogue: CATALOGUE,
  }).diagnostics;
}

/** The diagnostics of one code. */
function withCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

const LABEL = 'x="0" y="0" width="40" height="10" font="u8g2_font_6x10_mr"';

describe('carry 1 — every type="bool" prop is strict (WO8a finding 2)', () => {
  it('reports filled="yes" on a drawing element', () => {
    // Confirmed end to end before WO9: this validated, and reached emission,
    // where a bool has no spelling for `yes`.
    const reported = withCode(
      diagnosticsFor({ screenBody: '<u8g2gl_box name="b" x="0" y="0" width="8" height="8" filled="yes" />' }),
      DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/'filled'.*boolean/);
    expect(reported[0]?.suggestions).toEqual(['true', 'false']);
  });

  it('accepts true and false', () => {
    for (const value of ['true', 'false']) {
      const diagnostics = diagnosticsFor({
        screenBody: `<u8g2gl_box name="b" x="0" y="0" width="8" height="8" filled="${value}" />`,
      });
      expect(withCode(diagnostics, DIAGNOSTIC_CODES.INVALID_ENUM_VALUE)).toEqual([]);
    }
  });

  it('reports a bool prop on a class-backed element too, and only once', () => {
    const reported = withCode(
      diagnosticsFor({ screenBody: `<u8g2gl_clock name="c" ${LABEL} blink="sometimes" />` }),
      DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.offendingText).toBe('sometimes');
  });

  it('still reports hidden exactly once, though it is both a contract name and a bool prop', () => {
    // `hidden` is declared type="bool" on u8g2gl_obj and is also one of §7.2's
    // strict attributes, so an undeduplicated list would report it twice for
    // one mistake.
    const reported = withCode(
      diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} hidden="yes" />` }),
      DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(reported).toHaveLength(1);
  });
});

describe('carry 2 — non-coordinate int props are evaluated (WO8a finding 5)', () => {
  it('resolves an expression in scroll_px_per_sec', () => {
    const diagnostics = diagnosticsFor({
      screenBody: `<u8g2gl_label name="l" ${LABEL} scroll_px_per_sec="#gap + 8" />`,
    });
    expect(diagnostics).toEqual([]);
  });

  it('reports an unknown constant in it, through the one evaluator', () => {
    const reported = withCode(
      diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} scroll_px_per_sec="#speed" />` }),
      DIAGNOSTIC_CODES.UNKNOWN_CONSTANT,
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/'scroll_px_per_sec' on <u8g2gl_label>/);
    expect(reported[0]?.offendingText).toBe('#speed');
  });

  it('reports a malformed expression in it', () => {
    expect(
      withCode(
        diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} scroll_px_per_sec="4 +" />` }),
        DIAGNOSTIC_CODES.MALFORMED_EXPRESSION,
      ),
    ).toHaveLength(1);
  });

  it('applies the int32_t range rule, not the int16_t coordinate rule (§13.2)', () => {
    // 40000 does not fit int16_t but is a perfectly good int property, so it is
    // accepted here while the same value in `width` would be refused.
    expect(
      diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} scroll_px_per_sec="40000" />` }),
    ).toEqual([]);
    expect(
      withCode(
        diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} scroll_px_per_sec="3000000000" />` }),
        DIAGNOSTIC_CODES.INTEGER_OVERFLOW,
      ),
    ).toHaveLength(1);
  });

  it('reports a $prop in it, written where nothing can substitute it', () => {
    expect(
      withCode(
        diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} scroll_px_per_sec="$speed" />` }),
        DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
      ),
    ).toHaveLength(1);
  });
});

describe('carry 3 — a screen-level $prop in a bind_* attribute (WO8a finding 3)', () => {
  it('reports it, rather than binding a subject named $station', () => {
    const reported = withCode(
      diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} bind_text="$station" />` }),
      DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.offendingText).toBe('$station');
    expect(reported[0]?.message).toMatch(/'bind_text' on <u8g2gl_label>/);
  });

  it('accepts a real subject name', () => {
    expect(diagnosticsFor({ screenBody: `<u8g2gl_label name="l" ${LABEL} bind_text="station" />` })).toEqual([]);
  });

  it('leaves a bind_* $prop inside a composite view alone — there it is substituted', () => {
    const widget = `<widget name="wd_t"><api><prop name="s" type="subject" default="station" /></api>
      <view><u8g2gl_label name="inner" ${LABEL} bind_text="$s" /></view></widget>`;
    const diagnostics = diagnosticsFor({
      widgets: [widget],
      screenBody: '<wd_t name="t" x="0" y="0" width="40" height="10" />',
    });
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP)).toEqual([]);
  });
});

describe('carry 4 — a literal <style> child inside a <view> (WO8a finding 4)', () => {
  it('reports an unknown style name written in a template', () => {
    const widget = `<widget name="wd_s"><api><prop name="c" type="string" default="x" /></api>
      <view><u8g2gl_label name="inner" ${LABEL}><style name="hedaer" /></u8g2gl_label></view></widget>`;
    const reported = withCode(
      diagnosticsFor({ widgets: [widget], screenBody: '<wd_s name="s" x="0" y="0" width="40" height="10" />' }),
      DIAGNOSTIC_CODES.UNKNOWN_STYLE,
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.offendingText).toBe('hedaer');
    expect(reported[0]?.suggestions).toContain('header');
    expect(reported[0]?.message).toMatch(/composite 'wd_s'/);
  });

  it('accepts a declared style, and reports the template once however many instances', () => {
    const widget = `<widget name="wd_s"><api><prop name="c" type="string" default="x" /></api>
      <view><u8g2gl_label name="inner" ${LABEL}><style name="header" /></u8g2gl_label></view></widget>`;
    expect(
      withCode(
        diagnosticsFor({ widgets: [widget], screenBody: '<wd_s name="s" x="0" y="0" width="40" height="10" />' }),
        DIAGNOSTIC_CODES.UNKNOWN_STYLE,
      ),
    ).toEqual([]);

    const bad = `<widget name="wd_s"><api><prop name="c" type="string" default="x" /></api>
      <view><u8g2gl_label name="inner" ${LABEL}><style name="nope" /></u8g2gl_label></view></widget>`;
    const twice = withCode(
      diagnosticsFor({
        widgets: [bad],
        screenBody:
          '<wd_s name="a" x="0" y="0" width="40" height="10" /><wd_s name="b" x="0" y="20" width="40" height="10" />',
      }),
      DIAGNOSTIC_CODES.UNKNOWN_STYLE,
    );
    expect(twice).toHaveLength(1);
  });
});

describe('<output prefix> is diagnosed, not silently ignored (WO5b finding 4)', () => {
  const projectWith = (output: string): string =>
    `<u8g2gl schema="0.4" name="carries" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
    ${output}
</u8g2gl>
`;

  it('reports a prefix that cannot be honoured, naming §13.4', () => {
    const reported = withCode(
      diagnosticsFor({ projectXml: projectWith('<output dir="generated" prefix="app_" />') }),
      DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.offendingText).toBe('app_');
    expect(reported[0]?.message).toMatch(/§13\.4 fixes every generated identifier at 'ui_'/);
    expect(reported[0]?.suggestions).toEqual(['ui_']);
  });

  it("accepts prefix=\"ui_\", which asks for what the generator already does", () => {
    expect(
      withCode(
        diagnosticsFor({ projectXml: projectWith('<output dir="generated" prefix="ui_" />') }),
        DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      ),
    ).toEqual([]);
  });

  it('says nothing when no prefix is declared', () => {
    expect(
      withCode(
        diagnosticsFor({ projectXml: projectWith('<output dir="generated" />') }),
        DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      ),
    ).toEqual([]);
  });
});
