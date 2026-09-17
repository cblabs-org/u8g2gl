/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/one-pipeline.test.ts
 * Purpose: Pins PR-04 WO8a: `validate` and `generate` run one pipeline — the
 *          document is expanded once, resolved once, and mangled — and the
 *          checks that single model made possible. Composite expansion used to
 *          run four times per `validate` (WO7b 1) while `generate` resolved a
 *          different, unexpanded tree (WO7 F2), the mangler was built but never
 *          called (WO7 F1), and line, triangle, circle and ellipse coordinates
 *          were never resolved at all (WO7b 2).
 * Description: Real XML is parsed so every diagnostic carries a real location,
 *              and the whole validator runs against the bundled framework
 *              manifests and display catalogue, so each test also proves no
 *              other pass says the same thing twice. The expansion counter wraps
 *              the real `expandScreens`, so it counts what actually ran — a pass
 *              that quietly expands the document for itself fails these tests.
 */

import { describe, expect, it, vi } from 'vitest';

/** Counts real expansions; see the file header. */
const counters = vi.hoisted(() => ({ expansions: 0 }));

vi.mock('../../src/core/resolver/expand.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/resolver/expand.js')>();
  return {
    ...actual,
    expandScreens: (input: Parameters<typeof actual.expandScreens>[0]) => {
      counters.expansions += 1;
      return actual.expandScreens(input);
    },
  };
});

import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { generate, type ProjectModel } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const SCREEN_FILE = 'screens/screen_home.xml';
const FONT = 'u8g2_font_6x10_mr';

/** A screen whose view holds `body`; the body's first line is line 3. */
function screen(body: string): Screen {
  return parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, SCREEN_FILE).value!;
}

