/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/fonts/font-view-model.ts
 * Purpose: What the Fonts view (ui_spec §12) draws and measures, as pure
 *          functions, so the glyph grid's layout and the string ruler's
 *          measurement are unit-tested without a browser or a Wasm. The view
 *          draws both through the real renderer: each is a small project of
 *          its own — one screen, one target, the font declared — run through
 *          the same text pipeline and editor Wasm as the canvas, so what the
 *          view shows is what the device draws.
 * Description: `fontEncodings()` lists the glyphs a U8G2 font table carries,
 *              walking it as U8G2's own glyph lookup does. `glyphGridTexts()`
 *              and `rulerTexts()` write the two projects' files.
 *              `inkBox()` measures the lit pixels of a U8G2 tile buffer,
 *              which is the ruler's reading: the text's width and height in
 *              device pixels, as drawn.
 *
 * Exports:
 * - VIEW_SETUP:          The display the view's projects draw on
 * - VIEW_SCREEN:         The view's screen file
 * - GRID_LIMIT:          The most glyphs one grid draws
 * - InkBox:              A rectangle of lit pixels
 * - fontEncodings():     The glyph codes a U8G2 font table carries
 * - FontMetrics:         A font's glyph box, from its table's header
 * - fontMetrics():       Read it
 * - glyphGridTexts():    The project files that draw a font's glyph grid
 * - rulerTexts():        The project files that draw one string in a font
 * - inkBox():            The lit pixels' bounding box in a U8G2 buffer
 * - escapeXml():         Text as an XML attribute value
 */

/** The display the view's projects draw on: the catalogue's largest, 640×320. */
export const VIEW_SETUP = 'U8G2_ST7511_640X320_F_4W_HW_SPI';

/** Its size, which the layouts below fill. */
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 320;

/** The one screen the view's projects have: a screen file is `screens/screen_*.xml`. */
export const VIEW_SCREEN = 'screens/screen_fonts_view.xml';

/**
 * The most glyphs one grid draws. Each glyph is an object, and a screen's
 * objects are indexed by a byte (§9.2's flat tree), so a font with thousands
 * of glyphs shows its first GRID_LIMIT and says how many more it has.
 */
export const GRID_LIMIT = 192;

/** A rectangle of lit pixels, in device pixels. */
export interface InkBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * @brief The glyph codes a U8G2 font table carries, in table order.
 *
 * The 8-bit glyphs, each jumping to the next, then the Unicode glyphs the
 * jump table leads to (u8g2_font.c, `u8g2_font_get_glyph_data`).
 *
 * @param font The table's bytes.
 * @return The codes; empty for a table too short to hold a header. A table
 *         whose structure runs past its bytes yields the codes read before it
 *         did.
 */
export function fontEncodings(font: Uint8Array): number[] {
  const codes: number[] = [];
  const at = (index: number): number => font[index] ?? 0;
  const word = (index: number): number => (at(index) << 8) | at(index + 1);
  if (font.length < 23) return codes;

  // --- Step 1: The 8-bit glyphs, to the zero jump ---
  let glyph = 23;
  while (glyph + 2 <= font.length && at(glyph + 1) !== 0) {
    codes.push(at(glyph));
    glyph += at(glyph + 1);
  }

  // --- Step 2: The Unicode jump table, to its 0xffff entry ---
  let table = 23 + word(21);
  let unicode = table;
  while (table + 4 <= font.length) {
    unicode += word(table);
    const last = word(table + 2) === 0xffff;
    table += 4;
    if (last) break;
  }

  // --- Step 3: The Unicode glyphs, to encoding 0 ---
  while (unicode + 3 <= font.length && word(unicode) !== 0 && at(unicode + 2) !== 0) {
    codes.push(word(unicode));
    unicode += at(unicode + 2);
  }
  return codes;
}

/** A font's glyph box, from its table's header. */
export interface FontMetrics {
  /** The widest glyph box, in pixels. */
  readonly width: number;
  /** The tallest glyph box, in pixels. */
  readonly height: number;
  /** From the box's top to the baseline U8G2 draws a glyph on. */
  readonly ascent: number;
}

/**
 * @brief A font's glyph box: header bytes 9 and 10 (the largest glyph's width
 *        and height) and 12 (its bottom's offset from the baseline, signed).
 *
 * @param font The table's bytes; a table too short for a header has no box.
 */
export function fontMetrics(font: Uint8Array): FontMetrics {
  if (font.length < 23) return { width: 0, height: 0, ascent: 0 };
  const height = font[10] ?? 0;
  const below = ((font[12] ?? 0) << 24) >> 24;
  return { width: font[9] ?? 0, height, ascent: height + below };
}

