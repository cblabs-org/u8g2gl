/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/sample-set.test.ts
 * Purpose: The sample-set format and every check it is held to against the
 *          project (ui_spec §11): each problem names the set file, the line
 *          and column of the value at fault, and its JSON path; a set with
 *          problems still applies the parts that check clean; and the live
 *          pipeline draws the active set's values and the drawn screen's rows,
 *          leaving the declared values alone when no set is active.
 * Description: The departures fixture, read from disk and built with the
 *              designer's own model cache, is the project every set is checked
 *              against: its `formation` (a `<data>` of five typed fields,
 *              capacity `max_carriages="12"`) and `services` (a repeated string
 *              field, `max_rows="10"`, `max_cols` 6 and `max_cell_chars` 24
 *              by default) are the owner's test case.
 */

import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineColumnAt, readLocatedJson } from '../../src/samples/located-json';
import {
  checkSampleSet,
  collectionDataJson,
  emptySampleSet,
  isSampleSetPath,
  jsonPath,
  readSampleSetDocument,
  SAMPLE_CODES,
  sampleSetName,
  sampleSetPath,
  sampleValuesJson,
  serialiseSampleSet,
  validSetName,
} from '../../src/samples/sample-set';
import { sampleShapeOf, type SampleShape } from '../../src/samples/sample-shape';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { classifyProjectFile, ProjectModelCache } from '../../src/project/project-model';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../cli/test/fixtures/departures-project');
const SCREEN = 'screens/screen_departures.xml';
const SET = 'samples/typical.json';

// fixtureTexts
// Every XML document of the departures fixture, by project path.
function fixtureTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const project = relative(FIXTURE, path).split('\\').join('/');
        if (classifyProjectFile(project) !== undefined) texts.set(project, readFileSync(path, 'utf8'));
      }
    }
  };
  walk(FIXTURE);
  return texts;
}

const SHAPE: SampleShape = sampleShapeOf(new ProjectModelCache().build(fixtureTexts()));

/** A set's text from its parts, two-space JSON as the designer writes it. */
const setText = (body: Record<string, unknown>): string => `${JSON.stringify({ u8g2gl_samples: 1, ...body }, null, 2)}\n`;

/** A clean formation carriage. */
const CARRIAGE = { number: 1, class_type: 'first', wheelchair: true, bike: false, loading_pct: 40 };

test('a set path is samples/<name>.json, one level deep, and a set is a document but not part of the model', () => {
  expect(isSampleSetPath('samples/typical.json')).toBe(true);
  expect(isSampleSetPath('samples/deep/typical.json')).toBe(false);
  expect(isSampleSetPath('samples/typical.txt')).toBe(false);
  expect(isSampleSetPath('typical.json')).toBe(false);
  expect(sampleSetName('samples/worst case.json')).toBe('worst case');
  expect(sampleSetPath('empty')).toBe('samples/empty.json');
  expect(classifyProjectFile('samples/typical.json')).toBe('sample');
  expect(validSetName('longest plausible')).toBe(true);
  for (const bad of ['', '.hidden', 'a/b', 'trailing.', 'x'.repeat(65), 'tab\there']) expect(validSetName(bad), bad).toBe(false);
});

test('the shape lists both departures collections with their bounds resolved for the instance', () => {
  const services = SHAPE.collections.find((c) => c.element === 'services');
  const formation = SHAPE.collections.find((c) => c.element === 'formation');
  expect(SHAPE.collections.map((c) => c.element)).toEqual(['row0', 'formation', 'services']);
  expect(services?.file).toBe(SCREEN);
  expect(services?.blocks[0]).toMatchObject({ name: 'rows', capacity: 10 });
  expect(services?.blocks[0]?.fields[0]).toMatchObject({ name: 'cells', type: 'string', repeated: true, repeat: 6, maxLen: 24 });
  expect(SHAPE.collections.find((c) => c.element === 'row0')?.blocks[0]?.capacity).toBe(1);
  expect(formation?.blocks[0]).toMatchObject({ name: 'carriages', capacity: 12 });
  expect(formation?.blocks[0]?.fields.map((f) => [f.name, f.type, f.min, f.max, f.values])).toEqual([
    ['number', 'int', 1, 99, []],
    ['class_type', 'enum', undefined, undefined, ['standard', 'first']],
    ['wheelchair', 'bool', undefined, undefined, []],
    ['bike', 'bool', undefined, undefined, []],
    ['loading_pct', 'int', 0, 100, []],
  ]);
});

