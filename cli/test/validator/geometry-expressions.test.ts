/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/geometry-expressions.test.ts
 * Purpose: Proves Pass 6 now checks bounds through expressions and anchors
 *          (PR-04 WO6). Before WO6 it checked literal x/width pairs only, so
 *          `width="#screen_width - 8"` overflowing the display validated cleanly.
 * Description: Parses screen XML so diagnostics carry real attribute locations,
 *              and validates against the real framework manifests and catalogue.
 */

import { describe, expect, it } from 'vitest';
import { validateGeometry, type ValidateInput } from '../../src/core/validator/index.js';
import { parseScreenFile } from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const WIDE = 'U8G2_SH1122_256X64_F_3W_HW_SPI';

function inputFor(setup: string): ValidateInput {
  return {
    project: { schema: '0.4', name: 'geom', version: '1.0.0', targets: [{ name: 'primary', setup }] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: frameworkRegistry(),
    catalogue: CATALOGUE,
  };
}

/** A screen whose view holds `body`; the body's first line is line 3. */
function screen(body: string): Screen {
  return parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, 'screens/screen_home.xml').value!;
}

function check(body: string, setup: string = NARROW, extra: Partial<ValidateInput> = {}): readonly Diagnostic[] {
  return validateGeometry({ ...inputFor(setup), screens: [screen(body)], ...extra });
}

const outOfBounds = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS);

describe('validateGeometry through the resolver (PR-04 WO6)', () => {
  it('catches width="#screen_width - 8" overflowing the display', () => {
    const diagnostics = check('<u8g2gl_label name="title" x="16" y="0" width="#screen_width - 8" height="10" />');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
      severity: 'error',
      file: 'screens/screen_home.xml',
      line: 3,
      offendingText: '#screen_width - 8',
    });
    expect(diagnostics[0]?.message).toContain('extends to x=136, display is 128px wide (0..127)');
  });

  it('does not flag the same attribute when it fits', () => {
    expect(check('<u8g2gl_label name="title" x="8" y="0" width="#screen_width - 8" height="10" />')).toEqual([]);
  });

  it("checks against the first target's display", () => {
    const body = '<u8g2gl_label name="title" x="0" y="0" width="200" height="10" />';
    expect(outOfBounds(check(body, NARROW))).toHaveLength(1);
    expect(check(body, WIDE)).toEqual([]);
  });

  it('catches an anchored element pushed past the origin', () => {
    const diagnostics = outOfBounds(check('<u8g2gl_label name="wide" right="0" y="0" width="200" height="10" />'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('extends to x=-72, display is 128px wide');
    expect(diagnostics[0]?.offendingText).toBe('width, right');
  });

  it('catches a size that anchors resolve to a negative number', () => {
    const diagnostics = outOfBounds(check('<u8g2gl_label name="squeezed" x="100" right="40" y="0" height="10" />'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('resolves to width=-12, which is negative');
  });

  it('accepts centred elements that fit', () => {
    expect(check('<u8g2gl_label name="c" hcenter="true" width="41" vcenter="true" height="11" />')).toEqual([]);
  });

  it("reports the evaluator's diagnostics at the attribute", () => {
    const diagnostics = check('<u8g2gl_label name="bad" x="#nope" y="0" width="10 / 0" height="10" />');
    expect(diagnostics.map((d) => d.code).sort()).toEqual(
      [DIAGNOSTIC_CODES.DIVISION_BY_ZERO, DIAGNOSTIC_CODES.UNKNOWN_CONSTANT].sort(),
    );
    expect(diagnostics.every((d) => d.line === 3 && d.file === 'screens/screen_home.xml')).toBe(true);
  });

  it('reports over-constraint once — the resolver owns it', () => {
    const diagnostics = check('<u8g2gl_label name="o" x="0" width="10" right="0" y="0" height="10" />');
    expect(diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.OVERCONSTRAINED)).toHaveLength(1);
  });

  it("checks a nested element against its parent's size resolved from an expression", () => {
    const diagnostics = outOfBounds(
      check(
        [
          '<u8g2gl_box name="panel" x="0" y="0" width="#screen_width / 4" height="20">',
          '    <u8g2gl_label name="inner" x="10" y="0" width="30" height="10" />',
          '</u8g2gl_box>',
        ].join('\n'),
      ),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("extends to x=40, containing element '<u8g2gl_box>' is 32px wide");
  });

  it('skips screen-level checks, silently, when the target has no catalogue record', () => {
    expect(check('<u8g2gl_label name="t" x="16" y="0" width="#screen_width - 8" height="10" />', 'NO_SUCH_SETUP')).toEqual([]);
  });

  describe('composite templates', () => {
    const node = (tag: string, attributes: Record<string, string>, children: WidgetNode[] = []): WidgetNode => ({
      tag,
      attributes: { name: attributes.name ?? tag, ...attributes },
      children,
      styleOverrides: {},
    });
    const composite = (children: WidgetNode[]): WidgetManifest => ({
      name: 'status_bar',
      api: { props: [], bindings: [], elements: [] },
      view: { children },
    });
    const validateComposite = (children: WidgetNode[]) =>
      validateGeometry({ ...inputFor(NARROW), manifests: frameworkRegistry([composite(children)]) });

    it('defers #parent_* at the top level, where no size is known yet', () => {
      expect(
        validateComposite([node('u8g2gl_label', { x: '0', y: '0', width: '#parent_width - 52', height: '#parent_height' })]),
      ).toEqual([]);
    });

    it('checks nested elements against a sized element inside the template', () => {
      const diagnostics = validateComposite([
        node('u8g2gl_box', { name: 'frame', x: '0', y: '0', width: '40', height: '16' }, [
          node('u8g2gl_label', { name: 'inner', x: '0', y: '0', width: '#parent_width + 1', height: '10' }),
        ]),
      ]);
      expect(outOfBounds(diagnostics)).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain("extends to x=41, containing element '<u8g2gl_box>' is 40px wide");
    });

    it('reports malformed expressions inside a template', () => {
      const diagnostics = validateComposite([node('u8g2gl_label', { x: '0', y: '0', width: '10 +', height: '10' })]);
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.MALFORMED_EXPRESSION]);
    });
  });
});
