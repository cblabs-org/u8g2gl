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
 * Purpose: Implements u8g2gl_label rendering and lifecycle, including the
 *          marquee state machine absorbed from the deleted
 *          u8g2gl_scrolling_label (PR-3R WO2, [D-19]). Employs a zero-copy
 *          design where the widget holds a const char* pointer rather than an
 *          internal buffer, eliminating RAM duplication on constrained MCUs.
 *
 *          What it draws is decided in one place, current_text(): a bound
 *          subject's text when bind_text() is active, otherwise the literal
 *          set_text() text. Before PR-04 WO10b every path here read only the
 *          literal, so a bound label drew nothing at all.
 *
 * Description: Implementation of set_text, get_text, long_mode accessors,
 *              scroll configuration, current_text and the text-binding hook,
 *              tick, render and its two per-mode helpers, and
 *              render_animation_update for u8g2gl_label.
 */
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_helpers.h"
#include "u8g2gl/u8g2gl_state_saver.h"

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_label::set_text
// Stores pointer to the text string and invalidates measured layout if it
// actually changed. Zero-copy: does not duplicate string data or allocate
// memory. Moved unchanged from u8g2gl_scrolling_label — the guard matters for
// every long_mode, not only the scrolling ones, because dots also depends on
// message_width_ being remeasured under the new text.
//   text — null-terminated UTF-8 string, or nullptr to clear
void u8g2gl_label::set_text(const char* text) {
    if (text_ != text) {
        text_ = text;
        invalidate_text();
    }
}

// u8g2gl_label::get_text
// Accessor for the literal text pointer; see current_text() for what is drawn.
const char* u8g2gl_label::get_text() const {
    return text_;
}

// u8g2gl_label::invalidate_text
// The drawn text changed: its measured width is stale, so dots and the
// scrolling modes re-measure on the next render (which also rewinds the
// marquee), a finished dwell starts over, and a frame is scheduled.
void u8g2gl_label::invalidate_text() {
    needs_layout_ = true;
    scroll_finished_ = false;
    mark_dirty();
}

// u8g2gl_label::on_text_binding_changed
// A bound subject changed, or was just bound. For a string subject the pointer
// the label draws is the subject's own buffer, unchanged by set(), so no
// pointer comparison could notice the new text — the width has to be
// invalidated here, on the notification itself.
void u8g2gl_label::on_text_binding_changed() {
    invalidate_text();
}

// u8g2gl_label::current_text
// The text this label draws now. An active binding wins over the literal
// whichever was set first — the manifest's "Overridden when bind_text is
// active" — because the binding is consulted first on every read rather than
// copied into text_ when it fires.
//   buffer — U8G2GL_BOUND_TEXT_BUFFER_SIZE bytes on the caller's stack, for a
//            formatted int subject
const char* u8g2gl_label::current_text(char (&buffer)[U8G2GL_BOUND_TEXT_BUFFER_SIZE]) const {
    const char* bound = bound_text(buffer, sizeof(buffer));
    return bound != nullptr ? bound : text_;
}

// u8g2gl_label::set_long_mode
// Changes overflow handling, guarded on the value actually changing (WO1's
// change-guard pattern). A real change forces remeasurement on the next
// render — the previous mode's measurement (or lack of one, under clip) may
// no longer be valid for the new mode.
//   mode — one of the U8G2GL_LONG_* values; see the header for what each does
void u8g2gl_label::set_long_mode(u8g2gl_long_mode_t mode) {
    if (mode == long_mode_) {
        return;
    }
    long_mode_ = mode;
    needs_layout_ = true;
    mark_dirty();
}

u8g2gl_long_mode_t u8g2gl_label::get_long_mode() const {
    return long_mode_;
}

// u8g2gl_label::set_scroll_px_per_sec
// Configures horizontal marquee scroll velocity in pixels per second.
//   px — speed in pixels/sec (default 25)
void u8g2gl_label::set_scroll_px_per_sec(uint8_t px) {
    scroll_px_per_sec_ = px;
}

