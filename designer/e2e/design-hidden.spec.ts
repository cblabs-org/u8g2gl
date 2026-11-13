/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/design-hidden.spec.ts
 * Purpose: Hiding an element in the designer, in the real shell (ui_spec §6,
 *          §8): the eye takes its pixels out of the frame and lets a click
 *          select what was beneath; the canvas toolbar says the canvas is not
 *          the exported view, and Show all brings it back; a hidden element
 *          selected from the tree is outlined dashed with nothing to grab, and
 *          has no outline box; the hiding survives a reload and is never an
 *          edit — no ●, nothing for Save to write, the disk untouched; the
 *          eye works from the keyboard and never selects; the row inside a
 *          hidden one is hidden by its parent; the device's own hiding shows
 *          as a separate "hidden by data" mark; a Wasm that cannot hide
 *          disables the eyes and says why; and a test run with an element
 *          hidden still reports parity, because it draws the exported view.
 * Description: The departures project, where at (10, 25) `formation` is drawn
 *              over `plat_num` over `plat_box`, plus a second screen with a
 *              container and a label a binding hides with the sample data.
 *              Pixels are compared by the frame canvas's hash; state is read
 *              through the test build's workspace handle.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { emscriptenOnPath, PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, canvasPixels, clickCanvas, nextFrames, openFile, openShell, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
const NOTES = 'screens/screen_notes.xml';
/** A screen with a container, and a label its binding hides while `show_note` is false. */
const NOTES_TEXT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<screen name="notes">',
  '    <view>',
  '        <u8g2gl_obj name="panel" x="10" y="10" width="80" height="40" border="true">',
  '            <u8g2gl_box name="dot" x="2" y="2" width="4" height="4" />',
  '        </u8g2gl_obj>',
  '        <u8g2gl_label name="note" x="100" y="2" width="60" height="10" font="u8g2_font_6x10_mr" text="Note">',
  '            <bind_flag_if_eq subject="show_note" ref_value="0" flag="hidden" />',
  '        </u8g2gl_label>',
  '    </view>',
  '</screen>',
  '',
].join('\n');

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// item
// An element row by name, anywhere in the Explorer.
function item(page: Page, name: string): Locator {
  return page.getByRole('complementary', { name: 'Explorer' }).getByRole('treeitem', { name, exact: true });
}

// eye
// An element row's eye, by the name it carries now.
function eye(page: Page, name: string): Locator {
  return row(page, name).locator('.eye');
}

// row
// An element row's own line, not its children's.
function row(page: Page, name: string): Locator {
  return item(page, name).locator(':scope > .element-row');
}

/** The canvas toolbar's `N hidden · Show all` badge. */
function badge(page: Page): Locator {
  return page.locator('.canvas-toolbar .design-hidden-badge');
}

/** Whether a document has unsaved changes. */
async function dirty(page: Page, path: string): Promise<boolean> {
  return page.evaluate((p) => (window as unknown as TestHandle).__u8g2gl.documents.dirty.get().has(p), path);
}

/** The overlay's rectangles of one kind, as composed. */
async function overlay(page: Page, kind: string): Promise<{ x: number; y: number; handles?: boolean; dashed?: boolean }[]> {
  return page.evaluate((k) => (window as unknown as TestHandle).__u8g2gl.loop.overlay.filter((rect) => rect.kind === k), kind);
}

/** Opens the departures screen with a still frame. */
async function open(page: Page, files: Record<string, string> = {}): Promise<void> {
  session = await startDesign({ files });
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await nextFrames(page, 2);
}