test('a clean set has no problems and applies every value and row', () => {
  const text = setText({
    values: { platform: '4', box_fill: 3, system_time: 3600 },
    rows: { [SCREEN]: { services: [{ cells: ['10:15', 'Reading', '3', 'On time'] }], formation: [CARRIAGE] } },
  });
  const { problems, applied } = checkSampleSet(SET, text, SHAPE);
  expect(problems).toEqual([]);
  expect(applied.values).toEqual({ platform: '4', box_fill: 3, system_time: 3600 });
  expect(JSON.parse(collectionDataJson(applied, SCREEN) ?? '')).toEqual({
    services: { rows: [{ cells: ['10:15', 'Reading', '3', 'On time'] }] },
    formation: { carriages: [CARRIAGE] },
  });
  expect(collectionDataJson(applied, 'screens/screen_other.xml')).toBeUndefined();
});

test('JSON that does not parse is one error at its line and column, and nothing applies', () => {
  const text = '{\n  "u8g2gl_samples": 1,\n  "values": { "platform": 4 x }\n}\n';
  const { problems, applied } = checkSampleSet(SET, text, SHAPE);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ code: SAMPLE_CODES.JSON, severity: 'error', file: SET, line: 3, column: 29 });
  expect(problems[0]?.message).toMatch(/not valid JSON/);
  expect(applied.values).toEqual({});
  // Strings that stop short, and trailing text, are both located.
  expect(readLocatedJson('{"a": "b')).toMatchObject({ ok: false, offset: 8 });
  expect(readLocatedJson('[1] 2')).toMatchObject({ ok: false, offset: 4 });
  expect(lineColumnAt('a\nbc', 3)).toEqual({ line: 2, column: 2 });
});

test('an unknown or missing version is an error and nothing applies', () => {
  for (const [text, what] of [
    ['{ "u8g2gl_samples": 2, "values": { "platform": "4" } }', /version 1 .* not 2/],
    ['{ "values": { "platform": "4" } }', /missing/],
    ['[1, 2]', /must be a JSON object/],
  ] as const) {
    const { problems, applied } = checkSampleSet(SET, text, SHAPE);
    expect(problems.map((p) => p.severity)).toEqual(['error']);
    expect(problems[0]?.message).toMatch(what);
    expect(applied.values).toEqual({});
  }
});

test('an unknown subject, screen or element, or an element with no <data>, is a problem naming its path', () => {
  const text = setText({
    values: { platform: '4', no_such: 1 },
    rows: {
      'screens/screen_missing.xml': {},
      [SCREEN]: { nothing_here: [], plat_label: [], formation: [CARRIAGE] },
    },
  });
  const { problems, applied } = checkSampleSet(SET, text, SHAPE);
  expect(problems.map((p) => [p.code, p.message])).toEqual([
    [SAMPLE_CODES.UNKNOWN_SUBJECT, 'values.no_such: globals.xml declares no subject of that name'],
    [SAMPLE_CODES.UNKNOWN_SCREEN, 'rows["screens/screen_missing.xml"]: the project has no screen in that file'],
    [SAMPLE_CODES.UNKNOWN_ELEMENT, 'rows["screens/screen_departures.xml"].nothing_here: the screen has no element of that name'],
    [SAMPLE_CODES.NO_DATA, 'rows["screens/screen_departures.xml"].plat_label: <u8g2gl_label> declares no <data>, so it takes no rows'],
  ]);
  expect(problems.every((p) => p.file === SET && p.severity === 'warning')).toBe(true);
  // The problems are on the keys at fault, in order down the file.
  const lines = text.split('\n');
  expect(lines[(problems[0]?.line ?? 0) - 1]).toContain('"no_such"');
  expect(lines[(problems[3]?.line ?? 0) - 1]).toContain('"plat_label"');
  // The parts that check clean still apply.
  expect(applied.values).toEqual({ platform: '4' });
  expect(applied.rows.get(SCREEN)).toEqual({ formation: { carriages: [CARRIAGE] } });
});

