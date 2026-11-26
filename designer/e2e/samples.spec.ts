/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/samples.spec.ts
 * Purpose: Sample sets end to end (ui_spec §11), on the departures fixture: a
 *          set file on disk fills the departures board's train formation and
 *          service list on the canvas, an external edit to the set reaches the
 *          canvas as an XML edit would; the Sample data view's typed grids,
 *          paste, set management and canvas link; the subjects table's set
 *          columns; the conventional sets, swept from the keyboard; a test run
 *          reporting parity per set; and none of it touches the project's XML
 *          on disk.
 * Description: The tests that draw a project widget need its editor Wasm, so
 *              they need Emscripten 5.0.3 on PATH and skip without it. The
 *              active set is a view setting of the browser, so a test chooses
 *              it in the page's storage before the designer loads, as a user's
 *              earlier choice would have left it. A collection widget with no
 *              rows draws nothing, so its region's lit pixels say whether the
 *              set's rows reached it.
 */

import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { TestHandle } from '../src/test-hooks';
import { emscriptenOnPath, PROJECT_FIXTURE, REPO, startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, litIn, nextFrames, openFile, openShell, selectedNames } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
const SET = 'samples/typical.json';
/** The departures fixture's conventional sets, as the CLI's per-set parity test has them. */
const SAMPLE_FIXTURES = join(REPO, 'cli', 'test', 'node', 'design', 'test-run', 'fixtures', 'departures-samples');
/** The departures fixture's project name, which keys the browser's view settings. */
const PROJECT = 'probe';
/** Where the formation and the service list draw on the departures screen. */
const FORMATION = { x: 0, y: 17, width: 256, height: 32 } as const;
const SERVICES = { x: 0, y: 51, width: 190, height: 13 } as const;

/** A set with three carriages and two services. */
const TYPICAL = `${JSON.stringify(
  {
    u8g2gl_samples: 1,
    values: { platform: '4' },
    rows: {
      [SCREEN]: {
        formation: [
          { number: 1, class_type: 'first', wheelchair: false, bike: false, loading_pct: 40 },
          { number: 2, class_type: 'standard', wheelchair: true, bike: false, loading_pct: 80 },
          { number: 3, class_type: 'standard', wheelchair: false, bike: true, loading_pct: 10 },
        ],
        services: [{ cells: ['10:15', 'Reading', '3', 'On time'] }, { cells: ['10:32', 'Oxford', '4', 'Delayed'] }],
      },
    },
  },
  null,
  2,
)}\n`;

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Every XML file of the fixture, by project path, as the fixture has it. */
function fixtureXml(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.xml')) files.set(relative(PROJECT_FIXTURE, path).split('\\').join('/'), readFileSync(path, 'utf8'));
    }
  };
  walk(PROJECT_FIXTURE);
  return files;
}

/** @brief Asserts every project XML file on disk is byte for byte the fixture's. */
function expectXmlUntouched(): void {
  for (const [path, text] of fixtureXml()) expect(session?.read(path), path).toBe(text);
}

/** @brief Chooses a set (or none) in the page, as the browser remembers it. */
async function chooseSet(page: Page, name: string | undefined): Promise<void> {
  await page.evaluate((name) => (window as unknown as TestHandle).__u8g2gl.activeSampleSet.choose(name), name);
}

/** @brief Opens the designer on the project's editor Wasm, with the frame still. */
async function openWithWasm(page: Page): Promise<void> {
  if (session === undefined) throw new Error('no session');
  await openShell(page, session.url);
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'current', { timeout: 400_000 });
  await page.getByRole('button', { name: /live/ }).click();
  await nextFrames(page, 3);
}

