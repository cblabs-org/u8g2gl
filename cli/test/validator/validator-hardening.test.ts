/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/validator-hardening.test.ts
 * Purpose: Pins PR-04 WO11b: `validate` never passes a document `generate`
 *          refuses, never refuses one `generate` can build, and no mistake reaches
 *          emission silently. Each gap was found by WO9, WO10, WO10b or WO11, and
 *          two are the Chief Architect's rulings of 2026-09-19 (1c and 6).
 * Description: One describe per WORKORDER line item. Every case that concerns the
 *              journey split runs **both** journeys over one in-memory project —
 *              `checkProject` at the authoring policy, exactly as `validate` runs,
 *              and `generate` itself — so the assertion is that they agree, not
 *              merely that one of them says something. Real XML is parsed, so
 *              every diagnostic carries a real location.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate, type ValidateResult } from '../../src/core/validator/index.js';
import { checkProject, generate, type GenerateResult, type ProjectModel } from '../../src/core/generator/index.js';
import { GEOMETRY_BINDINGS } from '../../src/core/resolver/index.js';
import { POSITION_BINDINGS } from '../../src/core/generator/emit/placement.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const SCREEN_FILE = 'screens/screen_home.xml';
const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The globals every case starts from; `extra` is spliced into `<globals>`. */
const DEFAULT_SUBJECTS =
  '<int name="level" value="0" /><int name="offset" value="3" /><string name="station" max_len="16" />' +
  '<bool name="wifi" value="true" /><time name="clock" value="0" />';

interface ProjectOptions {
  /** Replaces the default `<subjects>` body. */
  readonly subjects?: string;
  /** `<styles>` body. */
  readonly styles?: string;
  /** `<fonts>` body; defaults to one real U8G2 built-in. */
  readonly fonts?: string;
  /** Composite manifests, as XML text keyed by name. */
  readonly composites?: readonly WidgetManifest[];
  /** The screen's own `<styles>` block, if any. */
  readonly screenStyles?: string;
}

