/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_types.h
 * Purpose: The shared vocabulary every other header depends on — the enums and
 *          constants that would otherwise create circular includes if they lived
 *          with the types that use them.
 *
 *          Every enum here carries an explicit uint8_t base type. That is not
 *          stylistic: an untyped enum is int, and these are stored in structs
 *          instantiated per object and per binding, where four bytes instead of
 *          one is multiplied across the whole screen.
 *
 * Description: Alignment, draw colour, font and bitmap modes, object flags,
 *              event kinds, and the sentinel constants (U8G2GL_NO_PARENT,
 *              U8G2GL_IDLE) that mark "no value" in their respective domains
 *
 * Exported Types:
 * - u8g2gl_align_t: Text alignment
 * - u8g2gl_color_t: Draw color (0, 1, XOR)
 * - u8g2gl_font_mode_t: Font rendering mode
 * - u8g2gl_bitmap_mode_t: Bitmap rendering mode
 * - u8g2gl_event_t: Event types for focus/input
 */
#ifndef U8G2GL_TYPES_H
#define U8G2GL_TYPES_H

#include <cstdint>
#include <cstddef>
#include <climits>

static constexpr uint32_t U8G2GL_IDLE = UINT32_MAX;
static constexpr uint8_t U8G2GL_NO_PARENT = UINT8_MAX;

// Flag constants (as uint8_t)
static constexpr uint8_t U8G2GL_FLAG_HIDDEN   = 0x01;
static constexpr uint8_t U8G2GL_FLAG_DIRTY    = 0x02;
static constexpr uint8_t U8G2GL_FLAG_DISABLED = 0x04;

// Alignment enum (WO6 Finding C: explicit narrow base type, was untyped `int`)
enum u8g2gl_align_t : uint8_t {
    U8G2GL_ALIGN_LEFT = 0,
    U8G2GL_ALIGN_CENTER,
    U8G2GL_ALIGN_RIGHT
};

// Color enum (WO6 Finding C: explicit narrow base type, was untyped `int`)
enum u8g2gl_color_t : uint8_t {
    U8G2GL_COLOR_0 = 0,
    U8G2GL_COLOR_1 = 1,
    U8G2GL_COLOR_XOR = 2
};

// Font mode enum (WO6 Finding C: explicit narrow base type, was untyped `int`)
enum u8g2gl_font_mode_t : uint8_t {
    U8G2GL_FONT_MODE_SOLID = 0,
    U8G2GL_FONT_MODE_TRANSPARENT = 1
};

// Bitmap mode enum (WO6 Finding C: explicit narrow base type, was untyped `int`)
enum u8g2gl_bitmap_mode_t : uint8_t {
    U8G2GL_BITMAP_MODE_SOLID = 0,
    U8G2GL_BITMAP_MODE_TRANSPARENT = 1
};

// Inline helper
inline uint32_t u8g2gl_min(uint32_t a, uint32_t b) {
    return a < b ? a : b;
}

// Event enum stub (for §12, don't implement dispatch)
enum u8g2gl_event_t : uint8_t {
    U8G2GL_EVENT_NONE = 0,
    U8G2GL_EVENT_ENCODER_CW,
    U8G2GL_EVENT_ENCODER_CCW,
    U8G2GL_EVENT_ENCODER_CLICK,
    U8G2GL_EVENT_BUTTON_PRESS,
    U8G2GL_EVENT_BUTTON_LONG_PRESS,
};

#endif // U8G2GL_TYPES_H
