/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/sample-set-unit.test.ts
 * Purpose: The C++ a test run stages to apply each sample set to the firmware
 *          (Q1a): one function per set, scalars through the public
 *          `ui_set_<subject>()` setters, each collection through
 *          `ui_screen_<s>.objs[i]` cast to its class and filled with
 *          `begin()`, its access method per row and `commit()`. And the guard:
 *          every staged `objs[i]` must name, in the generator's own `objs`
 *          table, the element it claims to, so an index drift refuses the run
 *          instead of filling the wrong widget.
 * Description: The departures fixture is generated (as the harness build
 *              generates it, no toolchain needed) and the stage read from it.
 *              The guard is shown three ways: every collection of the real
 *              project resolves to its own table entry; a table with two
 *              entries swapped is refused, naming both; and a set naming what
 *              the project lacks is refused, naming it.
 */

import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareBuild } from '../../../../src/node/design/build/prepare-build.js';
import {
  parseTestRunSampleSets,
  readObjsTables,
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
  stage = readSampleStage(project, readFileSync(join(prepared.editorDir, 'ui_scene.json'), 'utf8'), prepared.generatedDir);
});
afterAll(removeTempDirs);

describe('the staged sample-set unit', () => {
  it('fills each set through the setters and each collection through objs[i], begin, the access method and commit', () => {
    const unit = sampleSetUnit([SET], stage);
    expect(unit.ok, unit.ok ? '' : unit.message).toBe(true);
    if (!unit.ok) return;
    const lines = unit.source.split('\n').map((line) => line.trim());
    // The widgets' own headers, as the generated screen includes them.
    expect(lines).toEqual(expect.arrayContaining(['#include "ui.hpp"', '#include "wd_service_list.hpp"', '#include "wd_train_formation.hpp"']));
    const body = unit.source.slice(unit.source.indexOf('void ui_sample_set_0() {'), unit.source.indexOf('\n}\n', unit.source.indexOf('void ui_sample_set_0() {')));
    expect(body.split('\n').map((line) => line.trim())).toEqual([
      'void ui_sample_set_0() {',
      'ui_set_platform("4");',
      'ui_set_box_fill(int32_t{3});',
      'ui_set_system_time(uint32_t{3600u});',
      // Quotes and backslashes escaped; é as its UTF-8 bytes in octal.
      'ui_set_message_text("Say \\"hi\\" \\\\ caf\\303\\251");',
      '{  // departures.formation: carriages, 2 rows',
      'wd_train_formation* obj = static_cast<wd_train_formation*>(ui_screen_departures.objs[4]);',
      'obj->begin();',
      'obj->add_carriage(int32_t{1}, static_cast<const char*>("first"), true, false, int32_t{40});',
      'obj->add_carriage(int32_t{2}, static_cast<const char*>("standard"), false, true, int32_t{80});',
      'obj->commit();',
      '}',
      '{  // departures.services: rows, 2 rows',
      'wd_service_list* obj = static_cast<wd_service_list*>(ui_screen_departures.objs[5]);',
      'obj->begin();',
      'static const char* const row_0_cells[] = {"10:15", "Reading", "3", "On time"};',
      'obj->add_row(row_0_cells, size_t{4});',
      'obj->add_row(nullptr, size_t{0});',
      'obj->commit();',
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

  it('guard: every collection’s staged index names that element in the generated objs table', () => {
    const table = stage.objsTables.get('departures');
    expect(table).toEqual(['&ui_obj_plat_label', '&ui_obj_plat_num', '&ui_obj_row0', '&ui_obj_message_bar', '&ui_obj_formation', '&ui_obj_services', '&ui_obj_sys_clock']);
    for (const object of stage.objects.get('departures') ?? []) {
      expect(table?.[object.object], object.name).toBe(`&ui_obj_${object.name}`);
    }
    // And the generated screen unit is where that table came from.
    const tables = readObjsTables([readFileSync(join(generatedDir, 'ui_screen_departures.cpp'), 'utf8')], ['departures']);
    expect(tables.get('departures')).toEqual(table);
  });

  it('guard: an index that drifted from the generated table refuses the run, naming both', () => {
    const swapped = [...(stage.objsTables.get('departures') ?? [])];
    [swapped[4], swapped[5]] = [swapped[5] as string, swapped[4] as string];
    const drifted: SampleStage = { ...stage, objsTables: new Map([['departures', swapped]]) };
    expect(sampleSetUnit([SET], drifted)).toEqual({
      ok: false,
      message:
        "sample set 'typical': ui_screen_departures_objs[4] is &ui_obj_services, not &ui_obj_formation: the scene's object index and the generated table disagree",
    });
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
