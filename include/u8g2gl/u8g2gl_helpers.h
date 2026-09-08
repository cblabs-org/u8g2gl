/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_helpers.h
 * Description: Declarations for u8g2gl_helpers.h
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

// Tile-aligned partial refresh helper per §11.4
inline void u8g2gl_partial_refresh(U8G2& d, int x, int y, int w, int h) {
    int tx = x / 8, ty = y / 8;
    int tw = ((x % 8) + w + 7) / 8;   // NOT (w + 7) / 8 — spec §11.4
    int th = ((y % 8) + h + 7) / 8;
    d.updateDisplayArea(tx, ty, tw, th);
}

#endif // U8G2GL_HELPERS_H
