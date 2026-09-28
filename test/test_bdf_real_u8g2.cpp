/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_bdf_real_u8g2.cpp
 *
 * Purpose: Proves that a compiled `<bdf>` font is what real U8G2 consumes
 *          (PR-04b WO3b item 4) — not the host stub's recording of setFont(),
 *          which never decodes a font at all. test/CMakeLists.txt compiles
 *          the fixture's generated `ui_fonts.cpp` a third time, against real
 *          U8G2's own headers and C sources (tag 2.36.18), so a U8G2 bump
 *          that changes the converter or the font array format fails this
 *          build or this test, not a report on someone's hardware.
 *
 * Description: Two checks, one per fixture font (globals.xml):
 *
 *              - `font_4x6` (U8G2's own public-domain 4x6.bdf, filtered to
 *                `0x20-0x7F`) must be byte-identical to U8G2's own shipped
 *                `u8g2_font_4x6_tr` — the oracle cli/test/fonts/u8g2-oracle.test.ts
 *                already proves in TypeScript, checked again here in the
 *                array real U8G2 actually links. Every measured metric
 *                (`u8g2_GetMaxCharHeight`, `u8g2_GetAscent`, `u8g2_GetDescent`,
 *                `u8g2_GetStrWidth`) is derived independently from the BDF
 *                text itself (`FONTBOUNDINGBOX`, per-glyph `DWIDTH`/`BBX`),
 *                per the WORKORDER — never read back from U8G2's own output,
 *                which would make the test circular.
 *
 *              - `font_arrow_mini` (a hand-written MIT fixture with no
 *                `range`) draws its below-0x20 and above-0xFF glyphs with
 *                `u8g2_DrawGlyph` into a real, full-buffer `u8g2_t`, and every
 *                set pixel is compared against the BDF's own `BITMAP` rows —
 *                the test that proves the absent-`range` fix (WO3 item 1)
 *                reaches the screen, not just the compiled array.
 *
 *              How the metrics were derived (real U8G2's own source, read
 *              rather than assumed — extern/u8g2/tools/font/bdfconv/bdf_glyph.c's
 *              `bg_ReduceGlyph()` and bdf_font.c's `bf_copy_bbx_and_update_shift()`
 *              for what a compiled glyph's own bbx actually is; u8g2_font.c's
 *              `u8g2_UpdateRefHeight()` and `u8g2_string_width()` for what the
 *              four functions read from it):
 *
 *              `<bdf>` always compiles with `-b 0`, U8G2's
 *              `BDF_BBX_MODE_MINIMAL` — every glyph's compiled bbx is its own
 *              *ink-cropped* box (`bg_ReduceGlyph()` trims all-zero leading
 *              and trailing rows and columns off `BITMAP` before the array is
 *              written), never its declared `BBX` line. `u8g2_GetMaxCharHeight()`
 *              is the tallest cropped height among the selected glyphs;
 *              `u8g2_GetAscent()` is capital `A`'s own cropped height plus its
 *              cropped (possibly negative) y-offset, or digit `1`'s if `A` is
 *              absent, or 0 if neither is present; `u8g2_GetDescent()` is
 *              `g`'s own cropped y-offset, or 0 if `g` is absent.
 *
 *              `u8g2_GetStrWidth()` is not a plain sum of `DWIDTH` advances:
 *              it sums every glyph's `dx` (`DWIDTH`), then re-charges the
 *              *last* glyph — subtracts its `dx`, adds its cropped ink width
 *              and its cropped x-offset — and, since U8G2_BALANCED_STR_WIDTH_
 *              CALCULATION is defined by default (u8g2.h), adds the *first*
 *              glyph's own cropped x-offset back in when it is positive. A
 *              first draft of this test read `u8g2_string_width()`'s
 *              `#ifdef OBSOLETE` predecessor by mistake and got answers that
 *              matched by coincidence for two of three cases tried, which is
 *              exactly the trap independent derivation is supposed to catch —
 *              the fixes are recorded beside each constant below.
 */
#include <gtest/gtest.h>

#include <cstring>

// U8G2's C header first, exactly as test_rbox_bound.cpp does: u8g2gl_coord.h
// names u8g2_uint_t and would otherwise look for U8g2lib.h, which this target
// deliberately does not put on the path for this file (the C++ wrapper needs
// Arduino headers only to compile ui_fonts.cpp, never this test's own code).
#include "u8g2.h"

#include "ui.hpp"

