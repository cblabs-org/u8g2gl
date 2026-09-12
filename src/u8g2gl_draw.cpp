/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_draw.cpp
 *
 * Purpose: Implements the [D-18] primitive free functions declared in
 *          u8g2gl_draw.h. Each one is a thin, guarded dispatch onto the
 *          matching U8G2 draw call — the guard exists because these run
 *          inside the render loop, where a degenerate value (zero or negative
 *          width/height/radius) must be a silent no-op rather than undefined
 *          behaviour. U8G2's own coordinate type is unsigned, so a negative
 *          size passed through unguarded would wrap to a very large unsigned
 *          value rather than draw nothing.
 *
 * Description: One function body per primitive, plus u8g2gl_draw_ellipse's
 *              deliberately absent body — see the @note on its declaration in
 *              u8g2gl_draw.h and the WO3 Completion Report.
 */
#include "u8g2gl/u8g2gl_draw.h"

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_draw_box
// Dispatches to whichever of U8G2's four box primitives matches (filled x
// rounded), after rejecting non-positive geometry.
//   display — U8G2 display driver instance
//   filled  — drawBox/drawRBox vs drawFrame/drawRFrame
//   radius  — > 0 selects the rounded variant
void u8g2gl_draw_box(U8G2& display, int16_t x, int16_t y, int16_t width,
                      int16_t height, bool filled, int16_t radius) {
    if (width <= 0 || height <= 0) {
        return;
    }
    if (radius > 0) {
        if (filled) {
            display.drawRBox(x, y, width, height, radius);
        } else {
            display.drawRFrame(x, y, width, height, radius);
        }
    } else {
        if (filled) {
            display.drawBox(x, y, width, height);
        } else {
            display.drawFrame(x, y, width, height);
        }
    }
}

// u8g2gl_draw_circle
// Dispatches to drawCircle (outline) or drawDisc (filled), after rejecting a
// non-positive radius. `segments` is forwarded as U8G2's raw option byte.
void u8g2gl_draw_circle(U8G2& display, int16_t x, int16_t y, int16_t radius,
                         bool filled, u8g2gl_draw_segment_t segments) {
    if (radius <= 0) {
        return;
    }
    if (filled) {
        display.drawDisc(x, y, radius, static_cast<uint8_t>(segments));
    } else {
        display.drawCircle(x, y, radius, static_cast<uint8_t>(segments));
    }
}

// u8g2gl_draw_ellipse
// Deliberately not defined — see the @note on the declaration in
// u8g2gl_draw.h. test/stubs/U8G2lib.h (the single authoritative U8G2 test
// double) has no drawEllipse/drawFilledEllipse member to call, and extending
// it is outside WO3's boundary box. Defining this against the real U8G2 API
// would compile for firmware but break the shared host test build, which
// compiles this file against that same stub. Left undeclared-but-unused is
// safe: nothing calls it yet (WO4 wires the manifest to it), so there is no
// link error, only a reservation of the symbol name.

// u8g2gl_draw_hline
// Rejects a non-positive length, then forwards directly — U8G2 has no
// filled/outline distinction for a line of pixels.
void u8g2gl_draw_hline(U8G2& display, int16_t x, int16_t y, int16_t width) {
    if (width <= 0) {
        return;
    }
    display.drawHLine(x, y, width);
}

// u8g2gl_draw_line
// Straight forward: U8G2's drawLine accepts endpoints in either order, so
// there is no degenerate "inverted coordinates" case to reject.
void u8g2gl_draw_line(U8G2& display, int16_t x1, int16_t y1, int16_t x2,
                       int16_t y2) {
    display.drawLine(x1, y1, x2, y2);
}

// u8g2gl_draw_pixel
// A single point has no degenerate case beyond what U8G2 itself clips.
void u8g2gl_draw_pixel(U8G2& display, int16_t x, int16_t y) {
    display.drawPixel(x, y);
}

// u8g2gl_draw_triangle
// U8G2's drawTriangle is always filled — `filled` is accepted for manifest
// parity but currently unused; see the @note on the declaration.
void u8g2gl_draw_triangle(U8G2& display, int16_t x0, int16_t y0, int16_t x1,
                           int16_t y1, int16_t x2, int16_t y2, bool filled) {
    (void)filled;
    display.drawTriangle(x0, y0, x1, y1, x2, y2);
}

// u8g2gl_draw_vline
// Rejects a non-positive length, then forwards directly.
void u8g2gl_draw_vline(U8G2& display, int16_t x, int16_t y, int16_t height) {
    if (height <= 0) {
        return;
    }
    display.drawVLine(x, y, height);
}
