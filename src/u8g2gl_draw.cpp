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
 * Description: One function body per primitive. Positions reach U8G2 through
 *              u8g2gl_coord_pos() (an explicit wrap U8G2 clips) and sizes
 *              through u8g2gl_coord_size() (refused when <= 0); see
 *              u8g2gl_coord.h for why each rule is what it is.
 */
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_coord.h"

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
// rounded), after refusing a size that is non-positive or unrepresentable.
//   display — U8G2 display driver instance
//   filled  — drawBox/drawRBox vs drawFrame/drawRFrame
//   radius  — > 0 selects the rounded variant
void u8g2gl_draw_box(U8G2& display, int16_t x, int16_t y, int16_t width,
                      int16_t height, bool filled, int16_t radius) {
    // --- Step 1: Convert the size, or draw nothing ---
    u8g2_uint_t uw = 0;
    u8g2_uint_t uh = 0;
    if (!u8g2gl_coord_size(width, uw) || !u8g2gl_coord_size(height, uh)) {
        return;
    }
    const u8g2_uint_t ux = u8g2gl_coord_pos(x);
    const u8g2_uint_t uy = u8g2gl_coord_pos(y);

    // --- Step 2: Dispatch to the matching U8G2 primitive ---
    u8g2_uint_t ur = 0;
    if (u8g2gl_coord_size(radius, ur)) {
        if (filled) {
            display.drawRBox(ux, uy, uw, uh, ur);
        } else {
            display.drawRFrame(ux, uy, uw, uh, ur);
        }
    } else if (filled) {
        display.drawBox(ux, uy, uw, uh);
    } else {
        display.drawFrame(ux, uy, uw, uh);
    }
}

// u8g2gl_draw_circle
// Dispatches to drawCircle (outline) or drawDisc (filled), after refusing a
// non-positive radius. `segments` is forwarded as U8G2's raw option byte.
void u8g2gl_draw_circle(U8G2& display, int16_t x, int16_t y, int16_t radius,
                         bool filled, u8g2gl_draw_segment_t segments) {
    u8g2_uint_t ur = 0;
    if (!u8g2gl_coord_size(radius, ur)) {
        return;
    }
    if (filled) {
        display.drawDisc(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y), ur,
                         static_cast<uint8_t>(segments));
    } else {
        display.drawCircle(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y), ur,
                           static_cast<uint8_t>(segments));
    }
}

// u8g2gl_draw_ellipse
// Dispatches to drawEllipse (outline) or drawFilledEllipse (filled), after
// refusing a non-positive radius on either axis. `segments` is forwarded as
// U8G2's raw option byte, exactly as u8g2gl_draw_circle does.
void u8g2gl_draw_ellipse(U8G2& display, int16_t x, int16_t y, int16_t rx,
                          int16_t ry, bool filled,
                          u8g2gl_draw_segment_t segments) {
    u8g2_uint_t urx = 0;
    u8g2_uint_t ury = 0;
    if (!u8g2gl_coord_size(rx, urx) || !u8g2gl_coord_size(ry, ury)) {
        return;
    }
    if (filled) {
        display.drawFilledEllipse(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y), urx, ury,
                                  static_cast<uint8_t>(segments));
    } else {
        display.drawEllipse(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y), urx, ury,
                            static_cast<uint8_t>(segments));
    }
}

// u8g2gl_draw_hline
// Refuses a non-positive length, then forwards directly — U8G2 has no
// filled/outline distinction for a line of pixels.
void u8g2gl_draw_hline(U8G2& display, int16_t x, int16_t y, int16_t width) {
    u8g2_uint_t uw = 0;
    if (!u8g2gl_coord_size(width, uw)) {
        return;
    }
    display.drawHLine(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y), uw);
}

// u8g2gl_draw_line
// Straight forward: U8G2's drawLine accepts endpoints in either order, so
// there is no "inverted coordinates" case to reject. Both end points are
// positions and wrap explicitly.
void u8g2gl_draw_line(U8G2& display, int16_t x1, int16_t y1, int16_t x2,
                       int16_t y2) {
    display.drawLine(u8g2gl_coord_pos(x1), u8g2gl_coord_pos(y1),
                     u8g2gl_coord_pos(x2), u8g2gl_coord_pos(y2));
}

// u8g2gl_draw_pixel
// A single point has no degenerate case beyond what U8G2 itself clips.
void u8g2gl_draw_pixel(U8G2& display, int16_t x, int16_t y) {
    display.drawPixel(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y));
}

// u8g2gl_draw_triangle
// `filled` selects U8G2's single drawTriangle call, or a composed outline.
// U8G2 has no unfilled-triangle primitive, so the outline is not a U8G2 call
// at all — it is three line draws, one per edge, in vertex order.
void u8g2gl_draw_triangle(U8G2& display, int16_t x0, int16_t y0, int16_t x1,
                           int16_t y1, int16_t x2, int16_t y2, bool filled) {
    if (filled) {
        // No conversion: U8G2 declares drawTriangle with int16_t vertices
        // (U8g2lib.h), the only draw call that takes signed coordinates.
        display.drawTriangle(x0, y0, x1, y1, x2, y2);
    } else {
        u8g2gl_draw_line(display, x0, y0, x1, y1);
        u8g2gl_draw_line(display, x1, y1, x2, y2);
        u8g2gl_draw_line(display, x2, y2, x0, y0);
    }
}

// u8g2gl_draw_vline
// Refuses a non-positive length, then forwards directly.
void u8g2gl_draw_vline(U8G2& display, int16_t x, int16_t y, int16_t height) {
    u8g2_uint_t uh = 0;
    if (!u8g2gl_coord_size(height, uh)) {
        return;
    }
    display.drawVLine(u8g2gl_coord_pos(x), u8g2gl_coord_pos(y), uh);
}