uint8_t u8g2gl_label::get_scroll_px_per_sec() const {
    return scroll_px_per_sec_;
}

// u8g2gl_label::set_initial_delay_ms
// Configures pause duration before marquee motion starts.
//   ms — initial delay in milliseconds (default 3000)
void u8g2gl_label::set_initial_delay_ms(uint16_t ms) {
    initial_delay_ms_ = ms;
}

uint16_t u8g2gl_label::get_initial_delay_ms() const {
    return initial_delay_ms_;
}

// u8g2gl_label::set_static_dwell_ms
// Configures dwell timeout for text that fits before signaling completion.
//   ms — dwell duration in milliseconds past initial delay (default 5000)
void u8g2gl_label::set_static_dwell_ms(uint16_t ms) {
    static_dwell_ms_ = ms;
}

uint16_t u8g2gl_label::get_static_dwell_ms() const {
    return static_dwell_ms_;
}

// u8g2gl_label::is_scroll_finished
// Query whether static-fit text has finished dwelling. Neither marquee mode
// (U8G2GL_LONG_SCROLL reversing, U8G2GL_LONG_SCROLL_CIRCULAR wrapping) ever
// latches this for the marquee itself — both run indefinitely — see
// set_long_mode().
bool u8g2gl_label::is_scroll_finished() const {
    return scroll_finished_;
}

// u8g2gl_label::reset_scroll
// Rewinds marquee offset to the starting coordinate and resets animation
// timers. Moved unchanged from u8g2gl_scrolling_label, plus scroll_forward_
// (WO2b): a rewound label always departs forward, regardless of which
// direction it was travelling in when reset.
void u8g2gl_label::reset_scroll() {
    scroll_x_ = 0;
    last_scroll_ms_ = 0;
    scroll_finished_ = false;
    scroll_forward_ = true;
    mark_dirty();
}

