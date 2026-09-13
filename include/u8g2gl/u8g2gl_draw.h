/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_draw.h
 *
 * Purpose: [D-18] removed the Tier 1 / Tier 2 widget split — there is one
 *          element vocabulary, and whether an instance becomes a C++ object or
 *          a bare draw call is a generator outcome, never an authoring
 *          category. A primitive that needs no object (a line, a pixel, a
 *          filled box) has no state to own between frames, so it compiles to
 *          one of the free functions declared here instead of a class.
 *
 *          These are FREE FUNCTIONS, DELIBERATELY, NOT STATIC METHODS ON A
 *          CLASS. Wrapping them in a `u8g2gl_draw` class (or similar) would
 *          look tidy and would silently reintroduce the tier split [D-18]
 *          removed: a class implies an object identity these primitives do
 *          not have, and the whole reason they exist as functions is so the
 *          firmware and Wasm editor targets can share one set of draw calls
 *          with nothing to construct, own, or destroy. If you are reading this
 *          because you are about to "tidy" these into a class — don't; read
 *          [D-18] and design_spec.md §6 first.
 *
 *          Each function's parameters are taken directly from the
 *          corresponding primitive's manifest under
 *          include/u8g2gl/manifests/ (u8g2gl_box.xml, u8g2gl_circle.xml, ...),
 *          so a generator emitting a call from a parsed manifest has a 1:1
 *          mapping with no translation table.
 *
 * Description: One free function per primitive manifest — box, circle,
 *              ellipse, hline, line, pixel, triangle, vline — plus the shared
 *              segment enum used by circle and ellipse's `segments` property.
 *              Degenerate geometry (zero width/height/radius) is a no-op, not
 *              a crash: these run inside the render loop, where a bad value
 *              is a reboot rather than an exception.
 *
 * Exported Types:
 * - u8g2gl_draw_segment_t: Which arc/quadrant a circle or ellipse draws
 *
 * Exported Functions:
 * - u8g2gl_draw_box():      Filled or outline rectangle, optionally rounded
 * - u8g2gl_draw_circle():   Circle outline or filled disc
 * - u8g2gl_draw_ellipse():  Ellipse outline or filled
 * - u8g2gl_draw_hline():    Horizontal line
 * - u8g2gl_draw_line():     Arbitrary line between two points
 * - u8g2gl_draw_pixel():    Single pixel
 * - u8g2gl_draw_triangle(): Filled triangle, or a three-line outline
 * - u8g2gl_draw_vline():    Vertical line
 */
#ifndef U8G2GL_DRAW_H
#define U8G2GL_DRAW_H

#include <cstdint>

// Forward declaration of the U8G2 display class. The real declaration comes
// from U8G2lib.h on firmware/editor builds, or from the single authoritative
// test stub (test/stubs/U8G2lib.h) on host test builds — see cpp.md §7.
class U8G2;

/**
 * @brief Which quadrant(s) of a circle or ellipse to draw.
 *
 * Mirrors U8G2's own `U8G2_DRAW_*` option bits exactly (u8g2.h): a single
 * enumerator here is passed straight through as the `option` byte to
 * `drawCircle()` / `drawDisc()` / `drawEllipse()` / `drawFilledEllipse()`, so
 * the numeric values are load-bearing and must not be renumbered.
 */
enum u8g2gl_draw_segment_t : uint8_t {
    U8G2GL_DRAW_SEGMENT_UPPER_RIGHT = 0x01,
    U8G2GL_DRAW_SEGMENT_UPPER_LEFT = 0x02,
    U8G2GL_DRAW_SEGMENT_LOWER_LEFT = 0x04,
    U8G2GL_DRAW_SEGMENT_LOWER_RIGHT = 0x08,
    U8G2GL_DRAW_SEGMENT_ALL = 0x0F,
};

/**
 * @brief Draw a box (filled or outline rectangle), optionally with rounded
 * corners.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_box.xml`: `filled` selects between
 * U8G2's `drawBox`/`drawFrame`, and `radius > 0` selects the rounded variants
 * `drawRBox`/`drawRFrame` instead.
 *
 * @param display U8G2 display context to draw into.
 * @param x       Left edge, in device pixels.
 * @param y       Top edge, in device pixels.
 * @param width   Width in pixels. `<= 0` draws nothing.
 * @param height  Height in pixels. `<= 0` draws nothing.
 * @param filled  Whether the box is filled or an outline frame.
 * @param radius  Corner radius in pixels. `<= 0` draws square corners.
 */
