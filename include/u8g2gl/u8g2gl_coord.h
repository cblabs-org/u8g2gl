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
 *          supported target (U8G2_16BIT), uint8_t without it. An implicit
 *          conversion compiles without a warning and turns -5 into 65531, so
 *          every conversion in the runtime goes through a helper here and states
 *          which of three rules it applies (WO4c):
 *
 *          - exact:   the value must already fit; otherwise the draw is SKIPPED.
 *          - span:    an origin and a length; the part left of (or above) 0 is
 *                     cut off, so the length is SHORTENED to the visible part.
 *          - clamp:   the value is CLAMPED into the representable range.
 *
 *          The rule for each primitive is chosen so that no pixel is lit that the
 *          signed geometry would not light: a span is shortened only where that is
 *          pixel-exact (a filled box, a line of pixels, a region), and every
 *          shape whose appearance depends on its origin — outlines, rounded
 *          shapes, circles, bitmaps, points, line endpoints — is skipped instead.
 *          The per-primitive table lives in u8g2gl_draw.h.
 *
 *          Text is the exception, and is UNRESOLVED — see u8g2gl_coord_text().
 *
 * Description: Four inline conversions and the representable maximum. Nothing
 *              allocates; nothing depends on int being 32-bit.
 *
 * Exported Functions:
 * - U8G2GL_U8G2_COORD_MAX:  Largest value a u8g2_uint_t holds on this build
 * - u8g2gl_coord_exact():   Convert if representable; false means skip the draw
 * - u8g2gl_coord_span():    Shorten an origin/length pair to its non-negative part
 * - u8g2gl_coord_clamp():   Clamp into [0, U8G2GL_U8G2_COORD_MAX]
 * - u8g2gl_coord_text():    Text origin — explicit modular conversion (unresolved)
 */
#ifndef U8G2GL_COORD_H
#define U8G2GL_COORD_H

#include <cstdint>
#include <limits>

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

/**
 * @brief Largest value U8G2's coordinate type holds on this build.
 *
 * 65535 with U8G2_16BIT (every 32-bit target, and unconditionally in U8G2
 * 2.36.18's u8g2.h), 255 without it. Read from the type rather than assumed, so
 * an 8-bit build clamps and skips at 255 instead of wrapping.
 */
inline constexpr int32_t U8G2GL_U8G2_COORD_MAX =
    static_cast<int32_t>(std::numeric_limits<u8g2_uint_t>::max());

/**
 * @brief Convert a coordinate that must be representable exactly — the SKIP rule.
 *
 * For values whose meaning depends on their exact position: points, line
 * endpoints, circle centres, and the origin of an outline, a rounded shape or a
 * bitmap. Moving such a value would draw the shape somewhere it is not, and
 * shortening it would draw an edge that is not there, so the only safe response
 * to a negative (or too-large) value is to draw nothing.
 *
 * @param value Signed coordinate.
 * @param out   Receives the converted value; untouched when false is returned.
 * @return false if @p value is negative or exceeds U8G2GL_U8G2_COORD_MAX. The
 *         caller must then skip the draw.
 */
inline bool u8g2gl_coord_exact(int32_t value, u8g2_uint_t& out) {
    if (value < 0 || value > U8G2GL_U8G2_COORD_MAX) {
        return false;
    }
    out = static_cast<u8g2_uint_t>(value);
    return true;
}

/**
 * @brief Shorten a span to the part at non-negative coordinates — the SHORTEN rule.
 *
 * For a run of pixels [origin, origin + length): a filled box's width or height,
 * a horizontal or vertical line, a refresh region. Cutting off the part before
 * 0 lights exactly the pixels the signed span would have lit on the display, so
 * nothing moves. A span running past U8G2GL_U8G2_COORD_MAX is shortened at that
 * end too.
 *
 * @param origin      Signed start of the span.
 * @param length      Signed length; <= 0 is empty.
 * @param out_origin  Receives the converted start (0 if the span began before 0).
 * @param out_length  Receives the converted, shortened length.
 * @return false if nothing of the span is left at representable coordinates;
 *         the outputs are then untouched and the caller must skip the draw.
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

/**
 * @brief Clamp a value into U8G2's coordinate range — the CLAMP rule.
 *
 * For values that are bounds rather than positions: clip-window corners
 * (already intersected with the display by the caller), and extents or radii
 * the caller has already checked are positive, where the clamp only makes the
 * conversion explicit.
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
 * @brief Convert a text origin (drawUTF8, drawGlyph) — UNRESOLVED, see below.
 *
 * WO4C STOP-AND-REPORT — THIS CONVERSION WRAPS, DELIBERATELY AND EXPLICITLY.
 * It is the unsigned modular conversion: -1 becomes U8G2GL_U8G2_COORD_MAX.
 *
 * WO4c requires that no conversion wraps, choosing per primitive between clamp,
 * shorten and skip. For text none of the three preserves existing behaviour:
 * - a marquee (long_mode scroll) draws at x - scroll_x, which is negative on
 *   every step once scrolling starts; clamping freezes the text at 0, and
 *   skipping blanks it;
 * - centred text wider than its label starts left of the label, so clamping
 *   shifts it and skipping hides it;
 * - text has no "visible part" to shorten to without copying the string.
 *
 * U8G2 2.36.18 is written to accept a wrapped text origin: its glyph renderer
 * tests intersection with wrap-aware u8g2_IsIntersection(), and draws runs
 * through u8g2_clip_intersection2() (u8g2_hvline.c), whose comment says a
 * simpler form "will not handle the case with negative a". So this is the
 * value hardware receives today, and the marquee relies on it.
 *
 * The WORKORDER and existing behaviour disagree, so the choice is recorded in
 * WO4c's Completion Report for the Principal Architect rather than made here.
 * Behaviour is unchanged and the wrap is confined to this one function:
 * LabelScroll.TextLeftOfOriginReachesU8g2Wrapped pins it, and a ruling changes
 * this body and that test, nothing else.
 *
 * @param value Signed text origin coordinate.
 * @return @p value modulo 2^N, where N is the width of u8g2_uint_t.
 */
inline u8g2_uint_t u8g2gl_coord_text(int32_t value) {
    return static_cast<u8g2_uint_t>(value);
}

#endif // U8G2GL_COORD_H