// u8g2gl_label::tick
// Outside the two scrolling modes, labels are static text and never animate —
// this is the original u8g2gl_label::tick() contract, preserved for clip and
// dots. Under U8G2GL_LONG_SCROLL / U8G2GL_LONG_SCROLL_CIRCULAR, the state
// machine below is u8g2gl_scrolling_label::tick() moved largely unchanged;
// Step 5 branches on long_mode_ because WO2b gave U8G2GL_LONG_SCROLL its own
// reversing mechanic while leaving U8G2GL_LONG_SCROLL_CIRCULAR's wrap intact.
//   now_ms — current system millisecond timestamp
uint32_t u8g2gl_label::tick(uint32_t now_ms) {
    if (long_mode_ != U8G2GL_LONG_SCROLL && long_mode_ != U8G2GL_LONG_SCROLL_CIRCULAR) {
        return U8G2GL_IDLE;
    }

    // --- Step 1: Guard null or empty text ---
    char buffer[U8G2GL_BOUND_TEXT_BUFFER_SIZE];
    const char* text = current_text(buffer);
    if (text == nullptr || text[0] == '\0') {
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

    // --- Step 4: Handle text that fits (no scroll needed) ---
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
        uint32_t interval_ms = (scroll_px_per_sec_ > 0) ? (1000 / scroll_px_per_sec_) : 40;

        // U8G2GL_LONG_SCROLL reverses (LV_LABEL_LONG_SCROLL bounces);
        // U8G2GL_LONG_SCROLL_CIRCULAR below wraps (LV_LABEL_LONG_SCROLL_CIRCULAR
        // loops). These are LVGL's own semantics (§1.4), not a copy-paste split
        // of one behaviour into two — do not collapse them back together.
        if (long_mode_ == U8G2GL_LONG_SCROLL) {
            // scroll_max is the offset at which the text's far (right) edge
            // has just reached the widget's right bound: draw_x + message_width_
            // = (x_ - scroll_max) + message_width_ = x_ + w_ when
            // scroll_max = message_width_ - w_. needs_scroll_ guarantees
            // message_width_ > w_ here, so scroll_max is always positive.
            int16_t scroll_max = static_cast<int16_t>(message_width_ - w_);

            if (scroll_forward_) {
                scroll_x_++;
                if (scroll_x_ >= scroll_max) {
                    // Far edge reached: clamp exactly (a wide interval could
                    // otherwise overshoot by more than one pixel), dwell using
                    // the same static_dwell_ms_ that governs the static-fit
                    // pause, and flip direction so the tick after the dwell
                    // steps back toward the origin.
                    scroll_x_ = scroll_max;
                    scroll_forward_ = false;
                    last_scroll_ms_ = now_ms + static_dwell_ms_;
                    mark_dirty();
                    return static_dwell_ms_;
                }
            } else {
                scroll_x_--;
                if (scroll_x_ <= 0) {
                    // Back at the origin: clamp, dwell, flip to depart forward
                    // again. Reversing is endless (no controller watches for a
                    // finished cycle — see is_scroll_finished()), so this pair
                    // of dwells repeats indefinitely rather than latching.
                    scroll_x_ = 0;
                    scroll_forward_ = true;
                    last_scroll_ms_ = now_ms + static_dwell_ms_;
                    mark_dirty();
                    return static_dwell_ms_;
                }
            }

            last_scroll_ms_ = now_ms + interval_ms;
            mark_dirty();
            return interval_ms;
        }

        // U8G2GL_LONG_SCROLL_CIRCULAR: unchanged from WO2. When the string has
        // fully exited screen left (plus 30px gap for visual polish), wrap to
        // re-enter smoothly from the right edge. Never latches
        // scroll_finished_ — it is meant to loop forever with no controller
        // watching for a finished cycle.
        scroll_x_++;
        if (scroll_x_ > message_width_ + 30) {
            scroll_x_ = static_cast<int16_t>(-w_);
        }

        last_scroll_ms_ = now_ms + interval_ms;
        mark_dirty();
        return interval_ms;
    }

    // Still within pause or interval delay; return time remaining until next step
    return (last_scroll_ms_ >= now_ms) ? (last_scroll_ms_ - now_ms) : 1;
}

// u8g2gl_label::render
// Draws the text onto the display, dispatching to the per-long_mode path.
//   display — U8G2 display driver instance
void u8g2gl_label::render(U8G2& display) {
    // --- Step 1: Resolve the text; early exit if null or empty ---
    // The bound value is read here, at render time, into a stack buffer:
    // U8G2GL_BOUND_TEXT_BUFFER_SIZE bytes for the duration of this call and
    // none per label. U8G2 only draws from the pointer, so nothing outlives it.
    char buffer[U8G2GL_BOUND_TEXT_BUFFER_SIZE];
    const char* text = current_text(buffer);
    if (text == nullptr || text[0] == '\0') {
        return;
    }

    // --- Step 2: Measure text once per content/font/mode change ---
    // clip needs no metrics at all — the framework's ambient clip window
    // (§11.3) already hard-clips it with no help from here, which is exactly
    // what "clip" promises. dots, scroll and scroll_circular all need to know
    // the text's pixel width, so the measurement is shared across them rather
    // than duplicated ([D-19]'s cost accounting: "dots mode needs text
    // measurement too, so message_width_ and needs_layout_ are shared rather
    // than added"). A bound text keeps the cache honest through
    // on_text_binding_changed(), which invalidates it on every change, so a
    // bound label pays the measurement once per change, not once per frame.
    if (needs_layout_ && long_mode_ != U8G2GL_LONG_CLIP) {
        if (style_.font != nullptr) {
            display.setFont(style_.font);
        }
        message_width_ = static_cast<int16_t>(display.getUTF8Width(text));
        overflow_ = (w_ > 0) && (message_width_ > w_);
        needs_scroll_ = overflow_ &&
            (long_mode_ == U8G2GL_LONG_SCROLL || long_mode_ == U8G2GL_LONG_SCROLL_CIRCULAR);
        reset_scroll();
        needs_layout_ = false;
    }

    // --- Step 3: Apply resolved styles ---
    // U8G2 state is scoped and saved by the framework's u8g2gl_state_saver
    // (§11.3), so font and color changes do not leak into subsequently
    // rendered widgets.
    if (style_.font != nullptr) {
        display.setFont(style_.font);
    }
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setFontMode(static_cast<uint8_t>(style_.font_mode));

    // --- Step 4: Compute vertical centering ---
    // The y coordinate is the top of the glyph box: the framework's state
    // guard, u8g2gl_state_saver, establishes setFontPosTop() around every
    // render (§11.3). getAscent() is positive, getDescent() negative, so
    // (ascent - descent) gives total glyph box height.
    int font_height = static_cast<int>(display.getAscent()) - static_cast<int>(display.getDescent());
    int y_offset = (h_ > 0) ? (h_ - font_height) / 2 : 0;
    int16_t draw_y = static_cast<int16_t>(y_ + y_offset);

    // --- Step 5: Dispatch to the mode's render path ---
    if (long_mode_ == U8G2GL_LONG_SCROLL || long_mode_ == U8G2GL_LONG_SCROLL_CIRCULAR) {
        render_scroll(display, text, draw_y);
    } else {
        render_static(display, text, draw_y, long_mode_ == U8G2GL_LONG_DOTS);
    }
}