test('a set file on disk fills the formation and the service list on the canvas, and the XML on disk is unchanged', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true, files: { [SET]: TYPICAL } });
  await page.addInitScript((key) => window.localStorage.setItem(key, 'typical'), `u8g2gl.samples:${PROJECT}`);
  await openWithWasm(page);

  // --- The set's rows are drawn: both collections have lit pixels ---
  await expect.poll(() => litIn(page, FORMATION)).toBeGreaterThan(50);
  await expect.poll(() => litIn(page, SERVICES)).toBeGreaterThan(20);
  const withSet = { formation: await litIn(page, FORMATION), services: await litIn(page, SERVICES) };

  // --- No set: the collections are blank again, as before sets existed ---
  await chooseSet(page, undefined);
  await expect.poll(() => litIn(page, SERVICES)).toBe(0);
  expect(await litIn(page, FORMATION)).toBeLessThan(withSet.formation);

  // --- Back to the set, then an external edit to it reaches the canvas ---
  await chooseSet(page, 'typical');
  await expect.poll(() => litIn(page, SERVICES)).toBe(withSet.services);
  const oneService = TYPICAL.replace(/,\s*\{\s*"cells": \[\s*"10:32"[\s\S]*?\]\s*\}/, '');
  expect(oneService).not.toBe(TYPICAL);
  session.write(SET, oneService);
  await expect.poll(() => litIn(page, SERVICES)).toBeLessThan(withSet.services);
  await expect.poll(() => litIn(page, SERVICES)).toBeGreaterThan(0);

  // --- A set that stops checking still draws what checks, and says why in Problems ---
  session.write(SET, oneService.replace('"loading_pct": 40', '"loading_pct": 400'));
  await expect(page.locator('.problems .problem', { hasText: 'formation[0].loading_pct' })).toBeVisible();
  await expect.poll(() => litIn(page, SERVICES)).toBeGreaterThan(0);

  expectXmlUntouched();
});

/** The Sample data view. */
const view = (page: Page) => page.getByRole('complementary', { name: 'Sample data' });

/** One collection's section in the view. */
const collection = (page: Page, element: string) => view(page).locator(`.sample-collection[data-collection="${element}"]`);

/** @brief Opens the Sample data view from the activity bar. */
async function openView(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Sample data' }).click();
  await expect(view(page)).toBeVisible();
}

/** @brief Creates a set from the view, which makes it active. */
async function createSet(page: Page, name: string): Promise<void> {
  await view(page).getByRole('button', { name: 'New…' }).click();
  await view(page).getByRole('form', { name: 'New set' }).getByRole('textbox').fill(name);
  await view(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(view(page).getByRole('radio', { name: name })).toHaveAttribute('aria-checked', 'true');
}

test('the formation grid fills the canvas, one undo step per edit, saved into the set and never into the XML', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openWithWasm(page);
  await openView(page);
  await createSet(page, 'typical');
  expect(session.read(SET)).toBe('{\n  "u8g2gl_samples": 1,\n  "values": {},\n  "rows": {}\n}\n');
  const blank = await litIn(page, FORMATION);

  // --- Two rows, through the grid: the canvas draws them ---
  await collection(page, 'formation').getByRole('button', { name: /formation/ }).click();
  await expect(collection(page, 'formation').locator('.sample-capacity')).toHaveText('0 / 12');
  await collection(page, 'formation').getByRole('button', { name: '+ Row' }).click();
  await collection(page, 'formation').getByRole('button', { name: '+ Row' }).click();
  await expect(collection(page, 'formation').locator('.sample-capacity')).toHaveText('2 / 12');
  await expect.poll(() => litIn(page, FORMATION)).toBeGreaterThan(blank);
  const two = await litIn(page, FORMATION);

  // --- A typed number outside its bounds is marked and not written; one inside is ---
  const grid = collection(page, 'formation').locator('table.sample-grid');
  const pct = grid.getByRole('spinbutton', { name: 'loading_pct of row 2' });
  const setText = (): Promise<string> => page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.textOf(path) ?? '', SET);
  const beforeOutOfRange = await setText();
  await pct.fill('9090');
  await pct.press('Enter');
  await expect(pct).toHaveValue('9090');
  await expect(pct).toHaveAttribute('aria-invalid', 'true');
  await expect(grid.locator('.sample-number-cell[data-invalid="true"] .field-problem')).toHaveText('9090 is outside 0–100, so it is not written');
  expect(await setText()).toBe(beforeOutOfRange);
  await pct.fill('100');
  await pct.press('Enter');
  await expect(pct).toHaveAttribute('aria-invalid', 'false');
  // Written, and back in the grid, before the next edit: each grid edit writes
  // from the rows the grid holds, so one made sooner would undo this one.
  await expect(grid.locator('.sample-number-cell:has([aria-label="loading_pct of row 2"])')).toHaveAttribute('data-written', '100');
  await expect(pct).toHaveValue('100');

  // --- An enum is a dropdown; a bool a checkbox ---
  await grid.getByRole('combobox', { name: 'class_type of row 1' }).selectOption('first');
  // A click, not check(): the box shows the set's value, which the edit changes a frame later.
  await grid.getByRole('checkbox', { name: 'wheelchair of row 1' }).click();
  await expect(grid.getByRole('checkbox', { name: 'wheelchair of row 1' })).toBeChecked();
  await expect.poll(() => litIn(page, FORMATION)).not.toBe(two);
  const edited = await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.textOf(path) ?? '', SET);
  expect(JSON.parse(edited).rows[SCREEN].formation).toEqual([
    { number: 1, class_type: 'first', wheelchair: true, bike: false, loading_pct: 0 },
    { number: 1, class_type: 'standard', wheelchair: false, bike: false, loading_pct: 100 },
  ]);

  // --- One undo undoes one edit: the checkbox ---
  await view(page).getByRole('button', { name: 'Undo the last change to the set' }).click();
  await expect(grid.getByRole('checkbox', { name: 'wheelchair of row 1' })).not.toBeChecked();
  await expect(grid.getByRole('combobox', { name: 'class_type of row 1' })).toHaveValue('first');

  // --- Reorder and remove rows; then save writes the set, only the set ---
  await grid.getByRole('button', { name: 'Move row 1 down' }).click();
  await expect(grid.getByRole('combobox', { name: 'class_type of row 2' })).toHaveValue('first');
  await grid.getByRole('button', { name: 'Remove row 1' }).click();
  await expect(collection(page, 'formation').locator('.sample-capacity')).toHaveText('1 / 12');
  await view(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => JSON.parse(session?.read(SET) ?? '{}').rows?.[SCREEN]?.formation).toEqual([{ number: 1, class_type: 'first', wheelchair: false, bike: false, loading_pct: 0 }]);
  expectXmlUntouched();
});

