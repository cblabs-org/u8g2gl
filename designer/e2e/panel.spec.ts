/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/panel.spec.ts
 * Purpose: The property panel end to end (ui_spec §9): generated from the
 *          departures project's manifests, it shows the selected element's
 *          fields with geometry first, the element's own props, and the
 *          collapsed *From u8g2gl_obj* group ([Q-10]); with nothing selected,
 *          the screen's own. Each type has its control (§9.1), and each
 *          committed value — Enter, blur, a stepper, a toggle, a choice — is
 *          one undo stop with a one-line diff; typing alone writes nothing,
 *          and reset removes the attribute.
 * Description: Each test starts `u8g2gl design` on a fresh copy of the
 *              departures project and selects and edits through the canvas and
 *              the panel, as a user would; undo is the editor's own key.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, openFile, openShell, placeCaret } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
/** The departures screen as the fixture has it. */
const PROJECT_TEXT = readFileSync(join(PROJECT_FIXTURE, SCREEN), 'utf8');

/** The lines of the buffer that differ from the fixture's. */
async function changedLines(page: Page): Promise<string[]> {
  const before = PROJECT_TEXT.split('\n');
  return (await bufferText(page, SCREEN)).split('\n').filter((line, i) => line !== before[i]);
}

/**
 * Undo once, with the editor's own key, as a user would. Monaco binds its
 * modifier by the user agent's platform, not the keyboard's, so the key is
 * chosen the same way.
 */
async function undo(page: Page): Promise<void> {
  await page.locator(`.editor-host[data-editor-path="${SCREEN}"] .view-lines`).click();
  const mac = await page.evaluate(() => /Macintosh/.test(navigator.userAgent));
  await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

/** A field of the panel by attribute. */
const field = (page: Page, key: string) => panel(page).locator(`[data-field="${key}"]`);

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Opens the shell on the departures screen with a still frame. */
async function open(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
}

/** The panel's region. */
const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties' });

test('selecting an element shows its manifest’s fields: geometry first, its own props, and u8g2gl_obj’s collapsed', async ({ page }) => {
  await open(page);
  // sys_clock: 190, 51, 66 × 13.
  await clickCanvas(page, 220, 57);
  await expect(panel(page).locator('.panel-title')).toHaveText('u8g2gl_clock');
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('sys_clock');
  const sections = panel(page).locator('.panel-section');
  await expect(sections).toHaveCount(3);
  await expect(sections.nth(0).locator('.field').evaluateAll((fields) => fields.map((f) => f.getAttribute('data-field')))).resolves.toEqual(['x', 'y', 'width', 'height']);
  await expect(sections.nth(1).locator('.field').evaluateAll((fields) => fields.map((f) => f.getAttribute('data-field')))).resolves.toEqual([
    'time',
    'format',
    'font',
    'secondary_font',
    'blink',
    'bind_time',
  ]);
  const inherited = panel(page).locator('details.inherited');
  await expect(inherited.locator('summary')).toHaveText('From u8g2gl_obj');
  await expect(inherited).not.toHaveAttribute('open', '');
  // Help renders beneath the control, not on hover (ui_spec §9.2).
  await expect(panel(page).locator('[data-field="blink"] .field-help')).toHaveText('Enable 1Hz colon blink animation.');
});

test('with nothing selected the panel shows the screen’s own properties', async ({ page }) => {
  await open(page);
  await expect(panel(page).locator('.panel-title')).toHaveText('<screen>');
  await expect(panel(page).locator('[data-field="name"]')).toBeVisible();
  await expect(panel(page).locator('.panel-note').first()).toHaveText('Display 256×64');
});

test('typing in a field writes nothing until Enter; the commit is a one-line diff and one undo stop', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock
  const x = field(page, 'x').getByRole('textbox', { name: 'x' });
  await x.fill('180');
  await page.waitForTimeout(100);
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
  await x.press('Enter');
  await expect.poll(() => changedLines(page)).toEqual([
    '        <u8g2gl_clock name="sys_clock" x="180" y="51" width="66" height="13" font="u8g2_font_6x10_mr" format="hh_mm_ss" blink="false" bind_time="system_time" />',
  ]);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 180,51 66×13');
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
});

