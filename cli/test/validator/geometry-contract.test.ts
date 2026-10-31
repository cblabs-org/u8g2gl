/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/geometry-contract.test.ts
 * Purpose: Pins design_spec §7.2's geometry contract and §13.2's int16_t
 *          coordinate rule (PR-04 WO7b), and the checks WO6 and WO7 left for it:
 *          nothing reaches emission with an absent, wrapped or guessed coordinate,
 *          a value passed into a composite is checked as if written directly, and
 *          a defect in a composite's template is reported once however often the
 *          composite is used.
 * Description: One describe per WORKORDER line item. Real XML is parsed so every
 *              diagnostic carries a real location, and the whole validator runs
 *              against the bundled framework manifests and display catalogue, so
 *              each test also proves no other pass says the same thing again.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { expandScreens } from '../../src/core/resolver/index.js';
import { checkProject, generate, type ProjectModel } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const WIDE = 'U8G2_SH1122_256X64_F_3W_HW_SPI';
const SCREEN_FILE = 'screens/screen_home.xml';

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

/** Globals with `consts` on line 3, an int subject `level` and one builtin font. */
function globals(consts = ''): Globals {
  return parseGlobalsFile(
    `<globals>\n    <consts>\n${consts}\n    </consts>\n    <subjects><int name="level" value="0" /></subjects>\n` +
      `    <fonts><builtin name="u8g2_font_6x10_mr" /></fonts>\n</globals>\n`,
    'globals.xml',
  ).value!;
}

interface RunOptions {
  readonly composites?: readonly WidgetManifest[];
  readonly consts?: string;
}

/** Every diagnostic `validate` gives for a screen holding `body`, against a 128-wide target. */
function run(body: string, options: RunOptions = {}): readonly Diagnostic[] {
  return validate({
    project: { schema: '0.5', name: 'contract', version: '1.0.0', targets: [{ name: 'primary', setup: NARROW }] },
    globals: globals(options.consts),
    screens: [screen(body)],
    manifests: frameworkRegistry(options.composites ?? []),
    catalogue: CATALOGUE,
  }).diagnostics;
}

const withCode = (diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.code === code);
const errors = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.severity === 'error');

describe('the fixtures below start from a clean document', () => {
  it('a fully positioned label validates with no errors', () => {
    expect(errors(run('        <u8g2gl_label name="t" x="0" y="0" width="10" height="5" font="u8g2_font_6x10_mr" />'))).toEqual([]);
  });
});

