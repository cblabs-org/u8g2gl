/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_coord.h
 * Purpose: The one place a U8G2GL coordinate becomes a U8G2 coordinate.
 *          U8G2GL stores geometry as signed int16_t (§13.2), because an element
 *          may legitimately sit partly off the display or outside its container.
 *          U8G2 takes u8g2_uint_t, which is unsigned — uint16_t on every
 *          supported target (U8G2_16BIT). An implicit conversion compiles without
 *          a warning, so every conversion in the runtime goes through a helper
 *          here, named for what the value IS (WO4c):
 *
 *          - a BOUND VALUE — a subject's int32_t value plus its container
 *            origin, becoming int16_t geometry — u8g2gl_coord_bound(): the sum
 *            clamped into int16_t. The object path's geometry bindings and
 *            generated draw calls both go through it, so how an element is
 *            realised (§13.5, [D-18]) cannot be seen in where it is drawn
 *            (PR-4R WO4). This is the step BEFORE the conversions below;
 *          - a POSITION (origin, centre) — u8g2gl_coord_pos(): an explicit
 *            two's-complement wrap, because U8G2 is built to take a negative
 *            position that way and clip it to the visible part. A LINE END
 *            POINT is the exception: u8g2gl_draw_line() clips the segment to
 *            the display first and converts with u8g2gl_coord_clamp();
 *          - a SIZE (width, height, length, circle radius) — u8g2gl_coord_size():
 *            <= 0 is refused (nothing to draw), and so is a size u8g2_uint_t
 *            cannot hold; the caller then draws nothing;
 *          - a BOUND (clip-window corner, clipped line end point) —
 *            u8g2gl_coord_clamp(): clamped into range;
 *          - a rounded box's CORNER RADIUS — u8g2gl_coord_corner_radius():
 *            clamped to 2r <= min(w, h) of the shape being drawn, because U8G2
 *            draws far outside the box beyond that (PR-4R WO3);
 *          - a REFRESH REGION — u8g2gl_coord_span(): shortened to its on-screen
 *            part, because updateDisplayArea() is not clipped by U8G2.
 *
 * Description: Six inline conversions and the representable maximum. Nothing
 *              allocates; nothing depends on int being 32-bit.
 *
 * Exported Functions:
 * - U8G2GL_U8G2_COORD_MAX:        Largest value a u8g2_uint_t holds on this build
 * - u8g2gl_coord_bound():         Bound value — origin + value, clamped into int16_t
 * - u8g2gl_coord_pos():           Position — explicit wrap; U8G2 clips it
 * - u8g2gl_coord_size():          Size — refuse <= 0 or unrepresentable
 * - u8g2gl_coord_clamp():         Clip corner or line end — clamp into range
 * - u8g2gl_coord_corner_radius(): Rounded-box radius — clamp to [0, min(w,h)/2]
 * - u8g2gl_coord_span():          Refresh region — shorten to the non-negative part
 */
#ifndef U8G2GL_COORD_H
#define U8G2GL_COORD_H

#include <cstdint>
#include <limits>

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

/**
 * @brief Largest value U8G2's coordinate type holds on this build.
 *
 * 65535 with U8G2_16BIT (defined unconditionally in U8G2 2.36.18's u8g2.h), 255
 * without it. Read from the type rather than assumed.
 */
inline constexpr int32_t U8G2GL_U8G2_COORD_MAX =
    static_cast<int32_t>(std::numeric_limits<u8g2_uint_t>::max());

/**
 * @brief The geometry a BOUND VALUE gives: @p origin + @p value, clamped into
 *        int16_t.
 *
 * RULE: every subject value that becomes an element's geometry comes through
 * here, whichever way the element is realised (§13.5): an object's bind_x(),
 * bind_y(), bind_width() and bind_height() observers (u8g2gl_obj.cpp), and each
 * bound integer argument of a generated u8g2gl_draw_* call, which the generator
 * spells `u8g2gl_coord_bound(40, ui_subject_x.get())`. One function, so the two
 * realisations cannot disagree — design_spec §13.5 requires a value reaching a
 * draw call to be clamped exactly as the object path clamps it, instead of
 * wrapping in the draw function's narrower parameter ([D-18], PR-4R WO4).
 *
 * Why clamp rather than wrap: subjects are int32_t and geometry is int16_t, and
 * a wrapped value lands on the opposite side of the display. A clamped one pins
 * the element at the edge of the coordinate space, which is off the display in
 * the direction the value was heading.
 *
 * The **sum** is clamped, never each term (Chief Architect, 2026-09-19): 40 +
 * 40000 must pin at INT16_MAX, and -10000 + 40000 is a perfectly good 30000.
 * The sum is taken in 32 bits, so the value is first bounded to ±65536 to make
 * overflow impossible. That changes no result: any value beyond it puts the sum
 * outside int16_t whatever the int16_t origin, so it clamps to the same edge.
 *
 * @param origin The container's absolute corner on the value's axis, for a
 *               position (§7.2). 0 for a position directly on the screen, and
 *               for a size, which is a length and has no origin.
 * @param value  The subject's value.
 * @return The sum, clamped to [INT16_MIN, INT16_MAX].
 */