test('CSV pasted into the service list lands its good rows, names every refused value, and draws', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openWithWasm(page);
  await openView(page);
  await createSet(page, 'feed');
  await collection(page, 'services').getByRole('button', { name: /services/ }).click();
  await collection(page, 'services').getByRole('button', { name: 'Paste…' }).click();
  const csv = ['cells,cells,cells,cells', '10:15,"Reading, P3",3,On time', `10:32,${'x'.repeat(25)},4,Late`, '10:40,Oxford,1,Delayed'].join('\n');
  await collection(page, 'services').getByRole('textbox', { name: 'Paste rows into services' }).fill(csv);
  await collection(page, 'services').getByRole('button', { name: 'Add rows' }).click();
  const report = collection(page, 'services').locator('.sample-paste-report');
  await expect(report).toHaveAttribute('data-added', '2');
  await expect(report.locator('.sample-paste-rejected li')).toHaveText(['row 2, cells[1]: 25 characters, over the max_len of 24']);
  await expect(collection(page, 'services').locator('.sample-capacity')).toHaveText('2 / 10');
  await expect(collection(page, 'services').getByRole('textbox', { name: 'cells[1] of row 1' })).toHaveValue('Reading, P3');
  await expect.poll(() => litIn(page, SERVICES)).toBeGreaterThan(20);
  expectXmlUntouched();
});

test('selecting a collection on the canvas opens its grid in the view', async ({ page }) => {
  session = await startDesign({ files: { [SET]: TYPICAL } });
  await page.addInitScript((key) => window.localStorage.setItem(key, 'typical'), `u8g2gl.samples:${PROJECT}`);
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await openView(page);
  await expect(collection(page, 'services')).toHaveAttribute('data-open', 'false');
  // The view widens the sidebar, so the canvas lays out again before it is clicked.
  await nextFrames(page, 10);
  await clickCanvas(page, 100, 57); // services: 0, 51, 190 × 13
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['services'] });
  await expect(collection(page, 'services')).toHaveAttribute('data-open', 'true');
  await expect(collection(page, 'services').getByRole('textbox', { name: 'cells[1] of row 2' })).toHaveValue('Oxford');
  await expect(collection(page, 'formation')).toHaveAttribute('data-open', 'false');
});