describe('anchors only on rectangular elements (§7.2)', () => {
  it('reports right on a circle, naming the element and the anchor', () => {
    const found = withCode(
      run('        <u8g2gl_circle name="dot" x="10" y="10" radius="3" right="0" />'),
      DIAGNOSTIC_CODES.INAPPLICABLE_ANCHOR,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', file: SCREEN_FILE, line: 3, offendingText: 'right' });
    expect(found[0]?.message).toContain("Anchor 'right' cannot apply to <u8g2gl_circle> 'dot'");
  });

  it("reports hcenter on a pixel; hcenter='false' uses no anchor", () => {
    const found = withCode(
      run(
        [
          '        <u8g2gl_pixel name="p" x="1" y="1" hcenter="true" />',
          '        <u8g2gl_pixel name="q" x="2" y="1" hcenter="false" />',
        ].join('\n'),
      ),
      DIAGNOSTIC_CODES.INAPPLICABLE_ANCHOR,
    );
    expect(found.map((d) => [d.line, d.offendingText])).toEqual([[3, 'hcenter']]);
    expect(found[0]?.message).toContain("<u8g2gl_pixel> 'p'");
  });

  it('accepts an anchor on an element whose manifest declares x, y, width and height', () => {
    expect(
      errors(run('        <u8g2gl_label name="t" right="0" y="0" width="10" height="5" font="u8g2_font_6x10_mr" />')),
    ).toEqual([]);
  });

  it('reports a template defect once however many instances use it', () => {
    const dots = composite('dots', '', '        <u8g2gl_circle name="dot" x="2" y="2" radius="1" bottom="0" />');
    const found = withCode(
      run(
        [
          '        <dots name="a" x="0" y="0" width="10" height="10" />',
          '        <dots name="b" x="20" y="0" width="10" height="10" />',
        ].join('\n'),
        { composites: [dots] },
      ),
      DIAGNOSTIC_CODES.INAPPLICABLE_ANCHOR,
    );
    expect(found.map((d) => [d.file, d.line])).toEqual([['widgets/dots/dots.xml', 4]]);
  });
});

describe('every element fully positioned (§7.2)', () => {
  it('reports width with neither x nor right, naming the element', () => {
    const found = withCode(
      run('        <u8g2gl_label name="t" width="40" y="0" height="10" />'),
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', file: SCREEN_FILE, line: 3, offendingText: 'x' });
    expect(found[0]?.message).toContain("<u8g2gl_label> 't' is not fully positioned");
    expect(found[0]?.message).toContain("it has 'width' but neither 'x' nor 'right'");
  });

  it('reports a $prop that never substitutes', () => {
    const found = withCode(
      run('        <u8g2gl_label name="p" x="$px" y="0" width="10" height="5" />'),
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
    );
    expect(found.map((d) => d.offendingText)).toEqual(['$px']);
    expect(found[0]?.message).toContain("'x' on <u8g2gl_label> 'p' cannot be resolved: '$px' is never substituted");
  });

  it('reports #parent_height under a parent with no height', () => {
    const found = withCode(
      run(
        [
          '        <u8g2gl_label name="outer" x="0" y="0" width="40">',
          '            <u8g2gl_label name="inner" x="0" y="0" width="10" height="#parent_height" />',
          '        </u8g2gl_label>',
        ].join('\n'),
      ),
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
    );
    expect(found.map((d) => [d.line, d.offendingText])).toEqual([[4, '#parent_height']]);
    expect(found[0]?.message).toContain("'height' on <u8g2gl_label> 'inner' cannot be resolved");
    expect(found[0]?.message).toContain("containing element '<u8g2gl_label>' has no resolved height");
  });

  it('reports an anchor whose container has no size to measure against', () => {
    const found = withCode(
      run(
        [
          '        <u8g2gl_label name="outer" x="0" y="0" height="20">',
          '            <u8g2gl_label name="inner" right="0" width="10" y="0" height="5" />',
          '        </u8g2gl_label>',
        ].join('\n'),
      ),
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
    );
    expect(found.map((d) => [d.line, d.offendingText])).toEqual([[4, 'right']]);
    expect(found[0]?.message).toContain("'x' on <u8g2gl_label> 'inner' cannot be derived from 'right'");
  });

  it('a constant that never resolves is an error, reported once', () => {
    const diagnostics = run('        <u8g2gl_label name="t" x="0" y="#nope" width="10" height="5" />');
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNKNOWN_CONSTANT)).toHaveLength(1);
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNRESOLVED_VALUE)).toEqual([]);
  });

  it('reports a template defect once however many instances use it', () => {
    const loose = composite('loose', '', '        <u8g2gl_label name="l" width="10" y="0" height="5" />');
    const found = withCode(
      run(
        [
          '        <loose name="a" x="0" y="0" width="20" height="10" />',
          '        <loose name="b" x="0" y="20" width="20" height="10" />',
        ].join('\n'),
        { composites: [loose] },
      ),
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
    );
    expect(found.map((d) => [d.file, d.line])).toEqual([['widgets/loose/loose.xml', 4]]);
    expect(found[0]?.message).not.toContain('in instance');
  });

  it('reports an instance whose argument leaves a coordinate unset, naming that instance only', () => {
    const slot = composite(
      'slot',
      '<prop name="px" type="int" />',
      '        <u8g2gl_label name="l" x="$px" y="0" width="5" height="5" />',
    );
    const found = withCode(
      run(
        [
          '        <slot name="a" x="0" y="0" width="20" height="10" px="1" />',
          '        <slot name="b" x="0" y="20" width="20" height="10" />',
        ].join('\n'),
        { composites: [slot] },
      ),
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'widgets/slot/slot.xml', line: 4 });
    expect(found[0]?.message).toContain("in instance 'b' of <slot>");
  });
});

