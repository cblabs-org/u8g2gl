/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_core.cpp
 * Purpose: Implements the frame. ui_handler() is the only function an
 *          application calls per loop, and its shape encodes three decisions
 *          worth knowing: the whole frame is redrawn or none of it is ([D-4]),
 *          the dirty flag gates the expensive sendBuffer rather than individual
 *          objects, and the return value is a sleep hint aggregated from every
 *          widget's own deadline ([D-15]).
 *
 * Description: Tick-source registration, active-screen management, frame-level
 *              dirty gating, the ui_handler entry points, the two calls
 *              generated code makes into the frame — the per-object render
 *              wrapper (§11.3) and the frame-dirty subject observer (§13.5) —
 *              and u8g2gl_apply_clip(), the single owner of the clip-corner
 *              convention
 */
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_state_saver.h"
#include "u8g2gl/u8g2gl_tree.h"

#include <type_traits>

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// Module state. Two pointers, deliberately: the library drives one screen at a
// time and pulls time from the application rather than owning a clock, so there
// is nothing else to keep here.
static u8g2gl_tick_cb_t s_tick_cb = nullptr;
static u8g2gl_screen* s_active_screen = nullptr;

// u8g2gl_set_tick_cb
// Registers the application's clock. Time is pulled rather than pushed so the
// framework never has to own a timer or an interrupt.
//   cb — returns milliseconds since boot; millis() on Arduino
void u8g2gl_set_tick_cb(u8g2gl_tick_cb_t cb) {
    s_tick_cb = cb;
}

// u8g2gl_tick_now
// Current time via the registered callback.
uint32_t u8g2gl_tick_now() {
    // With no callback registered, time never advances. Every animation then
    // appears frozen while rendering still works, which is a confusing symptom
    // — but returning 0 is preferable to calling through a null pointer, and the
    // condition is obvious the first time anything is expected to move.
    return s_tick_cb ? s_tick_cb() : 0;
}

// u8g2gl_set_active_screen
// Switches the active screen, running the outgoing screen's deactivate hook
// before the incoming screen's activate hook so the two never overlap.
//   screen — the screen to make active, or nullptr to leave none active
void u8g2gl_set_active_screen(u8g2gl_screen* screen) {
    if (s_active_screen && s_active_screen->deactivate_fn) {
        s_active_screen->deactivate_fn();
    }
    s_active_screen = screen;
    if (screen) {
        // Force the first frame. A newly activated screen has changed nothing by
        // its own reckoning, so without this the dirty gate would suppress its
        // initial paint and the display would keep showing the previous screen
        // until something unrelated happened to change.
        screen->dirty = true;
        if (screen->activate_fn) {
            screen->activate_fn();
        }
    }
}

u8g2gl_screen* u8g2gl_get_active_screen() {
    return s_active_screen;
}

void u8g2gl_mark_dirty() {
    if (s_active_screen) {
        s_active_screen->dirty = true;
    }
}

// Generated code passes u8g2gl_frame_dirty_observer straight to add_observer().
// Proving the signature here makes a drift in u8g2gl_observer_cb a library
// build error rather than a generated-code build error in someone's project.
static_assert(
    std::is_same<decltype(&u8g2gl_frame_dirty_observer), u8g2gl_observer_cb>::value,
    "u8g2gl_frame_dirty_observer must match u8g2gl_observer_cb"
);

// u8g2gl_frame_dirty_observer
// Adapts u8g2gl_mark_dirty() to the observer signature. There is deliberately
// no per-subject or per-screen state: whichever screen is active is the one
// that may show the value.
//   user_data — unused
void u8g2gl_frame_dirty_observer(void* /*user_data*/) {
    u8g2gl_mark_dirty();
}

// u8g2gl_render_object
// Renders one object with the framework's containment around it: effective
// visibility, effective clip, saved font and colour.
//   display — the application's U8G2 instance
//   objs    — flat object array in document order
//   parents — parallel parent-index array, or nullptr for each object's own
//   index   — object to render
void u8g2gl_render_object(
    U8G2& display,
    u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
) {
    // --- Step 1: Skip an object hidden by itself or any ancestor ---
    // This also rejects a null array or a null entry on the chain, so objs[index]
    // is safe to dereference below.
    if (!u8g2gl_is_effectively_visible(objs, parents, index)) {
        return;
    }

    // --- Step 2: Skip an object with nothing left to draw into ---
    // An empty clip is the normal outcome for an element wholly outside its
    // container; there is no pixel it could legitimately set.
    const u8g2gl_rect clip = u8g2gl_effective_clip(objs, parents, index);
    if (clip.w <= 0 || clip.h <= 0) {
        return;
    }

    // --- Step 3: Draw inside saved state and the effective clip ---
    // The saver is constructed before the clip is applied so its lifetime spans
    // the whole render; it does not touch the clip either way.
    u8g2gl_state_saver saver(display);
    if (!u8g2gl_apply_clip(display, clip)) {
        // Wholly above or left of the display: no pixel to draw into.
        return;
    }
    objs[index]->render(display);

    // --- Step 4: Reset the clip this function set ---
    // The state saver cannot restore the clip: U8G2 has no clip getter. The full
    // display is the right state to leave, because no object's clip is ever
    // nested inside another's active clip — each is computed from its ancestors
    // in Step 2.
    display.setMaxClipWindow();
}

