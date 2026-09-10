/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_glyph.cpp
 *
 * Purpose: Implements the single font glyph display widget. Draws an individual
 *          16-bit codepoint via U8G2 drawGlyph(), respecting resolved font and
 *          style properties. Avoids heap allocations or secondary bitmap storage
 *          by using glyphs directly from compiled U8G2 font tables.
 *
 * Description: Implementation of set_glyph, get_glyph, tick, and render methods
 *              for the u8g2gl_glyph widget.
 */
#include "u8g2gl/u8g2gl_glyph.h"

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_glyph::set_glyph
// Assigns 16-bit glyph codepoint and flags the object as dirty.
//   codepoint — character or symbol index (0 to clear)
void u8g2gl_glyph::set_glyph(uint16_t codepoint) {
    glyph_ = codepoint;
    mark_dirty();
}

// u8g2gl_glyph::get_glyph
// Accessor for the active glyph codepoint.
// Returns 0 if no glyph has been assigned.
uint16_t u8g2gl_glyph::get_glyph() const {
    return glyph_;
}

// u8g2gl_glyph::tick
// Static widget lifecycle: returns U8G2GL_IDLE as glyphs do not animate.
// Enables low-power MCU sleep hinting ([D-15]).
//   now_ms — current system millisecond timestamp (unused)
uint32_t u8g2gl_glyph::tick(uint32_t now_ms) {
    (void)now_ms;
    return U8G2GL_IDLE;
}

// u8g2gl_glyph::render
// Draws the glyph onto the display according to resolved styling and coordinates.
//   display — U8G2 display driver instance
void u8g2gl_glyph::render(U8G2& display) {
    // --- Step 1: Early exit if no glyph is assigned ---
    if (glyph_ == 0) {
        return;
    }

    // --- Step 2: Apply resolved styles ---
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // --- Step 3: Draw glyph ---
    display.drawGlyph(x_, y_, glyph_);
}
