/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/sample-grid.test.ts
 * Purpose: The Sample data view's grid value rules and its paste mapping
 *          (ruling 7): a new row's defaults, a number held to min/max, a string
 *          counted in characters against max_len, a repeated field's cells;
 *          and pasted JSON or CSV mapped onto fields by name, with every
 *          refused value reported by row and field while the accepted rows
 *          still land, quoted commas, quotes and line breaks included.
 * Description: The blocks are the departures fixture's two, written out with
 *              their bounds resolved, as `sampleShapeOf()` gives them.
 */

import { expect, test } from '@playwright/test';
import { capacityLabel, defaultCell, heldInteger, newRow, numberProblem, repeatedCells, stringCount, withRepeatedCell } from '../../src/samples/grid-rules';
import { parseCsv, pasteRows } from '../../src/samples/paste-rows';
import type { SampleBlock, SampleField } from '../../src/samples/sample-shape';

// field
// A field with every bound unset unless given.
function field(name: string, type: SampleField['type'], extra: Partial<SampleField> = {}): SampleField {
  return { name, type, min: undefined, max: undefined, values: [], maxLen: undefined, repeat: undefined, repeated: false, help: undefined, ...extra };
}

const CARRIAGES: SampleBlock = {
  name: 'carriages',
  capacity: 12,
  help: undefined,
  fields: [
    field('number', 'int', { min: 1, max: 99 }),
    field('class_type', 'enum', { values: ['standard', 'first'] }),
    field('wheelchair', 'bool'),
    field('bike', 'bool'),
    field('loading_pct', 'int', { min: 0, max: 100 }),
  ],
};

const ROWS: SampleBlock = {
  name: 'rows',
  capacity: 10,
  help: undefined,
  fields: [field('cells', 'string', { repeated: true, repeat: 4, maxLen: 24 })],
};

test('a new row holds each field’s default: an int’s 0 held to its bounds, an enum’s first value, false, blank cells', () => {
  expect(newRow(CARRIAGES)).toEqual({ number: 1, class_type: 'standard', wheelchair: false, bike: false, loading_pct: 0 });
  expect(newRow(ROWS)).toEqual({ cells: [] });
  expect(defaultCell(field('t', 'int', { max: -5 }))).toBe(-5);
  expect(defaultCell(field('s', 'string'))).toBe('');
});

test('a typed number is held to min and max and rounded; a non-number keeps the cell', () => {
  const pct = CARRIAGES.fields[4] as SampleField;
  expect(heldInteger(pct, 150)).toBe(100);
  expect(heldInteger(pct, -3)).toBe(0);
  expect(heldInteger(pct, 41.6)).toBe(42);
  expect(heldInteger(pct, Number.NaN)).toBeUndefined();
  expect(heldInteger(field('free', 'int'), 1e6)).toBe(1e6);
});

test('a typed number outside min..max is refused with the reason; inside, rounded, empty or not a number is not', () => {
  const pct = CARRIAGES.fields[4] as SampleField;
  expect(numberProblem(pct, '9090')).toBe('9090 is outside 0–100, so it is not written');
  expect(numberProblem(pct, '-3')).toBe('-3 is outside 0–100, so it is not written');
  expect(numberProblem(pct, '100')).toBeUndefined();
  expect(numberProblem(pct, '41.6')).toBeUndefined();
  expect(numberProblem(pct, '')).toBeUndefined();
  expect(numberProblem(pct, 'x')).toBeUndefined();
  expect(numberProblem(field('low', 'int', { min: 1 }), '0')).toBe('0 is below the minimum of 1, so it is not written');
  expect(numberProblem(field('free', 'int'), '1e6')).toBeUndefined();
});

test('a string is counted in characters against max_len, and one over it is flagged but kept', () => {
  const cells = ROWS.fields[0] as SampleField;
  expect(stringCount(cells, 'Reading')).toEqual({ label: '7 / 24', over: false });
  expect(stringCount(cells, 'é'.repeat(24))).toEqual({ label: '24 / 24', over: false });
  expect(stringCount(cells, 'x'.repeat(25))).toEqual({ label: '25 / 24', over: true });
  expect(stringCount(field('free', 'string'), 'abc')).toEqual({ label: '3', over: false });
  expect(capacityLabel(8, 12)).toBe('8 / 12');
  expect(capacityLabel(3, undefined)).toBe('3');
});

test('a repeated field shows as its repeat’s cells, and writing one pads to it and drops trailing blanks', () => {
  const cells = ROWS.fields[0] as SampleField;
  expect(repeatedCells(cells, ['10:15', 'Reading'])).toEqual(['10:15', 'Reading', '', '']);
  expect(repeatedCells(cells, ['a', 'b', 'c', 'd', 'e'])).toHaveLength(5);
  expect(repeatedCells(cells, 'not an array')).toEqual(['', '', '', '']);
  expect(withRepeatedCell(['10:15'], 2, '3')).toEqual(['10:15', '', '3']);
  expect(withRepeatedCell(['10:15', '', '3'], 2, '')).toEqual(['10:15']);
});

