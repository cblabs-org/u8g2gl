/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_helpers.h
 * Purpose: Small utilities shared across the runtime that belong to no single
 *          module. Chiefly partial_refresh(), which exists because the obvious
 *          tile calculation is wrong in a way that is easy to miss and painful
 *          to debug — see its documentation.
 *
 * Description: Tile-coordinate conversion for U8G2's updateDisplayArea, and
 *              related geometry helpers
 *
 * Exported Functions:
 * - u8g2gl_partial_refresh(): Push one pixel region of the buffer, in tiles
 */
#ifndef U8G2GL_HELPERS_H
#define U8G2GL_HELPERS_H

#include "u8g2gl_coord.h"

#include <cstdint>

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#else
class U8G2;
#endif

/**
 * @brief Push one rectangular region of the buffer to the display.
 *
 * Wraps U8G2's updateDisplayArea(), which takes 8-pixel **tile** coordinates
 * rather than pixels. Use this rather than converting by hand — the obvious
 * conversion is wrong, and wrong in a way that produces stale columns on the
 * display rather than an error.
 *
 * A region partly left of or above the display refreshes only its on-screen
 * part, and a region with no on-screen part refreshes nothing. Tile arguments
 * are uint8_t in U8G2, so they are clamped at 255.
 *
 * @param d Display instance.
 * @param x Left edge of the region, in pixels; may be negative.
 * @param y Top edge, in pixels; may be negative.
 * @param w Width in pixels.
 * @param h Height in pixels.
 */
inline void u8g2gl_partial_refresh(U8G2& d, int x, int y, int w, int h) {
    // --- Step 1: Shorten the region to its part at non-negative coordinates ---
    // Refreshing the visible part of a region is exactly what refreshing the
    // whole region would have pushed. Tile arithmetic on a negative origin
    // would instead truncate toward zero, and the tile arguments are unsigned.
    u8g2_uint_t ux = 0;
    u8g2_uint_t uy = 0;
    u8g2_uint_t uw = 0;
    u8g2_uint_t uh = 0;
    if (!u8g2gl_coord_span(x, w, ux, uw) || !u8g2gl_coord_span(y, h, uy, uh)) {
        return;
    }

    // --- Step 2: Convert pixels to tiles ---
    // The tile origin rounds *down*, so the region starts up to 7 pixels left of
    // and above the requested rectangle. The width must therefore cover that
    // slack as well as the rectangle itself.
    //
    // The naive (w + 7) / 8 ignores the slack and under-covers whenever x is not
    // tile-aligned: a widget at x=6 w=12 occupies pixels 6..17, which is tiles
    // 0..2, but (12+7)/8 yields 2 tiles — pixels 0..15 — leaving columns 16 and
    // 17 showing whatever was there before. Adding (x % 8) before rounding up
    // accounts for it. Same reasoning vertically.
    const int32_t tx = ux / 8;
    const int32_t ty = uy / 8;
    const int32_t tw = ((ux % 8) + static_cast<int32_t>(uw) + 7) / 8;
    const int32_t th = ((uy % 8) + static_cast<int32_t>(uh) + 7) / 8;

    // --- Step 3: Narrow to U8G2's uint8_t tile arguments ---
    // U8G2 describes every display's size in uint8_t tiles, so no real display
    // reaches 255; the clamp only stops an oversized region from wrapping.
    const int32_t max_tile = 255;
    d.updateDisplayArea(static_cast<uint8_t>(tx > max_tile ? max_tile : tx),
                        static_cast<uint8_t>(ty > max_tile ? max_tile : ty),
                        static_cast<uint8_t>(tw > max_tile ? max_tile : tw),
                        static_cast<uint8_t>(th > max_tile ? max_tile : th));
}

#endif // U8G2GL_HELPERS_H
