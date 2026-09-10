/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_label.cpp
 *
 * Purpose: Implements u8g2gl_label rendering and lifecycle. Employs a zero-copy
 *          design where the widget holds a const char* pointer rather than an
 *          internal buffer (such as the legacy 128-byte buffer), eliminating
 *          RAM duplication on constrained MCUs. Renders text respecting
 *          resolved styling: font, color, mode, vertical centering, and
 *          horizontal alignment.
 *
 * Description: Implementation of set_text, get_text, tick, and render methods
 *              for the u8g2gl_label widget.
 */
#include "u8g2gl/u8g2gl_label.h"

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_label::set_text
// Stores pointer to the text string and flags the object as dirty.
// Zero-copy: does not copy bytes or allocate memory.
//   text — null-terminated UTF-8 string, or nullptr to clear
void u8g2gl_label::set_text(const char* text) {
    text_ = text;
    // Notify the framework that the visual appearance has changed so the
    // frame will be redrawn on the next ui_handler() pass.
    mark_dirty();
}

// u8g2gl_label::get_text
// Accessor for the active text pointer.
// Returns nullptr if no text has been set.
const char* u8g2gl_label::get_text() const {
    return text_;
}

// u8g2gl_label::tick
// Static widget lifecycle: returns U8G2GL_IDLE as labels do not animate.
// Returning U8G2GL_IDLE allows the framework sleep-hinting to put the MCU
// into low-power sleep rather than busy-polling.
//   now_ms — current system millisecond timestamp (unused)
uint32_t u8g2gl_label::tick(uint32_t now_ms) {
    (void)now_ms;
    return U8G2GL_IDLE;
}

// u8g2gl_label::render
// Draws the text onto the display according to resolved styling and geometry.
//   display — U8G2 display driver instance
void u8g2gl_label::render(U8G2& display) {
    // --- Step 1: Early exit if text is null or empty ---
    if (text_ == nullptr || text_[0] == '\0') {
        return;
    }

    // --- Step 2: Apply resolved styles ---
    // U8G2 state is scoped and saved by the framework's u8g2gl_state_saver (§11.3),
    // so font and color changes do not leak into subsequently rendered widgets.
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // --- Step 3: Compute vertical centering ---
    // In U8G2GL, setFontPosTop() is the framework standard, meaning the Y coordinate
    // corresponds to the top of glyph bounding boxes.
    // getAscent() is positive (above baseline) and getDescent() is negative (below baseline),
    // so (ascent - descent) gives total glyph box height.
    int font_height = display.getAscent() - display.getDescent();
    int y_offset = (h_ > 0) ? (h_ - font_height) / 2 : 0;

    // --- Step 4: Compute horizontal alignment ---
    int16_t draw_x = x_;
    if (style_.align == U8G2GL_ALIGN_CENTER) {
        int text_width = display.getUTF8Width(text_);
        draw_x = static_cast<int16_t>(x_ + (w_ - text_width) / 2);
    } else if (style_.align == U8G2GL_ALIGN_RIGHT) {
        int text_width = display.getUTF8Width(text_);
        draw_x = static_cast<int16_t>(x_ + (w_ - text_width));
    }
    // For U8G2GL_ALIGN_LEFT, draw_x remains x_.

    // --- Step 5: Draw text ---
    // Framework handles clipping to bounds (§11.3) when style_.truncate is set.
    // drawUTF8 is used rather than drawStr for full UTF-8 Unicode character support.
    display.drawUTF8(draw_x, static_cast<int16_t>(y_ + y_offset), text_);
}
