/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_switch.cpp
 *
 * Purpose: Implements the binary toggle switch widget. Manages boolean state,
 *          marks dirty on state transition, guarantees static low-power lifecycle
 *          ([D-15]), and renders an outer rounded track frame with an inner
 *          rounded thumb handle positioned to indicate state on a monochrome display.
 *
 * Description: Implementation of set_value, get_value, tick, and render methods
 *              for the u8g2gl_switch widget.
 */
#include "u8g2gl/u8g2gl_switch.h"
#include "u8g2gl/u8g2gl_coord.h"

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_switch::set_value
// Sets binary toggle state and flags the object as dirty if modified.
//   on — boolean toggle state: true = ON (thumb right), false = OFF (thumb left)
void u8g2gl_switch::set_value(bool on) {
    if (value_ != on) {
        value_ = on;
        mark_dirty();
    }
}

// u8g2gl_switch::get_value
// Accessor for current binary toggle state.
// Returns true if switch is ON, false if OFF.
bool u8g2gl_switch::get_value() const {
    return value_;
}

// u8g2gl_switch::bind_value
// Binds the toggle state to a bool subject through the base object's shared
// pool, so it is counted like every other binding ([D-21]).
//   subject — bool subject to observe; must outlive this switch
bool u8g2gl_switch::bind_value(u8g2gl_subject_bool_base* subject) {
    return add_value_binding(subject, U8G2GL_SUBJECT_BOOL, &u8g2gl_switch::on_value_changed);
}

// u8g2gl_switch::on_value_changed
// Observer callback registered only by bind_value(), so the downcast is safe.
// Delegates to set_value(), which already guards mark_dirty() on a change.
//   binding — handle from add_value_binding(); inactive after destruction
void u8g2gl_switch::on_value_changed(void* binding) {
    auto* sw = static_cast<u8g2gl_switch*>(binding_object(binding));
    auto* subject = static_cast<u8g2gl_subject_bool_base*>(binding_subject(binding));
    if (!sw || !subject) {
        return;
    }
    sw->set_value(subject->get());
}

// u8g2gl_switch::tick
// Static widget lifecycle: returns U8G2GL_IDLE as the switch does not animate.
// Returning U8G2GL_IDLE allows framework sleep-hinting to put the microcontroller
// into low-power sleep ([D-15]).
//   now_ms — current system millisecond timestamp (unused)
uint32_t u8g2gl_switch::tick(uint32_t now_ms) {
    (void)now_ms;
    return U8G2GL_IDLE;
}

// u8g2gl_switch::render
// Draws the switch track and handle onto the display according to geometry and state.
//   display — U8G2 display driver instance
void u8g2gl_switch::render(U8G2& display) {
    // --- Step 1: Early exit on degenerate geometry ---
    // A switch requires minimum 4x4 pixels to draw an outer track and an inner handle.
    if (w_ < 4 || h_ < 4) {
        return;
    }

    // --- Step 2: Apply resolved styles ---
    // Display draw color is scoped and restored by the framework state saver (§11.3).
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));

    // --- Step 3: Compute track corner radius ---
    // If style specifies a radius, use it; otherwise default to a capsule pill shape (h / 2).
    // The radius is clamped to 2r <= min(w, h) by u8g2gl_coord_corner_radius(),
    // the one statement of the bound; past it U8G2 draws outside the box. It
    // replaces private clamps to w / 2 and h / 2, which were the same bound
    // (floor(min(w, h) / 2) == min(w / 2, h / 2)), so no call argument changes
    // (ruling D). The default h / 2 is inside it whenever h <= w; a narrow
    // switch is held to w / 2, as before. Switch.DefaultCallArgumentsPinned
    // holds the arguments to the pre-helper values.
    const int16_t requested_r =
        (style_.radius > 0) ? style_.radius : static_cast<int16_t>(h_ / 2);
    const u8g2_uint_t r = u8g2gl_coord_corner_radius(requested_r, w_, h_);

    // --- Step 4: Draw switch track ---
    // Outer rounded rectangle frame covering the full widget bounds.
    // Converted here rather than through u8g2gl_draw_box(), which would pick
    // drawFrame/drawBox whenever a radius reaches 0; the switch always draws
    // rounded shapes. Rules from u8g2gl_coord.h: origins wrap explicitly, so a
    // switch partly off the left or top edge draws its visible part; sizes must
    // be positive (Step 1 guarantees it for the track).
    u8g2_uint_t track_w = 0;
    u8g2_uint_t track_h = 0;
    if (!u8g2gl_coord_size(w_, track_w) || !u8g2gl_coord_size(h_, track_h)) {
        return;
    }
    display.drawRFrame(u8g2gl_coord_pos(x_), u8g2gl_coord_pos(y_), track_w, track_h, r);

    // --- Step 5: Compute handle geometry ---
    // Handle is inset by 1 pixel from the track border.
    // Handle width is roughly w_ / 2 ((w_ / 2) - 1 to fit inside the 1px track frame).
    // Off position: x_ + 1 (left side).
    // On position:  x_ + w_ / 2 (right side).
    int16_t handle_w = static_cast<int16_t>((w_ / 2) - 1);
    if (handle_w < 1) {
        handle_w = 1;
    }
    int16_t handle_h = static_cast<int16_t>((h_ > 2) ? (h_ - 2) : h_);
    int16_t handle_y = static_cast<int16_t>(y_ + 1);
    int16_t handle_x = value_ ? static_cast<int16_t>(x_ + (w_ / 2))
                              : static_cast<int16_t>(x_ + 1);

    // One pixel tighter than the track so the handle sits inside its curvature,
    // then held to the handle's own box by the same bound as the track.
    const int32_t handle_requested_r = (r > 1) ? static_cast<int32_t>(r) - 1 : 0;
    const u8g2_uint_t handle_r =
        u8g2gl_coord_corner_radius(handle_requested_r, handle_w, handle_h);

    // --- Step 6: Draw switch handle ---
    // Filled rounded rectangle indicating current toggle state.
    u8g2_uint_t handle_uw = 0;
    u8g2_uint_t handle_uh = 0;
    if (u8g2gl_coord_size(handle_w, handle_uw) && u8g2gl_coord_size(handle_h, handle_uh)) {
        display.drawRBox(u8g2gl_coord_pos(handle_x), u8g2gl_coord_pos(handle_y), handle_uw,
                         handle_uh, handle_r);
    }
}
