/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/resolver/resolve.test.ts
 * Purpose: Pins anchor resolution and the resolved model (§7.2, §7.3, [D-7],
 *          [D-20], §17.1 "Resolution" layer): every anchor combination and
 *          centring with odd remainders resolve to the asserted integers, and the
 *          same screen resolves differently against a 128-wide and a 256-wide
 *          display.
 * Description: Resolves hand-built nodes against the real framework manifests,
 *              and parsed screen XML against real catalogue records.
 */

import { describe, expect, it } from 'vitest';
import {
  createResolverContext,
  resolveElements,
  resolveScreens,
  type Container,
  type ResolvedElement,
} from '../../src/core/resolver/index.js';
import { parseScreenFile } from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = CATALOGUE.find((d) => d.setup === 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
const WIDE = CATALOGUE.find((d) => d.setup === 'U8G2_SH1122_256X64_F_3W_HW_SPI');

const GLOBALS: Globals = {
  consts: [{ name: 'header_height', type: 'int', value: '12' }],
  subjects: [],
  styles: [],
  fonts: [],
  images: [],
};
const REGISTRY = frameworkRegistry();
const DISPLAY_128: Container = { label: 'display', width: 128, height: 64 };

function node(tag: string, attributes: Record<string, string>, children: WidgetNode[] = []): WidgetNode {
  return { tag, attributes: { name: attributes.name ?? tag, ...attributes }, children, styleOverrides: {} };
}

/** Resolves one element inside `container` against the 128x64 display. */
function resolveOne(
  element: WidgetNode,
  container: Container = DISPLAY_128,
): { element: ResolvedElement; diagnostics: readonly Diagnostic[] } {
  const context = createResolverContext(GLOBALS, REGISTRY, NARROW);
  const { elements, diagnostics } = resolveElements([element], container, context);
  return { element: elements[0]!, diagnostics };
}

/** The resolved geometry as plain numbers. */
function numbers(element: ResolvedElement): Record<string, number | undefined> {
  const g = element.geometry;
  return {
    x: g.x?.value,
    y: g.y?.value,
    width: g.width?.value,
    height: g.height?.value,
    right: g.right?.value,
    bottom: g.bottom?.value,
  };
}

describe('resolver anchors (PR-04 WO6, §7.2)', () => {
  it('sanity: the catalogue has both displays', () => {
    expect(NARROW?.width).toBe(128);
    expect(WIDE?.width).toBe(256);
  });

  describe('two of {x, width, right} determine the third; likewise {y, height, bottom}', () => {
    it.each([
      ['x + width → right', { x: '10', width: '50', y: '2', height: '12' }, { x: 10, width: 50, right: 68, y: 2, height: 12, bottom: 50 }],
      ['width + right → x', { right: '0', width: '40', y: '0', height: '11' }, { x: 88, width: 40, right: 0, y: 0, height: 11, bottom: 53 }],
      ['x + right → width', { x: '8', right: '8', y: '0', height: '10' }, { x: 8, width: 112, right: 8, y: 0, height: 10, bottom: 54 }],
      ['height + bottom → y', { x: '0', width: '10', bottom: '0', height: '11' }, { x: 0, width: 10, right: 118, y: 53, height: 11, bottom: 0 }],
      ['y + bottom → height', { x: '0', width: '10', y: '13', bottom: '13' }, { x: 0, width: 10, right: 118, y: 13, height: 38, bottom: 13 }],
    ])('%s', (_label, attributes, expected) => {
      const { element, diagnostics } = resolveOne(node('u8g2gl_label', attributes));
      expect(diagnostics).toEqual([]);
      expect(numbers(element)).toEqual(expected);
    });
  });

  describe('centring within the container, odd remainders rounding down', () => {
    it.each([
      ['hcenter, even remainder', { hcenter: 'true', width: '40', y: '0', height: '10' }, { x: 44, right: 44 }],
      ['hcenter, odd remainder', { hcenter: 'true', width: '41', y: '0', height: '10' }, { x: 43, right: 44 }],
      ['vcenter, odd remainder', { vcenter: 'true', height: '11', x: '0', width: '10' }, { y: 26, bottom: 27 }],
      ['vcenter, even remainder', { vcenter: 'true', height: '12', x: '0', width: '10' }, { y: 26, bottom: 26 }],
      ['hcenter, element wider than its container (negative remainder rounds down too)', { hcenter: 'true', width: '131', y: '0', height: '10' }, { x: -2, right: -1 }],
    ])('%s', (_label, attributes, expected) => {
      const { element, diagnostics } = resolveOne(node('u8g2gl_label', attributes));
      expect(diagnostics).toEqual([]);
      expect(numbers(element)).toMatchObject(expected);
    });

    it('hcenter="false" centres nothing', () => {
      const { element } = resolveOne(node('u8g2gl_label', { hcenter: 'false', width: '40', y: '0', height: '10' }));
      expect(element.geometry.x).toBeUndefined();
    });
  });

  it('resolves expressions before applying anchors', () => {
    const { element, diagnostics } = resolveOne(
      node('u8g2gl_label', { right: '#header_height', width: '#parent_width / 2', y: '0', height: '#header_height' }),
    );
    expect(diagnostics).toEqual([]);
    expect(numbers(element)).toMatchObject({ x: 52, width: 64, right: 12, height: 12, bottom: 52 });
  });

  describe('provenance', () => {
    it('carries the attribute, expression and location of a written coordinate', () => {
      const loc = { file: 'screens/screen_home.xml', line: 4, column: 30 };
      const written: WidgetNode = {
        ...node('u8g2gl_label', { x: '0', width: '#screen_width - 8', y: '0', height: '10' }),
        attributeLocs: { width: loc },
      };
      const { element } = resolveOne(written);
      expect(element.geometry.width).toEqual({
        value: 120,
        provenance: { kind: 'attribute', attribute: 'width', expression: '#screen_width - 8', loc },
      });
    });

    it('names the attributes a derived coordinate came from', () => {
      const { element } = resolveOne(node('u8g2gl_label', { hcenter: 'true', width: '40', y: '0', height: '10' }));
      expect(element.geometry.x?.provenance).toMatchObject({ kind: 'derived', attribute: 'x', from: ['hcenter', 'width'] });
      const anchored = resolveOne(node('u8g2gl_label', { right: '0', width: '40', y: '0', height: '10' })).element;
      expect(anchored.geometry.x?.provenance).toMatchObject({ kind: 'derived', attribute: 'x', from: ['width', 'right'] });
      expect(anchored.geometry.right?.provenance).toMatchObject({ kind: 'attribute', attribute: 'right', expression: '0' });
    });
  });

  describe('over-constraint (the existing diagnostic, raised once, here)', () => {
    it('x + width + right: reported, nothing derived', () => {
      const { element, diagnostics } = resolveOne(node('u8g2gl_box', { x: '10', width: '50', right: '20', y: '0', height: '10' }));
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.OVERCONSTRAINED]);
      expect(diagnostics[0]?.message).toContain("horizontal anchors: 'x', 'width', and 'right' are all specified");
      expect(element.geometry.right?.provenance.kind).toBe('attribute');
      expect(element.geometry.right?.value).toBe(20);
    });

    it('hcenter with x, and vcenter with bottom, give an edge two positions', () => {
      const h = resolveOne(node('u8g2gl_label', { hcenter: 'true', x: '5', width: '40', y: '0', height: '10' }));
      expect(h.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.OVERCONSTRAINED]);
      expect(h.diagnostics[0]?.message).toContain("'hcenter' and 'x' are both specified");
      expect(h.element.geometry.x?.value).toBe(5);

      const v = resolveOne(node('u8g2gl_label', { vcenter: 'true', bottom: '0', height: '10', x: '0', width: '10' }));
      expect(v.diagnostics[0]?.message).toContain("vertical anchors: 'vcenter' and 'bottom' are both specified");
    });
  });

  describe('a written coordinate that does not resolve is never replaced by a derived one', () => {
    it('invalid: reported, and the axis is not derived around it', () => {
      const { element, diagnostics } = resolveOne(node('u8g2gl_label', { width: '#nope', right: '0', y: '0', height: '10' }));
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.UNKNOWN_CONSTANT]);
      expect(element.geometry.x).toBeUndefined();
      expect(element.geometry.width).toBeUndefined();
      expect(element.geometry.right?.value).toBe(0);
    });

    it('deferred ($prop): silent, and not derived around', () => {
      const { element, diagnostics } = resolveOne(node('u8g2gl_label', { x: '$offset', right: '0', y: '0', height: '10' }));
      expect(diagnostics).toEqual([]);
      expect(element.geometry.x).toBeUndefined();
      expect(element.geometry.width).toBeUndefined();
    });
  });

  describe('containers', () => {
    it('a container of unknown size resolves literals, defers #parent_*, derives nothing', () => {
      const { element, diagnostics } = resolveOne(
        node('u8g2gl_label', { x: '0', width: '#parent_width - 52', y: '0', height: '#parent_height' }),
        { label: "composite '<status_bar>'" },
      );
      expect(diagnostics).toEqual([]);
      expect(numbers(element)).toEqual({ x: 0, y: 0, width: undefined, height: undefined, right: undefined, bottom: undefined });
    });

    it("a nested element resolves #parent_* and anchors against its parent's resolved size", () => {
      const { element, diagnostics } = resolveOne(
        node('u8g2gl_box', { name: 'panel', x: '0', right: '8', y: '0', height: '20' }, [
          node('u8g2gl_label', {
            name: 'inner',
            hcenter: 'true',
            width: '#parent_width - 100',
            vcenter: 'true',
            height: '#parent_height / 3',
          }),
        ]),
      );
      expect(diagnostics).toEqual([]);
      expect(numbers(element)).toMatchObject({ x: 0, width: 120, height: 20 });
      const inner = element.children[0]!;
      expect(inner.container).toEqual({ label: "containing element '<u8g2gl_box>'", width: 120, height: 20 });
      expect(numbers(inner)).toEqual({ x: 50, width: 20, right: 50, y: 7, height: 6, bottom: 7 });
    });

    it('a parent with only a width gives its children a width and no height', () => {
      const { element, diagnostics } = resolveOne(
        node('u8g2gl_label', { x: '0', width: '60', y: '0' }, [
          node('u8g2gl_label', { name: 'inner', x: '0', width: '#parent_width', y: '0', height: '#parent_height' }),
        ]),
      );
      expect(diagnostics).toEqual([]);
      const inner = element.children[0]!;
      expect(inner.container).toEqual({ label: "containing element '<u8g2gl_label>'", width: 60 });
      expect(inner.geometry.width?.value).toBe(60);
      expect(inner.geometry.height).toBeUndefined();
    });

    it('with no display record, #screen_* are deferred and screen-level anchors are not derived', () => {
      const context = createResolverContext(GLOBALS, REGISTRY, undefined);
      const { elements, diagnostics } = resolveElements(
        [node('u8g2gl_label', { x: '0', width: '#screen_width', y: '0', height: '10' })],
        { label: 'display', ...context.display },
        context,
      );
      expect(diagnostics).toEqual([]);
      expect(numbers(elements[0]!)).toEqual({ x: 0, y: 0, height: 10, width: undefined, right: undefined, bottom: undefined });
    });
  });

  describe('geometry comes from the effective manifest (PR-04 WO3 carry)', () => {
    it('reads no x off an element whose manifest does not declare it', () => {
      const { element } = resolveOne(node('u8g2gl_line', { x: '5', y: '5' }));
      expect(element.geometry.x).toBeUndefined();
      expect(element.geometry.y).toBeUndefined();
    });

    it('reads no geometry off an unknown tag', () => {
      const { element, diagnostics } = resolveOne(node('wd_unknown', { x: '0', width: '#nope', y: '0', height: '10' }));
      expect(diagnostics).toEqual([]);
      expect(numbers(element)).toEqual({ x: undefined, y: undefined, width: undefined, height: undefined, right: undefined, bottom: undefined });
    });

    it('still reads the common anchors', () => {
      const { element } = resolveOne(node('u8g2gl_line', { right: '3' }));
      expect(element.geometry.right?.value).toBe(3);
    });
  });
});