test('blur commits, Escape abandons the draft, and a draft the type refuses is flagged as typed and not written', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57);
  const width = field(page, 'width').getByRole('textbox', { name: 'width' });
  await width.fill('60');
  await width.press('Escape');
  await width.blur();
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
  await expect(width).toHaveValue('66');

  await width.fill('6x');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'width').locator('.field-problem.draft')).toContainText('integer');
  await width.press('Enter');
  await width.blur();
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);

  await width.fill('60');
  await width.blur();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('width="60"');
});

test('each stepper click commits one value and one undo stop', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57);
  await field(page, 'y').getByRole('button', { name: 'y − 1' }).click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('y="50"');
  await field(page, 'y').getByRole('button', { name: 'y − 1' }).click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('y="49"');
  await undo(page);
  await expect.poll(async () => (await changedLines(page))[0]).toContain('y="50"');
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
});

test('a toggle, a segmented control and a dropdown each commit their choice; reset removes the attribute', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock: blink="false", format="hh_mm_ss"
  const blink = field(page, 'blink').getByRole('switch', { name: 'blink' });
  await expect(blink).toHaveAttribute('aria-checked', 'false');
  await blink.click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('blink="true"');
  await expect(blink).toHaveAttribute('aria-checked', 'true');

  // Two options: a segmented control.
  await field(page, 'format').getByRole('button', { name: 'hh_mm', exact: true }).click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('format="hh_mm"');

  // A font: a dropdown of the project's fonts, built-ins with their pixel heights.
  await expect(field(page, 'font').getByRole('combobox', { name: 'font' }).locator('option')).toContainText(['u8g2_font_6x10_mr · 10 px', 'u8g2_font_helvR08_tr · 11 px']);
  await expect(panel(page).locator('.panel-note', { hasText: 'Font heights' })).toHaveCount(0);
  await field(page, 'font').getByRole('combobox', { name: 'font' }).selectOption('u8g2_font_helvR08_tr');
  await expect.poll(async () => (await changedLines(page))[0]).toContain('font="u8g2_font_helvR08_tr"');

  // Reset: the attribute goes, and the field shows the default, greyed.
  await field(page, 'blink').getByRole('button', { name: 'Reset blink' }).click();
  await expect.poll(async () => (await changedLines(page))[0]).not.toContain('blink=');
  await expect(field(page, 'blink')).toHaveAttribute('data-written', 'false');
  await expect(field(page, 'blink').getByRole('button', { name: 'Reset blink' })).toHaveCount(0);
});

test('a binding’s dropdown offers only subjects of a type it accepts, and choosing one binds it', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock: bind_time takes a time subject
  const bindTime = field(page, 'bind_time').getByRole('combobox', { name: 'bind_time' });
  const options = await bindTime.locator('option').allTextContents();
  expect(options).toEqual(['not bound', 'system_time · time']);
  // message_bar's bind_text accepts string or int subjects. formation is drawn
  // over it, so the second click at that point cycles down to it.
  await clickCanvas(page, 100, 22);
  await clickCanvas(page, 100, 22);
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('message_bar');
  const bindText = field(page, 'bind_text').getByRole('combobox', { name: 'bind_text' });
  expect(await bindText.locator('option').allTextContents()).toEqual([
    'not bound',
    'platform · string',
    'row0_time · string',
    'row0_dest · string',
    'row0_status · string',
    'box_fill · int',
    'message_text · string',
  ]);
  await bindText.selectOption('row0_dest');
  await expect.poll(async () => (await changedLines(page))[0]).toContain('bind_text="row0_dest"');
});

/** The fixture's globals with one constant, and its screen with an expression and an anchor. */
function guidanceProject(): Record<string, string> {
  const globals = readFileSync(join(PROJECT_FIXTURE, 'globals.xml'), 'utf8').replace('<globals>', '<globals>\n    <consts>\n        <int name="margin" value="4" />\n    </consts>');
  const screen = PROJECT_TEXT.replace('name="sys_clock" x="190"', 'name="sys_clock" x="#margin + 186"').replace('name="plat_label" x="5"', 'name="plat_label" right="233"');
  return { 'globals.xml': globals, [SCREEN]: screen };
}

/** Opens the shell on the guidance project's screen, frozen. */
async function openGuidance(page: Page): Promise<string> {
  const files = guidanceProject();
  session = await startDesign({ files });
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  return files[SCREEN] ?? '';
}