/** @brief Text as an XML attribute value, quoted with `"`. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// projectFiles
// The u8g2gl.xml and screen of a one-screen project on the view's display.
//   view — the screen's <view> body, already indented
function projectFiles(view: string): Map<string, string> {
  return new Map([
    [
      'u8g2gl.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<u8g2gl schema="0.7" name="fonts_view" version="1.0.0">\n    <targets>\n        <target name="view" setup="${VIEW_SETUP}" rotation="R0" />\n    </targets>\n</u8g2gl>\n`,
    ],
    [VIEW_SCREEN, `<?xml version="1.0" encoding="UTF-8"?>\n<screen name="fonts_view">\n    <view>\n${view}    </view>\n</screen>\n`],
  ]);
}

/** The gap between grid cells, in pixels. */
const GRID_GAP = 2;

/**
 * @brief The project files that draw a font's glyph grid: one `<u8g2gl_glyph>`
 *        per code, in rows, each in a cell of the font's largest glyph box
 *        plus a gap, its glyph on the cell's baseline.
 *
 * @param globals   The `globals.xml` to draw with: one that declares `font`.
 * @param font      The font's name.
 * @param codes     The glyphs, from fontEncodings(); at most GRID_LIMIT are drawn.
 * @param metrics   The font's glyph box, from fontMetrics().
 * @return The files, and the cells drawn with the code each holds, for the
 *         view's labels and hover.
 */
export function glyphGridTexts(
  globals: string,
  font: string,
  codes: readonly number[],
  metrics: FontMetrics,
): { readonly texts: Map<string, string>; readonly cells: readonly (InkBox & { readonly code: number })[] } {
  const width = Math.max(1, Math.min(metrics.width + GRID_GAP, VIEW_WIDTH));
  const height = Math.max(1, Math.min(metrics.height + GRID_GAP, VIEW_HEIGHT));
  const columns = Math.max(1, Math.floor(VIEW_WIDTH / width));
  const rows = Math.max(1, Math.floor(VIEW_HEIGHT / height));
  const cells = codes.slice(0, Math.min(GRID_LIMIT, columns * rows)).map((code, index) => ({
    code,
    x: (index % columns) * width,
    y: Math.floor(index / columns) * height,
    width,
    height,
  }));
  const view = cells
    // A glyph is drawn on its y, the baseline (u8g2gl_glyph::render), so each
    // sits that far below its cell's top.
    .map((c, index) => `        <u8g2gl_glyph name="g${index}" x="${c.x}" y="${c.y + metrics.ascent}" width="${c.width}" height="${c.height}" font="${font}" glyph="${c.code}" />\n`)
    .join('');
  const texts = projectFiles(view);
  texts.set('globals.xml', globals);
  return { texts, cells };
}

/**
 * @brief The project files that draw one string in a font, as a label at the
 *        display's top left, wide and tall enough not to clip it.
 *
 * @param globals The `globals.xml` to draw with: one that declares `font`.
 * @param font    The font's name.
 * @param text    The string; empty draws nothing.
 */
export function rulerTexts(globals: string, font: string, text: string): Map<string, string> {
  const texts = projectFiles(
    `        <u8g2gl_label name="ruler" x="0" y="0" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" font="${font}" text="${escapeXml(text)}" />\n`,
  );
  texts.set('globals.xml', globals);
  return texts;
}

/**
 * @brief The bounding box of the lit pixels in a U8G2 tile buffer, or of those
 *        inside `within` when it is given.
 *
 * @param buffer The buffer: `width * ceil(height / 8)` bytes, one bit per
 *               pixel, eight rows to a byte, least significant bit on top.
 * @param width  Display width in pixels.
 * @param height Display height in pixels.
 * @param within Only this rectangle is read, clipped to the display.
 * @return The box, or undefined when nothing is lit.
 */
export function inkBox(buffer: Uint8Array, width: number, height: number, within?: InkBox): InkBox | undefined {
  const left = Math.max(0, within?.x ?? 0);
  const top = Math.max(0, within?.y ?? 0);
  const right = Math.min(width, within === undefined ? width : within.x + within.width);
  const bottom = Math.min(height, within === undefined ? height : within.y + within.height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = top; y < bottom; y++) {
    const row = (y >> 3) * width;
    const bit = 1 << (y & 7);
    for (let x = left; x < right; x++) {
      if (((buffer[row + x] ?? 0) & bit) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? undefined : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