/** A composite at widgets/<name>/<name>.xml: props on line 2, the view's first line is line 4. */
function composite(name: string, props: string, view: string): WidgetManifest {
  const file = `widgets/${name}/${name}.xml`;
  const parsed = parseWidgetManifestFile(
    [`<widget name="${name}">`, `    <api>${props}</api>`, '    <view>', view, '    </view>', '</widget>'].join('\n'),
    file,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

/** Globals with one builtin font and one declared style. */
function globals(): Globals {
  return parseGlobalsFile(
    `<globals>\n    <subjects><int name="level" value="0" /></subjects>\n` +
      `    <styles><style name="header" /></styles>\n` +
      `    <fonts><builtin name="${FONT}" /></fonts>\n</globals>\n`,
    'globals.xml',
  ).value!;
}

const PROJECT_XML = `<u8g2gl schema="0.4" name="one_pipeline" version="1.0.0">
    <targets>
        <target name="primary" setup="${NARROW}" />
    </targets>
</u8g2gl>
`;

/** A loaded project holding `body`, ready for `generate` or `validate`. */
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

/** Every diagnostic `validate` gives for a screen holding `body`, against a 128-wide target. */
function run(body: string, composites: readonly WidgetManifest[] = []): readonly Diagnostic[] {
  const model = projectModel(body, composites);
  return validate({
    project: model.project,
    globals: model.globals,
    screens: model.screens,
    manifests: model.manifests,
    catalogue: model.catalogue,
  }).diagnostics;
}

const withCode = (diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.code === code);
const errors = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.severity === 'error');

const LINE = '        <u8g2gl_line name="ln" x1="0" y1="0" x2="10" y2="10" />';

describe('one pipeline: the document is expanded exactly once', () => {
  // Four passes used to expand the document for themselves, and `generate`
  // resolved an unexpanded tree of its own (WO7 F2/F3, WO7b 1/7). These two
  // tests are what stop a fifth expansion being added quietly later.
  it('validate expands once, however many passes need the expanded tree', () => {
    counters.expansions = 0;
    run(`        <u8g2gl_label name="t" x="0" y="0" width="10" height="5" font="${FONT}" />`);
    expect(counters.expansions).toBe(1);
  });

  it('generate expands once, and judges the model it emits from', () => {
    counters.expansions = 0;
    const result = generate({
      ...projectModel(`        <u8g2gl_label name="t" x="0" y="0" width="10" height="5" font="${FONT}" />`),
      generatorVersion: '9.9.9',
    });
    expect(result.errors).toBe(0);
    expect(counters.expansions).toBe(1);
  });

  it("generate's resolved model contains composite interiors, which its own resolve never saw", () => {
    const panel = composite(
      'panel',
      '',
      `        <u8g2gl_label name="inner" x="0" y="0" width="10" height="5" font="${FONT}" />`,
    );
    const result = generate({
      ...projectModel('        <panel name="p" x="4" y="0" width="20" height="10" />', [panel]),
      generatorVersion: '9.9.9',
    });

    expect(result.errors).toBe(0);
    const top = result.resolved?.[0]?.elements[0];
    expect(top?.node.attributes.name).toBe('p');
    // The interior is present, and measured against the instance, not the display.
    expect(top?.children[0]?.node.attributes.name).toBe('inner');
    expect(top?.children[0]?.geometry.x?.value).toBe(0);
    expect(top?.children[0]?.container).toMatchObject({ width: 20, height: 10 });
  });
});

describe('mangling is wired in (WO7 F1)', () => {
  /** `a_b` at screen level beside child `b` of instance `a`. */
  const collidingComposite = composite(
    'wrap',
    '',
    `        <u8g2gl_label name="b" x="0" y="0" width="5" height="5" font="${FONT}" />`,
  );
  const collidingScreen = [
    '        <wrap name="a" x="0" y="0" width="20" height="10" />',
    `        <u8g2gl_label name="a_b" x="0" y="20" width="10" height="5" font="${FONT}" />`,
  ].join('\n');

  it('validate reports the collision as an error naming both sources', () => {
    const found = withCode(run(collidingScreen, [collidingComposite]), DIAGNOSTIC_CODES.NAME_COLLISION);

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('error');
    expect(found[0]?.offendingText).toBe('a_b');
    expect(found[0]?.message).toContain("C++ identifier 'a_b' is generated twice");
    // Both sources, with their locations — the retired one-level check named one.
    expect(found[0]?.message).toContain('widgets/wrap/wrap.xml');
    expect(found[0]?.message).toContain(SCREEN_FILE);
    expect(found[0]?.message).toContain("in instance 'a' of <wrap>");
    expect(found[0]?.message).toContain('never renames');
  });

  it('generate refuses the build on it, writing nothing', () => {
    const result = generate({
      ...projectModel(collidingScreen, [collidingComposite]),
      generatorVersion: '9.9.9',
    });

    expect(result.files).toEqual([]);
    expect(result.errors).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.NAME_COLLISION)).toBe(true);
  });

  it('two names that only collide once mangled are still fine apart', () => {
    const fine = [
      '        <wrap name="a" x="0" y="0" width="20" height="10" />',
      `        <u8g2gl_label name="c_b" x="0" y="20" width="10" height="5" font="${FONT}" />`,
    ].join('\n');
    expect(withCode(run(fine, [collidingComposite]), DIAGNOSTIC_CODES.NAME_COLLISION)).toEqual([]);
  });
});

