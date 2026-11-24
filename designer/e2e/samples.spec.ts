/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/samples.spec.ts
 * Purpose: Sample sets end to end (ui_spec §11), on the owner's test case: a
 *          set file on disk fills the departures board's train formation and
 *          service list on the canvas, an external edit to the set reaches the
 *          canvas as an XML edit would, and none of it touches the project's
 *          XML on disk.
 * Description: The tests that draw a project widget need its editor Wasm, so
 *              they need Emscripten 5.0.3 on PATH and skip without it. The
 *              active set is a view setting of the browser, so a test chooses
 *              it in the page's storage before the designer loads, as a user's
 *              earlier choice would have left it. A collection widget with no
 *              rows draws nothing, so its region's lit pixels say whether the
 *              set's rows reached it.
 */

import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { TestHandle } from '../src/test-hooks';
import { emscriptenOnPath, PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { litIn, nextFrames, openShell } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
const SET = 'samples/typical.json';
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