test('an unknown field, a wrong type, a value out of min/max or not in values is a problem, and its row is left out', () => {
  const rows = [
    { ...CARRIAGE, colour: 'red' }, // [0] unknown field
    { ...CARRIAGE, number: '1' }, // [1] wrong type
    { ...CARRIAGE, number: 0 }, // [2] below min
    { ...CARRIAGE, loading_pct: 101 }, // [3] above max
    { ...CARRIAGE, class_type: 'second' }, // [4] not in values
    { ...CARRIAGE, wheelchair: 'yes' }, // [5] not a bool
    { ...CARRIAGE, number: 1.5 }, // [6] not an integer
    { number: 2, class_type: 'standard', wheelchair: false, bike: true }, // [7] loading_pct missing
    { ...CARRIAGE, number: 3 }, // [8] clean
  ];
  const { problems, applied } = checkSampleSet(SET, setText({ rows: { [SCREEN]: { formation: rows } } }), SHAPE);
  const at = 'rows["screens/screen_departures.xml"].formation';
  expect(problems.map((p) => [p.code, p.message])).toEqual([
    [SAMPLE_CODES.UNKNOWN_FIELD, `${at}[0].colour: <wd_train_formation> carriages has no field of that name`],
    [SAMPLE_CODES.VALUE, `${at}[1].number: must be an integer`],
    [SAMPLE_CODES.VALUE, `${at}[2].number: 0 is below the field's min of 1`],
    [SAMPLE_CODES.VALUE, `${at}[3].loading_pct: 101 is above the field's max of 100`],
    [SAMPLE_CODES.VALUE, `${at}[4].class_type: 'second' is not one of standard, first`],
    [SAMPLE_CODES.VALUE, `${at}[5].wheelchair: must be true or false`],
    [SAMPLE_CODES.VALUE, `${at}[6].number: must be an integer`],
    [SAMPLE_CODES.VALUE, `${at}[7].loading_pct: missing`],
  ]);
  expect(applied.rows.get(SCREEN)).toEqual({ formation: { carriages: [{ ...CARRIAGE, number: 3 }] } });
});

test('a string over max_len (from the instance’s props, in characters) and an array over its repeat are problems', () => {
  const long = 'x'.repeat(25);
  const rows = [
    { cells: ['10:15', long] }, // [0] cell over max_cell_chars (24)
    { cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, // [1] seven cells, repeat is max_cols 6
    { cells: 'not an array' }, // [2]
    { cells: ['é'.repeat(24)] }, // [3] 24 characters, 48 bytes: clean
    {}, // [4] a repeated field left out is every cell blank: clean
  ];
  const { problems, applied } = checkSampleSet(SET, setText({ values: { platform: '123456789' }, rows: { [SCREEN]: { services: rows } } }), SHAPE);
  const at = 'rows["screens/screen_departures.xml"].services';
  expect(problems.map((p) => p.message)).toEqual([
    "values.platform: 9 characters, over the subject's max_len of 8",
    `${at}[0].cells[1]: 25 characters, over the field's max_len of 24`,
    `${at}[1].cells[6]: 7 values, more than its repeat of 6`,
    `${at}[2].cells: must be an array of strings: the field repeats`,
  ]);
  expect(applied.rows.get(SCREEN)).toEqual({ services: { rows: [{ cells: ['é'.repeat(24)] }, {}] } });
  // The cell at fault is where the problem points.
  const text = setText({ rows: { [SCREEN]: { services: [{ cells: ['ok', long] }] } } });
  const [problem] = checkSampleSet(SET, text, SHAPE).problems;
  expect(text.split('\n')[(problem?.line ?? 0) - 1]).toContain(long);
});

test('rows beyond the instance’s capacity are one problem, and the rows within it still apply', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ cells: [String(i)] }));
  const { problems, applied } = checkSampleSet(SET, setText({ rows: { [SCREEN]: { services: twelve, row0: [{ cells: ['a'] }, { cells: ['b'] }] } } }), SHAPE);
  expect(problems.map((p) => [p.code, p.message])).toEqual([
    [SAMPLE_CODES.CAPACITY, `rows["screens/screen_departures.xml"].services[10]: 12 rows, over services's capacity of 10; the rows beyond it are left out`],
    [SAMPLE_CODES.CAPACITY, `rows["screens/screen_departures.xml"].row0[1]: 2 rows, over row0's capacity of 1; the rows beyond it are left out`],
  ]);
  expect(applied.rows.get(SCREEN)?.services?.rows).toHaveLength(10);
  expect(applied.rows.get(SCREEN)?.row0?.rows).toEqual([{ cells: ['a'] }]);
});

