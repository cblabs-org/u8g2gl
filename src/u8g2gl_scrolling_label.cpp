/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_scrolling_label.cpp
 *
 * Purpose: Implements the animated marquee scrolling label widget. Ports the
 *          timing, pixel shifting, loop reset, and layout invalidation logic
 *          from legacy ScrollingTextWidget while adhering to U8G2GL's strict
 *          zero-heap allocation policy ([D-1], [PD-3]). Text is measured using
 *          U8G2 font metrics on the first render pass following content change.
 *          If text width exceeds widget width, the widget scrolls smoothly at
 *          the configured pixel rate, honoring initial pause delays, wrap-around
 *          spacing, and sleep hinting ([D-15]).
 *
 * Description: Implementation of u8g2gl_scrolling_label methods: set_text,
 *              get_text, timing setters/getters, reset_scroll, is_scroll_finished,
 *              tick, render, and render_animation_update.
 */
#include "u8g2gl/u8g2gl_scrolling_label.h"
#include "u8g2gl/u8g2gl_helpers.h"

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_scrolling_label::set_text
// Stores pointer to the text string and invalidates layout metrics if changed.
// Zero-copy: does not duplicate string data or allocate memory.
//   text — null-terminated UTF-8 string, or nullptr to clear
void u8g2gl_scrolling_label::set_text(const char* text) {
    if (text_ != text) {
        text_ = text;
        // Text is either a literal or a subject buffer (both stable addresses).
        // A pointer change requires remeasuring width under the active font.
        needs_layout_ = true;
        scroll_finished_ = false;
        mark_dirty();
    }
}

// u8g2gl_scrolling_label::get_text
// Accessor for the current text pointer.
const char* u8g2gl_scrolling_label::get_text() const {
    return text_;
}

// u8g2gl_scrolling_label::set_scroll_px_per_sec
// Configures horizontal marquee scroll velocity in pixels per second.
//   px — speed in pixels/sec (default 25)
void u8g2gl_scrolling_label::set_scroll_px_per_sec(uint8_t px) {
    scroll_px_per_sec_ = px;
}

// u8g2gl_scrolling_label::get_scroll_px_per_sec
// Query configured scroll speed.
uint8_t u8g2gl_scrolling_label::get_scroll_px_per_sec() const {
    return scroll_px_per_sec_;
}

// u8g2gl_scrolling_label::set_initial_delay_ms
// Configures pause duration before marquee motion starts.
//   ms — initial delay in milliseconds (default 3000)
void u8g2gl_scrolling_label::set_initial_delay_ms(uint16_t ms) {
    initial_delay_ms_ = ms;
}

// u8g2gl_scrolling_label::get_initial_delay_ms
// Query configured initial delay.
uint16_t u8g2gl_scrolling_label::get_initial_delay_ms() const {
    return initial_delay_ms_;
}

// u8g2gl_scrolling_label::set_static_dwell_ms
// Configures dwell timeout for static (non-scrolling) text before signaling completion.
//   ms — dwell duration in milliseconds past initial delay (default 5000)
void u8g2gl_scrolling_label::set_static_dwell_ms(uint16_t ms) {
    static_dwell_ms_ = ms;
}

// u8g2gl_scrolling_label::get_static_dwell_ms
// Query configured static dwell duration.
uint16_t u8g2gl_scrolling_label::get_static_dwell_ms() const {
    return static_dwell_ms_;
}

// u8g2gl_scrolling_label::is_scroll_finished
// Query whether marquee has completed one full cycle or static text finished dwelling.
bool u8g2gl_scrolling_label::is_scroll_finished() const {
    return scroll_finished_;
}

// u8g2gl_scrolling_label::reset_scroll
// Rewinds marquee offset to starting coordinate and resets animation timers.
void u8g2gl_scrolling_label::reset_scroll() {
    scroll_x_ = 0;
    last_scroll_ms_ = 0;
    scroll_finished_ = false;
    mark_dirty();
}