test('sets are created, duplicated, renamed and deleted in the view; delete asks first, in the view', async ({ page }) => {
  session = await startDesign({ files: { [SET]: TYPICAL } });
  await openShell(page, session.url);
  await openView(page);
  await view(page).getByRole('radio', { name: 'typical' }).click();
  await view(page).getByRole('button', { name: 'Duplicate…' }).click();
  await view(page).getByRole('form', { name: 'Duplicate set' }).getByRole('textbox').fill('worst case');
  await view(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => session?.read('samples/worst case.json')).toBe(TYPICAL);
  await view(page).getByRole('button', { name: 'Rename…' }).click();
  await view(page).getByRole('form', { name: 'Rename set' }).getByRole('textbox').fill('busy');
  await view(page).getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(view(page).getByRole('radio', { name: 'busy' })).toHaveAttribute('aria-checked', 'true');
  await expect(view(page).getByRole('radio', { name: 'worst case' })).toHaveCount(0);
  expect(session.read('samples/busy.json')).toBe(TYPICAL);

  // A bad name is refused, saying why.
  await view(page).getByRole('button', { name: 'New…' }).click();
  await view(page).getByRole('form', { name: 'New set' }).getByRole('textbox').fill('../escape');
  await view(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(view(page).getByRole('alert')).toContainText('cannot name a set');

  // Delete asks first; Cancel keeps the file, Delete removes it.
  await view(page).getByRole('button', { name: 'Delete…' }).click();
  await expect(view(page).getByRole('alertdialog', { name: 'Delete busy' })).toContainText('samples/busy.json');
  await view(page).getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  expect(session.read('samples/busy.json')).toBe(TYPICAL);
  await view(page).getByRole('button', { name: 'Delete…' }).click();
  await view(page).getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(view(page).getByRole('radio', { name: 'busy' })).toHaveCount(0);
  await expect(view(page).getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => existsSync(session?.file('samples/busy.json') ?? '')).toBe(false);
  expect(session.read(SET)).toBe(TYPICAL);
  expectXmlUntouched();
});

test('the subjects table has a sample column per set beside the compiled-in initial value; inherited shows as inherited', async ({ page }) => {
  session = await startDesign({ files: { [SET]: TYPICAL, 'samples/empty.json': '{ "u8g2gl_samples": 1, "values": {}, "rows": {} }\n' } });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  const table = page.locator('.project-form[data-form-file="globals.xml"] table.subjects-table');
  await expect(table.locator('th[data-column="value"]')).toContainText('Initial value');
  await expect(table.locator('th[data-column="value"] .subject-heading-note')).toHaveText('boots with');
  await expect(table.locator('th[data-column="sample"]')).toHaveText(['empty sample', 'typical sample']);
  const platform = table.locator('tr[data-subject="platform"]');
  await expect(platform.locator('td[data-set="typical"] .sample-value')).toHaveAttribute('data-inherited', 'false');
  await expect(platform.getByRole('textbox', { name: 'platform in typical' })).toHaveValue('4');
  await expect(platform.locator('td[data-set="empty"] .sample-value')).toHaveAttribute('data-inherited', 'true');
  await expect(platform.getByRole('textbox', { name: 'platform in empty' })).toHaveAttribute('placeholder', '9');

  // An edit writes the set's buffer, never globals.xml.
  const globals = await bufferText(page, 'globals.xml');
  await platform.getByRole('textbox', { name: 'platform in empty' }).fill('12');
  await platform.getByRole('textbox', { name: 'platform in empty' }).press('Enter');
  await expect(platform.locator('td[data-set="empty"] .sample-value')).toHaveAttribute('data-inherited', 'false');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.documents.textOf('samples/empty.json') ?? ''))
    .toContain('"platform": "12"');
  expect(await bufferText(page, 'globals.xml')).toBe(globals);
  // ↺ inherits again.
  await platform.getByRole('button', { name: 'Inherit the initial value of platform in empty' }).click();
  await expect(platform.locator('td[data-set="empty"] .sample-value')).toHaveAttribute('data-inherited', 'true');
  expectXmlUntouched();
});