describe('hcenter and vcenter are strict booleans (§7.2)', () => {
  it("reports hcenter='yes', suggesting true and false", () => {
    const found = withCode(
      run('        <u8g2gl_label name="c" hcenter="yes" width="10" y="0" height="5" />'),
      DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: SCREEN_FILE, line: 3, offendingText: 'yes', suggestions: ['true', 'false'] });
    expect(found[0]?.message).toContain("'hcenter' on <u8g2gl_label> 'c'");
  });

  it('checks a substituted value at the element using it, naming the instance', () => {
    const centred = composite(
      'centred',
      '<prop name="centre" type="string" />',
      '        <u8g2gl_label name="l" hcenter="$centre" width="10" y="0" height="5" />',
    );
    const found = withCode(
      run(
        [
          '        <centred name="a" x="0" y="0" width="20" height="10" centre="true" />',
          '        <centred name="b" x="0" y="20" width="20" height="10" centre="maybe" />',
        ].join('\n'),
        { composites: [centred] },
      ),
      DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['widgets/centred/centred.xml', 4, 'maybe']]);
    expect(found[0]?.message).toContain("in instance 'b' of <centred>");
  });
});

describe('built-in constant names are reserved (§7.2)', () => {
  it('reports each reserved name at its declaration', () => {
    const found = withCode(
      run('        <u8g2gl_label name="t" x="0" y="0" width="10" height="5" />', {
        consts: '        <int name="screen_width" value="128" />\n        <int name="parent_height" value="4" />',
      }),
      DIAGNOSTIC_CODES.INVALID_NAME,
    );
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([
      ['globals.xml', 3, 'screen_width'],
      ['globals.xml', 4, 'parent_height'],
    ]);
    expect(found[0]?.message).toContain("Constant name 'screen_width' is reserved");
  });
});

describe('constants are validated where declared (§7.2)', () => {
  const LABEL = '        <u8g2gl_label name="t" x="0" y="0" width="10" height="5" />';

  it('reports an unused <int> whose value is not an integer, at the declaration', () => {
    const found = withCode(run(LABEL, { consts: '        <int name="gap" value="1.5" />' }), DIAGNOSTIC_CODES.NON_INTEGER_CONSTANT);
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['globals.xml', 3, '1.5']]);
    expect(found[0]?.message).toContain("Constant 'gap' is an <int>");
  });

  it('reports an <int> outside int32_t at the declaration', () => {
    const found = withCode(run(LABEL, { consts: '        <int name="huge" value="99999999999" />' }), DIAGNOSTIC_CODES.INTEGER_OVERFLOW);
    expect(found.map((d) => [d.file, d.line])).toEqual([['globals.xml', 3]]);
    expect(found[0]?.message).toContain("Constant 'huge'");
  });

  it('still reports the use, too', () => {
    const found = withCode(
      run('        <u8g2gl_label name="t" x="0" y="#gap" width="10" height="5" />', {
        consts: '        <int name="gap" value="1.5" />',
      }),
      DIAGNOSTIC_CODES.NON_INTEGER_CONSTANT,
    );
    expect(found.map((d) => d.file)).toEqual(['globals.xml', SCREEN_FILE]);
  });
});