void u8g2gl_draw_box(U8G2& display, int16_t x, int16_t y, int16_t width,
                      int16_t height, bool filled = true, int16_t radius = 0);

/**
 * @brief Draw a circle outline or filled disc.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_circle.xml`: `filled` selects
 * between U8G2's `drawCircle`/`drawDisc`.
 *
 * @param display  U8G2 display context to draw into.
 * @param x        Center X coordinate.
 * @param y        Center Y coordinate.
 * @param radius   Circle radius in pixels. `<= 0` draws nothing.
 * @param filled   Whether the circle is a filled disc or an outline.
 * @param segments Which quadrant(s) to draw.
 */
void u8g2gl_draw_circle(U8G2& display, int16_t x, int16_t y, int16_t radius,
                         bool filled = false,
                         u8g2gl_draw_segment_t segments = U8G2GL_DRAW_SEGMENT_ALL);

/**
 * @brief Draw an ellipse outline or filled ellipse.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_ellipse.xml`: `filled` selects
 * between U8G2's `drawEllipse`/`drawFilledEllipse`.
 *
 * @param display  U8G2 display context to draw into.
 * @param x        Center X coordinate.
 * @param y        Center Y coordinate.
 * @param rx       Horizontal radius in pixels. `<= 0` draws nothing.
 * @param ry       Vertical radius in pixels. `<= 0` draws nothing.
 * @param filled   Whether the ellipse is filled or an outline.
 * @param segments Which quadrant(s) to draw.
 */
void u8g2gl_draw_ellipse(U8G2& display, int16_t x, int16_t y, int16_t rx,
                          int16_t ry, bool filled = false,
                          u8g2gl_draw_segment_t segments = U8G2GL_DRAW_SEGMENT_ALL);

/**
 * @brief Draw a horizontal line.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_hline.xml`.
 *
 * @param display U8G2 display context to draw into.
 * @param x       Left edge, in device pixels.
 * @param y       Row to draw on.
 * @param width   Length in pixels. `<= 0` draws nothing.
 */
void u8g2gl_draw_hline(U8G2& display, int16_t x, int16_t y, int16_t width);

/**
 * @brief Draw a line between two arbitrary points.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_line.xml`. U8G2's `drawLine`
 * accepts endpoints in either order, so there is no "inverted coordinates"
 * case to guard here.
 *
 * @param display U8G2 display context to draw into.
 * @param x1      Start X coordinate.
 * @param y1      Start Y coordinate.
 * @param x2      End X coordinate.
 * @param y2      End Y coordinate.
 */
void u8g2gl_draw_line(U8G2& display, int16_t x1, int16_t y1, int16_t x2,
                       int16_t y2);

/**
 * @brief Draw a single pixel.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_pixel.xml`.
 *
 * @param display U8G2 display context to draw into.
 * @param x       Pixel X coordinate.
 * @param y       Pixel Y coordinate.
 */
void u8g2gl_draw_pixel(U8G2& display, int16_t x, int16_t y);

/**
 * @brief Draw a triangle, filled or as a three-line outline.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_triangle.xml`.
 *
 * @note U8G2 has no unfilled-triangle primitive — `drawTriangle` is always
 *       filled. `filled=false` is therefore composed from three
 *       `drawLine()` calls, one per edge, rather than dispatched to a U8G2
 *       outline primitive that does not exist.
 *
 * @param display U8G2 display context to draw into.
 * @param x0      Vertex 0 X coordinate.
 * @param y0      Vertex 0 Y coordinate.
 * @param x1      Vertex 1 X coordinate.
 * @param y1      Vertex 1 Y coordinate.
 * @param x2      Vertex 2 X coordinate.
 * @param y2      Vertex 2 Y coordinate.
 * @param filled  Whether the triangle is filled (single `drawTriangle` call)
 *                or an outline (three `drawLine` calls between the vertices).
 */
void u8g2gl_draw_triangle(U8G2& display, int16_t x0, int16_t y0, int16_t x1,
                           int16_t y1, int16_t x2, int16_t y2,
                           bool filled = true);

/**
 * @brief Draw a vertical line.
 *
 * Matches `include/u8g2gl/manifests/u8g2gl_vline.xml`.
 *
 * @param display U8G2 display context to draw into.
 * @param x       Left edge, in device pixels.
 * @param y       Top edge, in device pixels.
 * @param height  Length in pixels. `<= 0` draws nothing.
 */
void u8g2gl_draw_vline(U8G2& display, int16_t x, int16_t y, int16_t height);

#endif // U8G2GL_DRAW_H
