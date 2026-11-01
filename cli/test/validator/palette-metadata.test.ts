/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/palette-metadata.test.ts
 * Purpose: Schema 0.5's palette metadata — `label`, `category` and
 *          `description` on `<api>` — from the attribute an author writes to
 *          the diagnostic they get. Three things have to hold together: the
 *          parser keeps what was written (trimmed, located), the registry does
 *          not hand it to a child through `extends`, and the schema pass
 *          enforces the limits and refuses the attributes in a project still
 *          declaring 0.4, while 0.4 itself keeps validating.
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

/** The palette metadata diagnostics a run reports, in report order. */
function metadataDiagnostics(input: ValidateInput): ReturnType<typeof validate>['diagnostics'] {
  return validate(input).diagnostics.filter(
    (d) =>
      d.code === DIAGNOSTIC_CODES.INVALID_PALETTE_METADATA || d.code === DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED,
  );
}

describe('parsing palette metadata on <api>', () => {
  it('reads label, category and description, trimmed, with where each value starts', () => {
    const manifest = meter('label="  Meter " category="Indicators" description=" A bar showing a level. "');

    expect(manifest.api.label).toBe('Meter');
    expect(manifest.api.category).toBe('Indicators');
    expect(manifest.api.description).toBe('A bar showing a level.');
    // Line 2: `  <api label="…`; the value starts inside the quotes.
    expect(manifest.api.metadataLocs?.label?.name).toMatchObject({ line: 2, column: 8 });
    expect(manifest.api.metadataLocs?.label?.value).toMatchObject({ line: 2, column: 15 });
  });

  it('leaves every field absent when none is written', () => {
    const manifest = meter('');
    expect(manifest.api).not.toHaveProperty('label');
    expect(manifest.api).not.toHaveProperty('category');
    expect(manifest.api).not.toHaveProperty('description');
    expect(manifest.api).not.toHaveProperty('metadataLocs');
  });

  it('keeps an empty or blank value as written, for the schema pass to refuse', () => {
    const manifest = meter('label="" category="   "');
    expect(manifest.api.label).toBe('');
    expect(manifest.api.category).toBe('');
    expect(manifest.api).not.toHaveProperty('description');
  });
});

describe('palette metadata is not inherited through extends', () => {
  it('gives a project widget extending a labelled class none of its parent’s metadata', () => {
    const parent = manifestOf(
      '<widget name="wd_gauge" extends="u8g2gl_obj"><api label="Gauge" category="Indicators" ' +
        'description="A round dial."><prop name="level" type="int" setter="set_level" /></api></widget>',
      'widgets/wd_gauge/wd_gauge.xml',
    );
    const child = manifestOf(
      '<widget name="wd_fuel_gauge" extends="wd_gauge"><api /></widget>',
      'widgets/wd_fuel_gauge/wd_fuel_gauge.xml',
    );
    const registry = frameworkRegistry([parent, child]);

    const effective = registry.get('wd_fuel_gauge');
    // Inheritance did happen — the prop came through — but the metadata did not.
    expect(effective?.api.props.map((p) => p.name)).toContain('level');
    expect(effective?.api.label).toBeUndefined();
    expect(effective?.api.category).toBeUndefined();
    expect(effective?.api.description).toBeUndefined();
    expect(registry.get('wd_gauge')?.api.label).toBe('Gauge');
  });

  it('keeps a child’s own metadata rather than its parent’s', () => {
    const child = manifestOf(
      '<widget name="wd_fuel" extends="u8g2gl_obj"><api label="Fuel" /></widget>',
      'widgets/wd_fuel/wd_fuel.xml',
    );
    expect(frameworkRegistry([child]).get('wd_fuel')?.api.label).toBe('Fuel');
  });
});

