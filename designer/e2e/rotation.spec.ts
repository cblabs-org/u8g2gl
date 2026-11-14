/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/rotation.spec.ts
 * Purpose: A target's rotation end to end (design_spec §5.1, ui_spec §6.4).
 *          A quarter turn swaps the panel's width and height, so it is
 *          previewed like a new display: the elements that would fall outside
 *          are named before anything is written, applying it resizes the
 *          canvas, and one undo restores it. A half turn keeps the size and
 *          applies at once. And Run on a portrait project draws the firmware
 *          frame portrait too, since the harness sizes itself from the scene.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project (256×64 SSD1322 at R0), in the end-to-end test build.
 *              The canvas's size is read from its toolbar. The Run test needs
 *              Emscripten 5.0.3 on PATH and skips without it; it reads the
 *              firmware frame's size from the server's own test-run record.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { emscriptenOnPath, PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** The canvas's display size, from its toolbar. */
const canvasSize = (page: Page) => page.locator('.canvas-toolbar .dim');
/** The u8g2gl.xml form. */
const form = (page: Page) => page.locator('.project-form[data-form-file="u8g2gl.xml"]');
/** The first target's rotation field. */
const rotationField = (page: Page) => form(page).locator('.form-field[data-field="display/rotation"]').first();

/** The departures screen redrawn portrait: in bounds at R1, past the bottom at R0. */
const PORTRAIT_SCREEN = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="departures">
    <view>
        <u8g2gl_box name="top" x="0" y="0" width="64" height="16" />
        <u8g2gl_box name="low" x="0" y="200" width="64" height="40" filled="false" />
    </view>
</screen>
`;

test('R0 → R1 previews the elements outside, applies as a 64×256 canvas, and one undo restores 256×64', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await expect(canvasSize(page)).toHaveText('256×64');
  await openFile(page, 'u8g2gl.xml');
  const before = await bufferText(page, 'u8g2gl.xml');

  // --- The preview: every screen at 64×256, what no longer fits named ---
  await rotationField(page).getByRole('combobox', { name: 'rotation' }).selectOption('R1');
  const candidate = rotationField(page).locator('.rotation-candidate');
  await expect(candidate).toBeVisible();
  await expect(candidate).toContainText('the 256×64 panel is shown 64×256 at R1');
  await expect(candidate.locator('.impact-preview')).toBeVisible({ timeout: 15_000 });
  const screen = candidate.locator('.impact-screen[data-screen="departures"]');
  await expect(screen).toBeVisible();
  await expect(screen.locator('figcaption')).toContainText('departures · 64×256');
  const outside = ((await screen.getAttribute('data-outside')) ?? '').split(' ').filter((name) => name !== '');
  // The landscape layout's wide elements run off a 64px-wide display.
  expect(outside).toContain('formation');
  expect(outside).toContain('message_bar');
  console.log(`rotation preview: departures at R1, outside: ${outside.join(', ')}`);
  // Nothing is written until the author confirms.
  expect(await bufferText(page, 'u8g2gl.xml')).toBe(before);
  await expect(canvasSize(page)).toHaveText('256×64');

  // --- Confirmed: one edit, the rotation only, and the canvas turns ---
  await candidate.getByRole('button', { name: 'Use this rotation' }).click();
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before.replace('rotation="R0"', 'rotation="R1"'));
  await expect(canvasSize(page)).toHaveText('64×256');
  await expect(rotationField(page).locator('.rotation-candidate')).toHaveCount(0);
  // The picker still names the panel at its own size, and what it is shown at.
  await expect(form(page).locator('.display-current .display-facts').first()).toContainText('256×64 · shown 64×256 at R1');

  // --- Undo restores the text and the canvas ---
  await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.documents.modelOf('u8g2gl.xml')?.undo());
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before);
  await expect(canvasSize(page)).toHaveText('256×64');
});

test('a cancelled quarter turn writes nothing', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  const before = await bufferText(page, 'u8g2gl.xml');
  await rotationField(page).getByRole('combobox', { name: 'rotation' }).selectOption('270');
  const candidate = rotationField(page).locator('.rotation-candidate');
  await expect(candidate.locator('.impact-preview')).toBeVisible({ timeout: 15_000 });
  await candidate.getByRole('button', { name: 'Cancel' }).click();
  await expect(candidate).toHaveCount(0);
  expect(await bufferText(page, 'u8g2gl.xml')).toBe(before);
  await expect(canvasSize(page)).toHaveText('256×64');
});

test('R0 → R2 keeps the size, so it applies at once with no preview', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  const before = await bufferText(page, 'u8g2gl.xml');
  await rotationField(page).getByRole('combobox', { name: 'rotation' }).selectOption('R2');
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before.replace('rotation="R0"', 'rotation="R2"'));
  await expect(rotationField(page).locator('.rotation-candidate')).toHaveCount(0);
  await expect(canvasSize(page)).toHaveText('256×64');
});

test('Run on a portrait project draws a 64×256 firmware frame, at parity with the canvas', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  // Written before the server starts, as an author's portrait project would be.
  const project = readFileSync(join(PROJECT_FIXTURE, 'u8g2gl.xml'), 'utf8');
  expect(project).toContain('rotation="R0"');
  session = await startDesign({
    toolchain: true,
    files: { 'u8g2gl.xml': project.replace('rotation="R0"', 'rotation="R1"'), 'screens/screen_departures.xml': PORTRAIT_SCREEN },
  });
  const sizes: { width: number; height: number; bytes: number }[] = [];
  page.on('response', async (response) => {
    if (!/\/api\/build\/[^/]+$/.test(new URL(response.url()).pathname) || response.request().method() !== 'GET') return;
    const record = (await response.json().catch(() => undefined)) as
      | { status?: string; result?: { display: { width: number; height: number }; frames: { bytes: string }[] } }
      | undefined;
    const result = record?.status === 'succeeded' ? record.result : undefined;
    if (result?.display !== undefined) {
      sizes.push({ ...result.display, bytes: Buffer.from(result.frames[0]?.bytes ?? '', 'base64').length });
    }
  });
  await openShell(page, session.url);
  await expect(canvasSize(page)).toHaveText('64×256');
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'current', { timeout: 400_000 });
  await expect(page.locator('.run-button')).toHaveAttribute('data-availability', 'ready');

  await page.locator('.run-button').click();
  await expect(page.locator('.verdict')).toHaveAttribute('data-verdict', 'parity', { timeout: 300_000 });
  // U8G2's tile buffer for 64×256: 64 columns × 32 tile rows of 8 pixels.
  await expect.poll(() => sizes.at(-1)).toEqual({ width: 64, height: 256, bytes: (64 * 256) / 8 });
});