// u8g2gl_label::render_scroll
// Marquee render path, moved unchanged from u8g2gl_scrolling_label::render().
// When the measured text fits after all (needs_scroll_ false — e.g. the font
// or width changed since the last measurement), falls back to the same
// default-centering quirk the original widget used for its static-fit case,
// preserved here rather than "cleaned up" because a move must not alter
// behaviour.
//   display — U8G2 display driver instance
//   text    — the text to draw, already resolved by render()
//   draw_y  — vertically-centered top y, already computed by render()
void u8g2gl_label::render_scroll(U8G2& display, const char* text, int16_t draw_y) {
    if (needs_scroll_) {
        // Marquee scrolling: draw with the scroll offset and set no clip. The
        // framework's clip (§11.3) — this label's bounds intersected with every
        // ancestor's — is already in force. Setting a clip of the label's own
        // bounds here, then resetting to the full display, used to replace that
        // clip, so a scrolling label inside a narrower container painted outside
        // the container (WO4 F6). U8G2 cannot report the clip, so a widget has
        // no way to narrow it and put it back; it must leave it alone.
        //
        // x_ - scroll_x_ is negative on every step once the marquee starts; it
        // wraps explicitly and U8G2 draws the visible part (u8g2gl_coord_pos()).
        display.drawUTF8(u8g2gl_coord_pos(x_ - scroll_x_), u8g2gl_coord_pos(draw_y),
                         text);
        return;
    }

    // Static text: center horizontally by default, respecting explicit style
    // alignment. Unlike render_static()'s plain "default to LEFT" rule, this
    // widget historically centered short messages unless LEFT was explicitly
    // requested — a deliberate difference for the message-board look
    // u8g2gl_scrolling_label shipped with, moved unchanged.
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
    display.drawUTF8(u8g2gl_coord_pos(draw_x), u8g2gl_coord_pos(draw_y), text);
}

