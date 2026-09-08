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
 * - u8g2gl_min(): Minimum of two uint32_t values
 * - u8g2gl_max(): Maximum of two uint32_t values
 */
#ifndef U8G2GL_HELPERS_H
#define U8G2GL_HELPERS_H

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
 * @param d Display instance.
 * @param x Left edge of the region, in pixels.
 * @param y Top edge, in pixels.
 * @param w Width in pixels.
 * @param h Height in pixels.
 */
inline void u8g2gl_partial_refresh(U8G2& d, int x, int y, int w, int h) {
    // The tile origin rounds *down*, so the region starts up to 7 pixels left of
    // and above the requested rectangle. The width must therefore cover that
    // slack as well as the rectangle itself.
    //
    // The naive (w + 7) / 8 ignores the slack and under-covers whenever x is not
    // tile-aligned: a widget at x=6 w=12 occupies pixels 6..17, which is tiles
    // 0..2, but (12+7)/8 yields 2 tiles — pixels 0..15 — leaving columns 16 and
    // 17 showing whatever was there before. Adding (x % 8) before rounding up
    // accounts for it. Same reasoning vertically.
    int tx = x / 8, ty = y / 8;
    int tw = ((x % 8) + w + 7) / 8;
    int th = ((y % 8) + h + 7) / 8;
    d.updateDisplayArea(tx, ty, tw, th);
}

#endif // U8G2GL_HELPERS_H