/** The canvas toolbar's set switcher. */
const switcher = (page: Page) => page.getByRole('combobox', { name: 'Sample set' });

test('the conventional sets are offered while samples/ is empty, and Alt+] / Alt+[ sweep the canvas through them', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openWithWasm(page);
  await openView(page);
  await view(page).getByRole('button', { name: 'Create the conventional sets' }).click();
  await expect(switcher(page)).toHaveValue('typical');
  for (const name of ['typical', 'empty', 'longest-plausible', 'worst-case']) {
    await expect.poll(() => session?.read(`samples/${name}.json`) ?? '').toContain('"u8g2gl_samples": 1');
  }
  // worst-case is full: twelve carriages, strings at max_len in the 6x10's widest glyph.
  const worst = JSON.parse(session.read('samples/worst-case.json'));
  expect(worst.rows[SCREEN].formation).toHaveLength(12);
  expect(worst.rows[SCREEN].services[0].cells[0]).toBe('W'.repeat(24));
  expect(worst.values.platform).toHaveLength(8);
  await expect(view(page).getByRole('button', { name: 'Create the conventional sets' })).toHaveCount(0);

  // --- The keyboard sweep, in name order with none before the first ---
  const seen = new Map<string, number>();
  await page.locator('.canvas-frame canvas.frame').click({ position: { x: 1, y: 1 } });
  for (const expected of ['worst-case', '', 'empty', 'longest-plausible', 'typical']) {
    await page.keyboard.press('Alt+BracketRight');
    await expect(switcher(page)).toHaveValue(expected);
    await nextFrames(page, 3);
    seen.set(expected, await litIn(page, SERVICES));
  }
  await page.keyboard.press('Alt+BracketLeft');
  await expect(switcher(page)).toHaveValue('longest-plausible');
  expect(seen.get('')).toBe(0);
  expect(seen.get('empty')).toBe(0);
  expect(seen.get('typical')).toBeGreaterThan(0);
  expect(seen.get('worst-case')).toBeGreaterThan(seen.get('typical') ?? 0);
  // The switcher names the shortcut.
  await expect(page.locator('.sample-switcher')).toHaveAttribute('title', /Alt\+\]/);
  expectXmlUntouched();
});

test('a test run checks every set: parity is reported for each case, and the bug report names its set', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  const sets = Object.fromEntries(
    ['typical', 'empty', 'longest-plausible', 'worst-case'].map((name) => [`samples/${name}.json`, readFileSync(join(SAMPLE_FIXTURES, `${name}.json`), 'utf8')]),
  );
  session = await startDesign({ toolchain: true, files: sets });
  await openWithWasm(page);
  await expect(page.locator('.run-button')).toHaveAttribute('data-availability', 'ready');
  await page.locator('.run-button').click();
  await expect(page.locator('.verdict')).toHaveAttribute('data-verdict', 'parity', { timeout: 300_000 });
  await expect(page.locator('.verdict')).toContainText('5 cases');
  const cases = page.locator('.verdict-cases .verdict-case');
  await expect(cases).toHaveCount(5);
  await expect(cases).toHaveText(['✓ initial values', '✓ empty', '✓ longest-plausible', '✓ typical', '✓ worst-case']);
  expect(await cases.evaluateAll((items) => items.map((item) => item.getAttribute('data-verdict')))).toEqual(Array(5).fill('parity'));

  // --- The self-test's flipped pixel: a mismatch names its case ---
  await page.evaluate(() => Object.assign(window, { 'u8g2gl:flip-harness-pixel': true }));
  await page.locator('.run-button').click();
  await expect(page.locator('.verdict')).toHaveAttribute('data-verdict', 'mismatch', { timeout: 300_000 });
  await expect(page.locator('.verdict')).toContainText('with initial values');
  await expect(page.locator('.verdict-case[data-verdict="mismatch"]')).toHaveText(['≠ initial values']);
  await page.getByRole('button', { name: 'Save bug report' }).click();
  const reportPath = await page.locator('.report-path').getAttribute('title');
  expect(reportPath).toBeTruthy();
  const report = JSON.parse(readFileSync(join(reportPath ?? '', 'report.json'), 'utf8'));
  expect(report).toMatchObject({ screen: 'departures', set: null });
  expectXmlUntouched();
});
