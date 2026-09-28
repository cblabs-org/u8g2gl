/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/fonts/bdf-range.ts
 * Purpose: Owns the `<bdf range>` attribute's grammar so the validator and compileBdf()
 *          cannot disagree about what a range means: there is one definition of it.
 * Description: Accepts a comma-separated list of codepoints and inclusive `lo-hi` ranges,
 *              each written as a decimal number or a `0x`/`0X`-prefixed hex number
 *              (whitespace around items tolerated), and translates it into bdfconv's own
 *              `-m` map grammar (`extern/u8g2/tools/font/bdfconv/bdf_map.c`), where hex is
 *              written `$1f` rather than `0x1F`. bdfconv reads a glyph's codepoint from the
 *              BDF's `long encoding` field, but its own glyph renderer narrows that to a
 *              `uint16_t` (`bdf_font.h`, `tga_draw_glyph`), so this rejects anything above
 *              0xFFFF rather than letting bdfconv silently misbehave on it. bdfconv's own
 *              reserved syntax (`*`, `~`, `>`, `$`, the kerning-exclude `x` prefix) is
 *              explicitly rejected here — the `<bdf range>` grammar is deliberately a
 *              subset, not a passthrough.
 *
 * Exports:
 * - MAX_BDF_CODEPOINT: The largest codepoint bdfconv's glyph renderer can select
 * - BdfRangeItem:       One parsed item — a single codepoint or an inclusive lo-hi pair
 * - BdfRangeResult:     Either the parsed items and bdfconv's translated map string, or why not
 * - parseBdfRange():    Parses and translates a `<bdf range>` attribute's value
 */

/**
 * The largest codepoint bdfconv can select for a glyph. Measured from
 * `extern/u8g2/tools/font/bdfconv/bdf_font.h`: glyph selection reads a `long encoding`,
 * but `tga_draw_glyph(unsigned x, unsigned y, uint16_t encoding, ...)` narrows it to a
 * `uint16_t` before rendering, so nothing above this value can ever be selected correctly.
 */
export const MAX_BDF_CODEPOINT = 0xffff;

/** One parsed `<bdf range>` item: a single codepoint (`lo === hi`) or an inclusive pair. */
export interface BdfRangeItem {
  readonly lo: number;
  readonly hi: number;
}

/** Outcome of parsing a `<bdf range>` attribute value. */
export type BdfRangeResult =
  | {
      readonly ok: true;
      /** The parsed items, in declaration order. */
      readonly items: readonly BdfRangeItem[];
      /** The same range translated into bdfconv's `-m` grammar. */
      readonly bdfconvMap: string;
    }
  | {
      /** Names the offending item, never a generic "invalid range" message. */
      readonly reason: string;
      readonly ok: false;
    };

// parseNumber
// Parses one number token as either 0x/0X-prefixed hex or plain decimal. Returns
// undefined for anything else — including a bare negative sign, which this grammar does
// not support — so callers can report a uniform "not a valid number" reason.
//   token — the raw text, not yet trimmed
function parseNumber(token: string): number | undefined {
  const trimmed = token.trim();
  if (/^0[xX][0-9a-fA-F]+$/.test(trimmed)) {
    return parseInt(trimmed.slice(2), 16);
  }
  if (/^[0-9]+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  return undefined;
}

// formatBdfconvNumber
// Renders a parsed value back into bdfconv's own number grammar, preserving the author's
// chosen radix: hex input becomes bdfconv's `$`-prefixed hex, decimal input stays decimal.
//   token — the original token, used only to decide which radix to emit
//   value — the parsed numeric value
function formatBdfconvNumber(token: string, value: number): string {
  return /^\s*0[xX]/.test(token) ? `$${value.toString(16)}` : `${value}`;
}

/**
 * @brief Parses and translates a `<bdf range>` attribute value.
 *
 * @param range The raw attribute value, e.g. `"0x20-0x7F,0xA0"`.
 * @return The parsed items and bdfconv's translated map string, or a reason naming the
 *         offending item.
 */
export function parseBdfRange(range: string): BdfRangeResult {
  const rawItems = range.split(',');
  const items: BdfRangeItem[] = [];
  const mapParts: string[] = [];

  for (const rawItem of rawItems) {
    const item = rawItem.trim();
    if (item === '') {
      return { ok: false, reason: `Empty range item in '${range}'.` };
    }
    if (/[*~>$]/.test(item)) {
      return {
        ok: false,
        reason:
          `Range item '${item}' uses bdfconv's own map syntax ('*', '~', '>' or '$'), ` +
          "which <bdf range> does not accept — use a decimal or 0x-prefixed number, or a 'lo-hi' pair.",
      };
    }

    const dashIndex = item.indexOf('-');
    if (dashIndex > 0) {
      // A 'lo-hi' pair. (A leading '-' at index 0 is a negative number, not a pair —
      // parseNumber() below rejects it with the same "not a valid number" reason.)
      const loToken = item.slice(0, dashIndex);
      const hiToken = item.slice(dashIndex + 1);
      const lo = parseNumber(loToken);
      const hi = parseNumber(hiToken);
      if (lo === undefined || hi === undefined) {
        return { ok: false, reason: `Range item '${item}' is not a valid 'lo-hi' pair.` };
      }
      if (lo > MAX_BDF_CODEPOINT || hi > MAX_BDF_CODEPOINT) {
        return {
          ok: false,
          reason: `Range item '${item}' exceeds bdfconv's maximum codepoint 0x${MAX_BDF_CODEPOINT.toString(16)}.`,
        };
      }
      if (lo > hi) {
        return { ok: false, reason: `Range item '${item}' has lo (${lo}) greater than hi (${hi}).` };
      }
      items.push({ lo, hi });
      mapParts.push(`${formatBdfconvNumber(loToken, lo)}-${formatBdfconvNumber(hiToken, hi)}`);
      continue;
    }

    const value = parseNumber(item);
    if (value === undefined) {
      return { ok: false, reason: `Range item '${item}' is not a valid number.` };
    }
    if (value > MAX_BDF_CODEPOINT) {
      return {
        ok: false,
        reason: `Range item '${item}' exceeds bdfconv's maximum codepoint 0x${MAX_BDF_CODEPOINT.toString(16)}.`,
      };
    }
    items.push({ lo: value, hi: value });
    mapParts.push(formatBdfconvNumber(item, value));
  }

  // items.length === rawItems.length here: every loop iteration above either returns an
  // error or pushes exactly one item, and String.prototype.split() always yields at least
  // one element — including for range === '' (a single empty item, already rejected above
  // as "Empty range item"). There is no reachable path to an empty result.
  return { ok: true, items, bdfconvMap: mapParts.join(',') };
}
