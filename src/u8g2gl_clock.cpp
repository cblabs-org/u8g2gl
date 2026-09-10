/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_clock.cpp
 *
 * Purpose: Implements the digital clock widget. Ports the right-aligned
 *          column formatting, dual-font baseline alignment, and 1Hz colon
 *          blink logic from legacy ClockWidget while adhering to U8G2GL's
 *          strict zero-heap allocation discipline ([D-1], [PD-3]). Eliminates
 *          TimeManager dependency injection; epoch seconds are provided directly
 *          to set_time() or via subject binding.
 *
 * Description: Implementation of u8g2gl_clock methods: set_format,
 *              set_secondary_font, set_blink, set_time, get_format,
 *              get_secondary_font, is_blink_enabled, get_time, is_colon_visible,
 *              tick, render, and render_animation_update.
 */
#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_helpers.h"
#include <cstdio>

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_clock::set_format
// Selects between HH:MM and HH:MM:SS display modes.
//   fmt — clock format enum value
void u8g2gl_clock::set_format(u8g2gl_clock_format_t fmt) {
    if (format_ != fmt) {
        format_ = fmt;
        mark_dirty();
    }
}

// u8g2gl_clock::set_secondary_font
// Configures optional typography for seconds digits.
//   font — pointer to U8G2 font array, or nullptr to use primary font
void u8g2gl_clock::set_secondary_font(const uint8_t* font) {
    if (secondary_font_ != font) {
        secondary_font_ = font;
        mark_dirty();
    }
}

// u8g2gl_clock::set_blink
// Toggles the 1Hz colon blink animation.
// Resetting show_colon_ ensures the colon is immediately visible when blink is disabled.
//   enable — true to blink every 500ms, false for solid colon
void u8g2gl_clock::set_blink(bool enable) {
    if (blink_enabled_ != enable) {
        blink_enabled_ = enable;
        show_colon_ = true;
        mark_dirty();
    }
}

// u8g2gl_clock::set_time
// Updates the clock with epoch seconds.
//   epoch_seconds — total seconds since epoch (or midnight)
void u8g2gl_clock::set_time(uint32_t epoch_seconds) {
    if (epoch_seconds_ != epoch_seconds) {
        epoch_seconds_ = epoch_seconds;
        mark_dirty();
    }
}

// u8g2gl_clock::get_format
// Queries active display format.
u8g2gl_clock_format_t u8g2gl_clock::get_format() const {
    return format_;
}

// u8g2gl_clock::get_secondary_font
// Queries secondary font pointer.
const uint8_t* u8g2gl_clock::get_secondary_font() const {
    return secondary_font_;
}

// u8g2gl_clock::is_blink_enabled
// Queries whether colon blinking is enabled.
bool u8g2gl_clock::is_blink_enabled() const {
    return blink_enabled_;
}

// u8g2gl_clock::get_time
// Queries stored epoch seconds.
uint32_t u8g2gl_clock::get_time() const {
    return epoch_seconds_;
}

// u8g2gl_clock::is_colon_visible
// Queries current visibility state of the colon.
bool u8g2gl_clock::is_colon_visible() const {
    return show_colon_;
}

// u8g2gl_clock::tick
// Advances colon blink state machine every 500ms.
// Returns milliseconds until next blink toggle, or U8G2GL_IDLE if blink is disabled.
//   now_ms — current system timestamp in milliseconds
uint32_t u8g2gl_clock::tick(uint32_t now_ms) {
    // --- Step 1: Return idle if blink is disabled ---
    if (!blink_enabled_) {
        return U8G2GL_IDLE;
    }

    // --- Step 2: Check elapsed time since last blink toggle ---
    uint32_t elapsed = now_ms - last_blink_ms_;
    if (elapsed >= 500) {
        show_colon_ = !show_colon_;
        last_blink_ms_ = now_ms;
        mark_dirty();
        return 500;
    }

    // Return remaining milliseconds until next 500ms blink toggle
    return 500 - elapsed;
}