describe('bounds for the target being generated (§7.2, §7.3)', () => {
  const PROJECT_XML = `<u8g2gl schema="0.5" name="gen" version="1.0.0">
    <targets>
        <target name="wide" setup="${WIDE}" />
        <target name="narrow" setup="${NARROW}" />
    </targets>
</u8g2gl>
`;

  function model(): ProjectModel {
    const parsed = parseScreenFile(
      `<screen name="home">
    <view>
        <u8g2gl_label name="banner" x="0" y="0" width="200" height="10" font="u8g2_font_6x10_mr" text="Hi" />
    </view>
</screen>
`,
      SCREEN_FILE,
    );
    return {
      project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
      globals: parseGlobalsFile('<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n', 'globals.xml').value!,
      screens: [parsed.value!],
      manifests: frameworkRegistry(),
      catalogue: CATALOGUE,
      loadDiagnostics: parsed.diagnostics,
      hasProjectManifest: true,
    };
  }

  it('validate checks the first target, and says which', () => {
    const checked = checkProject(model(), 'warning');
    expect(checked.errors).toBe(0);
    expect(checked.checkedTarget).toEqual({ name: 'wide', setup: WIDE, display: { width: 256, height: 64 } });
  });

  it('a 256-wide and a 128-wide target give different bounds results for the same screen', () => {
    const wide = generate({ ...model(), target: 'wide', generatorVersion: '9.9.9' });
    const narrow = generate({ ...model(), target: 'narrow', generatorVersion: '9.9.9' });

    expect(wide.errors).toBe(0);
    expect(wide.files.length).toBeGreaterThan(0);

    expect(narrow.files).toEqual([]);
    expect(narrow.target).toBe('narrow');
    expect(narrow.errors).toBe(1);
    const found = withCode(narrow.diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: SCREEN_FILE, line: 3, offendingText: '200' });
    expect(found[0]?.message).toContain("Element '<u8g2gl_label>' extends to x=200, display is 128px wide");
  });
});

describe('coordinates fit int16_t (§13.2)', () => {
  it('reports x=40000, and does not also bounds-check that axis', () => {
    const diagnostics = run('        <u8g2gl_label name="far" x="40000" y="0" width="10" height="5" />');
    const found = withCode(diagnostics, DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: SCREEN_FILE, line: 3, offendingText: '40000' });
    expect(found[0]?.message).toContain("<u8g2gl_label> 'far' resolves to x=40000, outside the int16_t range (-32768..32767)");
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS)).toEqual([]);
  });

  it('checks a value build-time arithmetic produces', () => {
    const diagnostics = run('        <u8g2gl_label name="w" x="0" y="0" width="#screen_width * 300" height="5" />');
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE).map((d) => d.offendingText)).toEqual([
      '#screen_width * 300',
    ]);
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS)).toEqual([]);
  });

  it('a representable value outside its container is a bounds error only', () => {
    const diagnostics = run('        <u8g2gl_label name="o" x="100" y="0" width="100" height="5" />');
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS)).toHaveLength(1);
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE)).toEqual([]);
  });

  it('a value outside int32_t is still the arithmetic overflow, not the coordinate check', () => {
    const diagnostics = run('        <u8g2gl_label name="o" x="3000000000" y="0" width="1" height="5" />');
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.INTEGER_OVERFLOW)).toHaveLength(1);
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE)).toEqual([]);
  });

  it('reports a template defect once however many instances use it', () => {
    const far = composite('far', '', '        <u8g2gl_label name="l" x="40000" y="0" width="1" height="1" />');
    const found = withCode(
      run(
        [
          '        <far name="a" x="0" y="0" width="20" height="10" />',
          '        <far name="b" x="0" y="20" width="20" height="10" />',
        ].join('\n'),
        { composites: [far] },
      ),
      DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE,
    );
    expect(found.map((d) => [d.file, d.line])).toEqual([['widgets/far/far.xml', 4]]);
  });
});

