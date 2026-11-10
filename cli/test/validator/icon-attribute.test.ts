/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/icon-attribute.test.ts
 * Purpose: Schema 0.6's `icon` on `<api>`, from the attribute an author writes
 *          to the diagnostic they get. The parser keeps what was written
 *          (trimmed, located), the registry does not hand it to a child through
 *          `extends`, and the schema pass accepts a name or alias from the
 *          vendored icon set, refuses anything else with a suggestion when one
 *          is unambiguous, and refuses the attribute in a 0.4 or 0.5 project,
 *          while both of those versions keep validating.
 * Description: Parser and registry cases build manifests from XML strings. The
 *              validator cases start from the `valid` fixture, add one project
 *              widget, and set the project's schema per case, so each assertion
 *              is about the attribute under test and nothing else.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate, type ValidateInput } from '../../src/core/validator/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { buildManifestRegistry, parseFrameworkManifests } from '../../src/core/manifest/index.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';
import ICONS from '../../src/data/icons.json' with { type: 'json' };
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const validDir = resolve(__dirname, 'fixtures', 'valid');
const read = (relative: string): string => readFileSync(resolve(validDir, relative), 'utf-8');

/** Parses a manifest that must parse, naming the failure if it does not. */
function manifestOf(xml: string, file = 'widgets/wd_meter/wd_meter.xml'): WidgetManifest {
  const result = parseWidgetManifestFile(xml, file);
  expect(result.diagnostics).toEqual([]);
  if (result.value === undefined) throw new Error(`${file} did not parse`);
  return result.value;
}

/** A plain project widget whose `<api>` carries `apiAttributes`. */
function meter(apiAttributes: string): WidgetManifest {
  return manifestOf(
    `<widget name="wd_meter" extends="u8g2gl_obj">\n` +
      `  <api ${apiAttributes}>\n` +
      `    <prop name="level" type="int" setter="set_level" />\n` +
      `  </api>\n` +
      `</widget>\n`,
  );
}

/**
 * The `valid` fixture at `schema`, with `extra` added as project manifests and
 * `shipped` registered beside the bundled framework manifests.
 */
function projectWith(
  schema: string,
  extra: readonly WidgetManifest[],
  shipped: readonly WidgetManifest[] = [],
): ValidateInput {
  const project = parseProjectFile(read('u8g2gl.xml'), 'u8g2gl.xml').value!;
  const component = manifestOf(read('widgets/status_bar/status_bar.xml'), 'widgets/status_bar/status_bar.xml');
  const badge = manifestOf(read('widgets/wd_badge/wd_badge.xml'), 'widgets/wd_badge/wd_badge.xml');
  return {
    project: { ...project, schema },
    globals: parseGlobalsFile(read('globals.xml'), 'globals.xml').value!,
    screens: [parseScreenFile(read('screens/screen_home.xml'), 'screens/screen_home.xml').value!],
    manifests: buildManifestRegistry({
      framework: [...parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests, ...shipped],
      project: [component, badge, ...extra],
    }),
    catalogue: CATALOGUE,
  };
}

/** The icon diagnostics a run reports, in report order. */
function iconDiagnostics(input: ValidateInput): ReturnType<typeof validate>['diagnostics'] {
  return validate(input).diagnostics.filter(
    (d) => d.code === DIAGNOSTIC_CODES.INVALID_ICON || d.code === DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED,
  );
}

describe('parsing icon on <api>', () => {
  it('reads the icon, trimmed, with where its name and value start', () => {
    const manifest = meter('icon="  gauge "');
    expect(manifest.api.icon).toBe('gauge');
    // Line 2: `  <api icon="…`; the value starts inside the quotes.
    expect(manifest.api.iconLoc?.name).toMatchObject({ line: 2, column: 8 });
    expect(manifest.api.iconLoc?.value).toMatchObject({ line: 2, column: 14 });
  });

  it('leaves both fields absent when none is written', () => {
    const manifest = meter('');
    expect(manifest.api).not.toHaveProperty('icon');
    expect(manifest.api).not.toHaveProperty('iconLoc');
  });

  it('keeps an empty or blank value as written, for the schema pass to refuse', () => {
    expect(meter('icon=""').api.icon).toBe('');
    expect(meter('icon="   "').api.icon).toBe('');
  });
});