namespace {

constexpr int kDisplayWidth = 128;

// A real, full-buffer U8G2 display with no hardware behind it — the same
// construction test_rbox_bound.cpp uses, copied here rather than shared,
// because that file is deliberately its own executable (never linking the
// runtime or a generated unit) and this one is deliberately the opposite.
class real_u8g2 {
public:
    real_u8g2() {
        uint8_t tile_buf_height = 0;
        u8g2_SetupDisplay(&u8g2_, u8x8_d_ssd1306_128x64_noname, u8x8_cad_001, u8x8_byte_empty, u8x8_dummy_cb);
        uint8_t* buf = u8g2_m_16_8_f(&tile_buf_height);
        u8g2_SetupBuffer(&u8g2_, buf, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);
        u8g2_InitDisplay(&u8g2_);
        u8g2_SetPowerSave(&u8g2_, 0);
    }

    u8g2_t* raw() { return &u8g2_; }

    void set_font(const uint8_t* font) { u8g2_SetFont(&u8g2_, font); }

    void clear() { u8g2_ClearBuffer(&u8g2_); }

    void draw_glyph(u8g2_uint_t x, u8g2_uint_t y, uint16_t encoding) { u8g2_DrawGlyph(&u8g2_, x, y, encoding); }

    // The SSD1306 full buffer is vertical_top_lsb: a byte per column per
    // 8-row page, bit 0 the top row of the page (test_rbox_bound.cpp's own
    // comment on the same layout).
    bool pixel(int x, int y) const {
        const uint8_t* buf = u8g2_GetBufferPtr(&u8g2_);
        return ((buf[(y / 8) * kDisplayWidth + x] >> (y % 8)) & 1) != 0;
    }

private:
    u8g2_t u8g2_{};
};

}  // namespace

// --- font_4x6: U8G2's own 4x6.bdf, filtered to 0x20-0x7F ------------------
//
// Every selected glyph *declares* BBX "4 6 0 -1" (width 4, height 6, x 0,
// y -1) and DWIDTH "4 0" (extern/u8g2/tools/font/bdf/4x6.bdf — confirmed with
// `awk '/^ENCODING/{enc=$2} /^BBX|^DWIDTH/{if(enc>=32&&enc<=127) print}' 4x6.bdf | sort -u`,
// one distinct line each). But `<bdf>` always compiles with `-b 0`
// (compile-bdf.ts: "we always build with -b 0"), U8G2's `BDF_BBX_MODE_MINIMAL`
// (extern/u8g2/tools/font/bdfconv/bdf_font.c, `bf_copy_bbx_and_update_shift`:
// mode 0 passes the glyph's own already-cropped `bbx` straight through): the
// array's per-glyph bbx is the *ink-cropped* box read off `BITMAP` —
// leading/trailing all-zero rows and columns trimmed away — never the
// glyph's declared BBX line. `u8g2_GetMaxCharHeight`, `GetAscent`,
// `GetDescent` and `GetStrWidth` all read that cropped box, so every constant
// below is the cropped box, read glyph by glyph off `BITMAP` (row 0 first,
// bit 0 the leftmost of the declared width) exactly as the pixel tests below
// read it — never bdfconv's or u8g2's own output.
//
// For 'H' (0x48, rows A0 A0 E0 A0 A0 00), 'i' (0x69, rows 40 00 C0 40 E0 00),
// 'A' (0x41, rows 40 A0 E0 A0 A0 00) and 'g' (0x67, rows 00 60 A0 60 20 C0),
// against the declared BBX "4 6 0 -1" (h=6, y=-1): every one crops to ink
// rows 0-4 (5 rows) except 'g', which crops to rows 1-5 — so cropped h=5 for
// all four, and cropped y = -1 + (6-1-last_ink_row): 0 for 'H'/'i'/'A'
// (last_ink_row=4), -1 for 'g' (last_ink_row=5). Cropped x is 0 for all four
// (every one's ink touches the left edge); cropped w is 3 for all four (the
// rightmost two of the declared four columns are never set).

// u8g2_GetMaxCharHeight(): the tallest cropped ink height among the 95
// selected glyphs — 6, from '$' (0x24, rows 40 E0 C0 20 E0 40, none of them
// all-zero, so its ink spans every one of the declared 6 rows). Every other
// letter/digit checked above crops to 5 or fewer.
constexpr int8_t kFont4x6MaxCharHeight = 6;
// ascent_A: 'A' is selected — its cropped h (5) + cropped y (0), derived above.
constexpr int8_t kFont4x6Ascent = 5 + 0;
// descent_g: 'g' is selected — its cropped y, derived above.
constexpr int8_t kFont4x6Descent = -1;
// GetStrWidth("Hi"): the *live* `u8g2_string_width` (u8g2_font.c) — not the
// `#ifdef OBSOLETE` one above it, a dead function this test's first draft
// mistakenly read — sums each glyph's `dx` (its DWIDTH advance) across the
// whole string, then re-charges the *last* glyph: subtracts its own `dx`,
// adds its cropped ink width (`gw`) and its cropped x-offset (`ox`), and
// finally — `U8G2_BALANCED_STR_WIDTH_CALCULATION`, defined by default
// (u8g2.h) — adds the *first* glyph's own `ox` back in, but only if it is
// positive. 'H's cropped x is 0, so that term is 0 too:
// dx('H') + gw('i') + ox('i') + max(ox('H'), 0) = 4 + 3 + 0 + 0 = 7.
constexpr int kFont4x6StrWidthOfHi = 4 + 3 + 0 + 0;