describe('substituted arguments are checked as if written directly (WO7 F4/F5)', () => {
  const badge = composite(
    'badge',
    '<prop name="face" type="font" /><prop name="mode" type="string" />',
    '        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="$face" long_mode="$mode" />',
  );

  it("font='nope' passed to a composite fails at the element using it, naming the instance", () => {
    const diagnostics = run('        <badge name="b" x="0" y="0" width="20" height="10" face="nope" />', { composites: [badge] });
    const found = withCode(diagnostics, DIAGNOSTIC_CODES.UNKNOWN_FONT);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'widgets/badge/badge.xml', line: 4, offendingText: 'nope' });
    expect(found[0]?.message).toContain("Unknown font 'nope'");
    expect(found[0]?.message).toContain("in instance 'b' of <badge>");
  });

  it('an enum value passed to a composite fails the same way', () => {
    const diagnostics = run('        <badge name="b" x="0" y="0" width="20" height="10" mode="wobble" />', { composites: [badge] });
    const found = withCode(diagnostics, DIAGNOSTIC_CODES.INVALID_ENUM_VALUE);
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['widgets/badge/badge.xml', 4, 'wobble']]);
    expect(found[0]?.message).toContain("enum property 'long_mode'");
  });

  it('a declared font passes', () => {
    const diagnostics = run('        <badge name="b" x="0" y="0" width="20" height="10" face="u8g2_font_6x10_mr" />', {
      composites: [badge],
    });
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNKNOWN_FONT)).toEqual([]);
  });

  it('is not said twice when the argument itself is already reported where it is written', () => {
    const chip = composite(
      'chip',
      '<prop name="font" type="font" />',
      '        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="$font" />',
    );
    const found = withCode(
      run('        <chip name="c" x="0" y="0" width="20" height="10" font="nope" />', { composites: [chip] }),
      DIAGNOSTIC_CODES.UNKNOWN_FONT,
    );
    expect(found.map((d) => [d.file, d.line])).toEqual([[SCREEN_FILE, 3]]);
  });

  it('a bad default is the template’s defect, reported once', () => {
    const plate = composite(
      'plate',
      '<prop name="face" type="font" default="nope" />',
      '        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" font="$face" />',
    );
    const found = withCode(
      run(
        [
          '        <plate name="a" x="0" y="0" width="20" height="10" />',
          '        <plate name="b" x="0" y="20" width="20" height="10" />',
        ].join('\n'),
        { composites: [plate] },
      ),
      DIAGNOSTIC_CODES.UNKNOWN_FONT,
    );
    expect(found.map((d) => [d.file, d.line])).toEqual([['widgets/plate/plate.xml', 4]]);
    expect(found[0]?.message).toContain("(the declared default of prop 'face')");
  });
});

describe('hidden="$p" substitutes (WO7 F6)', () => {
  it('the parser keeps a $prop placeholder as text and still booleanises a literal', () => {
    const parsed = screen(
      [
        '        <u8g2gl_label name="h" x="0" y="0" width="1" height="1" hidden="$p" />',
        '        <u8g2gl_label name="v" x="0" y="0" width="1" height="1" hidden="true" />',
      ].join('\n'),
    );
    const [h, v] = (parsed.view?.children ?? []) as WidgetNode[];
    expect(h?.attributes.hidden).toBe('$p');
    expect(v?.attributes.hidden).toBe(true);
  });

  it('expansion substitutes the argument and applies the boolean rule to it', () => {
    const hider = composite(
      'hider',
      '<prop name="hide" type="bool" default="false" />',
      '        <u8g2gl_label name="l" x="0" y="0" width="5" height="5" hidden="$hide" />',
    );
    const expansion = expandScreens({
      globals: globals(),
      screens: [
        screen(
          [
            '        <hider name="a" x="0" y="0" width="20" height="10" hide="true" />',
            '        <hider name="b" x="0" y="20" width="20" height="10" />',
          ].join('\n'),
        ),
      ],
      manifests: frameworkRegistry([hider]),
    });
    const [a, b] = expansion.screens[0]?.elements ?? [];
    expect(a?.children[0]?.node.attributes.hidden).toBe(true);
    expect(b?.children[0]?.node.attributes.hidden).toBe(false);
  });
});