inline int16_t u8g2gl_coord_bound(int16_t origin, int32_t value) {
    // --- Step 1: Bound the value so the 32-bit sum cannot overflow ---
    constexpr int32_t kBeyondAnyOrigin = 65536;
    if (value > kBeyondAnyOrigin) {
        value = kBeyondAnyOrigin;
    } else if (value < -kBeyondAnyOrigin) {
        value = -kBeyondAnyOrigin;
    }

    // --- Step 2: Add the origin, then clamp the sum into int16_t ---
    int32_t sum = static_cast<int32_t>(origin) + value;
    if (sum > INT16_MAX) {
        sum = INT16_MAX;
    } else if (sum < INT16_MIN) {
        sum = INT16_MIN;
    }
    return static_cast<int16_t>(sum);
}

/**
 * @brief Convert a draw POSITION — an origin, end point or centre — by an
 *        explicit two's-complement wrap.
 *
 * RULE: every draw position except a line end point (see below) reaches U8G2
 * through this one conversion, and it
 * wraps ON PURPOSE: -5 becomes 65531. A shape partly off the left or top edge is
 * therefore drawn, and U8G2 draws only its visible part. Nothing is clamped,
 * shortened or skipped here.
 *
 * Why wrapping is correct — U8G2 2.36.18 (extern/u8g2/csrc) is designed for it:
 * - u8g2_hvline.c, u8g2_clip_intersection2(): handles the a > b case explicitly,
 *   and its comment warns that replacing that branch with "return 0" "will not
 *   handle the case with negative a" — a negative start arriving wrapped is a
 *   case it exists to clip.
 * - u8g2_intersection.c, u8g2_is_intersection_decision_tree(): treats a wrapped
 *   span (v0 > v1) as intersecting, so u8g2_IsIntersection() does not reject it.
 * - u8g2_box.c (u8g2_DrawBox, u8g2_DrawFrame, u8g2_DrawRBox, u8g2_DrawRFrame),
 *   u8g2_bitmap.c (u8g2_DrawXBMP) and u8g2_font.c (glyph decoding) test
 *   u8g2_IsIntersection() and then draw through u8g2_DrawHVLine(), which clips
 *   with u8g2_clip_intersection2(). Their internal arithmetic (x + w, x + r) is
 *   in u8g2_uint_t, so it wraps back consistently.
 * - u8g2_circle.c plots outlines per pixel through u8g2_DrawPixel(), where a
 *   wrapped negative coordinate fails x >= user_x1 and is simply not drawn;
 *   discs and filled ellipses draw through u8g2_DrawVLine()/u8g2_DrawHVLine().
 *
 * The marquee depends on this: a scrolling label draws at x_ - scroll_x_, which
 * is negative on every step once it starts.
 *
 * Two exceptions do NOT use this:
 * - The clip window: setClipWindow() with a wrapped near corner would not clip,
 *   so u8g2gl_apply_clip() clamps both corners with u8g2gl_coord_clamp().
 * - Line end points: u8g2_line.c's u8g2_DrawLine() has no intersection check
 *   and measures the line from unsigned end points, so it never reaches
 *   u8g2_clip_intersection2(). u8g2gl_draw_line() clips the segment to the
 *   display in signed arithmetic, then converts with u8g2gl_coord_clamp().
 *
 * @param value Signed position, in the range of int16_t geometry.
 * @return @p value modulo 2^N, where N is the width of u8g2_uint_t.
 */
inline u8g2_uint_t u8g2gl_coord_pos(int32_t value) {
    return static_cast<u8g2_uint_t>(value);
}

/**
 * @brief Convert a draw SIZE — width, height, length or circle radius.
 *
 * RULE: a size is not a position and never wraps. A size <= 0 has nothing to
 * draw, and a size larger than U8G2GL_U8G2_COORD_MAX cannot be represented; both
 * are refused, and the caller must draw nothing.
 *
 * @param value Signed size.
 * @param out   Receives the converted size; untouched when false is returned.
 * @return false if @p value <= 0 or > U8G2GL_U8G2_COORD_MAX — skip the draw.
 */
inline bool u8g2gl_coord_size(int32_t value, u8g2_uint_t& out) {
    if (value <= 0 || value > U8G2GL_U8G2_COORD_MAX) {
        return false;
    }
    out = static_cast<u8g2_uint_t>(value);
    return true;
}

/**
 * @brief Clamp a BOUND into U8G2's coordinate range.
 *
 * For clip-window corners and clipped line end points, which must not wrap (see
 * u8g2gl_coord_pos()). A rounded box's corner radius has a tighter bound that
 * depends on the box, and goes through u8g2gl_coord_corner_radius() instead.
 *
 * @param value Signed value.
 * @return 0 for a negative value, U8G2GL_U8G2_COORD_MAX for one above it,
 *         otherwise the value.
 */