// u8g2gl_scrolling_label::tick
// Advances animation state machine and computes next wake deadline.
//   now_ms — current system millisecond timestamp
uint32_t u8g2gl_scrolling_label::tick(uint32_t now_ms) {
    // --- Step 1: Guard null or empty text ---
    if (text_ == nullptr || text_[0] == '\0') {
        return U8G2GL_IDLE;
    }

    // --- Step 2: Request immediate frame if text measurement is pending ---
    // Text measurement requires the U8G2 context and active font, which are
    // only available inside render(). Returning 1 requests an immediate draw.
    if (needs_layout_) {
        return 1;
    }

    // --- Step 3: Handle initial delay ---
    // On the first tick after reset/initialization, establish the initial pause.
    if (last_scroll_ms_ == 0) {
        last_scroll_ms_ = now_ms + initial_delay_ms_;
        return (initial_delay_ms_ > 0) ? initial_delay_ms_ : 1;
    }

    // --- Step 4: Handle static text (no scroll needed) ---
    if (!needs_scroll_) {
        if (scroll_finished_) {
            return U8G2GL_IDLE;
        }

        uint32_t dwell_deadline = last_scroll_ms_ + static_dwell_ms_;
        if (now_ms >= dwell_deadline) {
            scroll_finished_ = true;
            return U8G2GL_IDLE;
        }

        return dwell_deadline - now_ms;
    }

    // --- Step 5: Advance scrolling marquee ---
    if (now_ms > last_scroll_ms_) {
        scroll_x_++;

        // When the string has fully exited screen left (plus 30px gap for visual polish),
        // signal completion and wrap to re-enter smoothly from the right edge.
        if (scroll_x_ > message_width_ + 30) {
            scroll_finished_ = true;
            scroll_x_ = static_cast<int16_t>(-w_);
        }

        uint32_t interval_ms = (scroll_px_per_sec_ > 0) ? (1000 / scroll_px_per_sec_) : 40;
        last_scroll_ms_ = now_ms + interval_ms;
        mark_dirty();
        return interval_ms;
    }

    // Still within pause or interval delay; return time remaining until next step
    return (last_scroll_ms_ >= now_ms) ? (last_scroll_ms_ - now_ms) : 1;
}

// u8g2gl_scrolling_label::render
// Draws the text onto the display, handling layout measurement and clipping.
//   display — U8G2 display driver instance
void u8g2gl_scrolling_label::render(U8G2& display) {
    // --- Step 1: Early exit if text is null or empty ---
    if (text_ == nullptr || text_[0] == '\0') {
        return;
    }

    // --- Step 2: Resolve layout if needed ---
    if (needs_layout_) {
        if (style_.font != nullptr) {
            display.setFont(style_.font);
        }
        message_width_ = static_cast<int16_t>(display.getUTF8Width(text_));
        needs_scroll_ = (w_ > 0) && (message_width_ > w_);
        reset_scroll();
        needs_layout_ = false;
    }

    // --- Step 3: Apply resolved styles ---
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // --- Step 4: Compute vertical centering ---
    int font_height = display.getAscent() - display.getDescent();
    int y_offset = (h_ > 0) ? (h_ - font_height) / 2 : 0;
    int16_t draw_y = static_cast<int16_t>(y_ + y_offset);

    // --- Step 5: Render text ---
    if (needs_scroll_) {
        // Marquee scrolling: clip to widget bounds and draw with scroll offset
        if (w_ > 0 && h_ > 0) {
            display.setClipWindow(x_, y_, x_ + w_ - 1, y_ + h_ - 1);
        }
        display.drawUTF8(static_cast<int16_t>(x_ - scroll_x_), draw_y, text_);
        display.setMaxClipWindow();
    } else {
        // Static text: center horizontally by default, respecting explicit style alignment
        int16_t draw_x = x_;
        if (style_.align == U8G2GL_ALIGN_CENTER) {
            draw_x = static_cast<int16_t>(x_ + (w_ - message_width_) / 2);
        } else if (style_.align == U8G2GL_ALIGN_RIGHT) {
            draw_x = static_cast<int16_t>(x_ + (w_ - message_width_));
        } else {
            draw_x = (style_.has(U8G2GL_STYLE_ALIGN) && style_.align == U8G2GL_ALIGN_LEFT)
                ? x_
                : static_cast<int16_t>(x_ + (w_ - message_width_) / 2);
        }
        display.drawUTF8(draw_x, draw_y, text_);
    }
}

// u8g2gl_scrolling_label::render_animation_update
// Targeted redraw for marquee animation while the main loop is blocked.
//   display — U8G2 display driver instance
//   now_ms  — current system timestamp in milliseconds
void u8g2gl_scrolling_label::render_animation_update(U8G2& display, uint32_t now_ms) {
    // --- Step 1: Early exit if text is null or empty ---
    if (text_ == nullptr || text_[0] == '\0') {
        return;
    }

    // --- Step 2: Measure text if layout is uninitialized ---
    if (needs_layout_) {
        if (style_.font != nullptr) {
            display.setFont(style_.font);
        }
        message_width_ = static_cast<int16_t>(display.getUTF8Width(text_));
        needs_scroll_ = (w_ > 0) && (message_width_ > w_);
        reset_scroll();
        needs_layout_ = false;
    }

    // --- Step 3: Non-scrolling widgets only tick dwell timer ---
    if (!needs_scroll_) {
        tick(now_ms);
        return;
    }

    // --- Step 4: Advance tick and check for coordinate change ---
    int16_t old_scroll_x = scroll_x_;
    tick(now_ms);

    // --- Step 5: Partial refresh on pixel shift ---
    if (scroll_x_ != old_scroll_x) {
        // Clear own bounding box first ([D-5])
        display.setDrawColor(0);
        display.drawBox(x_, y_, w_, h_);

        // Re-render text with active style and clip window
        render(display);

        // Hardware partial update to avoid full frame transfer
        u8g2gl_partial_refresh(display, x_, y_, w_, h_);
    }
}