// u8g2gl_clock::render
// Draws formatted clock with right-aligned digit columns and dual-font baseline alignment.
//   display — U8G2 display driver instance
void u8g2gl_clock::render(U8G2& display) {
    // --- Step 1: Apply primary font and styling ---
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // --- Step 2: Decompose epoch seconds using integer arithmetic ---
    uint32_t day_seconds = epoch_seconds_ % 86400;
    uint8_t hours = static_cast<uint8_t>(day_seconds / 3600);
    uint8_t minutes = static_cast<uint8_t>((day_seconds % 3600) / 60);
    uint8_t seconds = static_cast<uint8_t>(day_seconds % 60);

    // Format two-digit strings into stack buffers (no heap allocation)
    char hour_str[3];
    char min_str[3];
    char sec_str[3];
    snprintf(hour_str, sizeof(hour_str), "%02u", hours);
    snprintf(min_str, sizeof(min_str), "%02u", minutes);
    snprintf(sec_str, sizeof(sec_str), "%02u", seconds);

    // --- Step 3: Measure widths for right-aligned digit columns ---
    // Right-aligning digit columns within a fixed "00" width prevents jitter
    // when glyphs with different advance widths change (e.g. "11" vs "00").
    int hour_w = display.getUTF8Width(hour_str);
    int min_w = display.getUTF8Width(min_str);
    int colon_w = display.getUTF8Width(":");
    int max_hour_w = display.getUTF8Width("00");
    int max_min_w = display.getUTF8Width("00");

    int sec_w = 0;
    int max_sec_w = 0;
    int max_sec_colon_w = 0;

    if (format_ == U8G2GL_CLOCK_HH_MM_SS) {
        if (secondary_font_ != nullptr) {
            display.setFont(secondary_font_);
        }
        sec_w = display.getUTF8Width(sec_str);
        max_sec_w = display.getUTF8Width("00");
        max_sec_colon_w = display.getUTF8Width(":");
        if (secondary_font_ != nullptr && style_.font != nullptr) {
            display.setFont(style_.font); // Restore primary font for hours/minutes
        }
    }

    // --- Step 4: Calculate total footprint and horizontal positioning ---
    // 2px total padding per colon (1px left + 1px right)
    int actual_w = max_hour_w + colon_w + max_min_w + 2;
    if (format_ == U8G2GL_CLOCK_HH_MM_SS) {
        actual_w += max_sec_colon_w + max_sec_w + 2;
    }

    int16_t start_x = x_;
    if (style_.align == U8G2GL_ALIGN_CENTER) {
        start_x = static_cast<int16_t>(x_ + (w_ - actual_w) / 2);
    } else if (style_.align == U8G2GL_ALIGN_RIGHT) {
        start_x = static_cast<int16_t>(x_ + (w_ - actual_w));
    }

    // --- Step 5: Compute vertical centering and baseline alignment ---
    // In U8G2GL, setFontPosTop is the standard: (ascent - descent) gives total glyph box height.
    int font_height = display.getAscent() - display.getDescent();
    int16_t draw_y = static_cast<int16_t>(y_ + ((h_ > font_height) ? (h_ - font_height) / 2 : 0));

    int16_t sec_draw_y = draw_y;
    if (format_ == U8G2GL_CLOCK_HH_MM_SS && secondary_font_ != nullptr) {
        display.setFont(secondary_font_);
        int sec_font_height = display.getAscent() - display.getDescent();
        // Bottom-align font descenders so secondary seconds digits align flush with main digits
        sec_draw_y = static_cast<int16_t>(draw_y + font_height - sec_font_height);
        if (style_.font != nullptr) {
            display.setFont(style_.font);
        }
    }

    // --- Step 6: Draw hours ---
    int h_offset = max_hour_w - hour_w;
    display.drawUTF8(start_x + h_offset, draw_y, hour_str);
    int16_t current_x = static_cast<int16_t>(start_x + max_hour_w + 1);

    // --- Step 7: Draw colon (subject to blink visibility) ---
    if (show_colon_) {
        display.drawUTF8(current_x, draw_y, ":");
    }
    current_x = static_cast<int16_t>(current_x + colon_w + 1);

    // --- Step 8: Draw minutes ---
    int m_offset = max_min_w - min_w;
    display.drawUTF8(current_x + m_offset, draw_y, min_str);
    current_x = static_cast<int16_t>(current_x + max_min_w + 1);

    // --- Step 9: Draw seconds (if HH_MM_SS format) ---
    if (format_ == U8G2GL_CLOCK_HH_MM_SS) {
        if (secondary_font_ != nullptr) {
            display.setFont(secondary_font_);
        }

        // Seconds colon is always visible (non-blinking), centered in slot
        int s_colon_w = display.getUTF8Width(":");
        int s_col_offset = (max_sec_colon_w - s_colon_w) / 2;
        display.drawUTF8(current_x + s_col_offset, sec_draw_y, ":");
        current_x = static_cast<int16_t>(current_x + max_sec_colon_w + 1);

        // Seconds digits right-aligned in max_sec_w slot
        int s_offset = max_sec_w - sec_w;
        display.drawUTF8(current_x + s_offset, sec_draw_y, sec_str);
    }
}

// u8g2gl_clock::render_animation_update
// Redraws and pushes changed region during blocked execution loops.
//   display — U8G2 display driver instance
//   now_ms  — current system timestamp in milliseconds
void u8g2gl_clock::render_animation_update(U8G2& display, uint32_t now_ms) {
    bool old_colon = show_colon_;
    tick(now_ms);

    if (show_colon_ != old_colon) {
        // Clear own bounding box first ([D-5])
        display.setDrawColor(0);
        display.drawBox(x_, y_, w_, h_);

        // Re-render
        render(display);

        // Hardware partial update
        u8g2gl_partial_refresh(display, x_, y_, w_, h_);
    }
}