test('the eye takes an element out of the frame and lets a click select beneath it; the badge says so and Show all restores', async ({ page }) => {
  await open(page);
  const shown = await canvasPixels(page);
  await clickCanvas(page, 10, 25);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['formation'] });
  await page.keyboard.press('Escape');
  await expect(badge(page)).toHaveCount(0);

  // --- Hide formation: its pixels go, the row dims, the badge appears ---
  await expect(eye(page, 'formation')).toHaveAttribute('aria-pressed', 'false');
  await eye(page, 'formation').click();
  await expect(eye(page, 'formation')).toHaveAttribute('aria-pressed', 'true');
  await expect(eye(page, 'formation')).toHaveAccessibleName('Show formation');
  await expect(row(page, 'formation')).toHaveClass(/design-hidden/);
  await expect.poll(() => canvasPixels(page)).not.toBe(shown);
  await expect(badge(page)).toHaveText('1 hidden · Show all');
  // The eye never selects.
  await expect.poll(() => selectedNames(page)).toEqual({ file: undefined, names: [] });

  // --- A click where it was lands on the element beneath ---
  await clickCanvas(page, 10, 25);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['plat_num'] });
  const targets = await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.loop.hitTargets.get().targets.map((t) => t.name));
  expect(targets).not.toContain('formation');

  // --- Outlines box only what is drawn ---
  const boxes = await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.loop.bounds.get().size);
  await page.getByRole('button', { name: /Outlines/ }).click();
  await expect.poll(async () => (await overlay(page, 'outline')).length).toBe(boxes - 1);
  await page.getByRole('button', { name: /Outlines/ }).click();

  // --- Selected from the tree, it is outlined dashed with nothing to grab ---
  await row(page, 'formation').locator('.element-name').click();
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['formation'] });
  await expect.poll(() => overlay(page, 'selection')).toEqual([expect.objectContaining({ x: 0, y: 17, dashed: true, handles: false })]);
  await expect(page.getByRole('complementary', { name: 'Properties' }).locator('.panel-title')).toHaveText('wd_train_formation');

  // --- Show all: everything back, the badge gone ---
  await badge(page).getByRole('button', { name: 'Show all' }).click();
  await expect(badge(page)).toHaveCount(0);
  await expect.poll(() => canvasPixels(page)).toBe(shown);
  await expect(eye(page, 'formation')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => overlay(page, 'selection')).toEqual([expect.objectContaining({ x: 0, y: 17, handles: true })]);
});

test('hiding is never an edit: no ●, Save writes nothing, the disk is untouched; it survives a reload; the screen menu shows all', async ({ page }) => {
  await open(page);
  const disk = session?.read(SCREEN);
  const text = await bufferText(page, SCREEN);
  const shown = await canvasPixels(page);

  // --- Hide two; the file stays clean ---
  await eye(page, 'formation').click();
  await eye(page, 'plat_num').click();
  await expect(badge(page)).toHaveText('2 hidden · Show all');
  const hidden = await canvasPixels(page);
  expect(hidden).not.toBe(shown);
  expect(await dirty(page, SCREEN)).toBe(false);
  await expect(page.locator(`.file[data-path="${SCREEN}"]`)).not.toHaveClass(/dirty/);
  expect(await bufferText(page, SCREEN)).toBe(text);
  // ⌘S / Ctrl-S has nothing to write.
  await page.keyboard.press('ControlOrMeta+s');
  await nextFrames(page, 3);
  expect(session?.read(SCREEN)).toBe(disk);

  // --- A reload remembers it ---
  await page.reload();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false', { timeout: 20_000 });
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await expect(eye(page, 'formation')).toHaveAttribute('aria-pressed', 'true');
  await expect(eye(page, 'plat_num')).toHaveAttribute('aria-pressed', 'true');
  await expect(badge(page)).toHaveText('2 hidden · Show all');
  await expect.poll(() => canvasPixels(page)).toBe(hidden);

  // --- The screen's menu: Show all elements, then disabled ---
  const fileRow = page.locator(`.file[data-path="${SCREEN}"]`);
  await fileRow.click({ button: 'right' });
  const showAll = page.getByRole('menuitem', { name: 'Show all elements' });
  await expect(showAll).not.toHaveAttribute('aria-disabled', 'true');
  await showAll.click();
  await expect(badge(page)).toHaveCount(0);
  await expect.poll(() => canvasPixels(page)).toBe(shown);
  await fileRow.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Show all elements' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  expect(session?.read(SCREEN)).toBe(disk);
});

