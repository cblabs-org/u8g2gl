/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: tools/font-samples/font_samples.cpp
 * Purpose: Draws one sample line of every built-in U8G2 font with U8G2
 *          itself, so the designer's font picker can show a font before the
 *          project declares it. The editor Wasm links only the fonts a project
 *          uses, so it cannot draw an undeclared one; this host program,
 *          run when the catalogue is rebuilt, links them all instead, and its
 *          output is committed beside u8g2-fonts.json (§14.1, [D-14]).
 * Description: Each entry of the generated table (font_samples.h) is drawn at
 *              the font's own size into a memory-backed U8G2 full buffer, then
 *              cropped and packed one bit per pixel. Output goes to stdout, one
 *              line per font in the table's order:
 *
 *                  <name> <width> <height> <hex>
 *
 *              where <hex> is the packed bits: row-major, pixel (x, y) at bit
 *              index y * width + x, most significant bit first in each byte.
 *              The node script (cli/src/node/build-font-samples.ts) turns this
 *              into u8g2-font-samples.json. Any font that draws nothing, or
 *              does not fit the buffer, is an error naming it, and the exit
 *              status is 1.
 *
 * Usage: font_samples > samples.txt
 */

#include "font_samples.h"

#include <u8g2.h>

#include <cstdio>
#include <cstring>

