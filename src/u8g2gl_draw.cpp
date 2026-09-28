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
 *              u8g2gl_coord.h for why each rule is what it is. Lines are the
 *              exception: u8g2gl_clip_line_to_display() clips them to the
 *              display first, because U8G2's drawLine does not clip.
 */
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_coord.h"

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
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

// Cohen–Sutherland outcode bits for u8g2gl_clip_line_to_display().
enum : uint8_t {
    LINE_CLIP_INSIDE = 0x00,
    LINE_CLIP_LEFT = 0x01,
    LINE_CLIP_RIGHT = 0x02,
    LINE_CLIP_TOP = 0x04,
    LINE_CLIP_BOTTOM = 0x08,
};

// line_clip_outcode
// Which edges of [0, xmax] x [0, ymax] a point lies beyond.
static uint8_t line_clip_outcode(int32_t x, int32_t y, int32_t xmax, int32_t ymax) {
    uint8_t code = LINE_CLIP_INSIDE;
    if (x < 0) {
        code |= LINE_CLIP_LEFT;
    } else if (x > xmax) {
        code |= LINE_CLIP_RIGHT;
    }
    if (y < 0) {
        code |= LINE_CLIP_TOP;
    } else if (y > ymax) {
        code |= LINE_CLIP_BOTTOM;
    }
    return code;
}

// line_clip_div_round
// num / den rounded to the nearest integer, halves away from zero. The
// product in num is computed by the caller in int64_t: two deltas of int16_t
// geometry can each approach 65535, and their product does not fit int32_t.
// The quotient is an offset along a segment the caller has proven crosses the
// boundary, so it is no larger than that segment's own delta and fits int32_t.
//   den — non-zero; the caller clips only against a boundary the segment spans
static int32_t line_clip_div_round(int64_t num, int64_t den) {
    if (den < 0) {
        num = -num;
        den = -den;
    }
    const int64_t half = den / 2;
    const int64_t q = (num >= 0) ? (num + half) / den : -((-num + half) / den);
    return static_cast<int32_t>(q);
}

