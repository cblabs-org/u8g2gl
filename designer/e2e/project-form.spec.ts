/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/project-form.spec.ts
 * Purpose: The project-file forms end to end (ui_spec §2 principle 8): opening
 *          `u8g2gl.xml` or `globals.xml` shows form ∥ XML; a form edit is one
 *          text edit and one undo stop in that file's buffer; items are added
 *          and removed; the Explorer lists each file's sections and a row
 *          opens its section; a comment survives an edit; text that does not
 *          parse keeps the last form, read-only, saying why; and the field's
 *          own problem shows on it with the Problems panel's code.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, in the end-to-end test build. Undo is the Monaco
 *              model's own, through the test handle, as align.spec.ts does.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell, placeCaret } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// undo
// Undoes the last stop of a file's buffer.
async function undo(page: Page, file: string): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), file);
}

// form
// The form shown for a file.
const form = (page: Page, file: string) => page.locator(`.project-form[data-form-file="${file}"]`);

// labels
// A tree's row labels, in order.
const labels = (tree: Locator) => tree.getByRole('treeitem').evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));

// field
// A field of the form by its vocabulary id, in the n-th item that has it.
const field = (page: Page, file: string, id: string, n = 0) => form(page, file).locator(`.form-field[data-field="${id}"]`).nth(n);

test('opening u8g2gl.xml shows its form beside the XML; an edit is one line in the buffer and one undo stop', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  await expect(form(page, 'u8g2gl.xml')).toBeVisible();
  await expect(form(page, 'u8g2gl.xml').locator('.form-section > h3')).toHaveText(['Project', 'Targets (1)', 'Output']);
  // The XML editor is still there, beside it.
  await expect(page.locator('.editor-host[data-editor-path="u8g2gl.xml"] .monaco-editor')).toBeVisible();

  const before = await bufferText(page, 'u8g2gl.xml');
  const name = field(page, 'u8g2gl.xml', 'project/name').getByRole('textbox', { name: 'name' });
  await name.fill('departures');
  await name.press('Enter');
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before.replace('name="probe"', 'name="departures"'));
  await expect(page.locator('.editor-host[data-editor-path="u8g2gl.xml"]')).toHaveAttribute('data-dirty', 'true');

  await undo(page, 'u8g2gl.xml');
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before);
  await expect(name).toHaveValue('probe');

  // The schema is shown, never edited.
  await expect(field(page, 'u8g2gl.xml', 'project/schema').locator('[data-readonly="true"]')).toHaveText('0.6');
  await expect(field(page, 'u8g2gl.xml', 'project/schema').getByRole('textbox')).toHaveCount(0);
});