namespace {

// The canvas. U8X8 addresses at most 255 tiles a side, so 2040 pixels is the
// widest a buffer can be; 256 rows is more than twice the tallest bundled font
// (logisoso92 is 111 high), leaving room above and below the baseline.
constexpr int CANVAS_W = 2040;
constexpr int CANVAS_H = 256;
constexpr int CANVAS_TILES_W = CANVAS_W / 8;
constexpr int CANVAS_TILES_H = CANVAS_H / 8;
// Where the text starts and sits. The left margin keeps a glyph with a
// negative x offset on the canvas; the baseline leaves 160 rows of ascent.
constexpr int ORIGIN_X = 16;
constexpr int BASELINE_Y = 160;
// How many glyphs to show for a font that carries none of the sample text,
// such as an icon font.
constexpr int FALLBACK_GLYPHS = 8;

uint8_t s_buffer[CANVAS_TILES_W * 8 * CANVAS_TILES_H];
u8x8_display_info_t s_info;
uint8_t s_packed[(CANVAS_W * CANVAS_H + 7) / 8];

// memory_display_cb
// A U8X8 display that is only memory: it reports the canvas geometry when
// U8G2 sets up and accepts every other message, as nothing reaches hardware.
uint8_t memory_display_cb(u8x8_t* u8x8, uint8_t msg, uint8_t /*arg_int*/, void* /*arg_ptr*/) {
    if (msg == U8X8_MSG_DISPLAY_SETUP_MEMORY) {
        u8x8_d_helper_display_setup_memory(u8x8, &s_info);
    }
    return 1;
}

// setup_canvas
// Points U8G2 at the static canvas, through U8G2's own setup sequence.
void setup_canvas(u8g2_t* u8g2) {
    std::memset(&s_info, 0, sizeof(s_info));
    s_info.tile_width = CANVAS_TILES_W;
    s_info.tile_height = CANVAS_TILES_H;
    s_info.pixel_width = CANVAS_W;
    s_info.pixel_height = CANVAS_H;
    u8g2_SetupDisplay(u8g2, memory_display_cb, u8x8_cad_001, u8x8_byte_empty, u8x8_dummy_cb);
    u8g2_SetupBuffer(u8g2, s_buffer, CANVAS_TILES_H, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);
    u8g2_InitDisplay(u8g2);
}

// pixel_at
// Reads one canvas pixel. The buffer is U8G2's vertical-top-LSB layout: one
// byte per column of each 8-row tile row, the top row in bit 0.
bool pixel_at(int x, int y) {
    return (s_buffer[(y / 8) * CANVAS_W + x] >> (y % 8)) & 1u;
}

// draw_sample
// Draws the entry's text at the baseline, skipping glyphs the font lacks, or,
// when it lacks every non-space glyph of the text, its first few glyphs.
//   u8g2  — set up, with the entry's font selected
//   text  — the entry's ASCII sample text
// Returns the x one past the last advance, so the caller can check the fit.
int draw_sample(u8g2_t* u8g2, const char* text) {
    // --- Step 1: The sample text, as far as the font carries it ---
    bool any_glyph = false;
    for (const char* c = text; *c != '\0'; ++c) {
        if (*c != ' ' && u8g2_IsGlyph(u8g2, static_cast<uint8_t>(*c))) any_glyph = true;
    }
    int x = ORIGIN_X;
    if (any_glyph) {
        for (const char* c = text; *c != '\0'; ++c) {
            const uint16_t encoding = static_cast<uint8_t>(*c);
            if (!u8g2_IsGlyph(u8g2, encoding)) continue;
            x += u8g2_DrawGlyph(u8g2, static_cast<u8g2_uint_t>(x), BASELINE_Y, encoding);
        }
        return x;
    }

    // --- Step 2: Otherwise the font's first glyphs, in encoding order ---
    int drawn = 0;
    for (uint32_t encoding = 33; encoding <= 0xFFFF && drawn < FALLBACK_GLYPHS; ++encoding) {
        if (!u8g2_IsGlyph(u8g2, static_cast<uint16_t>(encoding))) continue;
        x += u8g2_DrawGlyph(u8g2, static_cast<u8g2_uint_t>(x), BASELINE_Y, static_cast<uint16_t>(encoding));
        ++drawn;
    }
    return x;
}

// render_entry
// Draws one font, crops it and writes its output line.
//   u8g2  — the set-up canvas
//   entry — the font to draw
// Returns false, having reported why on stderr, if the font drew nothing or
// did not fit the canvas.
bool render_entry(u8g2_t* u8g2, const font_sample_entry& entry) {
    // --- Step 1: Draw on a clear canvas ---
    u8g2_ClearBuffer(u8g2);
    u8g2_SetFont(u8g2, entry.font);
    u8g2_SetFontMode(u8g2, 1);
    u8g2_SetDrawColor(u8g2, 1);
    const int end_x = draw_sample(u8g2, entry.text);
    if (end_x >= CANVAS_W) {
        std::fprintf(stderr, "font_samples: %s: the sample is wider than the %d-pixel canvas\n", entry.name, CANVAS_W);
        return false;
    }

    // --- Step 2: The lit pixels' extent ---
    int left = CANVAS_W, right = -1, top = CANVAS_H, bottom = -1;
    for (int y = 0; y < CANVAS_H; ++y) {
        for (int x = 0; x < CANVAS_W; ++x) {
            if (!pixel_at(x, y)) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }
    if (right < 0) {
        std::fprintf(stderr, "font_samples: %s: nothing was drawn\n", entry.name);
        return false;
    }
    if (left == 0 || top == 0 || right == CANVAS_W - 1 || bottom == CANVAS_H - 1) {
        std::fprintf(stderr, "font_samples: %s: the sample reaches the canvas edge\n", entry.name);
        return false;
    }

    // --- Step 3: Crop: the drawn width, and the font's own height ---
    // Vertically the crop is the font's bounding box, so samples of one font
    // family share a baseline and a 7-high font looks 7 high, widened only if
    // a glyph overhangs it. U8G2 defines ascent as max_char_height + y_offset.
    const int ascent = u8g2->font_info.max_char_height + u8g2->font_info.y_offset;
    const int box_top = BASELINE_Y - ascent;
    const int box_bottom = box_top + u8g2->font_info.max_char_height - 1;
    if (box_top < top) top = box_top;
    if (box_bottom > bottom) bottom = box_bottom;
    const int w = right - left + 1;
    const int h = bottom - top + 1;

    // --- Step 4: Pack one bit per pixel and write the line ---
    const size_t bytes = (static_cast<size_t>(w) * static_cast<size_t>(h) + 7) / 8;
    std::memset(s_packed, 0, bytes);
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            if (!pixel_at(left + x, top + y)) continue;
            const size_t bit = static_cast<size_t>(y) * static_cast<size_t>(w) + static_cast<size_t>(x);
            s_packed[bit / 8] = static_cast<uint8_t>(s_packed[bit / 8] | (0x80u >> (bit % 8)));
        }
    }
    std::printf("%s %d %d ", entry.name, w, h);
    for (size_t i = 0; i < bytes; ++i) std::printf("%02x", s_packed[i]);
    std::printf("\n");
    return true;
}

}  // namespace

// main
// Renders every entry in the table, in order, and reports every failure
// rather than stopping at the first, so one run names all the fonts at fault.
int main() {
    static u8g2_t u8g2;
    setup_canvas(&u8g2);
    bool ok = true;
    for (size_t i = 0; i < font_sample_count; ++i) {
        if (!render_entry(&u8g2, font_sample_table[i])) ok = false;
    }
    return ok ? 0 : 1;
}