describe('line and triangle endpoints and circle radii resolve (WO7b 2)', () => {
  it('resolves an expression in an endpoint against the target display', () => {
    expect(errors(run('        <u8g2gl_line name="ln" x1="0" y1="0" x2="#screen_width - 8" y2="10" />'))).toEqual([]);
  });

  it('reports an endpoint outside the display as OUT_OF_BOUNDS', () => {
    const found = withCode(
      run('        <u8g2gl_line name="ln" x1="0" y1="0" x2="200" y2="10" />'),
      DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: SCREEN_FILE, line: 3, offendingText: '200' });
    expect(found[0]?.message).toContain('has x2=200');
    expect(found[0]?.message).toContain('display is 128px wide (0..127)');
  });

  it('reports an endpoint outside int16_t as COORDINATE_OUT_OF_RANGE, and does not then bound it', () => {
    const diagnostics = run('        <u8g2gl_line name="ln" x1="0" y1="0" x2="40000" y2="10" />');
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE)).toHaveLength(1);
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS)).toEqual([]);
  });

  it('reports a malformed endpoint expression, which nothing used to evaluate', () => {
    const found = withCode(
      run('        <u8g2gl_line name="ln" x1="0" y1="0" x2="10 +" y2="10" />'),
      DIAGNOSTIC_CODES.MALFORMED_EXPRESSION,
    );
    expect(found.map((d) => d.offendingText)).toEqual(['10 +']);
  });

  it('resolves a triangle vertex and bounds it', () => {
    const clean = '        <u8g2gl_triangle name="tri" x0="0" y0="0" x1="4" y1="0" x2="2" y2="4" />';
    expect(errors(run(clean))).toEqual([]);

    const found = withCode(
      run('        <u8g2gl_triangle name="tri" x0="0" y0="0" x1="4" y1="90" x2="2" y2="4" />'),
      DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
    );
    expect(found[0]?.message).toContain('has y1=90');
    expect(found[0]?.message).toContain('display is 64px high (0..63)');
  });

  it('reports a negative radius, and leaves a radius unbounded against its container', () => {
    const found = withCode(
      run('        <u8g2gl_circle name="dot" x="10" y="10" radius="-3" />'),
      DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('resolves to radius=-3, which is negative');

    // A radius larger than the display is not a bounds error: what a radius is
    // measured against needs the centre-positioned semantics §7.2 defers.
    expect(errors(run('        <u8g2gl_circle name="dot" x="10" y="10" radius="500" />'))).toEqual([]);
  });

  it('resolves an ellipse rx and ry through the evaluator', () => {
    expect(errors(run('        <u8g2gl_ellipse name="el" x="20" y="20" rx="#screen_width / 32" ry="4" />'))).toEqual([]);
    expect(
      withCode(
        run('        <u8g2gl_ellipse name="el" x="20" y="20" rx="4" ry="3 / 0" />'),
        DIAGNOSTIC_CODES.DIVISION_BY_ZERO,
      ),
    ).toHaveLength(1);
  });

  it('still refuses an anchor on a line — anchors stay rectangular-only (§7.2)', () => {
    const found = withCode(
      run('        <u8g2gl_line name="ln" x1="0" y1="0" x2="10" y2="10" right="0" />'),
      DIAGNOSTIC_CODES.INAPPLICABLE_ANCHOR,
    );
    expect(found.map((d) => d.offendingText)).toEqual(['right']);
    expect(found[0]?.message).toContain('<u8g2gl_line>');
  });
});

describe('hidden is a strict boolean (WO7b 3)', () => {
  const label = (hidden: string): string =>
    `        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="${FONT}" hidden="${hidden}" />`;

  it("reports hidden='yes', which used to become false silently", () => {
    const found = withCode(run(label('yes')), DIAGNOSTIC_CODES.INVALID_ENUM_VALUE);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: SCREEN_FILE, line: 3, offendingText: 'yes', suggestions: ['true', 'false'] });
    expect(found[0]?.message).toContain("'hidden' on <u8g2gl_label> 'l'");
  });

  it('accepts true and false', () => {
    expect(errors(run(label('true')))).toEqual([]);
    expect(errors(run(label('false')))).toEqual([]);
  });

  it("reports a hidden='$p' written in a screen, where nothing can substitute it", () => {
    const found = withCode(run(label('$p')), DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP);
    expect(found.map((d) => d.offendingText)).toEqual(['$p']);
    expect(found[0]?.message).toContain('outside any composite');
  });

  it('still substitutes hidden inside a composite, and checks what arrives', () => {
    const hider = composite(
      'hider',
      '<prop name="hide" type="bool" default="false" />',
      `        <u8g2gl_label name="l" x="0" y="0" width="5" height="5" font="${FONT}" hidden="$hide" />`,
    );
    expect(errors(run('        <hider name="h" x="0" y="0" width="20" height="10" hide="true" />', [hider]))).toEqual([]);

    const found = withCode(
      run('        <hider name="h" x="0" y="0" width="20" height="10" hide="yes" />', [hider]),
      DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(found).toHaveLength(1);
    // Reported once, at the `hide="yes"` the author actually wrote (PR-04 WO9).
    // Until every `type="bool"` prop became strict, `hide` itself was unchecked
    // and the defect surfaced only on the substituted `hidden="$hide"` inside
    // the template — which had to name the instance to be intelligible at all.
    // Checking the argument where it is written is both earlier and more direct,
    // and substituted-values.ts then suppresses the duplicate at the use.
    expect(found[0]?.message).toContain("'hide' on <hider> 'h'");
    expect(found[0]).toMatchObject({ file: SCREEN_FILE, offendingText: 'yes' });
  });
});