describe('icon is not inherited through extends', () => {
  it('gives a project widget extending a class with an icon none of its own', () => {
    const parent = manifestOf(
      '<widget name="wd_gauge" extends="u8g2gl_obj"><api icon="gauge">' +
        '<prop name="level" type="int" setter="set_level" /></api></widget>',
      'widgets/wd_gauge/wd_gauge.xml',
    );
    const child = manifestOf(
      '<widget name="wd_fuel_gauge" extends="wd_gauge"><api /></widget>',
      'widgets/wd_fuel_gauge/wd_fuel_gauge.xml',
    );
    const registry = frameworkRegistry([parent, child]);

    const effective = registry.get('wd_fuel_gauge');
    // Inheritance did happen — the prop came through — but the icon did not.
    expect(effective?.api.props.map((p) => p.name)).toContain('level');
    expect(effective?.api.icon).toBeUndefined();
    expect(registry.get('wd_gauge')?.api.icon).toBe('gauge');
  });

  it('keeps a child’s own icon rather than its parent’s', () => {
    const parent = manifestOf(
      '<widget name="wd_gauge" extends="u8g2gl_obj"><api icon="gauge" /></widget>',
      'widgets/wd_gauge/wd_gauge.xml',
    );
    const child = manifestOf(
      '<widget name="wd_fuel_gauge" extends="wd_gauge"><api icon="fuel" /></widget>',
      'widgets/wd_fuel_gauge/wd_fuel_gauge.xml',
    );
    expect(frameworkRegistry([parent, child]).get('wd_fuel_gauge')?.api.icon).toBe('fuel');
  });
});

describe('validating icon (schema 0.6)', () => {
  it('accepts a canonical name', () => {
    expect(iconDiagnostics(projectWith('0.6', [meter('icon="train-front"')]))).toEqual([]);
  });

  it('accepts an alias, so a manifest written against a renamed icon keeps validating', () => {
    const [alias, canonical] = Object.entries(ICONS.aliases)[0]!;
    expect(ICONS.names).not.toContain(alias);
    expect(ICONS.names).toContain(canonical);
    expect(iconDiagnostics(projectWith('0.6', [meter(`icon="${alias}"`)]))).toEqual([]);
  });

  it('refuses an unknown name at the value, suggesting the one close match', () => {
    const diagnostics = iconDiagnostics(projectWith('0.6', [meter('icon="train-frnt"')]));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_ICON,
      severity: 'error',
      file: 'widgets/wd_meter/wd_meter.xml',
      line: 2,
      column: 14,
      offendingText: 'train-frnt',
      suggestions: ['train-front'],
    });
    expect(diagnostics[0]?.message).toContain('is not an icon in the vendored Lucide set');
    expect(diagnostics[0]?.message).toContain(ICONS.version);
  });

  it('offers no suggestion when more than one name is as close', () => {
    // `house-plus` and `house-plug` are each one edit away.
    const diagnostics = iconDiagnostics(projectWith('0.6', [meter('icon="house-plux"')]));
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.INVALID_ICON]);
    expect(diagnostics[0]).not.toHaveProperty('suggestions');
  });

  it('offers no suggestion when nothing is close', () => {
    const diagnostics = iconDiagnostics(projectWith('0.6', [meter('icon="zzzzzzzzzz"')]));
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.INVALID_ICON]);
    expect(diagnostics[0]).not.toHaveProperty('suggestions');
  });

  it('refuses an empty icon, and a blank one', () => {
    for (const written of ['', '   ']) {
      const diagnostics = iconDiagnostics(projectWith('0.6', [meter(`icon="${written}"`)]));
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ code: DIAGNOSTIC_CODES.INVALID_ICON, offendingText: 'icon' });
      expect(diagnostics[0]?.message).toContain('is empty');
    }
  });

  it.each(['Train-Front', 'train_front', 'train--front', '-train', 'train front'])(
    'refuses %s as not lowercase kebab-case, without also calling it unknown',
    (written) => {
      const diagnostics = iconDiagnostics(projectWith('0.6', [meter(`icon="${written}"`)]));
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.INVALID_ICON);
      expect(diagnostics[0]?.message).toContain('not lowercase kebab-case');
    },
  );

  it('refuses a name over 48 characters, and judges a 48-character one by the set', () => {
    const over = iconDiagnostics(projectWith('0.6', [meter(`icon="${'a'.repeat(49)}"`)]));
    expect(over).toHaveLength(1);
    expect(over[0]?.message).toContain('is 49 characters, over the limit of 48');

    const atLimit = iconDiagnostics(projectWith('0.6', [meter(`icon="${'a'.repeat(48)}"`)]));
    expect(atLimit[0]?.message).toContain('is not an icon');
  });

  it('reports a composite’s icon as it does a plain widget’s', () => {
    const composite = manifestOf(
      '<widget name="wd_tile"><api icon="nope-nope-nope"><prop name="caption" type="string" default="x" /></api>' +
        '<view><u8g2gl_label name="wd_tile_caption" x="0" y="0" width="20" height="10" font="small_9" ' +
        'text="$caption" /></view></widget>',
      'widgets/wd_tile/wd_tile.xml',
    );
    const diagnostics = iconDiagnostics(projectWith('0.6', [composite]));
    expect(diagnostics.map((d) => [d.code, d.file])).toEqual([
      [DIAGNOSTIC_CODES.INVALID_ICON, 'widgets/wd_tile/wd_tile.xml'],
    ]);
  });

  it('holds the framework’s own manifests to the icon set all the same', () => {
    const framework = manifestOf(
      '<widget name="wd_shipped" extends="u8g2gl_obj"><api icon="not-an-icon-at-all" /></widget>',
      'u8g2gl/manifests/wd_shipped.xml',
    );
    expect(iconDiagnostics(projectWith('0.6', [], [framework])).map((d) => d.code)).toEqual([
      DIAGNOSTIC_CODES.INVALID_ICON,
    ]);
  });
});