describe('validating palette metadata (schema 0.5)', () => {
  it('accepts all three within their limits', () => {
    const manifest = meter(
      `label="${'L'.repeat(32)}" category="${'C'.repeat(24)}" description="${'D'.repeat(120)}"`,
    );
    expect(metadataDiagnostics(projectWith('0.5', [manifest]))).toEqual([]);
  });

  it('counts characters, not UTF-16 units, so a 32-character label with an emoji passes', () => {
    const manifest = meter(`label="${'L'.repeat(31)}🚆"`);
    expect(metadataDiagnostics(projectWith('0.5', [manifest]))).toEqual([]);
  });

  it.each([
    ['label', 33, 32],
    ['category', 25, 24],
    ['description', 121, 120],
  ])('refuses a %s of %i characters, over its limit of %i, at the value', (key, length, limit) => {
    const value = 'x'.repeat(length);
    const diagnostics = metadataDiagnostics(projectWith('0.5', [meter(`${key}="${value}"`)]));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_PALETTE_METADATA,
      severity: 'error',
      file: 'widgets/wd_meter/wd_meter.xml',
      line: 2,
      // `  <api ` puts the name at column 8, and the value after `="`.
      column: 8 + key.length + 2,
      offendingText: value,
    });
    expect(diagnostics[0]?.message).toContain(`is ${length} characters, over the limit of ${limit}`);
    expect(diagnostics[0]?.message).toContain(`<api ${key}>`);
  });

  it.each(['label', 'category', 'description'])('refuses an empty %s, and a blank one', (key) => {
    for (const written of ['', '   ']) {
      const diagnostics = metadataDiagnostics(projectWith('0.5', [meter(`${key}="${written}"`)]));
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ code: DIAGNOSTIC_CODES.INVALID_PALETTE_METADATA, offendingText: key });
      expect(diagnostics[0]?.message).toContain('is empty');
    }
  });

  it('refuses a description over more than one line, and does not trim the break away from inside', () => {
    const diagnostics = metadataDiagnostics(projectWith('0.5', [meter('description="A bar.\n  Shows a level."')]));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.INVALID_PALETTE_METADATA);
    expect(diagnostics[0]?.message).toContain('more than one line');
  });

  it('accepts a value whose only line breaks are leading or trailing, since they trim away', () => {
    expect(metadataDiagnostics(projectWith('0.5', [meter('label="\n  Meter\n"')]))).toEqual([]);
  });

  it('reports a composite’s metadata as it does a plain widget’s', () => {
    const composite = manifestOf(
      '<widget name="wd_tile"><api label=""><prop name="caption" type="string" default="x" /></api>' +
        '<view><u8g2gl_label name="wd_tile_caption" x="0" y="0" width="20" height="10" font="small_9" ' +
        'text="$caption" /></view></widget>',
      'widgets/wd_tile/wd_tile.xml',
    );
    const diagnostics = metadataDiagnostics(projectWith('0.5', [composite]));
    expect(diagnostics.map((d) => [d.code, d.file])).toEqual([
      [DIAGNOSTIC_CODES.INVALID_PALETTE_METADATA, 'widgets/wd_tile/wd_tile.xml'],
    ]);
  });

  it('reports one manifest’s problems each at its own attribute, in source order', () => {
    const diagnostics = metadataDiagnostics(
      projectWith('0.5', [meter(`description="" category="${'c'.repeat(30)}" label=""`)]),
    );
    // The run's diagnostics are sorted by position (§13.9), not by attribute.
    expect(diagnostics.map((d) => d.offendingText)).toEqual(['description', 'c'.repeat(30), 'label']);
  });
});

describe('schema versions (§15.4)', () => {
  it('accepts 0.4 and 0.5 alike for a project that uses no 0.5 vocabulary', () => {
    for (const schema of ['0.4', '0.5']) {
      const result = validate(projectWith(schema, [meter('')]));
      expect(result.diagnostics.map((d) => d.code), schema).toEqual([]);
    }
  });

  it('gives a 0.4 project one diagnostic per palette attribute, naming schema="0.5" as the fix', () => {
    const diagnostics = metadataDiagnostics(
      projectWith('0.4', [meter('label="Meter" category="Indicators" description="A bar."')]),
    );

    expect(diagnostics.map((d) => [d.code, d.offendingText])).toEqual([
      [DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED, 'label'],
      [DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED, 'category'],
      [DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED, 'description'],
    ]);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.severity).toBe('error');
      expect(diagnostic.message).toContain('schema="0.5"');
      expect(diagnostic.file).toBe('widgets/wd_meter/wd_meter.xml');
    }
    // At the attribute's name: in 0.4 the attribute itself is what is wrong.
    expect(diagnostics[0]).toMatchObject({ line: 2, column: 8 });
  });

  it('does not also judge the value in a 0.4 project: the version is the one thing to fix', () => {
    const diagnostics = metadataDiagnostics(projectWith('0.4', [meter('label=""')]));
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED]);
  });

  it('does not hold the framework’s own manifests to a 0.4 project’s version', () => {
    // A framework manifest carrying metadata, registered as the framework's:
    // the CLI shipped it, and the 0.4 project did not write it.
    const framework = manifestOf(
      '<widget name="wd_shipped" extends="u8g2gl_obj"><api label="Shipped" /></widget>',
      'u8g2gl/manifests/wd_shipped.xml',
    );
    expect(metadataDiagnostics(projectWith('0.4', [], [framework]))).toEqual([]);
    // The same manifest as a project's own is held to the version.
    expect(metadataDiagnostics(projectWith('0.4', [framework])).map((d) => d.code)).toEqual([
      DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED,
    ]);
  });

  it('holds the framework’s own manifests to the limits all the same', () => {
    const framework = manifestOf(
      '<widget name="wd_shipped" extends="u8g2gl_obj"><api label="" /></widget>',
      'u8g2gl/manifests/wd_shipped.xml',
    );
    expect(metadataDiagnostics(projectWith('0.5', [], [framework])).map((d) => d.code)).toEqual([
      DIAGNOSTIC_CODES.INVALID_PALETTE_METADATA,
    ]);
  });

  it('keeps refusing 0.3 with its migration table, now pointing at 0.5', () => {
    const diagnostics = validate(projectWith('0.3', [])).diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.DEPRECATED_SCHEMA_VERSION,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('long_mode="clip"');
    expect(diagnostics[0]?.suggestions).toEqual(['0.5']);
  });
});
