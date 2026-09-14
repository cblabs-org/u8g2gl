/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_progress_bar.cpp
 *
 * Purpose: Implements the animated progress bar widget. Ports the smooth
 *          integer linear interpolation and checkered stipple fill pattern
 *          from legacy ProgressBarWidget while adhering to U8G2GL's strict
 *          zero-heap allocation discipline ([D-1], [PD-3]). Renders outer track,
 *          fill pattern (solid or 2x2 checkered stipple), and optional centered
 *          percentage string using stack-allocated buffers.
 *
 * Description: Implementation of u8g2gl_progress_bar methods: set_value,
 *              set_animate_duration_ms, set_fill_style, set_show_percent_text,
 *              get_value, get_target_value, get_animate_duration_ms,
 *              get_fill_style, get_show_percent_text, tick, render, and
 *              render_animation_update.
 */
#include "u8g2gl/u8g2gl_progress_bar.h"
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

// u8g2gl_progress_bar::set_value
// Sets target progress percentage clamped to 0..100.
// Snaps immediately if anim_duration_ms_ == 0; otherwise prepares interpolation path.
//   percent — desired progress percentage (0..100)
void u8g2gl_progress_bar::set_value(uint8_t percent) {
    if (percent > 100) {
        percent = 100;
    }

    // Change guard, compared after clamping so 150 and 200 are the same value.
    // Compared against the target, not the displayed value: re-setting the
    // current target mid-animation must not restart the interpolation, and
    // must not schedule a frame for a picture that has not changed (§11.2).
    if (percent == target_percent_) {
        return;
    }

    if (anim_duration_ms_ > 0) {
        start_percent_ = current_percent_;
        target_percent_ = percent;
        anim_start_ms_ = 0;
        anim_started_ = false;
    } else {
        current_percent_ = percent;
        target_percent_ = percent;
        anim_started_ = false;
    }
    mark_dirty();
}

// u8g2gl_progress_bar::set_animate_duration_ms
// Configures animation transition duration in milliseconds (0 for instant snapping).
//   ms — transition duration in milliseconds
void u8g2gl_progress_bar::set_animate_duration_ms(uint16_t ms) {
    anim_duration_ms_ = ms;
}

// u8g2gl_progress_bar::set_fill_style
// Configures the fill pattern (solid box vs checkered stipple).
//   s — fill pattern enum value
void u8g2gl_progress_bar::set_fill_style(u8g2gl_fill_style_t s) {
    if (fill_style_ != s) {
        fill_style_ = s;
        mark_dirty();
    }
}

// u8g2gl_progress_bar::set_show_percent_text
// Toggles rendering of the centered numeric percentage text.
//   show — true to render "NN%", false to omit
void u8g2gl_progress_bar::set_show_percent_text(bool show) {
    if (show_percent_text_ != show) {
        show_percent_text_ = show;
        mark_dirty();
    }
}

// u8g2gl_progress_bar::bind_value
// Binds the target percentage to an int subject through the base object's
// shared pool, so it is counted like every other binding ([D-21]).
//   subject — int subject to observe; must outlive this bar
bool u8g2gl_progress_bar::bind_value(u8g2gl_subject_int_base* subject) {
    return add_value_binding(subject, U8G2GL_SUBJECT_INT, &u8g2gl_progress_bar::on_value_changed);
}

// u8g2gl_progress_bar::on_value_changed
// Observer callback registered only by bind_value(), so the downcast is safe.
// Clamps in int32_t before narrowing: set_value() takes uint8_t, and casting
// first would turn -1 into 255 (clamped to 100) and 300 into 44. The change
// guard is set_value()'s own, so a subject re-notifying an unchanged value does
// not schedule a frame (§11.2); it is not repeated here.
//   binding — handle from add_value_binding(); inactive after destruction
void u8g2gl_progress_bar::on_value_changed(void* binding) {
    auto* bar = static_cast<u8g2gl_progress_bar*>(binding_object(binding));
    auto* subject = static_cast<u8g2gl_subject_int_base*>(binding_subject(binding));
    if (!bar || !subject) {
        return;
    }
    int32_t value = subject->get();
    if (value < 0) {
        value = 0;
    } else if (value > 100) {
        value = 100;
    }
    bar->set_value(static_cast<uint8_t>(value));
}

// u8g2gl_progress_bar::get_value
// Queries current visual progress percentage (0..100).
uint8_t u8g2gl_progress_bar::get_value() const {
    return current_percent_;
}

// u8g2gl_progress_bar::get_target_value
// Queries target progress percentage (0..100).
uint8_t u8g2gl_progress_bar::get_target_value() const {
    return target_percent_;
}

// u8g2gl_progress_bar::get_animate_duration_ms
// Queries configured animation duration in milliseconds.
uint16_t u8g2gl_progress_bar::get_animate_duration_ms() const {
    return anim_duration_ms_;
}

// u8g2gl_progress_bar::get_fill_style
// Queries active fill pattern style.
u8g2gl_fill_style_t u8g2gl_progress_bar::get_fill_style() const {
    return fill_style_;
}