/** A composite at widgets/<name>/<name>.xml. */
function composite(name: string, props: string, view: string): WidgetManifest {
  const parsed = parseWidgetManifestFile(
    [`<widget name="${name}">`, `    <api>${props}</api>`, '    <view>', view, '    </view>', '</widget>'].join('\n'),
    `widgets/${name}/${name}.xml`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

/** A loaded project whose one screen's view holds `body`. */
function model(body: string, options: ProjectOptions = {}): ProjectModel {
  const globals = parseGlobalsFile(
    `<globals>\n    <subjects>${options.subjects ?? DEFAULT_SUBJECTS}</subjects>\n` +
      `    <styles>${options.styles ?? ''}</styles>\n` +
      `    <fonts>${options.fonts ?? '<builtin name="u8g2_font_6x10_mr" />'}</fonts>\n</globals>\n`,
    'globals.xml',
  );
  const screen = parseScreenFile(
    `<screen name="home">\n${options.screenStyles ?? ''}    <view>\n${body}\n    </view>\n</screen>\n`,
    SCREEN_FILE,
  );
  return {
    project: { schema: '0.4', name: 'hardening', version: '1.0.0', targets: [{ name: 'primary', setup: NARROW }] },
    globals: globals.value!,
    screens: [screen.value!],
    manifests: frameworkRegistry(options.composites ?? []),
    catalogue: CATALOGUE,
    loadDiagnostics: [...globals.diagnostics, ...screen.diagnostics],
    hasProjectManifest: true,
  };
}

/** Both journeys over one project: `validate` (authoring policy) and `generate`. */
interface Journeys {
  readonly validated: ValidateResult;
  readonly generated: GenerateResult;
}

function journeys(body: string, options: ProjectOptions = {}): Journeys {
  const project = model(body, options);
  return {
    validated: checkProject(project, 'warning'),
    generated: generate({ ...project, generatorVersion: '9.9.9' }),
  };
}

/** Errors only, as `code@line`, for compact assertions. */
function errorsOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}@${d.line}`);
}

/** Error codes only. */
function errorCodes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
}

/**
 * The journey split holds: `validate` refuses exactly when `generate` does, and
 * with the same error — so neither passes what the other refuses.
 */
function expectAgreement(result: Journeys): void {
  expect(errorsOf(result.validated.diagnostics)).toEqual(errorsOf(result.generated.diagnostics));
  if (result.validated.errors === 0) {
    expect(result.generated.files.length).toBeGreaterThan(0);
  }
}

/** Every `.ts` file under a directory, as paths relative to the CLI root. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      out.push(relative(CLI_ROOT, path));
    }
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// Two renames (WO9 f7, WO8c f3)
// ---------------------------------------------------------------------------

describe('two renames, codes stable (WO9 f7, WO8c f3)', () => {
  it('the constant is UNRESOLVED_VALUE, and the public code string is unchanged', () => {
    expect(DIAGNOSTIC_CODES.UNRESOLVED_VALUE).toBe('U8G2GL_UNRESOLVED_GEOMETRY');
    expect(Object.keys(DIAGNOSTIC_CODES)).not.toContain('UNRESOLVED_GEOMETRY');
  });

  it("refusalPolicy sets the severity of realisation's refusal as well as a not-yet-supported one", () => {
    const project = model(
      '        <u8g2gl_box name="b" x="0" y="0" width="4" height="4"><u8g2gl_box name="inner" x="0" y="0" width="1" height="1" /></u8g2gl_box>\n' +
        '        <u8g2gl_label name="l" x="0" y="10" width="20" height="10" font="u8g2_font_6x10_mr"><event_cb trigger="press" callback="on_press" /></u8g2gl_label>',
    );
    const severities = (policy: 'warning' | 'error'): string[] =>
      validate({ ...project, refusalPolicy: policy })
        .diagnostics.filter(
          (d) =>
            d.code === DIAGNOSTIC_CODES.NOT_YET_SUPPORTED || d.code === DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT,
        )
        .map((d) => `${d.code}:${d.severity}`)
        .sort();
    expect(severities('error')).toEqual([
      'U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT:error',
      'U8G2GL_NOT_YET_SUPPORTED:error',
    ]);
    expect(severities('warning')).toEqual([
      'U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT:warning',
      'U8G2GL_NOT_YET_SUPPORTED:warning',
    ]);
  });
});

// ---------------------------------------------------------------------------
// One table of geometry bindings (WO10b f2)
// ---------------------------------------------------------------------------

describe('one table of geometry bindings (WO10b f2)', () => {
  it('names [D-20]’s four bindings, and placement’s position table is derived from it', () => {
    expect(GEOMETRY_BINDINGS.map((entry) => `${entry.binding}:${entry.attribute}:${entry.kind}`)).toEqual([
      'bind_x:x:position',
      'bind_y:y:position',
      'bind_width:width:size',
      'bind_height:height:size',
    ]);
    expect(POSITION_BINDINGS).toEqual({ bind_x: 'x', bind_y: 'y' });
  });

  it('no other core source spells the set: no binding-name literal, no `bind_${axis}` template', () => {
    const table = join('src', 'core', 'resolver', 'geometry-bindings.ts');
    const spellings = /'bind_(x|y|width|height)'|`bind_\$\{/;
    const offenders = sourceFiles(join(CLI_ROOT, 'src', 'core')).filter(
      (file) => file !== table && spellings.test(readFileSync(join(CLI_ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A missing size (WO10 SR2)
// ---------------------------------------------------------------------------

/** The emitted screen unit, from a successful generate. */
function screenUnit(result: Journeys): string {
  return result.generated.files.find((file) => file.path === 'ui_screen_home.cpp')?.content ?? '';
}

describe('a missing size is an error in validate, as in generate (WO10 SR2)', () => {
  it('a drawing element with no width and no bind_width: both journeys refuse it, alike', () => {
    const result = journeys('        <u8g2gl_box name="bar" x="4" y="20" height="6" />');
    expectAgreement(result);
    expect(errorCodes(result.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.MISSING_REQUIRED]);
    expect(result.validated.diagnostics[0]?.offendingText).toBe('width');
  });

  it('an object with no width: both refuse it (generate used to throw from the screen model)', () => {
    const result = journeys(
      '        <u8g2gl_label name="l" x="0" y="0" height="10" font="u8g2_font_6x10_mr" text="hi" />',
    );
    expectAgreement(result);
    expect(errorCodes(result.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.MISSING_REQUIRED]);
  });

  it('a composite instance with no height is a container with no size: refused', () => {
    const card = composite('card', '', '        <u8g2gl_box name="fill" x="0" y="0" width="4" height="4" />');
    const result = journeys('        <card name="c" x="0" y="0" width="20" />', { composites: [card] });
    expectAgreement(result);
    expect(errorCodes(result.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.MISSING_REQUIRED]);
  });

  it('a bound size, an anchor-derived size and a draw default all supply one (controls)', () => {
    const result = journeys(
      [
        '        <u8g2gl_box name="bound" x="4" y="20" height="6" bind_width="level" />',
        '        <u8g2gl_box name="anchored" x="4" right="4" y="30" height="6" />',
        '        <u8g2gl_hline name="rule" x="0" y="40" width="10" />',
      ].join('\n'),
    );
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bound or styled values satisfy `required` (WO10b f1)
// ---------------------------------------------------------------------------

describe('a binding or a named style satisfies required (WO10b f1)', () => {
  it('bind_x with no literal x: both journeys build it, and the draw call reads the subject', () => {
    const result = journeys('        <u8g2gl_box name="dot" bind_x="offset" y="40" width="2" height="2" />');
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
    expect(screenUnit(result)).toContain('u8g2gl_draw_box(display, ui_subject_offset.get(), 40, 2, 2, true, 0);');
  });

  it('bind_y on an object with no literal y: built, the axis passed as 0 and set by its binding', () => {
    const result = journeys(
      '        <u8g2gl_label name="l" x="0" bind_y="offset" width="20" height="10" font="u8g2_font_6x10_mr" />',
    );
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
    expect(screenUnit(result)).toContain('ui_obj_l.set_coords(0, 0, 20, 10);  // y: set by its binding below');
    expect(screenUnit(result)).toContain('ui_obj_l.bind_y(&ui_subject_offset, 0);');
  });

  it("a named style's font satisfies a label's required font — by attribute, by <style> child, or style_font", () => {
    const result = journeys(
      [
        '        <u8g2gl_label name="a" x="0" y="0" width="20" height="10" style="loud" />',
        '        <u8g2gl_label name="b" x="0" y="10" width="20" height="10"><style name="loud" /></u8g2gl_label>',
        '        <u8g2gl_label name="c" x="0" y="20" width="20" height="10" style_font="u8g2_font_6x10_mr" />',
      ].join('\n'),
      { styles: '<style name="loud" font="u8g2_font_6x10_mr" />' },
    );
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
  });

  it("a screen's own style supplies it too, overriding a global one of the same name", () => {
    const result = journeys('        <u8g2gl_label name="a" x="0" y="0" width="20" height="10" style="loud" />', {
      styles: '<style name="loud" align="center" />',
      screenStyles: '    <styles><style name="loud" font="u8g2_font_6x10_mr" /></styles>\n',
    });
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
  });

  it('a style that sets no font does not (the control)', () => {
    const result = journeys('        <u8g2gl_label name="a" x="0" y="0" width="20" height="10" style="plain" />', {
      styles: '<style name="plain" align="center" />',
    });
    expect(errorCodes(result.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.MISSING_REQUIRED]);
  });

  it('a style passed into a composite is judged per instance, once its name is known', () => {
    const tag = composite(
      'tag',
      '<prop name="look" type="style" default="loud" />',
      '        <u8g2gl_label name="text" x="0" y="0" width="20" height="10"><style name="$look" /></u8g2gl_label>',
    );
    const options = {
      composites: [tag],
      styles: '<style name="loud" font="u8g2_font_6x10_mr" /><style name="plain" align="center" />',
    };
    const good = journeys('        <tag name="t" x="0" y="0" width="20" height="10" />', options);
    expectAgreement(good);
    expect(good.validated.errors).toBe(0);
    const bad = journeys('        <tag name="t" x="0" y="0" width="20" height="10" look="plain" />', options);
    expect(errorCodes(bad.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.MISSING_REQUIRED]);
  });
});

// ---------------------------------------------------------------------------
// Ruling 6 — bounds-check what is drawn (Chief Architect, 2026-09-19; §7.2)
// ---------------------------------------------------------------------------

/** OUT_OF_BOUNDS diagnostics, as `offendingText@line`. */
function outOfBounds(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics
    .filter((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS)
    .map((d) => `${d.offendingText ?? ''}@${d.line}`);
}

describe('ruling 6: what is drawn is bounds-checked (§7.2)', () => {
  it('a quarter-circle at a display corner passes, in both journeys, at every corner', () => {
    const result = journeys(
      [
        '        <u8g2gl_circle name="tl" x="0" y="0" radius="10" segments="lower_right" />',
        '        <u8g2gl_circle name="br" x="127" y="63" radius="10" segments="upper_left" />',
        '        <u8g2gl_ellipse name="tr" x="127" y="0" rx="12" ry="6" segments="lower_left" />',
        '        <u8g2gl_ellipse name="bl" x="0" y="63" rx="12" ry="6" segments="upper_right" />',
      ].join('\n'),
    );
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
  });

  it('the whole circle at the same corner does not: it draws off the left and top edges', () => {
    const result = journeys('        <u8g2gl_circle name="tl" x="0" y="0" radius="10" />');
    expectAgreement(result);
    expect(outOfBounds(result.validated.diagnostics)).toEqual(['10@3', '10@3']);
    expect(result.validated.diagnostics[0]?.message).toContain("draws to x=-10 (x - radius");
  });

  it('a radius larger than the display is refused (closes WO8a finding 1)', () => {
    const result = journeys('        <u8g2gl_circle name="c" x="64" y="32" radius="500" />');
    expectAgreement(result);
    expect(outOfBounds(result.validated.diagnostics)).toHaveLength(4);
  });

  it('an ellipse is bounded per axis by rx and ry', () => {
    const result = journeys('        <u8g2gl_ellipse name="e" x="64" y="32" rx="10" ry="40" />');
    expectAgreement(result);
    expect(outOfBounds(result.validated.diagnostics)).toEqual(['40@3', '40@3']);
  });

  it('a pixel is a 1×1 box: one past the edge is refused, the last pixel is not', () => {
    const inside = journeys('        <u8g2gl_pixel name="p" x="127" y="63" />');
    expectAgreement(inside);
    expect(inside.validated.errors).toBe(0);
    const outside = journeys('        <u8g2gl_pixel name="p" x="128" y="20" />');
    expectAgreement(outside);
    expect(outOfBounds(outside.validated.diagnostics)).toEqual(['128@3']);
  });

  it('an hline is one pixel high, so its y is bounded too', () => {
    const result = journeys('        <u8g2gl_hline name="h" x="0" y="64" width="10" />');
    expectAgreement(result);
    expect(outOfBounds(result.validated.diagnostics)).toEqual(['64@3']);
  });

  it('a line and a triangle are bounded by the box around their points', () => {
    const result = journeys(
      [
        '        <u8g2gl_line name="l" x1="0" y1="0" x2="127" y2="63" />',
        '        <u8g2gl_triangle name="t" x0="0" y0="0" x1="130" y1="0" x2="2" y2="4" />',
      ].join('\n'),
    );
    expectAgreement(result);
    expect(outOfBounds(result.validated.diagnostics)).toEqual(['130@4']);
  });

  it('is measured against the containing element, for the target generated', () => {
    const badge = composite('badge', '', '        <u8g2gl_circle name="dot" x="10" y="10" radius="12" />');
    const result = journeys('        <badge name="b" x="0" y="0" width="20" height="20" />', { composites: [badge] });
    expectAgreement(result);
    expect(result.validated.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS)).toHaveLength(4);
    expect(result.validated.diagnostics[0]?.message).toContain("containing element '<badge>' is 20px");
  });

  it('a bound centre is not measured at build time (the control)', () => {
    const result = journeys('        <u8g2gl_circle name="c" bind_x="level" y="32" radius="10" />');
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
  });

  it('the segment table exists once: no other core source spells a segment name', () => {
    const table = join('src', 'core', 'resolver', 'drawn-extent.ts');
    const offenders = sourceFiles(join(CLI_ROOT, 'src', 'core')).filter(
      (file) => file !== table && /'(upper|lower)_(left|right)'/.test(readFileSync(join(CLI_ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ruling 1c — a container whose position is bound has no children
// ---------------------------------------------------------------------------

describe('ruling 1c: a container whose position is bound may have no children (§7.2, Q-16)', () => {
  const panel = composite('panel', '', '        <u8g2gl_box name="fill" x="0" y="0" width="4" height="4" />');

  it('a composite instance with bind_x is a container with children: both journeys refuse it', () => {
    const result = journeys('        <panel name="p" x="0" bind_x="offset" y="0" width="20" height="20" />', {
      composites: [panel],
    });
    expectAgreement(result);
    const found = result.validated.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.BOUND_POSITION_HAS_CHILDREN);
    expect(found.map((d) => `${d.offendingText ?? ''}@${d.line}`)).toEqual(['bind_x@3']);
    expect(found[0]?.message).toContain('no reflow yet');
    expect(found[0]?.message).toContain('Q-16');
    expect(errorCodes(result.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.BOUND_POSITION_HAS_CHILDREN]);
  });

  it('so does an object with bind_y and an element written inside it', () => {
    const result = journeys(
      '        <u8g2gl_label name="l" x="0" bind_y="offset" width="40" height="20" font="u8g2_font_6x10_mr">\n' +
        '            <u8g2gl_box name="b" x="0" y="0" width="2" height="2" />\n' +
        '        </u8g2gl_label>',
    );
    expectAgreement(result);
    expect(errorCodes(result.validated.diagnostics)).toEqual([DIAGNOSTIC_CODES.BOUND_POSITION_HAS_CHILDREN]);
  });

  it('inside a template, it is the template’s defect: reported once for two instances', () => {
    const frame = composite(
      'frame',
      '',
      '        <panel name="inner" x="0" bind_x="offset" y="0" width="10" height="10" />',
    );
    const result = journeys(
      [
        '        <frame name="a" x="0" y="0" width="20" height="20" />',
        '        <frame name="b" x="30" y="0" width="20" height="20" />',
      ].join('\n'),
      { composites: [panel, frame] },
    );
    expectAgreement(result);
    const found = result.validated.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.BOUND_POSITION_HAS_CHILDREN);
    expect(found.map((d) => d.file)).toEqual(['widgets/frame/frame.xml']);
  });

  it('a bound size keeps the anchored-child rule, and a childless bound position is fine (controls)', () => {
    const result = journeys(
      [
        '        <panel name="sized" x="0" y="0" bind_width="level" height="20" />',
        '        <u8g2gl_box name="alone" bind_x="offset" y="30" width="2" height="2" />',
      ].join('\n'),
      { composites: [panel] },
    );
    expectAgreement(result);
    expect(result.validated.errors).toBe(0);
  });
});