test('an expression offers Detach, which writes the literal the scene computed as one undo stop, and Edit in XML', async ({ page }) => {
  const original = await openGuidance(page);
  await clickCanvas(page, 220, 57); // sys_clock, at #margin + 186 = 190
  const x = field(page, 'x');
  await expect(x.locator('.field-reason')).toContainText('x is computed from #margin + 186');
  await x.getByRole('button', { name: 'Detach' }).click();
  await expect.poll(() => bufferText(page, SCREEN)).toBe(original.replace('x="#margin + 186"', 'x="190"'));
  await expect(x.getByRole('button', { name: 'Detach' })).toHaveCount(0);
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(original);

  // Edit in XML: the editor takes the keyboard, its caret at the start of the
  // expression, so what is typed next lands there.
  await clickCanvas(page, 220, 57);
  await x.getByRole('button', { name: 'Edit in XML' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.monaco-editor') != null)).toBe(true);
  await page.keyboard.type('(');
  await expect.poll(() => bufferText(page, SCREEN)).toBe(original.replace('x="#margin + 186"', 'x="(#margin + 186"'));
});

test('right disables x and bind_text disables text, each with its reason, and Edit in XML shows what disabled it', async ({ page }) => {
  const original = await openGuidance(page);
  await clickCanvas(page, 12, 12); // plat_label, anchored by right="233"
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('plat_label');
  const x = field(page, 'x');
  await expect(x).toHaveAttribute('data-disabled', 'true');
  await expect(x.getByRole('textbox', { name: 'x' })).toBeDisabled();
  await expect(x.locator('.field-reason')).toHaveText(
    `x is set by right="233": the element is anchored to its container's right edge, and setting both would over-constrain it (§7.2).`,
  );
  await expect(field(page, 'y')).toHaveAttribute('data-disabled', 'false');
  await x.getByRole('button', { name: 'Edit in XML' }).click();
  await page.keyboard.type('1');
  await expect.poll(() => bufferText(page, SCREEN)).toBe(original.replace('right="233"', 'right="1233"'));

  // message_bar, under formation: the second click at that point.
  await clickCanvas(page, 100, 22);
  await clickCanvas(page, 100, 22);
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('message_bar');
  const text = field(page, 'text');
  await expect(text).toHaveAttribute('data-disabled', 'true');
  await expect(text.locator('.field-reason')).toHaveText(
    "text is bound to 'message_text' by bind_text: the subject's value replaces it, so edit the binding or the sample data instead (§8.4).",
  );
  await expect(text.getByRole('button', { name: 'Detach' })).toHaveCount(0);
  await expect(text.getByRole('button', { name: 'Edit in XML' })).toBeVisible();
});

test('a value the validator rejects is flagged at its field, with the validator’s reason', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock, x 190: 66 wide fits the 256-pixel display exactly
  const width = field(page, 'width');
  await width.getByRole('textbox', { name: 'width' }).fill('80');
  await width.getByRole('textbox', { name: 'width' }).press('Enter');
  await expect(width.locator('.field-problem.error')).toHaveCount(1);
  await expect(width.locator('.field-problem.error')).toContainText('display is 256px wide');
  await expect(field(page, 'height').locator('.field-problem')).toHaveCount(0);
});

test('a prop at its default is greyed with no reset; a project widget says its RAM cost is not reported ([Q-19]); a framework one does not', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 100, 5); // row0, a wd_service_list: max_rows written, max_cols not
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('row0');
  const maxCols = field(page, 'max_cols');
  await expect(maxCols).toHaveAttribute('data-written', 'false');
  await expect(maxCols.getByRole('textbox', { name: 'max_cols' })).toHaveAttribute('placeholder', '6');
  await expect(maxCols.getByRole('textbox', { name: 'max_cols' })).toHaveClass(/default/);
  await expect(maxCols.getByRole('button', { name: 'Reset max_cols' })).toHaveCount(0);
  await expect(field(page, 'max_rows').getByRole('button', { name: 'Reset max_rows' })).toBeVisible();
  // The author's help as written; the panel's own line never puts a figure on it.
  await expect(field(page, 'max_rows').locator('.field-help')).toHaveText('Row capacity. Determines allocated RAM.');
  await expect(panel(page).locator('.panel-note', { hasText: 'RAM cost not reported for project widgets ([Q-19])' })).toBeVisible();
  await expect(panel(page).getByText(/\d+(\.\d+)? ?(KB|B)\b/)).toHaveCount(0);

  await clickCanvas(page, 220, 57); // sys_clock, a framework widget
  await expect(panel(page).locator('.panel-note', { hasText: '[Q-19]' })).toHaveCount(0);
});