describe('[D-20] bound-geometry rule on the expanded tree (WO7 F7)', () => {
  it('judges an anchor after substitution: only the instance that turns centring on is reported', () => {
    const panel = composite(
      'panel',
      '<prop name="centre" type="string" default="false" />',
      '        <u8g2gl_label name="l" x="0" hcenter="$centre" width="10" y="0" height="5" />',
    );
    const found = withCode(
      run(
        [
          '        <panel name="a" x="0" y="0" width="40" height="10" bind_width="level" centre="false" />',
          '        <panel name="b" x="0" y="20" width="40" height="10" bind_width="level" centre="true" />',
        ].join('\n'),
        { composites: [panel] },
      ),
      DIAGNOSTIC_CODES.BOUND_GEOMETRY_ANCHORED_CHILD,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'widgets/panel/panel.xml', line: 4, offendingText: 'hcenter' });
    expect(found[0]?.message).toContain("Container 'b' <panel> binds its geometry with 'bind_width'");
    expect(found[0]?.message).toContain("in instance 'b' of <panel>");
  });

  it('sees through nested composites, and reports a pair fixed by a template once', () => {
    const inner = composite('inner', '', '        <u8g2gl_label name="l" right="0" y="0" width="5" height="5" />');
    const outer = composite(
      'outer',
      '',
      '        <inner name="in" x="0" y="0" width="20" height="10" bind_width="level" />',
    );
    const found = withCode(
      run(
        [
          '        <outer name="a" x="0" y="0" width="40" height="10" />',
          '        <outer name="b" x="0" y="20" width="40" height="10" />',
        ].join('\n'),
        { composites: [inner, outer] },
      ),
      DIAGNOSTIC_CODES.BOUND_GEOMETRY_ANCHORED_CHILD,
    );
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['widgets/inner/inner.xml', 4, 'right']]);
    expect(found[0]?.message).not.toContain('in instance');
  });
});

describe('an interpolated $prop is an error (WO7 F9, interim)', () => {
  it("reports text='Hi $who' once, naming the prop", () => {
    const greet = composite(
      'greet',
      '<prop name="who" type="string" />',
      '        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" text="Hi $who" />',
    );
    const found = withCode(
      run(
        [
          '        <greet name="a" x="0" y="0" width="20" height="10" who="Ann" />',
          '        <greet name="b" x="0" y="20" width="20" height="10" who="Bob" />',
        ].join('\n'),
        { composites: [greet] },
      ),
      DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
    );
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['widgets/greet/greet.xml', 4, '$who']]);
    expect(found[0]?.message).toContain("'$who' in 'text' on <u8g2gl_label> 'l'");
  });

  it('reports an int prop with no value inside an expression, per instance, and nothing more', () => {
    const gapped = composite(
      'gapped',
      '<prop name="gap" type="int" />',
      '        <u8g2gl_label name="l" x="$gap + 1" y="0" width="5" height="5" />',
    );
    const diagnostics = run(
      [
        '        <gapped name="a" x="0" y="0" width="20" height="10" gap="2" />',
        '        <gapped name="b" x="0" y="20" width="20" height="10" />',
      ].join('\n'),
      { composites: [gapped] },
    );
    const found = withCode(diagnostics, DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("in instance 'b' of <gapped>");
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNRESOLVED_VALUE)).toEqual([]);
  });
});

describe('required with default is a schema error (WO7 F10)', () => {
  it('reports the declaration', () => {
    const req = composite(
      'req',
      '<prop name="title" type="string" required="true" default="x" />',
      '        <u8g2gl_label name="l" x="0" y="0" width="10" height="5" />',
    );
    const found = withCode(
      run('        <u8g2gl_label name="t" x="0" y="0" width="10" height="5" />', { composites: [req] }),
      DIAGNOSTIC_CODES.OVERCONSTRAINED,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'widgets/req/req.xml', line: 2, offendingText: 'required, default' });
    expect(found[0]?.message).toContain("Prop 'title' in composite 'req' declares both required=\"true\" and default=\"x\"");
  });
});
