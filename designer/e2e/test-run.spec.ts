/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/test-run.spec.ts
 * Purpose: Run, end to end, with the real toolchain (EDITOR-DESIGN §4): the
 *          departures project's firmware target, built by the real server and
 *          compared with the live canvas, shows `✓ parity`; the text tested is
 *          the unsaved buffer and the file is left alone; an edit afterwards
 *          marks the verdict stale; ⌘↵ in Monaco runs and inserts no line;
 *          Run waits for a rebuild and is disabled, with its reason, in each
 *          state ruling 7 names; *Run after a pause* is off until turned
 *          on, then runs after an edit and is remembered; and the self-test
 *          hook's flipped pixel shows `≠ 1 px differ`, the overlay with both
 *          hashes, and a bug report.
 * Description: The tests that build need Emscripten 5.0.3 on PATH and skip
 *              with a message without it. Each starts its own server, whose
 *              cache is its own, so every first Run builds cold.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { emscriptenOnPath, startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell, placeCaret } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** The Run button, the verdict, and the state Run is in. */
function run(page: Page): { button: ReturnType<Page['locator']>; verdict: ReturnType<Page['locator']> } {
  return { button: page.locator('.run-button'), verdict: page.locator('.verdict') };
}

/** Waits until the project renderer is current, so Run is ready. */
async function projectRendererCurrent(page: Page): Promise<void> {
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'current', { timeout: 400_000 });
  await expect(run(page).button).toHaveAttribute('data-availability', 'ready');
}

test('Run on departures shows ✓ parity, testing the unsaved buffer and leaving the file alone; an edit after marks it stale', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  await projectRendererCurrent(page);

  // --- An unsaved edit: the clock moves left in the buffer only ---
  const disk = session.read(SCREEN);
  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, 'x="190" y="51"', 4);
  await page.keyboard.press('Delete');
  await page.keyboard.type('5');
  expect(await bufferText(page, SCREEN)).toContain('x="150" y="51"');
  const posted: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/build/test-run')) posted.push(request.postData() ?? '');
  });

  // --- Run: running…, then parity ---
  await run(page).button.click();
  await expect(run(page).verdict).toHaveAttribute('data-verdict', /running|parity/);
  await expect(run(page).verdict).toHaveAttribute('data-verdict', 'parity', { timeout: 300_000 });
  await expect(run(page).verdict).toContainText(/^✓ parity · \d+ s ago$/);
  const body = JSON.parse(posted[0] ?? '{}') as { screen: string; documents: Array<{ path: string; content: string }> };
  expect(body.screen).toBe('departures');
  expect(body.documents.map((d) => d.path)).toEqual([SCREEN]);
  expect(body.documents[0]?.content).toContain('x="150" y="51"');
  expect(session.read(SCREEN)).toBe(disk);

  // --- One more edit: the verdict no longer vouches for the text ---
  // (The click left the keyboard on the button; the caret goes back first.)
  await placeCaret(page, SCREEN, 'x="150" y="51"', 4);
  await page.keyboard.type('1');
  await expect(run(page).verdict).toContainText('· 1 edit since');
});

test('⌘↵ inside Monaco runs and inserts no line', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  await projectRendererCurrent(page);
  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, 'name="sys_clock"');
  const before = await bufferText(page, SCREEN);
  for (const shortcut of ['Meta+Enter', 'Control+Enter']) {
    await page.keyboard.press(shortcut);
    await expect(run(page).verdict).toHaveAttribute('data-verdict', 'parity', { timeout: 300_000 });
    expect(await bufferText(page, SCREEN)).toBe(before);
    // Back to no verdict between the two, so the second is seen to run.
    await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.testRun.view.set({ kind: 'none' }));
  }
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('Run waits for the editor Wasm build, then runs; not well-formed and errors disable it with the reason', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);

  // --- Pressed while the project renderer builds: it waits, then runs ---
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'building');
  await expect(run(page).button).toHaveAttribute('data-availability', 'wait');
  await run(page).button.click();
  await expect(run(page).verdict).toContainText('waiting: the editor Wasm is being rebuilt');
  await expect(run(page).verdict).toHaveAttribute('data-verdict', 'parity', { timeout: 400_000 });

  // --- Not well-formed ---
  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, '<u8g2gl_clock');
  await page.keyboard.type('<');
  await expect(run(page).button).toBeDisabled();
  await expect(run(page).button).toHaveAttribute('data-reason', 'the document is not well-formed');
  await expect(run(page).button).toHaveAttribute('title', /^Run is unavailable: the document is not well-formed$/);
  await page.keyboard.press('Backspace');
  await expect(run(page).button).toBeEnabled();

  // --- Well-formed, but the canvas cannot draw it: the last good frame ---
  await placeCaret(page, SCREEN, 'font="u8g2_font_6x10_mr" format', 6);
  await page.keyboard.type('nope_');
  await expect(run(page).button).toHaveAttribute('data-reason', /last good frame/);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  await expect(run(page).button).toBeEnabled();

  // --- Placeholders on the canvas. Only transiently real (a widget added
  //     before its rebuild), so the frame state is set here to show the
  //     button's rendering of the reason ---
  await page.evaluate(() => {
    const loop = (window as unknown as TestHandle).__u8g2gl.loop;
    const state = loop.frameState.get();
    loop.frameState.set({ ...state, placeholders: [{ name: 'p', tag: 'wd_x', class: 'wd_x', rect: [0, 0, 8, 8] }] });
  });
  await expect(run(page).button).toHaveAttribute('data-reason', 'the canvas shows placeholders: the frames are not comparable');
});