test('several selected: shared fields show a common value or mixed, geometry their box read-only, and a commit to all is one undo stop', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 12, 12); // plat_label: helvR08
  await clickCanvas(page, 100, 5, ['Shift']); // row0: 6x10
  await expect(panel(page).locator('.panel-title')).toHaveText('2 elements');
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('plat_label, row0');
  // Geometry: the box around both, read-only.
  await expect(field(page, 'x').getByRole('textbox', { name: 'x' })).toHaveValue('5');
  await expect(field(page, 'width').getByRole('textbox', { name: 'width' })).toHaveValue('251');
  await expect(field(page, 'x').getByRole('textbox', { name: 'x' })).toBeDisabled();
  // Only what both have: a label's text is not a list's.
  await expect(field(page, 'text')).toHaveCount(0);
  await expect(field(page, 'max_rows')).toHaveCount(0);
  const font = field(page, 'font').getByRole('combobox', { name: 'font' });
  await expect(font).toHaveValue('\n(mixed)');
  await expect(field(page, 'font')).toHaveAttribute('data-mixed', 'true');
  await font.selectOption('u8g2_font_6x10_mr');
  await expect.poll(() => changedLines(page)).toEqual([
    '        <u8g2gl_label name="plat_label" x="5" y="6" width="18" height="13" font="u8g2_font_6x10_mr" text="Plat" align="center" />',
  ]);
  await expect(font).toHaveValue('u8g2_font_6x10_mr');
  await font.selectOption('u8g2_font_helvR08_tr');
  await expect.poll(async () => (await changedLines(page)).length).toBe(1);
  expect((await changedLines(page))[0]).toContain('name="row0" x="32" y="0" width="224" height="16" font="u8g2_font_helvR08_tr"');
  await undo(page);
  await expect.poll(() => changedLines(page)).toEqual([
    '        <u8g2gl_label name="plat_label" x="5" y="6" width="18" height="13" font="u8g2_font_6x10_mr" text="Plat" align="center" />',
  ]);
});

test('every manifest prop of the departures project is editable from the panel', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const names = ['plat_box', 'plat_label', 'plat_num', 'header_sep', 'row0', 'message_bar', 'formation', 'services', 'sys_clock'];
  const edited: string[] = [];
  for (const name of names) {
    // --- Select it through the XML, as the caret does ---
    await placeCaret(page, SCREEN, `name="${name}"`);
    await expect(panel(page).locator('.panel-subtitle')).toHaveText(name);
    const inherited = panel(page).locator('details.inherited');
    if ((await inherited.count()) > 0) await inherited.locator('summary').click();

    // --- Every field, in panel order; one held by a binding after it is unbound ---
    const keys = await panel(page).locator('.field').evaluateAll((fields) => fields.map((f) => f.getAttribute('data-field') ?? ''));
    const held: string[] = [];
    for (const key of keys) {
      if ((await field(page, key).getAttribute('data-disabled')) === 'true') {
        held.push(key);
        continue;
      }
      await editField(page, name, key);
      edited.push(`${name}.${key}`);
    }
    for (const key of held) {
      if ((await field(page, `bind_${key}`).getAttribute('data-written')) === 'true') {
        await field(page, `bind_${key}`).getByRole('button', { name: `Reset bind_${key}` }).click();
      }
      await expect(field(page, key)).toHaveAttribute('data-disabled', 'false');
      await editField(page, name, key);
      edited.push(`${name}.${key}`);
    }
    expect(keys.length, `${name} has fields`).toBeGreaterThan(0);
  }
  console.log(`edited ${edited.length} fields from the panel across ${names.length} elements`);
  expect(new Set(edited).size).toBe(edited.length);
});