inline u8g2_uint_t u8g2gl_coord_clamp(int32_t value) {
    if (value < 0) {
        return 0;
    }
    if (value > U8G2GL_U8G2_COORD_MAX) {
        return static_cast<u8g2_uint_t>(U8G2GL_U8G2_COORD_MAX);
    }
    return static_cast<u8g2_uint_t>(value);
}

/**
 * @brief Clamp a rounded box's CORNER RADIUS to the bound 2r <= min(w, h).
 *
 * RULE: every radius passed to drawRBox() or drawRFrame() comes through here,
 * clamped against the size of the shape actually being drawn. The validator
 * refuses a literal radius past the same bound at build time
 * (checkCornerRadius(), cli/src/core/validator/validate-geometry.ts); this is
 * the draw-time half, for a size that is bound or a radius that arrives through
 * a style, which the validator cannot see.
 *
 * Why this number — measured, not reasoned (PR-4R WO3; harness and full output
 * in .agents/skills/principal-architect-workspace/pr-4r-corrections/evidence/rbox-bound/):
 * u8g2_DrawRBox() and u8g2_DrawRFrame() (extern/u8g2/csrc/u8g2_box.c, U8G2
 * 2.36.18: lines 121–123 and 134–136, and 183–188) compute the band between the
 * corners as ww = w - r - r and hh = h - r - r in u8g2_uint_t. Once 2r > w, ww
 * wraps, the `ww >= 3` test that follows passes, and U8G2 draws a box of the
 * wrapped width, clipped only by the display. Measured across sizes and every
 * radius, each r with 2r <= min(w, h) draws nothing outside the box and each r
 * with 2r > min(w, h) does, from 70 to 1753 stray pixels: the bound is exact in
 * both directions. test/test_rbox_bound.cpp keeps that measurement against the
 * pinned U8G2, so a U8G2 bump that moves the boundary fails there.
 *
 * 2r == min(w, h) is a capsule — the corner discs meet — and is the intended
 * look (the switch's default r = h / 2), so it is not reduced. Integer division
 * makes min(w, h) / 2 the largest r with 2r <= min(w, h) for odd sizes too:
 * 11 gives 5.
 *
 * A radius that clamps to 0 means square corners. A caller that chooses between
 * the square and rounded primitives (u8g2gl_draw_box()) must clamp first and
 * choose on the result, so that such a radius behaves exactly as a literal 0.
 *
 * @param radius Requested radius; negative means 0.
 * @param width  Width of the shape being drawn.
 * @param height Height of the shape being drawn. A width or height <= 0 gives 0.
 * @return The radius in [0, min(width, height) / 2], also held to
 *         U8G2GL_U8G2_COORD_MAX.
 */
inline u8g2_uint_t u8g2gl_coord_corner_radius(int32_t radius, int32_t width,
                                              int32_t height) {
    const int32_t smaller = (width < height) ? width : height;
    const int32_t bound = (smaller > 0) ? smaller / 2 : 0;
    return u8g2gl_coord_clamp((radius > bound) ? bound : radius);
}

/**
 * @brief Shorten a REFRESH REGION to the part at non-negative coordinates.
 *
 * Only for u8g2gl_partial_refresh(). updateDisplayArea() takes uint8_t tiles and
 * U8G2 does not clip them, so a wrapped origin would name the wrong tiles.
 * Refreshing the on-screen part of a region pushes exactly what refreshing the
 * whole region would.
 *
 * @param origin      Signed start of the span.
 * @param length      Signed length; <= 0 is empty.
 * @param out_origin  Receives the converted start (0 if the span began before 0).
 * @param out_length  Receives the converted, shortened length.
 * @return false if nothing of the span is left at representable coordinates;
 *         the outputs are then untouched and the caller must skip the refresh.
 */
inline bool u8g2gl_coord_span(int32_t origin, int32_t length,
                              u8g2_uint_t& out_origin, u8g2_uint_t& out_length) {
    // --- Step 1: Reject an empty span, or one wholly outside the range ---
    // The end is exclusive: a span ending at 0 has no pixel at x >= 0.
    const int32_t end = origin + length;
    if (length <= 0 || end <= 0 || origin > U8G2GL_U8G2_COORD_MAX) {
        return false;
    }

    // --- Step 2: Cut off what lies before 0 or past the maximum ---
    const int32_t first = (origin < 0) ? 0 : origin;
    const int32_t last_excl =
        (end > U8G2GL_U8G2_COORD_MAX) ? U8G2GL_U8G2_COORD_MAX : end;
    if (last_excl <= first) {
        return false;
    }

    out_origin = static_cast<u8g2_uint_t>(first);
    out_length = static_cast<u8g2_uint_t>(last_excl - first);
    return true;
}

#endif // U8G2GL_COORD_H
