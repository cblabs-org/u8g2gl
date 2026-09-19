/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/manifest-fixes.test.ts
 * Purpose: Pins the three fixes WO10 needed before it could emit (PR-04 WO9
 *          findings 1, 2 and 8): a circle or ellipse segment has an enumerator
 *          spelling; a drawing element's geometry is not required where a
 *          binding or an anchor can supply it; and a `<bind_flag_if_*>`
 *          directive naming `$p` at screen level is an error.
 * Description: Each fix has its control beside it — the geometry fix beside a
 *              box with nothing to supply its width, which must still fail, and
 *              line endpoints, which nothing else can supply and so stay
 *              required; the `$p` directive beside the same directive inside a
 *              composite, where it is legal.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { generate, type GenerateResult } from '../../src/core/generator/index.js';
import { validate } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const PROJECT_XML = `<u8g2gl schema="0.4" name="fixes" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>`;

const GLOBALS_XML = `<globals>
    <subjects>
        <int name="level" value="3" />
        <bool name="wifi" value="true" />
    </subjects>
</globals>`;

/** The pieces of a one-screen project, so validate and generate see the same document. */
function model(screenBody: string, widgets: readonly string[] = []) {
  const projectManifests: WidgetManifest[] = widgets.map(
    (xml, index) => parseWidgetManifestFile(xml, `widgets/w${index}/w${index}.xml`).value!,
  );
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: [parseScreenFile(`<screen name="home"><view>${screenBody}</view></screen>`, 'screens/screen_home.xml').value!],
    manifests: frameworkRegistry(projectManifests),
    catalogue: CATALOGUE,
  };
}

function validateScreen(screenBody: string, widgets: readonly string[] = []): readonly Diagnostic[] {
  return validate(model(screenBody, widgets)).diagnostics;
}

function generateScreen(screenBody: string): GenerateResult {
  return generate({
    ...model(screenBody),
    loadDiagnostics: [],
    hasProjectManifest: true,
    generatorVersion: '0.0.0-test',
  });
}

function screenUnit(result: GenerateResult): string {
  const unit = result.files.find((file) => file.path === 'ui_screen_home.cpp');
  if (unit === undefined) {
    throw new Error(`no screen unit; diagnostics: ${JSON.stringify(result.diagnostics)}`);
  }
  return unit.content;
}

const errors = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
  diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

describe('fix 1 — segments has an emit= pattern (WO9 finding 2)', () => {
  it('emits a circle with a non-default segment as the runtime enumerator', () => {
    const unit = screenUnit(generateScreen('<u8g2gl_circle name="c" x="20" y="20" radius="8" segments="lower_right" />'));
    expect(unit).toContain('u8g2gl_draw_circle(display, 20, 20, 8, false, U8G2GL_DRAW_SEGMENT_LOWER_RIGHT);');
  });

  it('emits an ellipse segment the same way', () => {
    const unit = screenUnit(
      generateScreen('<u8g2gl_ellipse name="e" x="20" y="20" rx="8" ry="4" filled="true" segments="upper_left" />'),
    );
    expect(unit).toContain('u8g2gl_draw_ellipse(display, 20, 20, 8, 4, true, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);');
  });

  it('emits the default segment when none is written', () => {
    const unit = screenUnit(generateScreen('<u8g2gl_circle name="c" x="20" y="20" radius="8" />'));
    expect(unit).toContain('u8g2gl_draw_circle(display, 20, 20, 8, false, U8G2GL_DRAW_SEGMENT_ALL);');
  });
});

describe('fix 2 — drawing geometry is not required where a binding or anchor supplies it (WO9 finding 1)', () => {
  it("validates and emits §8.4's own bound-width box, which has no width attribute", () => {
    const box = '<u8g2gl_box name="bar" x="4" y="20" height="6" bind_width="level" />';
    expect(errors(validateScreen(box))).toEqual([]);
    expect(screenUnit(generateScreen(box))).toContain('u8g2gl_draw_box(display, 4, 20, ui_subject_level.get(), 6, true, 0);');
  });

  it('validates an anchor-positioned box, and emits the resolved position', () => {
    const box = '<u8g2gl_box name="edge" right="0" y="0" width="8" height="8" />';
    expect(errors(validateScreen(box))).toEqual([]);
    expect(screenUnit(generateScreen(box))).toContain('u8g2gl_draw_box(display, 120, 0, 8, 8, true, 0);');
  });

  it('still refuses a box whose width nothing supplies (the control) — at generate', () => {
    // `generate` refuses it with a located diagnostic rather than throwing.
    const result = generateScreen('<u8g2gl_box name="bar" x="4" y="20" height="6" />');
    expect(result.files).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.offendingText])).toEqual([
      [DIAGNOSTIC_CODES.MISSING_REQUIRED, 'width'],
    ]);
  });

  it('and validate refuses it too — the journey-split gap WO10 recorded, closed by PR-04 WO11b', () => {
    // WO7b's rule covered an under-determined start, not an absent size; Pass 6
    // now checks the size as well, with the code generate used.
    expect(
      errors(validateScreen('<u8g2gl_box name="bar" x="4" y="20" height="6" />')).map((diagnostic) => [
        diagnostic.code,
        diagnostic.offendingText,
      ]),
    ).toEqual([[DIAGNOSTIC_CODES.MISSING_REQUIRED, 'width']]);
  });

  it('keeps a line endpoint required, since nothing else can supply it', () => {
    const diagnostics = errors(validateScreen('<u8g2gl_line name="l" x1="0" y1="0" x2="10" />'));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DIAGNOSTIC_CODES.MISSING_REQUIRED);
  });
});

describe('fix 3 — a <bind_flag_if_*> subject="$p" at screen level is an error (WO9 finding 8)', () => {
  it('reports it with the code the attribute form already uses', () => {
    const diagnostics = errors(
      validateScreen(
        '<u8g2gl_pixel name="p" x="1" y="1"><bind_flag_if_eq subject="$online" ref_value="0" flag="hidden" /></u8g2gl_pixel>',
      ),
    );
    const reported = diagnostics.filter((diagnostic) => diagnostic.code === DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.offendingText).toBe('$online');
    expect(reported[0]?.message).toContain("'subject' of <bind_flag_if_eq> on <u8g2gl_pixel>");
  });

  it('is the same code as the attribute form', () => {
    const diagnostics = errors(validateScreen('<u8g2gl_box name="b" x="0" y="0" height="4" bind_width="$w" />'));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP);
  });

  it('accepts the same directive inside a composite, where $p is substituted (the control)', () => {
    const composite = `<widget name="dot">
        <api><prop name="online" type="subject" default="wifi" /></api>
        <view>
            <u8g2gl_pixel name="p" x="1" y="1"><bind_flag_if_eq subject="$online" ref_value="0" flag="hidden" /></u8g2gl_pixel>
        </view>
    </widget>`;
    const diagnostics = errors(validateScreen('<dot name="d" x="0" y="0" width="4" height="4" />', [composite]));
    expect(diagnostics).toEqual([]);
  });
});