// editField
// Commits a new value to one field through its control, and waits for the
// element's line to carry it.
//   name — the selected element
//   key  — the field
async function editField(page: Page, name: string, key: string): Promise<void> {
  const control = field(page, key);
  let expected: string;
  if ((await control.getByRole('switch').count()) > 0) {
    const on = (await control.getByRole('switch').getAttribute('aria-checked')) === 'true';
    await control.getByRole('switch').click();
    expected = `${key}="${on ? 'false' : 'true'}"`;
  } else if ((await control.locator('.segmented').count()) > 0) {
    const choice = control.locator('.segmented button[aria-pressed="false"]').first();
    expected = `${key}="${await choice.textContent()}"`;
    await choice.click();
  } else if ((await control.getByRole('combobox').count()) > 0) {
    const select = control.getByRole('combobox');
    const current = await select.inputValue();
    const values = await select.locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    const choice = values.find((value) => value !== '' && value !== current && !value.startsWith('\n'));
    if (choice === undefined) {
      // The only choice is already made (one time subject, bound): the other
      // edit a dropdown makes is to unset it.
      await select.selectOption('');
      await expect.poll(async () => elementLine(page, name), { message: `${name}.${key}` }).not.toContain(`${key}="`);
      return;
    }
    await select.selectOption(choice);
    expected = `${key}="${choice}"`;
  } else {
    const input = control.getByRole('textbox', { name: key });
    const type = (await input.locator('xpath=ancestor::*[@data-field][1]').locator('.stepper').count()) > 0 ? 'int' : 'string';
    const value = type === 'int' ? String(3 + (key.length % 5)) : `edited ${key}`;
    await input.fill(value);
    await input.press('Enter');
    expected = `${key}="${value}"`;
  }
  await expect.poll(async () => elementLine(page, name), { message: `${name}.${key}` }).toContain(expected);
}

/** The buffer's line that writes the named element. */
async function elementLine(page: Page, name: string): Promise<string> {
  return (await bufferText(page, SCREEN)).split('\n').find((line) => line.includes(`name="${name}"`)) ?? '';
}

test('an image field is a picker of the project’s images, each drawn at 1:1, and choosing one commits it', async ({ page }) => {
  const xbm = (name: string, bits: string): string => `#define ${name}_width 8\n#define ${name}_height 8\nstatic unsigned char ${name}_bits[] = {\n   ${bits} };\n`;
  const globals = readFileSync(join(PROJECT_FIXTURE, 'globals.xml'), 'utf8').replace(
    '</globals>',
    '    <images>\n        <xbm name="icon_a" src="images/a.xbm" />\n        <xbm name="icon_b" src="images/b.xbm" />\n    </images>\n</globals>',
  );
  const screen = PROJECT_TEXT.replace('    </view>', '        <u8g2gl_xbm name="icon" x="240" y="0" width="8" height="8" src="icon_a" />\n    </view>');
  session = await startDesign({
    files: {
      'globals.xml': globals,
      [SCREEN]: screen,
      'images/a.xbm': xbm('a', '0x00, 0x18, 0x24, 0x42, 0x00, 0x18, 0x00, 0x00'),
      'images/b.xbm': xbm('b', '0xff, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0xff'),
    },
  });
  // Not openShell: a project's images are compiled into its own editor Wasm,
  // and this session has no toolchain to build one, so the framework Wasm
  // refuses the scene and there is no live frame to wait for. The panel does
  // not need one: it reads the text and the page's compiled assets.
  await page.goto(session.url);
  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, 'name="icon"');
  const src = field(page, 'src');
  await expect(src.locator('.image-picker button')).toHaveCount(2);
  await expect(src.getByRole('button', { name: /icon_a/ })).toHaveAttribute('aria-pressed', 'true');
  // 1:1: one canvas pixel per image pixel, laid out at that size.
  const thumbnail = src.locator('canvas[data-image="icon_b"]');
  await expect(thumbnail).toHaveJSProperty('width', 8);
  expect((await thumbnail.boundingBox())?.width).toBe(8);
  const lit = await thumbnail.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')?.getImageData(0, 0, 8, 8).data ?? new Uint8ClampedArray();
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 128) count++;
    return count;
  });
  expect(lit).toBe(28); // b's frame: 8 + 8 + 2 × 6
  await src.getByRole('button', { name: /icon_b/ }).click();
  await expect.poll(async () => (await changedLines(page)).find((line) => line.includes('name="icon"')) ?? '').toContain('src="icon_b"');
});