describe('schema versions and icon (§15.4)', () => {
  it('accepts 0.4, 0.5 and 0.6 alike for a project that uses no newer vocabulary', () => {
    for (const schema of ['0.4', '0.5', '0.6']) {
      const result = validate(projectWith(schema, [meter('')]));
      expect(result.diagnostics.map((d) => d.code), schema).toEqual([]);
    }
  });

  it.each(['0.4', '0.5'])('gives a %s project one diagnostic for icon, naming schema="0.6"', (schema) => {
    const diagnostics = iconDiagnostics(projectWith(schema, [meter('icon="gauge"')]));

    expect(diagnostics.map((d) => [d.code, d.offendingText])).toEqual([
      [DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED, 'icon'],
    ]);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      file: 'widgets/wd_meter/wd_meter.xml',
      // At the attribute's name: in this version the attribute itself is what is wrong.
      line: 2,
      column: 8,
    });
    expect(diagnostics[0]?.message).toContain('schema="0.6"');
    expect(diagnostics[0]?.message).toContain(`schema '${schema}'`);
  });

  it('does not also judge the value in a 0.5 project: the version is the one thing to fix', () => {
    const diagnostics = iconDiagnostics(projectWith('0.5', [meter('icon=""')]));
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED]);
  });

  it('gives a 0.4 project using both newer vocabularies one diagnostic per attribute, each naming its version', () => {
    const diagnostics = iconDiagnostics(projectWith('0.4', [meter('label="Meter" icon="gauge"')]));
    expect(diagnostics.map((d) => [d.offendingText, d.message.includes('schema="0.5"'), d.message.includes('schema="0.6"')])).toEqual([
      ['label', true, false],
      ['icon', false, true],
    ]);
  });

  it('does not hold the framework’s own manifests to a 0.5 project’s version', () => {
    const framework = manifestOf(
      '<widget name="wd_shipped" extends="u8g2gl_obj"><api icon="gauge" /></widget>',
      'u8g2gl/manifests/wd_shipped.xml',
    );
    expect(iconDiagnostics(projectWith('0.5', [], [framework]))).toEqual([]);
    // The same manifest as a project's own is held to the version.
    expect(iconDiagnostics(projectWith('0.5', [framework])).map((d) => d.code)).toEqual([
      DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED,
    ]);
  });

  it('keeps refusing 0.3 with its migration table', () => {
    const diagnostics = validate(projectWith('0.3', [])).diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.DEPRECATED_SCHEMA_VERSION,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('long_mode="clip"');
  });
});