test('wrong subject value types are problems; the set’s values go over the initial ones and the rest are inherited', () => {
  const { problems, applied } = checkSampleSet(SET, setText({ values: { platform: 4, box_fill: 'eight', system_time: -1, row0_dest: 'Reading' } }), SHAPE);
  expect(problems.map((p) => p.message)).toEqual([
    'values.platform: must be a string: platform is a string subject',
    'values.box_fill: must be an integer: box_fill is an int subject',
    'values.system_time: must be a whole number of seconds: system_time is a time subject',
  ]);
  const merged = JSON.parse(sampleValuesJson(JSON.stringify({ platform: '9', row0_dest: 'London Paddington', box_fill: 8 }), applied)) as Record<string, unknown>;
  expect(merged).toEqual({ platform: '9', row0_dest: 'Reading', box_fill: 8 });
});

test('an unknown member and a values or rows of the wrong shape are problems, never a crash', () => {
  const { problems } = checkSampleSet(SET, '{ "u8g2gl_samples": 1, "values": [], "rows": { "screens/screen_departures.xml": [] }, "extra": 1 }', SHAPE);
  expect(problems.map((p) => p.message)).toEqual([
    'values: must be an object of subject values',
    'rows["screens/screen_departures.xml"]: must be an object keyed by element name',
    'extra: not part of the sample-set format; expected "values" or "rows"',
  ]);
  // Nothing a set holds can throw: a deep, odd or hostile document is checked or refused.
  for (const text of ['', '   ', '{"u8g2gl_samples":1,"rows":{"screens/screen_departures.xml":{"services":[null,1,"x",[[]]]}}}', '['.repeat(200)]) {
    expect(() => checkSampleSet(SET, text, SHAPE), text.slice(0, 20)).not.toThrow();
  }
});

test('a document round-trips: read leniently, changed, and written back in the same member order', () => {
  expect(serialiseSampleSet(emptySampleSet())).toBe('{\n  "u8g2gl_samples": 1,\n  "values": {},\n  "rows": {}\n}\n');
  const document = readSampleSetDocument('{"rows":{"a":{}},"values":{"x":1},"u8g2gl_samples":1,"note":"kept"}');
  expect(document).toBeDefined();
  if (document === undefined) return;
  document.values.y = 2;
  expect(JSON.parse(serialiseSampleSet(document))).toEqual({ u8g2gl_samples: 1, values: { x: 1, y: 2 }, rows: { a: {} }, note: 'kept' });
  expect(readSampleSetDocument('{ not json')).toBeUndefined();
  expect(jsonPath(['rows', 'screens/a.xml', 'services', 3, 'cells', 1])).toBe('rows["screens/a.xml"].services[3].cells[1]');
});

test('the live pipeline draws the active set: its values over the initial ones, and the drawn screen’s rows', () => {
  const texts = fixtureTexts();
  texts.set(SET, setText({ values: { platform: '4' }, rows: { [SCREEN]: { formation: [CARRIAGE] } } }));
  texts.set('samples/broken.json', '{ broken');
  const assets = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set<string>(), failedImages: new Set<string>() };
  const cache = new ProjectModelCache();
  const none = runTextPipeline({ texts, cache, assets, activeFile: SCREEN });
  expect(none.sampleValues).toBe(none.subjectValues);
  expect(none.collectionData).toBeUndefined();
  // Every set's problems are reported, active or not, and none is a pipeline diagnostic.
  expect(none.sampleProblems.map((p) => [p.file, p.code])).toEqual([['samples/broken.json', SAMPLE_CODES.JSON]]);
  expect(none.diagnostics.some((d) => d.file.startsWith('samples/'))).toBe(false);
  const active = runTextPipeline({ texts, cache, assets, activeFile: SCREEN, sampleSet: SET });
  expect(JSON.parse(active.sampleValues)).toMatchObject({ platform: '4', row0_dest: 'London Paddington' });
  // The test run still applies the initial values: a set never reaches the firmware.
  expect(JSON.parse(active.subjectValues)).toMatchObject({ platform: '9' });
  expect(JSON.parse(active.collectionData ?? '')).toEqual({ formation: { carriages: [CARRIAGE] } });
  // A set chosen whose file is gone draws as no set.
  const gone = runTextPipeline({ texts, cache, assets, activeFile: SCREEN, sampleSet: 'samples/missing.json' });
  expect(gone.collectionData).toBeUndefined();
});
