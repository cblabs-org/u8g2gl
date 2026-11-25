/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/sample-set-unit.test.ts
 * Purpose: The C++ a test run stages to apply each sample set to the firmware
 *          (Q1a): one function per set, scalars through the public
 *          `ui_set_<subject>()` setters, each collection through its
 *          generated facade (design_spec §9.2), `ui_<screen>_<element>_<data>`:
 *          `begin()`, `add_row()` per row and `commit()`, named rather than
 *          indexed, so no object index can drift.
 * Description: The departures fixture is generated (as the harness build
 *              generates it, no toolchain needed) and the stage read from it.
 *              A set naming what the project lacks is refused, naming it.
 */

import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareBuild } from '../../../../src/node/design/build/prepare-build.js';
import {
  parseTestRunSampleSets,
  readSampleStage,
  sampleSetUnit,
  type SampleStage,
  type TestRunSampleSet,
} from '../../../../src/node/design/test-run/sample-set-unit.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from '../build/departures-project.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';

/** One set: a platform, two carriages and a service, as the designer sends it. */
const SET: TestRunSampleSet = {
  name: 'typical',
  values: { platform: '4', box_fill: 3, system_time: 3600, message_text: 'Say "hi" \\ café' },
  rows: {
    departures: {
      formation: {
        carriages: [
          { number: 1, class_type: 'first', wheelchair: true, bike: false, loading_pct: 40 },
          { number: 2, class_type: 'standard', wheelchair: false, bike: true, loading_pct: 80 },
        ],
      },
      services: { rows: [{ cells: ['10:15', 'Reading', '3', 'On time'] }, {}] },
    },
  },
};

let stage: SampleStage;
let generatedDir: string;
beforeAll(async () => {
  const project = join(makeTempDir('sample-unit'), 'project');
  cpSync(DEPARTURES_PROJECT, project, { recursive: true });
  const prepared = await prepareBuild(project, makeTempDir('sample-unit-cache'), FRAMEWORK_ROOT);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
  generatedDir = prepared.generatedDir;
  stage = readSampleStage(project, readFileSync(join(prepared.editorDir, 'ui_scene.json'), 'utf8'));
});
afterAll(removeTempDirs);

describe('the staged sample-set unit', () => {
  it('fills each set through the setters and each collection through its facade: begin, add_row and commit', () => {
    const unit = sampleSetUnit([SET], stage);
    expect(unit.ok, unit.ok ? '' : unit.message).toBe(true);
    if (!unit.ok) return;
    const lines = unit.source.split('\n').map((line) => line.trim());
    // The facades are declared in ui.hpp: no widget header is needed.
    expect(lines).toContain('#include "ui.hpp"');
    expect(lines.filter((line) => line.startsWith('#include "wd_'))).toEqual([]);
    // And the generated firmware defines the facades the unit names.
    const screenUnit = readFileSync(join(generatedDir, 'ui_screen_departures.cpp'), 'utf8');
    expect(screenUnit).toContain('const ui_departures_formation_carriages_t ui_departures_formation_carriages{};');
    expect(screenUnit).toContain('const ui_departures_services_rows_t ui_departures_services_rows{};');
    const body = unit.source.slice(unit.source.indexOf('void ui_sample_set_0() {'), unit.source.indexOf('\n}\n', unit.source.indexOf('void ui_sample_set_0() {')));
    expect(body.split('\n').map((line) => line.trim())).toEqual([
      'void ui_sample_set_0() {',
      'ui_set_platform("4");',
      'ui_set_box_fill(int32_t{3});',
      'ui_set_system_time(uint32_t{3600u});',
      // Quotes and backslashes escaped; é as its UTF-8 bytes in octal.
      'ui_set_message_text("Say \\"hi\\" \\\\ caf\\303\\251");',
      '{  // departures.formation: carriages, 2 rows',
      'ui_departures_formation_carriages.begin();',
      'ui_departures_formation_carriages.add_row(int32_t{1}, static_cast<const char*>("first"), true, false, int32_t{40});',
      'ui_departures_formation_carriages.add_row(int32_t{2}, static_cast<const char*>("standard"), false, true, int32_t{80});',
      'ui_departures_formation_carriages.commit();',
      '}',
      '{  // departures.services: rows, 2 rows',
      'ui_departures_services_rows.begin();',
      'static const char* const row_0_cells[] = {"10:15", "Reading", "3", "On time"};',
      'ui_departures_services_rows.add_row(row_0_cells, size_t{4});',
      'ui_departures_services_rows.add_row(nullptr, size_t{0});',
      'ui_departures_services_rows.commit();',
      '}',
    ]);
    // The harness's entry point and the exports that choose the set.
    expect(unit.source).toContain('void u8g2gl_harness_apply_sample_set() {');
    expect(unit.source).toContain('case 0: ui_sample_set_0(); break;');
    expect(unit.source).toContain('int selectSampleSet(int index) {');
    expect(unit.source).toContain('"typical",');
  });

  it('with no sets, the unit still links and applies nothing', () => {
    const unit = sampleSetUnit([], stage);
    expect(unit.ok).toBe(true);
    if (!unit.ok) return;
    expect(unit.source).toContain('int getSampleSetCount() { return 0; }');
    expect(unit.source).not.toContain('ui_sample_set_0');
    expect(unit.source).toMatch(/switch \(s_sample_set\) \{\n {8}default: break;/);
    // Deterministic: the same input, the same text.
    expect(sampleSetUnit([SET], stage)).toEqual(sampleSetUnit([SET], stage));
  });

  it('refuses a set naming a subject, screen, element or data the project lacks, or a value of the wrong type', () => {
    const refused = (set: Partial<TestRunSampleSet>): string => {
      const unit = sampleSetUnit([{ name: 'bad', values: {}, rows: {}, ...set }], stage);
      return unit.ok ? 'staged' : unit.message;
    };
    expect(refused({ values: { nope: 1 } })).toBe("sample set 'bad': the project has no subject 'nope'");
    expect(refused({ values: { box_fill: 'three' } })).toBe("sample set 'bad': 'box_fill' is an int subject, so \"three\" cannot be its value");
    expect(refused({ rows: { elsewhere: {} } })).toBe("sample set 'bad': the project has no screen 'elsewhere'");
    expect(refused({ rows: { departures: { plat_box: {} } } })).toBe("sample set 'bad': screen 'departures' has no object 'plat_box'");
    expect(refused({ rows: { departures: { formation: { wagons: [] } } } })).toBe('sample set \'bad\': <wd_train_formation> declares no <data name="wagons">');
    expect(refused({ rows: { departures: { formation: { carriages: [{ number: 'one' }] } } } })).toBe("sample set 'bad': departures.formation row 0: number must be an int");
  });

  it('validates a request’s sets before anything is staged', () => {
    expect(parseTestRunSampleSets(undefined)).toEqual([]);
    expect(parseTestRunSampleSets([SET])).toEqual([SET]);
    expect(parseTestRunSampleSets('x')).toMatch(/must be a list/);
    expect(parseTestRunSampleSets([SET, SET])).toBe("sample set 'typical' is sent twice");
    expect(parseTestRunSampleSets([{ name: 'a', values: { x: {} }, rows: {} }])).toMatch(/a value must be/);
    expect(parseTestRunSampleSets([{ name: 'a', values: {}, rows: { s: { e: { d: [{ c: [1] }] } } } }])).toMatch(/a row must be/);
    expect(parseTestRunSampleSets(Array.from({ length: 33 }, (_, i) => ({ ...SET, name: String(i) })))).toMatch(/at most 32/);
  });
});