// u8g2gl_progress_bar::get_show_percent_text
// Queries whether percentage text is enabled.
bool u8g2gl_progress_bar::get_show_percent_text() const {
    return show_percent_text_;
}

// u8g2gl_progress_bar::tick
// Advances animation interpolation toward target_percent_.
// Returns 16ms deadline while animating (~60 FPS), or U8G2GL_IDLE when at target.
//   now_ms — current system millisecond timestamp
uint32_t u8g2gl_progress_bar::tick(uint32_t now_ms) {
    // --- Step 1: Check if animation is active ---
    if (current_percent_ == target_percent_) {
        anim_started_ = false;
        return U8G2GL_IDLE;
    }

    // --- Step 2: Lazy initialization of animation start timestamp ---
    // anim_start_ms_ is set to 0 in set_value(); capture now_ms on first tick.
    // anim_started_ boolean distinguishes an unstarted animation from one starting at now_ms == 0.
    if (!anim_started_) {
        anim_start_ms_ = now_ms;
        anim_started_ = true;
    }

    // --- Step 3: Compute linear interpolation using integer math ---
    uint32_t elapsed = now_ms - anim_start_ms_;
    uint8_t next_percent = current_percent_;

    if (elapsed >= anim_duration_ms_) {
        // Animation duration has expired; snap to exact target
        next_percent = target_percent_;
        anim_started_ = false;
    } else {
        // Integer linear interpolation avoids floating-point instructions on low-end MCUs
        int16_t range = static_cast<int16_t>(target_percent_) - static_cast<int16_t>(start_percent_);
        int32_t interpolated = static_cast<int32_t>(start_percent_) +
            (static_cast<int32_t>(range) * static_cast<int32_t>(elapsed)) / static_cast<int32_t>(anim_duration_ms_);
        next_percent = static_cast<uint8_t>(interpolated);
    }

    // --- Step 4: Update state and mark dirty if changed ---
    if (next_percent != current_percent_) {
        current_percent_ = next_percent;
        mark_dirty();
    }

    // If still in transit, request next frame at ~60 FPS (16ms); otherwise sleep
    if (current_percent_ != target_percent_) {
        return 16;
    }

    return U8G2GL_IDLE;
}

// u8g2gl_progress_bar::render
// Renders the progress bar frame, fill area, and optional centered label.
//   display — U8G2 display driver instance
void u8g2gl_progress_bar::render(U8G2& display) {
    // --- Step 1: Validate geometry ---
    if (w_ <= 2 || h_ <= 2) {
        return;
    }

    // --- Step 2: Apply styling ---
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // --- Step 3: Draw outer track frame ---
    display.drawFrame(x_, y_, w_, h_);

    // --- Step 4: Calculate fill width ---
    int16_t inner_w = static_cast<int16_t>(w_ - 2);
    int16_t inner_h = static_cast<int16_t>(h_ - 2);
    int16_t fill = static_cast<int16_t>((static_cast<int32_t>(current_percent_) * inner_w) / 100);

    // --- Step 5: Draw fill pattern ---
    if (fill_style_ == U8G2GL_FILL_STIPPLE) {
        // Checkered stipple pattern creates a shaded appearance on 1-bit displays
        // without requiring software alpha-blending buffers.
        for (int16_t i = 0; i < fill; i++) {
            bool toggle = (i % 2 == 0);
            for (int16_t row = 0; row < inner_h; row++) {
                if ((row + (toggle ? 0 : 1)) % 2 == 0) {
                    display.drawPixel(x_ + 1 + i, y_ + 1 + row);
                }
            }
        }
    } else {
        // Solid fill
        if (fill > 0) {
            display.drawBox(x_ + 1, y_ + 1, fill, inner_h);
        }
    }

    // --- Step 6: Render centered percentage text (if enabled) ---
    if (show_percent_text_) {
        // Stack buffer for "100%" plus null terminator (no heap allocation)
        char buf[8];
        snprintf(buf, sizeof(buf), "%u%%", current_percent_);

        int text_w = display.getUTF8Width(buf);
        int font_height = display.getAscent() - display.getDescent();
        int16_t text_x = static_cast<int16_t>(x_ + (w_ - text_w) / 2);
        int16_t text_y = static_cast<int16_t>(y_ + (h_ - font_height) / 2);

        display.drawUTF8(text_x, text_y, buf);
    }
}

// u8g2gl_progress_bar::render_animation_update
// Redraws and pushes changed region during blocked execution loops.
//   display — U8G2 display driver instance
//   now_ms  — current system timestamp in milliseconds
void u8g2gl_progress_bar::render_animation_update(U8G2& display, uint32_t now_ms) {
    uint8_t old_percent = current_percent_;
    tick(now_ms);

    if (current_percent_ != old_percent) {
        // Clear own bounding box first ([D-5])
        display.setDrawColor(0);
        display.drawBox(x_, y_, w_, h_);

        // Re-render
        render(display);

        // Hardware partial update
        u8g2gl_partial_refresh(display, x_, y_, w_, h_);
    }
}
