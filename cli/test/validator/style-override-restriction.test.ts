/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/style-override-restriction.test.ts
 * Purpose: Pins PR-4R WO2: an inline `style_<name>` override is accepted only
 *          when `<name>` is one of §10's nine style properties **and** the
 *          element has a setter for it. Before, any prop with a setter could be
 *          overridden, so `style_text="x"` validated and was emitted as
 *          `set_text`. Two places decide whether an override applies — Pass 4
 *          and the screen model's `styleOverridesOf` — so each case runs both
 *          journeys, and the firmware and editor targets are checked to apply
 *          exactly what the validator accepts. PR-4R WO5 adds the refusal's
 *          suggestion for a prop the element declares (the plain attribute),
 *          and the emitter's own report of which reason refused an override.
 * Description: One in-memory project per case, real XML parsed so diagnostics
 *              carry real locations. The accepted cases are table-driven over
 *              STYLE_PROPERTIES, with each value drawn from the element's own
 *              manifest, so no list of the nine is written here.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseScreenFile } from '../../src/core/parser/index.js';
import { checkProject, generate, type GenerateResult, type ProjectModel } from '../../src/core/generator/index.js';
import { describeScenes, emitScreenUnit } from '../../src/core/generator/emit/index.js';
import { styleOverridesOf, type Placement } from '../../src/core/generator/emit/screen-model.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import { isStyleAttribute, STYLE_ATTRIBUTES, STYLE_PROPERTIES } from '../../src/core/schema/globals.js';
import type { PropDef } from '../../src/core/schema/widget-manifest.js';
import type { ManifestRegistry } from '../../src/core/manifest/index.js';
import type { ValidateResult } from '../../src/core/validator/index.js';
import type { ResolvedElement } from '../../src/core/resolver/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const FONT = 'u8g2_font_6x10_mr';
const REGISTRY = frameworkRegistry();
const LABEL_MANIFEST = REGISTRY.get('u8g2gl_label')!;

/** A label written with `attributes` beside the ones it needs to build. */
function label(attributes: string): string {
  return `        <u8g2gl_label name="l" x="0" y="0" width="40" height="10" font="${FONT}" ${attributes} />`;
}

/** A loaded project whose one screen's view holds `body`. */
function model(body: string): ProjectModel {
  const globals = parseGlobalsFile(
    `<globals>\n    <subjects><int name="level" value="0" /></subjects>\n    <styles></styles>\n` +
      `    <fonts><builtin name="${FONT}" /></fonts>\n</globals>\n`,
    'globals.xml',
  );
  const screen = parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, 'screens/screen_home.xml');
  return {
    project: { schema: '0.4', name: 'overrides', version: '1.0.0', targets: [{ name: 'primary', setup: NARROW }] },
    globals: globals.value!,
    screens: [screen.value!],
    manifests: REGISTRY,
    catalogue: CATALOGUE,
    loadDiagnostics: [...globals.diagnostics, ...screen.diagnostics],
    hasProjectManifest: true,
  };
}

/** Both journeys over one project: `validate` (authoring policy) and `generate`. */
interface Journeys {
  readonly project: ProjectModel;
  readonly validated: ValidateResult;
  readonly generated: GenerateResult;
}

function journeys(body: string): Journeys {
  const project = model(body);
  return {
    project,
    validated: checkProject(project, 'warning'),
    generated: generate({ ...project, generatorVersion: '9.9.9' }),
  };
}