test('globals.xml: a subject is added and removed through the form, and the canvas file is untouched', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  await expect(form(page, 'globals.xml').locator('.form-section > h3')).toHaveText(['Subjects (7)', 'Fonts (2)', 'Images (0)', 'Styles (0)', 'Consts (0)']);
  const before = await bufferText(page, 'globals.xml');

  await form(page, 'globals.xml').getByRole('button', { name: '+ Bool subject' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<bool name="subject_1" />');
  await expect(form(page, 'globals.xml').locator('.form-section > h3').first()).toHaveText('Subjects (8)');

  await form(page, 'globals.xml').getByRole('button', { name: 'Remove Bool subject subject_1' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);
  expect(session.read('globals.xml')).toBe(before);
});

test('the Explorer lists each project file’s sections from the buffer; a row opens its section', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  const explorer = page.getByRole('complementary', { name: 'Explorer' });
  await explorer.getByRole('button', { name: 'Show the sections of globals.xml' }).click();
  const globals = explorer.getByRole('tree', { name: 'Sections of globals.xml' });
  await expect.poll(() => labels(globals)).toEqual(['Subjects (7)', 'Fonts (2)', 'Images (0)', 'Styles (0)', 'Consts (0)']);
  await explorer.getByRole('button', { name: 'Show the sections of u8g2gl.xml' }).click();
  const project = explorer.getByRole('tree', { name: 'Sections of u8g2gl.xml' });
  await expect.poll(() => labels(project)).toEqual(['Project', 'Targets', 'primary', 'Output']);
  await expect(project.getByRole('treeitem', { name: 'Targets' })).toHaveAttribute('aria-expanded', 'true');

  // A row opens the file, with its form at that section.
  await globals.getByRole('treeitem', { name: 'Fonts (2)' }).click();
  await expect(form(page, 'globals.xml')).toBeVisible();
  await expect(form(page, 'globals.xml').locator('[data-section="globals.xml>fonts"]')).toBeInViewport();

  // Keys: Down moves, Enter opens.
  await globals.getByRole('treeitem', { name: 'Fonts (2)' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(globals.getByRole('treeitem', { name: 'Images (0)' })).toBeFocused();

  // Counts follow the buffer, before any save.
  await form(page, 'globals.xml').getByRole('button', { name: '+ Built-in font' }).click();
  await expect(globals.getByRole('treeitem', { name: 'Fonts (3)' })).toBeVisible();
});

test('a comment and the layout survive a form edit: the diff is the one value', async ({ page }) => {
  const text =
    '<?xml version="1.0" encoding="UTF-8"?>\n<!-- the project -->\n<u8g2gl schema="0.6" name="probe" version="1.0.0">\n    <targets>\n        <!-- the board on the bench -->\n        <target name="primary" setup="U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI" rotation="R0" />\n    </targets>\n    <output dir="generated" />\n</u8g2gl>\n';
  session = await startDesign({ files: { 'u8g2gl.xml': text } });
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  const version = field(page, 'u8g2gl.xml', 'project/version').getByRole('textbox', { name: 'version' });
  await version.fill('1.1.0');
  await version.press('Enter');
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(text.replace('version="1.0.0"', 'version="1.1.0"'));
});

test('text that does not parse keeps the last form, read-only, with the problem shown', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  await expect(form(page, 'globals.xml')).toHaveAttribute('data-readonly', 'false');
  await placeCaret(page, 'globals.xml', '<fonts>');
  await page.keyboard.type('<');
  await expect(form(page, 'globals.xml')).toHaveAttribute('data-readonly', 'true');
  await expect(form(page, 'globals.xml').getByRole('alert')).toContainText('cannot be read');
  // The last form is still shown, its controls disabled.
  await expect(form(page, 'globals.xml').locator('.form-section > h3').first()).toHaveText('Subjects (7)');
  await expect(form(page, 'globals.xml').getByRole('button', { name: '+ Int subject' })).toBeDisabled();
  await page.keyboard.press('Backspace');
  await expect(form(page, 'globals.xml')).toHaveAttribute('data-readonly', 'false');
});

test('a field’s problem shows on it with the Problems panel’s code; the XML caret scrolls the form, the form highlights the XML', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  const rotation = field(page, 'u8g2gl.xml', 'display/rotation');
  await rotation.getByRole('combobox', { name: 'rotation' }).selectOption('R2');
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toContain('rotation="R2"');
  await placeCaret(page, 'u8g2gl.xml', 'R2');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await page.keyboard.type('R9');
  await expect(rotation.locator('.field-problem[data-code="U8G2GL_INVALID_ENUM_VALUE"]')).toContainText("Invalid rotation 'R9'");
  await expect(page.locator('.problems .problem[data-code="U8G2GL_INVALID_ENUM_VALUE"]')).toBeVisible();

  // The caret moved into <output> marks the Output section, and focus stays in
  // the XML. A key moves it, as the author would: a caret placed by an open
  // request is not the author's and moves no form.
  await placeCaret(page, 'u8g2gl.xml', 'dir=');
  await page.keyboard.press('ArrowRight');
  await expect(form(page, 'u8g2gl.xml').locator('[data-section="u8g2gl.xml>output"]')).toHaveAttribute('data-current', 'true');
  expect(await page.evaluate(() => document.activeElement?.closest('.editor-host')?.getAttribute('data-editor-path'))).toBe('u8g2gl.xml');

  // Focusing a form field highlights its element in the XML.
  await field(page, 'u8g2gl.xml', 'output/dir').getByRole('combobox', { name: 'dir' }).focus();
  await expect(page.locator('.editor-host[data-editor-path="u8g2gl.xml"] .selected-element').first()).toBeVisible();
});