describe('resolveScreens (PR-04 WO6, §7.3)', () => {
  const SCREEN_XML = `<screen name="home">
    <view>
        <u8g2gl_clock name="clock" right="0" y="0" width="40" height="11" />
        <u8g2gl_label name="title" x="4" y="#header_height + 2" width="#screen_width - 8" height="10" />
        <status_bar name="bar" x="0" y="54" width="#screen_width" height="10" />
    </view>
</screen>
`;
  const statusBar: WidgetManifest = {
    name: 'status_bar',
    api: { props: [], bindings: [], elements: [] },
    view: { children: [node('u8g2gl_label', { name: 'loc', x: '0', y: '0', width: '#nope', height: '10' })] },
  };
  const parsed = parseScreenFile(SCREEN_XML, 'screens/screen_home.xml');
  const screen: Screen = parsed.value!;

  function resolveAgainst(display: typeof NARROW) {
    return resolveScreens({ globals: GLOBALS, screens: [screen], manifests: frameworkRegistry([statusBar]), display: display! });
  }

  it('resolves the same screen differently against a 128-wide and a 256-wide target', () => {
    const narrow = resolveAgainst(NARROW);
    const wide = resolveAgainst(WIDE);
    expect(narrow.diagnostics).toEqual([]);
    expect(wide.diagnostics).toEqual([]);

    const [narrowClock, narrowTitle] = narrow.screens[0]!.elements;
    const [wideClock, wideTitle] = wide.screens[0]!.elements;
    // §7.2's own example: x=88 on 128-wide, x=216 on 256-wide.
    expect(narrowClock?.geometry.x?.value).toBe(88);
    expect(wideClock?.geometry.x?.value).toBe(216);
    expect(narrowTitle?.geometry.width?.value).toBe(120);
    expect(wideTitle?.geometry.width?.value).toBe(248);
    expect(narrowTitle?.geometry.y?.value).toBe(14);

    expect(narrow.screens[0]?.container).toEqual({ label: 'display', width: 128, height: 64 });
    expect(wide.screens[0]?.container).toEqual({ label: 'display', width: 256, height: 64 });
  });

  it('keeps document order and the parsed attribute location as provenance', () => {
    const { screens } = resolveAgainst(NARROW);
    expect(screens[0]?.elements.map((e) => e.node.attributes.name)).toEqual(['clock', 'title', 'bar']);
    const width = screens[0]?.elements[1]?.geometry.width?.provenance;
    expect(width).toMatchObject({ kind: 'attribute', expression: '#screen_width - 8', loc: { file: 'screens/screen_home.xml', line: 4 } });
  });

  it("does not enter a composite instance's <view> — expansion is WO7", () => {
    const { screens, diagnostics } = resolveAgainst(NARROW);
    expect(screens[0]?.elements[2]?.children).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
});