TEST(BdfRealU8g2, Font4x6IsByteIdenticalToU8g2sOwnShippedArray) {
    // u8g2_font_4x6_tr is declared by real U8G2's own u8g2.h (extern const
    // uint8_t[] U8G2_FONT_SECTION(...)) — no forced include needed, unlike
    // the host stub build.
    extern const uint8_t u8g2_font_4x6_tr[];

    // The array's own declared length is byte[0..1]-independent here: U8G2's
    // font format carries no length prefix, so the only length this test can
    // assert without re-deriving bdfconv's own encoding is "however long
    // ui_fontdata_font_4x6 was declared" — read from the generated comment's
    // measured byte count (ui_fonts.cpp), which the CLI oracle test
    // (cli/test/fonts/u8g2-oracle.test.ts) already pins at 723 for this exact
    // BDF and range.
    constexpr size_t kDeclaredLength = 723;
    EXPECT_EQ(std::memcmp(ui_font_font_4x6, u8g2_font_4x6_tr, kDeclaredLength), 0);
}

TEST(BdfRealU8g2, Font4x6MetricsMatchWhatTheBdfItselfSays) {
    real_u8g2 display;
    display.set_font(ui_font_font_4x6);

    EXPECT_EQ(u8g2_GetMaxCharHeight(display.raw()), kFont4x6MaxCharHeight);
    EXPECT_EQ(u8g2_GetAscent(display.raw()), kFont4x6Ascent);
    EXPECT_EQ(u8g2_GetDescent(display.raw()), kFont4x6Descent);
    EXPECT_EQ(u8g2_GetStrWidth(display.raw(), "Hi"), kFont4x6StrWidthOfHi);
}

// --- font_arrow_mini: a hand-written fixture, no `range` ------------------
//
// Three glyphs, every one *declaring* BBX "5 7 0 -1" (width 5, height 7, x 0,
// y -1) and DWIDTH "5 0" (test/generated_fixture/assets/fonts/custom/arrow_mini.bdf,
// written for this WORKORDER, so these are exactly the values that file's own
// BITMAP rows were drawn against — but, as for font_4x6 above, `-b 0` crops
// every glyph's bbx to its own ink before it reaches the compiled array:
//   ctrl_bell   ENCODING 7     rows 00 70 70 70 00 00 00 (below 0x20)
//   A           ENCODING 65    rows 20 50 50 70 50 50 00 (ASCII)
//   arrowleft   ENCODING 8592  rows 00 20 40 F8 40 20 00 (U+2190, above 0xFF)
// Cropped: ctrl_bell ink rows 1-3 (h=3, y = -1+(7-1-3)=2), cols 1-3 (w=3, x=1).
// 'A' ink rows 0-5 (h=6, y = -1+(7-1-5)=0), cols 1-3 (w=3, x=1) — the exact
// pixel rows are asserted byte for byte in DrawsTheBelow0x20Glyph... and
// DrawsTheAbove0xFFGlyph... below, which is the primary proof for this font;
// these are its two scalar metrics.

// max_char_height: the tallest cropped ink height among the 3 glyphs — 'A's
// (6), since ctrl_bell (3) and arrowleft (5, rows 1-5) are both shorter.
constexpr int8_t kArrowMiniMaxCharHeight = 6;
// ascent_A: 'A' is present — its cropped h (6) + cropped y (0), derived above.
constexpr int8_t kArrowMiniAscent = 6 + 0;
// descent_g: 'g' is not one of this font's three glyphs, so bdfconv's own
// fallback applies (extern/u8g2/tools/font/bdfconv/bdf_rle.c: idx_g_descent
// defaults to 0 when 'g' was never selected).
constexpr int8_t kArrowMiniDescent = 0;
// GetStrWidth("A"): the font's only ASCII glyph is 'A', so a single-character
// string is the only literal one it can spell. For one character, the same
// glyph is both first and last (see kFont4x6StrWidthOfHi's comment for the
// general formula): the "sum of every dx but the last" term is empty (0), so
// this is gw('A') + ox('A') + max(ox('A'), 0) = 3 + 1 + 1 = 5 — not a plain
// DWIDTH advance (5 also, by coincidence of this font's own numbers; the
// pixel tests below are what actually pin 'A's shape).
constexpr int kArrowMiniStrWidthOfA = 3 + 1 + 1;