// u8g2gl_apply_clip
// Converts a rect to setClipWindow() corners. The convention (exclusive second
// corner) and the evidence for it are documented on the declaration, which is
// the one place to change if PR-06's pixel test disagrees.
//   display — receives the clip window
//   clip    — region in device pixels; may be empty or partly negative
bool u8g2gl_apply_clip(U8G2& display, const u8g2gl_rect& clip) {
    // --- Step 1: Reject a rect with no area ---
    if (clip.w <= 0 || clip.h <= 0) {
        return false;
    }

    // --- Step 2: Compute the corners, exclusive at the far edge ---
    // In int32_t: x + w can leave int16_t, and int may be 16-bit.
    int32_t x0 = clip.x;
    int32_t y0 = clip.y;
    int32_t x1 = static_cast<int32_t>(clip.x) + clip.w;
    int32_t y1 = static_cast<int32_t>(clip.y) + clip.h;

    // --- Step 3: Clamp both corners to the display ---
    // U8G2 takes unsigned coordinates, so a negative near corner would wrap to
    // a huge value rather than clip. The far corner is clamped too, so the
    // window never names a column or row past the display and always fits
    // u8g2_uint_t, whatever its width on this build.
    const int32_t display_w = static_cast<int32_t>(display.getDisplayWidth());
    const int32_t display_h = static_cast<int32_t>(display.getDisplayHeight());
    if (x0 < 0) {
        x0 = 0;
    }
    if (y0 < 0) {
        y0 = 0;
    }
    if (x1 > display_w) {
        x1 = display_w;
    }
    if (y1 > display_h) {
        y1 = display_h;
    }

    // --- Step 4: Reject a rect with no pixel on the display ---
    // With an exclusive far corner, x1 <= x0 means no column survives: the rect
    // lay wholly left of, or wholly right of, the display (likewise rows).
    if (x1 <= x0 || y1 <= y0) {
        return false;
    }

    display.setClipWindow(u8g2gl_coord_clamp(x0), u8g2gl_coord_clamp(y0),
                          u8g2gl_coord_clamp(x1), u8g2gl_coord_clamp(y1));
    return true;
}

// ui_handler
// One frame: tick every widget, redraw if anything changed, and report how long
// the caller may sleep. This is the whole of the framework's per-loop work.
//   display — the application's U8G2 instance; the framework only draws into it
uint32_t ui_handler(U8G2& display) {
    if (!s_active_screen) {
        return U8G2GL_IDLE;
    }

    uint32_t now = u8g2gl_tick_now();
    uint32_t next_deadline = U8G2GL_IDLE;

    // --- Step 1: Tick all widgets, collect deadlines ---
    if (s_active_screen->tick_fn) {
        next_deadline = s_active_screen->tick_fn(now);
    }

    // --- Step 2: Render the whole frame, or none of it ---
    // There is no per-object skipping: clearBuffer() has wiped the buffer, so an
    // object that declined to draw would leave a hole rather than its previous
    // appearance ([D-4]). The gate is the whole frame, and what it saves is the
    // sendBuffer below — the SPI or I2C transfer, which dominates frame cost.
    if (s_active_screen->dirty) {
        display.clearBuffer();
        if (s_active_screen->render_fn) {
            s_active_screen->render_fn(display);
        }
        display.sendBuffer();
        s_active_screen->dirty = false;
    }

    // --- Step 3: Convert the deadline into a sleep the caller can use ---
    if (next_deadline == U8G2GL_IDLE) {
        return U8G2GL_IDLE;
    }

    // The deadline was measured before rendering, and rendering is not free —
    // a full redraw plus sendBuffer can take several milliseconds on a slow bus.
    // Re-read the clock and subtract what the frame consumed, otherwise the
    // caller sleeps for the full interval on top of the time already spent and
    // every animation runs progressively late.
    uint32_t elapsed = u8g2gl_tick_now() - now;
    if (next_deadline <= elapsed) {
        return 0;  // The frame overran its own deadline: due again immediately.
    }
    return next_deadline - elapsed;
}

// ui_handler_run_in_period
// Rate-limits ui_handler to at most one run per period. Convenience for loops
// that would rather cap the update rate than act on a returned deadline.
//   display   — the application's U8G2 instance
//   period_ms — minimum interval between actual handler runs
uint32_t ui_handler_run_in_period(U8G2& display, uint32_t period_ms) {
    // Function-local statics: this wrapper is a single global rate limiter, not
    // per-screen state. Calling it for two displays would have them share the
    // same period, which is a limitation of the convenience rather than a bug —
    // ui_handler() itself is stateless and should be used directly in that case.
    static uint32_t s_last_period_tick = 0;
    static bool s_period_initialized = false;

    uint32_t now = u8g2gl_tick_now();
    if (!s_period_initialized || (now - s_last_period_tick) >= period_ms) {
        s_period_initialized = true;
        s_last_period_tick = now;
        return ui_handler(display);
    }
    // Skipped this round. Returning 0 means "do not sleep", so a caller feeding
    // this to a delay will spin until the period expires — see the note on the
    // declaration. Returning the remaining period would be friendlier, but that
    // is a behavioural change and this wrapper is optional sugar over
    // ui_handler(), which already reports a usable deadline.
    return 0;
}