test('CSV is read as RFC 4180: quoted commas, doubled quotes, line breaks in quotes, CRLF, and blank lines skipped', () => {
  expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n"two\nlines",z\n')).toEqual([
    ['a', 'b'],
    ['x, y', 'say "hi"'],
    ['two\nlines', 'z'],
  ]);
  expect(parseCsv('a,"never closed\n')).toBeUndefined();
  expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
});

test('CSV maps columns by name, in any order, ignoring case and an unknown column, with fields it lacks defaulted', () => {
  const csv = 'Loading_Pct,number,class_type,colour\n40,1,first,red\n80,2,standard,blue\n';
  const result = pasteRows(csv, CARRIAGES, 12);
  expect(result.rejected).toEqual([]);
  expect(result.rows).toEqual([
    { number: 1, class_type: 'first', wheelchair: false, bike: false, loading_pct: 40 },
    { number: 2, class_type: 'standard', wheelchair: false, bike: false, loading_pct: 80 },
  ]);
  expect(result.notes).toEqual([
    "column 'colour' matches no field of carriages, so it was ignored",
    'no column gives wheelchair, so every row takes its default',
    'no column gives bike, so every row takes its default',
  ]);
});

test('every refused value is reported by row and field, and the accepted rows still land', () => {
  const csv = [
    'number,class_type,wheelchair,bike,loading_pct',
    '1,first,yes,no,40', // row 1: fine
    '0,second,maybe,1,101', // row 2: four refused values
    'x,standard,true,false,50', // row 3: number not an integer
    '4,standard,TRUE,0,10', // row 4: fine
  ].join('\n');
  const result = pasteRows(csv, CARRIAGES, 12);
  expect(result.rows.map((r) => r.number)).toEqual([1, 4]);
  expect(result.rows[0]).toEqual({ number: 1, class_type: 'first', wheelchair: true, bike: false, loading_pct: 40 });
  expect(result.rejected).toEqual([
    { row: 2, field: 'number', reason: '0 is below the min of 1' },
    { row: 2, field: 'class_type', reason: "'second' is not one of standard, first" },
    { row: 2, field: 'wheelchair', reason: "'maybe' is not true or false" },
    { row: 2, field: 'loading_pct', reason: '101 is above the max of 100' },
    { row: 3, field: 'number', reason: "'x' is not an integer" },
  ]);
});

test('a service list’s cells come from a repeated bare column or indexed ones, quoted commas kept, too long refused', () => {
  const repeated = pasteRows('cells,cells,cells,cells\n10:15,"Reading, Platform 3",3,On time\n', ROWS, 10);
  expect(repeated.rows).toEqual([{ cells: ['10:15', 'Reading, Platform 3', '3', 'On time'] }]);
  const indexed = pasteRows(`cells[1],cells.0\nOxford,10:32\n${'x'.repeat(25)},10:40\n`, ROWS, 10);
  expect(indexed.rows).toEqual([{ cells: ['10:32', 'Oxford'] }]);
  expect(indexed.rejected).toEqual([{ row: 2, field: 'cells[1]', reason: "25 characters, over the max_len of 24" }]);
  const beyond = pasteRows('cells[4]\nx\n', ROWS, 10);
  expect(beyond.rejected).toEqual([{ row: 1, field: 'cells[4]', reason: 'beyond its repeat of 4' }]);
});

test('JSON is an array of row objects mapped by name; a non-object item and an over-long array are refused', () => {
  const json = JSON.stringify([{ cells: ['10:15', 'Reading'] }, 'nope', { cells: ['a', 'b', 'c', 'd', 'e'] }, { cells: ['x', 7] }]);
  const result = pasteRows(json, ROWS, 10);
  expect(result.rows).toEqual([{ cells: ['10:15', 'Reading'] }, { cells: ['x', '7'] }]);
  expect(result.rejected).toEqual([
    { row: 2, field: undefined, reason: 'not an object keyed by field name' },
    { row: 3, field: 'cells', reason: '5 values, more than its repeat of 4' },
  ]);
  expect(pasteRows('[1,', ROWS, 10).failure).toMatch(/does not parse/);
  expect(pasteRows('', ROWS, 10).failure).toBe('nothing was pasted');
});

test('rows beyond the room left in the capacity are refused, each by row', () => {
  const result = pasteRows('cells\na\nb\nc\n', ROWS, 2);
  expect(result.rows).toHaveLength(2);
  expect(result.rejected).toEqual([{ row: 3, field: undefined, reason: 'over the capacity: only 2 more rows fit' }]);
});