describe('a $prop outside a composite is an error (WO7b 4)', () => {
  it('reports one in a font attribute, which used to validate silently', () => {
    const found = withCode(
      run('        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="$f" />'),
      DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', file: SCREEN_FILE, line: 3, offendingText: '$f' });
    expect(found[0]?.message).toContain("'font' on <u8g2gl_label>");
    expect(found[0]?.message).toContain('no props to substitute');
  });

  it('reports one in a style attribute and in an enum attribute', () => {
    const style = withCode(
      run(`        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="${FONT}" style="$s" />`),
      DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
    );
    expect(style.map((d) => d.offendingText)).toEqual(['$s']);

    const enumValue = withCode(
      run(`        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="${FONT}" long_mode="$m" />`),
      DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
    );
    expect(enumValue.map((d) => d.offendingText)).toEqual(['$m']);
  });

  it('reports one in a <style> child, rather than calling it an unknown style', () => {
    const diagnostics = run(
      [
        `        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="${FONT}">`,
        '            <style name="$s" />',
        '        </u8g2gl_label>',
      ].join('\n'),
    );
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP).map((d) => d.offendingText)).toEqual(['$s']);
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNKNOWN_STYLE)).toEqual([]);
  });

  it('says nothing about the same references inside a composite, where they do have a meaning', () => {
    const badge = composite(
      'badge',
      '<prop name="face" type="font" /><prop name="mode" type="enum" values="clip,dots" default="clip" />',
      `        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="$face" long_mode="$mode" />`,
    );
    const diagnostics = run(
      `        <badge name="b" x="0" y="0" width="20" height="10" face="${FONT}" />`,
      [badge],
    );
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP)).toEqual([]);
    expect(errors(diagnostics)).toEqual([]);
  });
});

describe('<style name="$s"> is checked after substitution (WO7b 6)', () => {
  const panel = (): WidgetManifest =>
    composite(
      'panel',
      '<prop name="face" type="style" />',
      [
        `        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="${FONT}">`,
        '            <style name="$face" />',
        '        </u8g2gl_label>',
      ].join('\n'),
    );

  it('reports a style the substituted name does not declare, naming the instance', () => {
    const found = withCode(
      run('        <panel name="c" x="0" y="0" width="20" height="10" face="nope" />', [panel()]),
      DIAGNOSTIC_CODES.UNKNOWN_STYLE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'widgets/panel/panel.xml', offendingText: 'nope' });
    expect(found[0]?.message).toContain("in instance 'c' of <panel>");
  });

  it('accepts a declared style', () => {
    expect(
      withCode(
        run('        <panel name="c" x="0" y="0" width="20" height="10" face="header" />', [panel()]),
        DIAGNOSTIC_CODES.UNKNOWN_STYLE,
      ),
    ).toEqual([]);
  });
});

describe('a prop that is required with a default reports once (WO7b 5)', () => {
  it('reports the declaration only, not every instance that omits it', () => {
    const req = composite(
      'req',
      '<prop name="title" type="string" required="true" default="x" />',
      `        <u8g2gl_label name="l" x="0" y="0" width="5" height="5" font="${FONT}" text="$title" />`,
    );
    const diagnostics = run(
      [
        '        <req name="a" x="0" y="0" width="20" height="10" />',
        '        <req name="b" x="0" y="20" width="20" height="10" />',
      ].join('\n'),
      [req],
    );

    const about = diagnostics.filter((d) => d.offendingText === 'required, default' || d.offendingText === 'title');
    expect(about).toHaveLength(1);
    expect(about[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.OVERCONSTRAINED,
      file: 'widgets/req/req.xml',
      offendingText: 'required, default',
    });
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.MISSING_REQUIRED)).toEqual([]);
  });

  it('still reports a genuinely missing required prop, which has no default to fall back on', () => {
    const strict = composite(
      'strict',
      '<prop name="title" type="string" required="true" />',
      `        <u8g2gl_label name="l" x="0" y="0" width="5" height="5" font="${FONT}" text="$title" />`,
    );
    const found = withCode(
      run('        <strict name="a" x="0" y="0" width="20" height="10" />', [strict]),
      DIAGNOSTIC_CODES.MISSING_REQUIRED,
    );
    expect(found.map((d) => d.offendingText)).toEqual(['title']);
  });
});

describe('the line fixture above is clean, so each failure above is the rule under test', () => {
  it('a fully positioned line validates with no errors', () => {
    expect(errors(run(LINE))).toEqual([]);
  });
});
