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
 *          - a POSITION (origin, centre) — u8g2gl_coord_pos(): an explicit
 *            two's-complement wrap, because U8G2 is built to take a negative
 *            position that way and clip it to the visible part. A LINE END
 *            POINT is the exception: u8g2gl_draw_line() clips the segment to
 *            the display first and converts with u8g2gl_coord_clamp();
 *          - a SIZE (width, height, length, circle radius) — u8g2gl_coord_size():
 *            <= 0 is refused (nothing to draw), and so is a size u8g2_uint_t
 *            cannot hold; the caller then draws nothing;
 *          - a BOUND (clip-window corner) or a CORNER RADIUS —
 *            u8g2gl_coord_clamp(): clamped into range;
 *          - a REFRESH REGION — u8g2gl_coord_span(): shortened to its on-screen
 *            part, because updateDisplayArea() is not clipped by U8G2.
 *
 * Description: Four inline conversions and the representable maximum. Nothing
 *              allocates; nothing depends on int being 32-bit.
 *
 * Exported Functions:
 * - U8G2GL_U8G2_COORD_MAX:  Largest value a u8g2_uint_t holds on this build
 * - u8g2gl_coord_pos():     Position — explicit wrap; U8G2 clips it
 * - u8g2gl_coord_size():    Size — refuse <= 0 or unrepresentable
 * - u8g2gl_coord_clamp():   Clip corner or corner radius — clamp into range
 * - u8g2gl_coord_span():    Refresh region — shorten to the non-negative part
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
 * @brief Clamp a BOUND or CORNER RADIUS into U8G2's coordinate range.
 *
 * For clip-window corners and clipped line end points, which must not wrap (see
 * u8g2gl_coord_pos()), and for
 * the corner radius of a rounded box, where 0 is a valid value meaning square
 * corners rather than an empty shape.
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