TEST(BdfRealU8g2, ArrowMiniMetricsMatchWhatTheBdfItselfSays) {
    real_u8g2 display;
    display.set_font(ui_font_font_arrow_mini);

    EXPECT_EQ(u8g2_GetMaxCharHeight(display.raw()), kArrowMiniMaxCharHeight);
    EXPECT_EQ(u8g2_GetAscent(display.raw()), kArrowMiniAscent);
    EXPECT_EQ(u8g2_GetDescent(display.raw()), kArrowMiniDescent);
    EXPECT_EQ(u8g2_GetStrWidth(display.raw(), "A"), kArrowMiniStrWidthOfA);
}

// A pixel-mask helper: `rows[i]` holds the glyph's row `i`, MSB first, in the
// glyph's own BBX width (5) — exactly BITMAP's own hex-nibble convention,
// read at build time from arrow_mini.bdf rather than eyeballed from the
// compiled array.
bool row_bit_set(uint8_t row_mask, int bit_from_left) {
    return ((row_mask >> (7 - bit_from_left)) & 1) != 0;
}

TEST(BdfRealU8g2, DrawsTheBelow0x20GlyphExactlyAsItsBdfBitmapSays) {
    // arrow_mini.bdf's ctrl_bell (ENCODING 7):
    //   00 70 70 70 00 00 00  (7 rows, top 5 bits of each byte significant)
    // A filled 3x3 square at glyph-local (x=1..3, y=1..3).
    constexpr uint8_t kRows[7] = {0x00, 0x70, 0x70, 0x70, 0x00, 0x00, 0x00};
    constexpr int kGlyphWidth = 5;
    constexpr int kGlyphHeight = 7;
    // BBX y-offset -1: U8G2 draws a glyph with its origin at the text
    // baseline, offset by BBX's own (x, y) — the same convention
    // u8g2_DrawGlyph uses for every font, compiled or built-in.
    constexpr int16_t kOriginX = 20;
    constexpr int16_t kOriginY = 40;
    constexpr int kBbxYOffset = -1;

    real_u8g2 display;
    display.clear();
    display.set_font(ui_font_font_arrow_mini);
    display.draw_glyph(kOriginX, kOriginY, 7);

    for (int row = 0; row < kGlyphHeight; ++row) {
        for (int col = 0; col < kGlyphWidth; ++col) {
            const bool expected = row_bit_set(kRows[row], col);
            // u8g2_font_decode_glyph (u8g2_font.c): target_y = origin_y -
            // (glyph_height + bbx_y); u8g2_font_decode_len then draws row i
            // of the bitmap at target_y + i, top row first — read from the
            // source rather than assumed, since this is the whole point of
            // testing against real U8G2's own decoder.
            const int y = kOriginY - (kGlyphHeight + kBbxYOffset) + row;
            const int x = kOriginX + col;
            EXPECT_EQ(display.pixel(x, y), expected) << "row=" << row << " col=" << col;
        }
    }
}

TEST(BdfRealU8g2, DrawsTheAbove0xFFGlyphExactlyAsItsBdfBitmapSays) {
    // arrow_mini.bdf's arrowleft (ENCODING 8592, U+2190):
    //   00 20 40 F8 40 20 00  (7 rows, top 5 bits of each byte significant)
    // A left-pointing arrow: a full-width horizontal bar on the middle row,
    // tapering from both ends toward the row above and below it.
    constexpr uint8_t kRows[7] = {0x00, 0x20, 0x40, 0xF8, 0x40, 0x20, 0x00};
    constexpr int kGlyphWidth = 5;
    constexpr int kGlyphHeight = 7;
    constexpr int16_t kOriginX = 60;
    constexpr int16_t kOriginY = 40;
    constexpr int kBbxYOffset = -1;

    real_u8g2 display;
    display.clear();
    display.set_font(ui_font_font_arrow_mini);
    display.draw_glyph(kOriginX, kOriginY, 8592);

    for (int row = 0; row < kGlyphHeight; ++row) {
        for (int col = 0; col < kGlyphWidth; ++col) {
            const bool expected = row_bit_set(kRows[row], col);
            const int y = kOriginY - (kGlyphHeight + kBbxYOffset) + row;
            const int x = kOriginX + col;
            EXPECT_EQ(display.pixel(x, y), expected) << "row=" << row << " col=" << col;
        }
    }
}