// u8g2gl_label::render_static
// Non-marquee render path for clip and dots. Draws once; the framework's
// ambient clip window (§11.3) — already set before render() is called, per
// u8g2gl_obj::render()'s contract — hard-clips it at the bounds, which is all
// "clip" needs to do.
//
// dots turns that same clip into an ellipsis without a truncated copy of the
// string: a zero-copy label has no buffer to build one in ([D-1]), and the
// text may point into flash or a subject the caller owns, not memory this
// widget may write through. Instead, when the measured width overflows, a
// small box is cleared at the right edge and "..." is drawn on top — the same
// clear-then-redraw idiom u8g2gl_scrolling_label already used for partial
// refresh (render_animation_update(), below), so it introduces no new pattern.
//   display — U8G2 display driver instance
//   text    — the text to draw, already resolved by render()
//   draw_y  — vertically-centered top y, already computed by render()
//   dots    — true to overdraw the ellipsis when text overflows
void u8g2gl_label::render_static(U8G2& display, const char* text, int16_t draw_y, bool dots) {
    // clip has no measurement (Step 2 skips it), so its overflow test uses the
    // live width; dots always measures in Step 2, so message_width_ is current.
    int text_width = dots ? message_width_ : static_cast<int>(display.getUTF8Width(text));

    int16_t draw_x = x_;
    if (style_.align == U8G2GL_ALIGN_CENTER) {
        draw_x = static_cast<int16_t>(x_ + (w_ - text_width) / 2);
    } else if (style_.align == U8G2GL_ALIGN_RIGHT) {
        draw_x = static_cast<int16_t>(x_ + (w_ - text_width));
    }
    // For U8G2GL_ALIGN_LEFT, draw_x remains x_.

    // drawUTF8 is used rather than drawStr for full UTF-8 Unicode character
    // support. Centred or right-aligned text wider than the label starts left
    // of it, so this origin can be negative: see u8g2gl_coord_pos().
    display.drawUTF8(u8g2gl_coord_pos(draw_x), u8g2gl_coord_pos(draw_y), text);

    if (dots && overflow_) {
        int dots_width = static_cast<int>(display.getUTF8Width("..."));
        int16_t dots_x = static_cast<int16_t>(x_ + w_ - dots_width);
        display.setDrawColor(0);
        u8g2gl_draw_box(display, dots_x, y_, static_cast<int16_t>(dots_width), h_);
        display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
        display.drawUTF8(u8g2gl_coord_pos(dots_x), u8g2gl_coord_pos(draw_y), "...");
    }
}

// u8g2gl_label::render_animation_update
// Targeted redraw for marquee animation while the main loop is blocked.
// No-op outside the two scrolling modes — clip and dots have nothing to
// animate. Moved unchanged from u8g2gl_scrolling_label.
//   display — U8G2 display driver instance
//   now_ms  — current system timestamp in milliseconds
void u8g2gl_label::render_animation_update(U8G2& display, uint32_t now_ms) {
    if (long_mode_ != U8G2GL_LONG_SCROLL && long_mode_ != U8G2GL_LONG_SCROLL_CIRCULAR) {
        return;
    }

    // --- Step 1: Early exit if text is null or empty ---
    char buffer[U8G2GL_BOUND_TEXT_BUFFER_SIZE];
    const char* text = current_text(buffer);
    if (text == nullptr || text[0] == '\0') {
        return;
    }

    // --- Step 2: Measure text if layout is uninitialized ---
    // Measuring needs the label's font; the guard puts the caller's back.
    if (needs_layout_) {
        const u8g2gl_state_saver saver(display);
        if (style_.font != nullptr) {
            display.setFont(style_.font);
        }
        message_width_ = static_cast<int16_t>(display.getUTF8Width(text));
        overflow_ = (w_ > 0) && (message_width_ > w_);
        needs_scroll_ = overflow_;
        reset_scroll();
        needs_layout_ = false;
    }

    // --- Step 3: Text that fits only needs to tick its dwell timer ---
    if (!needs_scroll_) {
        tick(now_ms);
        return;
    }

    // --- Step 4: Advance tick and check for coordinate change ---
    int16_t old_scroll_x = scroll_x_;
    tick(now_ms);

    // --- Step 5: Partial refresh on pixel shift ---
    // The repaint clears and redraws inside the label's own bounds under the
    // render wrapper's state guard ([D-5], §11.3).
    if (scroll_x_ != old_scroll_x) {
        u8g2gl_repaint_object(display, *this);

        // Hardware partial update to avoid full frame transfer
        u8g2gl_partial_refresh(display, x_, y_, w_, h_);
    }
}