/** Errors only, as `code:offendingText`. */
function errorsOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}:${d.offendingText ?? ''}`);
}

/** The editor target's `style_overrides` for the first element of the one screen. */
function editorOverrides(result: Journeys): readonly { readonly name: string }[] {
  const scene = describeScenes({
    project: {
      project: result.project.project,
      globals: result.project.globals,
      screens: result.project.screens,
      capacities: result.generated.capacities!,
      manifests: REGISTRY,
      assets: new Map(),
      stamp: '',
    },
    realised: result.generated.realised!,
    resolved: result.generated.resolved!,
    manifests: REGISTRY,
    generated: { source: 'u8g2gl.xml', schema: '0.4', generator: '9.9.9', target: 'host' },
  }) as { readonly screens: readonly { readonly elements: readonly { readonly style_overrides: readonly { name: string }[] }[] }[] };
  return scene.screens[0]!.elements[0]!.style_overrides;
}

/** The firmware screen unit's text. */
function screenUnit(result: Journeys): string {
  const unit = result.generated.files.find((file) => file.path.endsWith('ui_screen_home.cpp'));
  expect(unit).toBeDefined();
  return unit!.content;
}

/** A value of `prop`'s own type, spelled as the element's manifest allows. */
function sampleValue(prop: PropDef): string {
  switch (prop.type) {
    case 'bool':
      return 'true';
    case 'int':
      return '1';
    case 'color':
      return 'xor';
    case 'font':
      return FONT;
    case 'enum':
      return (prop.values ?? '').split(',').map((member) => member.trim()).at(-1)!;
    default:
      throw new Error(`no sample value for a ${prop.type} prop`);
  }
}

describe('the rule is stated once, from STYLE_PROPERTIES (§10)', () => {
  it('holds exactly the nine canonical attributes, in table order', () => {
    expect(STYLE_ATTRIBUTES).toEqual(STYLE_PROPERTIES.map((property) => property.attribute));
    expect(STYLE_ATTRIBUTES).toHaveLength(9);
    for (const attribute of STYLE_ATTRIBUTES) {
      expect(isStyleAttribute(attribute)).toBe(true);
    }
  });

  it('does not extend the camelCase aliases to style_*', () => {
    const aliases = STYLE_PROPERTIES.flatMap((property) => property.aliases ?? []);
    expect(aliases.length).toBeGreaterThan(0);
    for (const alias of aliases) {
      expect(isStyleAttribute(alias)).toBe(false);
    }
  });

  it('refuses a setter prop outside the nine', () => {
    expect(isStyleAttribute('text')).toBe(false);
    expect(isStyleAttribute('long_mode')).toBe(false);
    expect(isStyleAttribute('hidden')).toBe(false);
  });
});

describe('each of the nine is accepted on an element that sets it: validated and generated', () => {
  it.each(STYLE_PROPERTIES.map((property) => [property.attribute, property.setter] as const))(
    'style_%s on a u8g2gl_label',
    (attribute, setter) => {
      const prop = LABEL_MANIFEST.api.props.find((candidate) => candidate.name === attribute && candidate.setter !== undefined);
      expect(prop, `u8g2gl_label sets ${attribute}`).toBeDefined();
      const result = journeys(label(`style_${attribute}="${sampleValue(prop!)}"`));

      expect(errorsOf(result.validated.diagnostics)).toEqual([]);
      expect(errorsOf(result.generated.diagnostics)).toEqual([]);
      // Applied by the firmware target through its setter, and by the editor target.
      expect(screenUnit(result)).toContain(`.${setter}(`);
      expect(editorOverrides(result).map((override) => override.name)).toEqual([attribute]);
    },
  );
});

describe('a setter prop outside the nine is refused: UNKNOWN_ATTRIBUTE in both journeys', () => {
  it('style_text="x" on a u8g2gl_label, naming all nine', () => {
    const result = journeys(label('style_text="x"'));
    expect(errorsOf(result.validated.diagnostics)).toEqual([`${DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE}:style_text`]);
    expect(errorsOf(result.generated.diagnostics)).toEqual(errorsOf(result.validated.diagnostics));
    expect(result.generated.files).toEqual([]);

    const refusal = result.validated.diagnostics.find((d) => d.offendingText === 'style_text')!;
    expect(refusal.message).toContain('§10');
    for (const attribute of STYLE_ATTRIBUTES) {
      expect(refusal.message).toContain(attribute);
    }
  });

  it.each(['style_long_mode="dots"', 'style_hidden="true"'])('%s', (attribute) => {
    const written = attribute.slice(0, attribute.indexOf('='));
    const result = journeys(label(attribute));
    expect(errorsOf(result.validated.diagnostics)).toEqual([`${DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE}:${written}`]);
    expect(errorsOf(result.generated.diagnostics)).toEqual(errorsOf(result.validated.diagnostics));
  });

  // PR-4R WO5 R6: suggestions are machine-applicable ([D-16]). For a prop the
  // element declares, the message's remedy is the plain attribute, so that is
  // the one suggestion; the closest of the nine by spelling (style_font for
  // style_text) would rewrite the override into a different property.
  it.each([
    ['style_text="x"', 'text'],
    ['style_long_mode="dots"', 'long_mode'],
  ])('%s, naming a prop the element declares, suggests the plain attribute alone', (written, plain) => {
    const result = journeys(label(written));
    const refusal = result.validated.diagnostics.find((d) => d.offendingText === `style_${plain}`)!;
    expect(refusal.message).toContain(`Write it as the attribute '${plain}' instead.`);
    expect(refusal.suggestions).toEqual([plain]);
  });

  it('an override naming no prop suggests only overrides the element can take, from among the nine', () => {
    const result = journeys(label('style_font_mod="transparent"'));
    const refusal = result.validated.diagnostics.find((d) => d.offendingText === 'style_font_mod')!;
    expect(refusal.message).not.toContain('Write it as the attribute');
    const suggestions = refusal.suggestions ?? [];
    for (const suggestion of suggestions) {
      expect(STYLE_ATTRIBUTES.map((attribute) => `style_${attribute}`)).toContain(suggestion);
    }
    expect(suggestions).toContain('style_font_mode');
  });

  it('style_drawColor stays refused: the aliases are not style_* spellings', () => {
    const result = journeys(label('style_drawColor="xor"'));
    expect(errorsOf(result.validated.diagnostics)).toEqual([`${DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE}:style_drawColor`]);
  });

  it('a refused override does not satisfy a required prop', () => {
    // `glyph` is required and has a setter; only the attribute supplies it now.
    const result = journeys(
      `        <u8g2gl_glyph name="g" x="0" y="0" width="10" height="10" font="${FONT}" style_glyph="65" />`,
    );
    expect(errorsOf(result.validated.diagnostics).sort()).toEqual(
      [`${DIAGNOSTIC_CODES.MISSING_REQUIRED}:glyph`, `${DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE}:style_glyph`].sort(),
    );
    expect(errorsOf(result.generated.diagnostics).sort()).toEqual(errorsOf(result.validated.diagnostics).sort());
  });
});

describe('styleOverridesOf applies the same rule (§10)', () => {
  // styleOverridesOf reads only the manifest and the node's overrides, so the
  // placement's resolved geometry is left out.
  function placementWith(styleOverrides: Record<string, string>): Placement {
    const screen = parseScreenFile(
      `<screen name="home"><view>${label('')}</view></screen>`,
      'screens/screen_home.xml',
    ).value!;
    const node = { ...screen.view.children[0]!, styleOverrides };
    return { manifest: LABEL_MANIFEST, absolute: { node } as unknown as ResolvedElement, origin: { x: 0, y: 0 } };
  }

  it('puts a non-§10 key in unknown and never in applied, even with a setter', () => {
    const overrides = styleOverridesOf(placementWith({ text: 'x', align: 'right', long_mode: 'dots' }));
    expect(overrides.applied.map(({ prop }) => prop.name)).toEqual(['align']);
    expect(overrides.unknown).toEqual(['long_mode', 'text']);
  });

  it('still reports a key the element does not declare', () => {
    expect(styleOverridesOf(placementWith({ sparkle: 'true' })).unknown).toEqual(['sparkle']);
  });
});

describe('emission says which reason refused an override (PR-4R WO5 R5)', () => {
  // Pass 4 refuses both cases first, and generate() stops on its errors, so the
  // emitter's own report is reached only by calling it directly. The document
  // is generated clean, then the override is put on the resolved element the
  // emitter places, so the emitter sees exactly what an unvalidated caller
  // would hand it.
  function emittedWith(
    styleOverrides: Record<string, string>,
    manifests: ManifestRegistry = REGISTRY,
  ): readonly Diagnostic[] {
    const result = journeys(label(''));
    expect(errorsOf(result.generated.diagnostics)).toEqual([]);
    const resolved = result.generated.resolved![0]!;
    const element = resolved.elements.find((candidate) => candidate.node.tag === 'u8g2gl_label')!;
    (element.node as { styleOverrides: Record<string, string> }).styleOverrides = styleOverrides;
    return emitScreenUnit({ realised: result.generated.realised![0]!, resolved, manifests, stamp: '' }).diagnostics;
  }

  it('a setter prop outside the nine is refused as not a style override, not for want of a setter', () => {
    const diagnostics = emittedWith({ text: 'x' });
    expect(errorsOf(diagnostics)).toEqual([`${DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE}:style_text`]);
    expect(diagnostics[0]!.message).toContain('is not a style override');
    expect(diagnostics[0]!.message).toContain(STYLE_ATTRIBUTES.join(', '));
    expect(diagnostics[0]!.message).not.toContain('setter');
  });

  it('one of the nine the element has no setter for is refused for want of a setter (the control)', () => {
    // Every framework element with an object sets all nine, so the label's
    // manifest is served without its `font_mode` prop.
    const withoutFontMode: ManifestRegistry = {
      get: (tag) => {
        const manifest = REGISTRY.get(tag);
        return tag === 'u8g2gl_label' && manifest !== undefined
          ? { ...manifest, api: { ...manifest.api, props: manifest.api.props.filter((prop) => prop.name !== 'font_mode') } }
          : manifest;
      },
      has: (tag) => REGISTRY.has(tag),
      tags: REGISTRY.tags,
      declaredComposites: REGISTRY.declaredComposites,
      declaredWidgets: REGISTRY.declaredWidgets,
      diagnostics: REGISTRY.diagnostics,
    };
    const diagnostics = emittedWith({ font_mode: 'transparent' }, withoutFontMode);
    expect(errorsOf(diagnostics)).toEqual([`${DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE}:style_font_mode`]);
    expect(diagnostics[0]!.message).toContain('no setter to apply it with');
    expect(diagnostics[0]!.message).not.toContain('is not a style override');
  });
});