test('the eye from the keyboard: Tab from the row reaches it, Space and Enter toggle it, and the selection never moves', async ({ page }) => {
  await open(page);
  await row(page, 'sys_clock').locator('.element-name').click();
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['sys_clock'] });
  await page.keyboard.press('Tab');
  await expect(eye(page, 'sys_clock')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(eye(page, 'sys_clock')).toHaveAttribute('aria-pressed', 'true');
  await expect(badge(page)).toHaveText('1 hidden · Show all');
  await page.keyboard.press('Enter');
  await expect(eye(page, 'sys_clock')).toHaveAttribute('aria-pressed', 'false');
  await expect(badge(page)).toHaveCount(0);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['sys_clock'] });
});

test('a row inside a hidden one is hidden by its parent; the device’s own hiding is a separate mark; a Wasm that cannot hide says why', async ({ page }) => {
  const globals = readFileSync(join(PROJECT_FIXTURE, 'globals.xml'), 'utf8');
  session = await startDesign({
    files: { [NOTES]: NOTES_TEXT, 'globals.xml': globals.replace('<subjects>', '<subjects>\n        <bool name="show_note" value="false" />') },
  });
  await openShell(page, session.url);
  await openFile(page, NOTES);
  await expect(page.locator('.canvas-toolbar .screen-name')).toHaveText('notes');

  // --- Hidden by data: a quiet mark, not the eye, and only while the data hides it ---
  const mark = row(page, 'note').locator('.data-hidden-mark');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('title', 'Hidden by its bindings with the current sample data — the device would not draw it');
  await expect(eye(page, 'note')).toHaveAttribute('aria-pressed', 'false');
  await expect(row(page, 'panel').locator('.data-hidden-mark')).toHaveCount(0);
  await openFile(page, 'globals.xml');
  await page.evaluate(() => {
    const model = (window as unknown as TestHandle).__u8g2gl.documents.modelOf('globals.xml');
    model?.setValue(model.getValue().replace('name="show_note" value="false"', 'name="show_note" value="true"'));
  });
  await expect(mark).toHaveCount(0);

  // --- Hidden by a parent: dimmed, its eye disabled and saying so ---
  await openFile(page, NOTES);
  await eye(page, 'panel').click();
  await expect(row(page, 'dot')).toHaveClass(/design-hidden/);
  await expect(eye(page, 'dot')).toBeDisabled();
  await expect(eye(page, 'dot')).toHaveAccessibleName('dot is hidden with panel');
  // The badge counts the rows the author hid, not what is inside them.
  await expect(badge(page)).toHaveText('1 hidden · Show all');
  const targets = await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.loop.hitTargets.get().targets.map((t) => t.name));
  expect(targets).toEqual(['note']);

  // --- A Wasm without the hiding exports: every eye disabled, with the reason, nothing treated as hidden ---
  await page.evaluate(() => {
    const wasm = (window as unknown as TestHandle).__u8g2gl.wasm;
    const module = wasm.module.get();
    if (module !== undefined) wasm.module.set({ ...module, designHiding: false });
  });
  await expect(eye(page, 'note')).toBeDisabled();
  await expect(eye(page, 'note')).toHaveAttribute('title', "Hiding needs the project's editor Wasm to be rebuilt");
  await expect(badge(page)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.loop.hitTargets.get().targets.map((t) => t.name)))
    .toEqual(['panel', 'dot', 'note']);
});

test('a test run with an element hidden still reports parity: it draws the exported view', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'current', { timeout: 400_000 });
  await expect(page.locator('.run-button')).toHaveAttribute('data-availability', 'ready');
  await openFile(page, SCREEN);

  // --- Hide one element; the canvas shows it gone ---
  await page.getByRole('button', { name: /live/ }).click();
  await nextFrames(page, 2);
  const shown = await canvasPixels(page);
  await eye(page, 'plat_label').click();
  await expect(badge(page)).toHaveText('1 hidden · Show all');
  await expect.poll(() => canvasPixels(page)).not.toBe(shown);

  // --- Run: parity, and the canvas afterwards is still the designer's view ---
  await page.locator('.run-button').click();
  await expect(page.locator('.verdict')).toHaveAttribute('data-verdict', 'parity', { timeout: 300_000 });
  await expect(eye(page, 'plat_label')).toHaveAttribute('aria-pressed', 'true');
  await expect(badge(page)).toHaveText('1 hidden · Show all');
  const after = await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.loop.hitTargets.get().targets.map((t) => t.name));
  expect(after).not.toContain('plat_label');
});