test('without a toolchain Run is disabled and says why; without a source tree it says that', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'none', { timeout: 30_000 });
  await expect(run(page).button).toBeDisabled();
  await expect(run(page).button).toHaveAttribute('data-reason', "no toolchain: run 'u8g2gl toolchain install'");
  await session.stop();

  // An npm install has no runtime sources beside the CLI; the server answers
  // the editor-wasm job with that code, which this stands in for.
  session = await startDesign();
  await page.route('**/api/build/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { id: '1', job: 'editor-wasm', status: 'failed', code: 'no-source-tree', error: 'no U8G2GL source tree' } });
    } else {
      await route.fallback();
    }
  });
  await openShell(page, session.url);
  await expect(run(page).button).toHaveAttribute('data-reason', /^no U8G2GL source tree beside this CLI/, { timeout: 30_000 });
});

test('self-test: one flipped harness pixel shows ≠ 1 px differ, the overlay with both hashes, and a bug report', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  await projectRendererCurrent(page);
  await page.evaluate(() => Object.assign(window, { 'u8g2gl:flip-harness-pixel': true }));
  await run(page).button.click();
  await expect(run(page).verdict).toHaveAttribute('data-verdict', 'mismatch', { timeout: 300_000 });
  await expect(run(page).verdict).toHaveText('≠ 1 px differ at 0 ms');
  const info = page.locator('.diff-info');
  await expect(info).toHaveAttribute('data-pixels', '1');
  const live = await info.locator('[data-hash="live"]').textContent();
  const harness = await info.locator('[data-hash="harness"]').textContent();
  expect(live).toMatch(/^[0-9a-f]{64}$/);
  expect(harness).toMatch(/^[0-9a-f]{64}$/);
  expect(live).not.toBe(harness);
  await expect(page.locator('.verdict-note')).toContainText('framework bug');

  // --- The bug report: written in the build cache, its path shown ---
  await page.locator('.save-report').click();
  const shown = page.locator('.report-path');
  await expect(shown).toContainText('saved to');
  const dir = (await shown.getAttribute('title')) ?? '';
  for (const name of ['live-0ms.pbm', 'harness-0ms.pbm', 'scene.json', 'report.json']) {
    expect(existsSync(join(dir, name)), name).toBe(true);
  }
  // The report holds the server's own harness frame, which the hook (a flip
  // in the page, after the frames arrive) never touched: so here the two
  // written frames agree, and that is the proof the report took the harness
  // frame from the run's record rather than from the page.
  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as { differingPixels: number; screen: string; sha256: { live: string; harness: string } };
  expect(report).toMatchObject({ differingPixels: 0, screen: 'departures' });
  expect(report.sha256.live).toBe(live);
  expect(dir.startsWith(session.project)).toBe(false);

  // --- The next edit clears the overlay ---
  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, 'name="sys_clock"');
  await page.keyboard.type(' ');
  await expect(info).toHaveCount(0);
  await expect(run(page).verdict).toContainText('· 1 edit since');
});

test('Run after a pause: off by default; turned on, an edit runs it with no press, and the browser remembers', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  await projectRendererCurrent(page);
  const setting = page.getByLabel('Run after a pause');
  await expect(setting).not.toBeChecked();
  await setting.check();

  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, 'name="sys_clock"');
  await page.keyboard.type(' ');
  await expect(run(page).verdict).toHaveAttribute('data-verdict', 'parity', { timeout: 300_000 });
  await expect(run(page).verdict).toContainText(/^✓ parity · \d+ s ago$/);

  await page.reload();
  await expect(page.getByLabel('Run after a pause')).toBeChecked();
});
