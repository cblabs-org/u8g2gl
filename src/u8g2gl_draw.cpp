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
 *          value passed through unguarded would wrap to a very large unsigned
 *          value rather than draw nothing.
 *
 * Description: One function body per primitive. Every signed coordinate reaches
 *              U8G2 through a u8g2gl_coord.h helper; which rule each primitive
 *              applies (shorten or skip) is tabulated in u8g2gl_draw.h.
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
// rounded), after rejecting non-positive geometry.
//   display — U8G2 display driver instance
//   filled  — drawBox/drawRBox vs drawFrame/drawRFrame
//   radius  — > 0 selects the rounded variant
void u8g2gl_draw_box(U8G2& display, int16_t x, int16_t y, int16_t width,
                      int16_t height, bool filled, int16_t radius) {
    if (width <= 0 || height <= 0) {
        return;
    }

    // --- Step 1: A square filled box is shortened to its visible part ---
    // Cutting the columns left of 0 and the rows above 0 lights exactly the
    // pixels the signed box would have lit, so this is the one box that can be
    // shortened rather than skipped.
    if (filled && radius <= 0) {
        u8g2_uint_t ux = 0;
        u8g2_uint_t uy = 0;
        u8g2_uint_t uw = 0;
        u8g2_uint_t uh = 0;
        if (!u8g2gl_coord_span(x, width, ux, uw) ||
            !u8g2gl_coord_span(y, height, uy, uh)) {
            return;
        }
        display.drawBox(ux, uy, uw, uh);
        return;
    }

    // --- Step 2: Outlines and rounded boxes need their exact origin ---
    // Shortening a frame would draw its left or top edge at the display edge,
    // where the signed frame has no edge; moving a rounded box would put its
    // corners in the wrong place. Neither can be drawn faithfully from a
    // negative origin, so the draw is skipped.
    u8g2_uint_t ux = 0;
    u8g2_uint_t uy = 0;
    if (!u8g2gl_coord_exact(x, ux) || !u8g2gl_coord_exact(y, uy)) {
        return;
    }
    const u8g2_uint_t uw = u8g2gl_coord_clamp(width);
    const u8g2_uint_t uh = u8g2gl_coord_clamp(height);

    // --- Step 3: Dispatch to the matching U8G2 primitive ---
    if (radius > 0) {
        const u8g2_uint_t ur = u8g2gl_coord_clamp(radius);
        if (filled) {
            display.drawRBox(ux, uy, uw, uh, ur);
        } else {
            display.drawRFrame(ux, uy, uw, uh, ur);
        }
    } else {
        display.drawFrame(ux, uy, uw, uh);
    }
}

// u8g2gl_draw_circle
// Dispatches to drawCircle (outline) or drawDisc (filled), after rejecting a
// non-positive radius or a centre U8G2 cannot represent. `segments` is
// forwarded as U8G2's raw option byte.
void u8g2gl_draw_circle(U8G2& display, int16_t x, int16_t y, int16_t radius,
                         bool filled, u8g2gl_draw_segment_t segments) {
    if (radius <= 0) {
        return;
    }
    // A circle is placed by its centre; moving it would draw it elsewhere.
    u8g2_uint_t ux = 0;
    u8g2_uint_t uy = 0;
    if (!u8g2gl_coord_exact(x, ux) || !u8g2gl_coord_exact(y, uy)) {
        return;
    }
    const u8g2_uint_t ur = u8g2gl_coord_clamp(radius);
    if (filled) {
        display.drawDisc(ux, uy, ur, static_cast<uint8_t>(segments));
    } else {
        display.drawCircle(ux, uy, ur, static_cast<uint8_t>(segments));
    }
}

// u8g2gl_draw_ellipse
// Dispatches to drawEllipse (outline) or drawFilledEllipse (filled), after
// rejecting a non-positive radius on either axis or an unrepresentable centre.
// `segments` is forwarded as U8G2's raw option byte, exactly as
// u8g2gl_draw_circle does.
void u8g2gl_draw_ellipse(U8G2& display, int16_t x, int16_t y, int16_t rx,
                          int16_t ry, bool filled,
                          u8g2gl_draw_segment_t segments) {
    if (rx <= 0 || ry <= 0) {
        return;
    }
    u8g2_uint_t ux = 0;
    u8g2_uint_t uy = 0;
    if (!u8g2gl_coord_exact(x, ux) || !u8g2gl_coord_exact(y, uy)) {
        return;
    }
    const u8g2_uint_t urx = u8g2gl_coord_clamp(rx);
    const u8g2_uint_t ury = u8g2gl_coord_clamp(ry);
    if (filled) {
        display.drawFilledEllipse(ux, uy, urx, ury, static_cast<uint8_t>(segments));
    } else {
        display.drawEllipse(ux, uy, urx, ury, static_cast<uint8_t>(segments));
    }
}

// u8g2gl_draw_hline
// Shortens the run to its visible columns; a row above the display has no
// visible part, so it is skipped.
void u8g2gl_draw_hline(U8G2& display, int16_t x, int16_t y, int16_t width) {
    u8g2_uint_t ux = 0;
    u8g2_uint_t uw = 0;
    u8g2_uint_t uy = 0;
    if (!u8g2gl_coord_span(x, width, ux, uw) || !u8g2gl_coord_exact(y, uy)) {
        return;
    }
    display.drawHLine(ux, uy, uw);
}

// u8g2gl_draw_line
// U8G2's drawLine accepts endpoints in either order, so there is no
// "inverted coordinates" case to reject. It has no signed form, and the pixels
// of a line depend on both endpoints, so an endpoint U8G2 cannot represent
// skips the line rather than bending it.
void u8g2gl_draw_line(U8G2& display, int16_t x1, int16_t y1, int16_t x2,
                       int16_t y2) {
    u8g2_uint_t ux1 = 0;
    u8g2_uint_t uy1 = 0;
    u8g2_uint_t ux2 = 0;
    u8g2_uint_t uy2 = 0;
    if (!u8g2gl_coord_exact(x1, ux1) || !u8g2gl_coord_exact(y1, uy1) ||
        !u8g2gl_coord_exact(x2, ux2) || !u8g2gl_coord_exact(y2, uy2)) {
        return;
    }
    display.drawLine(ux1, uy1, ux2, uy2);
}

// u8g2gl_draw_pixel
// A pixel at a negative coordinate is off the display; skip it.
void u8g2gl_draw_pixel(U8G2& display, int16_t x, int16_t y) {
    u8g2_uint_t ux = 0;
    u8g2_uint_t uy = 0;
    if (!u8g2gl_coord_exact(x, ux) || !u8g2gl_coord_exact(y, uy)) {
        return;
    }
    display.drawPixel(ux, uy);
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
        // Each edge goes through u8g2gl_draw_line, so an edge with an
        // unrepresentable endpoint is skipped on its own.
        u8g2gl_draw_line(display, x0, y0, x1, y1);
        u8g2gl_draw_line(display, x1, y1, x2, y2);
        u8g2gl_draw_line(display, x2, y2, x0, y0);
    }
}

// u8g2gl_draw_vline
// Shortens the run to its visible rows; a column left of the display has no
// visible part, so it is skipped.
void u8g2gl_draw_vline(U8G2& display, int16_t x, int16_t y, int16_t height) {
    u8g2_uint_t ux = 0;
    u8g2_uint_t uy = 0;
    u8g2_uint_t uh = 0;
    if (!u8g2gl_coord_exact(x, ux) || !u8g2gl_coord_span(y, height, uy, uh)) {
        return;
    }
    display.drawVLine(ux, uy, uh);
}