// u8g2gl_clip_line_to_display
// Clips the segment (x1, y1)-(x2, y2) to the display's pixel grid
// [0, width-1] x [0, height-1], in signed arithmetic, before anything is
// converted to U8G2's unsigned coordinate type. Returns false when no part of
// the segment is on the display; the caller then draws nothing.
//   width, height — the display's size (getDisplayWidth/Height())
//   x1, y1, x2, y2 — end points; an end point outside is moved onto the edge
//
// WHY LINES ARE CLIPPED, when every other primitive takes a wrapped position
// (u8g2gl_coord_pos()): U8G2 2.36.18's u8g2_DrawLine() (extern/u8g2/csrc/
// u8g2_line.c) says "no intersection check at the moment, should be added..."
// (line 49), computes dx and dy from UNSIGNED end points (lines 51–52), and
// then plots pixel by pixel from x1 to x2 (line 78). It never reaches
// u8g2_clip_intersection2(), so a wrapped end point is not clipped: -2 arrives
// as 65534, and (-2, 0)-(10, 10) becomes a 65,524-pixel loop whose visible part
// is drawn almost flat. Clipping to the display is sufficient, because
// u8g2_DrawPixel() still applies the clip window to every plotted pixel.
//
// SLOPE IS PRESERVED. A segment with both end points on the display is returned
// unchanged, so U8G2 draws exactly the pixels it always drew. An end point
// outside is moved along the true line (x1, y1)-(x2, y2) to where it meets the
// display edge, and only that intersection is rounded to the nearest pixel, so
// the direction of the line is kept; U8G2 then draws the on-screen segment.
//
// Algorithm: Cohen–Sutherland. Each pass moves one outside end point onto an
// edge it lies beyond, which clears that outcode bit; rounding can leave the
// moved point just beyond an adjacent edge, which the next pass clips. Four
// edges per end point bound it at eight passes. A segment still outside after
// that only grazes a corner, and is not drawn.
static bool u8g2gl_clip_line_to_display(int32_t width, int32_t height,
                                        int32_t& x1, int32_t& y1,
                                        int32_t& x2, int32_t& y2) {
    // --- Step 1: A display with no pixels shows no line ---
    if (width <= 0 || height <= 0) {
        return false;
    }
    const int32_t xmax = width - 1;
    const int32_t ymax = height - 1;

    // --- Step 2: Move outside end points onto the edges they lie beyond ---
    uint8_t code1 = line_clip_outcode(x1, y1, xmax, ymax);
    uint8_t code2 = line_clip_outcode(x2, y2, xmax, ymax);
    for (int pass = 0; pass < 8; ++pass) {
        if ((code1 | code2) == LINE_CLIP_INSIDE) {
            return true;    // both on the display: nothing (more) to clip
        }
        if ((code1 & code2) != LINE_CLIP_INSIDE) {
            return false;   // both beyond the same edge: wholly off the display
        }

        // The other end point is not beyond the edge being clipped, so the
        // segment spans it and the delta divided by below is non-zero.
        const bool clip_first = (code1 != LINE_CLIP_INSIDE);
        const uint8_t code = clip_first ? code1 : code2;
        const int64_t dx = static_cast<int64_t>(x2) - x1;
        const int64_t dy = static_cast<int64_t>(y2) - y1;
        int32_t nx = 0;
        int32_t ny = 0;
        if ((code & LINE_CLIP_TOP) != 0) {
            ny = 0;
            nx = x1 + line_clip_div_round(dx * (0 - y1), dy);
        } else if ((code & LINE_CLIP_BOTTOM) != 0) {
            ny = ymax;
            nx = x1 + line_clip_div_round(dx * (static_cast<int64_t>(ymax) - y1), dy);
        } else if ((code & LINE_CLIP_RIGHT) != 0) {
            nx = xmax;
            ny = y1 + line_clip_div_round(dy * (static_cast<int64_t>(xmax) - x1), dx);
        } else {
            nx = 0;
            ny = y1 + line_clip_div_round(dy * (0 - x1), dx);
        }

        if (clip_first) {
            x1 = nx;
            y1 = ny;
            code1 = line_clip_outcode(x1, y1, xmax, ymax);
        } else {
            x2 = nx;
            y2 = ny;
            code2 = line_clip_outcode(x2, y2, xmax, ymax);
        }
    }
    return (code1 | code2) == LINE_CLIP_INSIDE;
}

// u8g2gl_draw_line
// U8G2's drawLine accepts endpoints in either order, so there is no "inverted
// coordinates" case to reject. Unlike every other primitive, a line is clipped
// to the display before converting — see u8g2gl_clip_line_to_display().
void u8g2gl_draw_line(U8G2& display, int16_t x1, int16_t y1, int16_t x2,
                       int16_t y2) {
    // --- Step 1: Clip the segment to the display, in signed arithmetic ---
    int32_t cx1 = x1;
    int32_t cy1 = y1;
    int32_t cx2 = x2;
    int32_t cy2 = y2;
    if (!u8g2gl_clip_line_to_display(static_cast<int32_t>(display.getDisplayWidth()),
                                     static_cast<int32_t>(display.getDisplayHeight()),
                                     cx1, cy1, cx2, cy2)) {
        return;
    }

    // --- Step 2: Convert the in-range end points without wrapping ---
    // Clipped end points lie in [0, width-1] x [0, height-1], so the clamp only
    // makes the conversion explicit. u8g2gl_coord_size() cannot be used: 0 is a
    // valid end point. u8g2gl_coord_pos()'s wrap must never reach drawLine().
    display.drawLine(u8g2gl_coord_clamp(cx1), u8g2gl_coord_clamp(cy1),
                     u8g2gl_coord_clamp(cx2), u8g2gl_coord_clamp(cy2));
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
