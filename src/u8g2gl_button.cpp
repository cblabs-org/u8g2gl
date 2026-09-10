/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_button.cpp
 *
 * Purpose: Implements the interactive push button widget. Supports zero-copy
 *          string pointer management ([D-1]), configurable border frame width,
 *          focus state visual inversion (§12.2) when not disabled, and centered
 *          UTF-8 label text rendering. Operates statically with U8G2GL_IDLE
 *          lifecycle to maximize microcontroller sleep opportunities ([D-15]).
 *
 * Description: Implementation of set_text, get_text, set_border_width,
 *              get_border_width, tick, and render methods for u8g2gl_button.
 */
#include "u8g2gl/u8g2gl_button.h"

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_button::set_text
// Stores pointer to the button label text and flags the object as dirty.
// Zero-copy: does not copy bytes or allocate memory.
//   text — null-terminated UTF-8 string, or nullptr to clear
void u8g2gl_button::set_text(const char* text) {
    text_ = text;
    mark_dirty();
}

// u8g2gl_button::get_text
// Accessor for the active button label text pointer.
// Returns nullptr if no text has been configured.
const char* u8g2gl_button::get_text() const {
    return text_;
}

// u8g2gl_button::set_border_width
// Configures border stroke thickness in pixels and marks object dirty.
//   w — border width in pixels (0 disables border)
void u8g2gl_button::set_border_width(uint8_t w) {
    if (border_width_ != w) {
        border_width_ = w;
        mark_dirty();
    }
}

// u8g2gl_button::get_border_width
// Accessor for active border thickness in pixels.
// Returns border width in pixels.
uint8_t u8g2gl_button::get_border_width() const {
    return border_width_;
}

// u8g2gl_button::tick
// Static widget lifecycle: returns U8G2GL_IDLE as buttons do not animate.
// Returning U8G2GL_IDLE allows framework sleep-hinting to put the MCU
// into low-power sleep rather than busy-polling ([D-15]).
//   now_ms — current system millisecond timestamp (unused)
uint32_t u8g2gl_button::tick(uint32_t now_ms) {
    (void)now_ms;
    return U8G2GL_IDLE;
}

// u8g2gl_button::render
// Draws the button frame, optional focus inversion, and centered label text.
//   display — U8G2 display driver instance
void u8g2gl_button::render(U8G2& display) {
    // --- Step 1: Early exit on degenerate geometry ---
    if (w_ <= 0 || h_ <= 0) {
        return;
    }

    // --- Step 2: Apply resolved font styling ---
    // U8G2 state is scoped and saved by the framework's u8g2gl_state_saver (§11.3).
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }

    // --- Step 3: Check focus inversion state (§12.2) ---
    // Invert when style indicates focus (invert flag) and the button is NOT disabled.
    // A disabled button must not display focus highlights even if navigation lands on it.
    bool is_focused = !has_flag(U8G2GL_FLAG_DISABLED) && style_.invert;

    // --- Step 4: Draw background inversion if focused ---
    if (is_focused) {
        display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
        if (style_.radius > 0) {
            display.drawRBox(x_, y_, w_, h_, style_.radius);
        } else {
            display.drawBox(x_, y_, w_, h_);
        }
    }

    // --- Step 5: Draw border frame(s) ---
    // For border_width == 1, draw a single rounded frame matching style radius.
    // For border_width > 1, draw concentric nested frames inset by 1px per layer.
    if (border_width_ > 0) {
        display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
        if (border_width_ == 1) {
            display.drawRFrame(x_, y_, w_, h_, style_.radius);
        } else {
            for (uint8_t i = 0; i < border_width_; ++i) {
                int16_t bx = static_cast<int16_t>(x_ + i);
                int16_t by = static_cast<int16_t>(y_ + i);
                int16_t bw = static_cast<int16_t>(w_ - 2 * i);
                int16_t bh = static_cast<int16_t>(h_ - 2 * i);
                if (bw <= 0 || bh <= 0) {
                    break;
                }
                int16_t br = (style_.radius > i) ? static_cast<int16_t>(style_.radius - i) : 0;
                display.drawRFrame(bx, by, bw, bh, br);
            }
        }
    }

    // --- Step 6: Render label text ---
    if (text_ == nullptr || text_[0] == '\0') {
        return;
    }

    // On focused buttons, draw text with color 0 to contrast against the solid background.
    if (is_focused) {
        display.setDrawColor(0);
    } else {
        display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    }
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // Vertical centering within button bounds
    int font_height = display.getAscent() - display.getDescent();
    int y_offset = (h_ > 0) ? (h_ - font_height) / 2 : 0;
    int16_t draw_y = static_cast<int16_t>(y_ + y_offset);

    // Horizontal centering (or alignment override if explicitly styled)
    int text_width = display.getUTF8Width(text_);
    int16_t draw_x = static_cast<int16_t>(x_ + (w_ - text_width) / 2);

    if (style_.has(U8G2GL_STYLE_ALIGN)) {
        if (style_.align == U8G2GL_ALIGN_LEFT) {
            draw_x = static_cast<int16_t>(x_ + border_width_ + style_.padding);
        } else if (style_.align == U8G2GL_ALIGN_RIGHT) {
            draw_x = static_cast<int16_t>(x_ + w_ - border_width_ - style_.padding - text_width);
        }
    }

    display.drawUTF8(draw_x, draw_y, text_);
}
