/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_core.h
 * Purpose: The application's entry point into the framework and the owner of the
 *          frame. Everything else in the library is passive; this is what drives
 *          it. ui_handler() is the single call an application makes each loop —
 *          it ticks the active screen, redraws only if something changed, and
 *          returns how long the caller may sleep ([D-15]).
 *
 *          The application owns the U8G2 instance and the main loop; the
 *          framework owns scheduling and rendering. That boundary is deliberate
 *          (§12.1) — board wiring, debounce and timing policy vary per project
 *          and are none of the framework's business.
 *
 * Description: Tick-source registration, the u8g2gl_screen descriptor that binds
 *              a generated screen's arrays and lifecycle functions together,
 *              active-screen selection, frame-level dirty gating, and the
 *              ui_handler entry points
 *
 * Exported Classes:
 * - u8g2gl_screen: struct holding screen lifecycle callbacks and object arrays
 *
 *     UI Core:
 *     - ui_handler(): The main handler for rendering and ticking
 *     - u8g2gl_mark_dirty(): Mark the active screen dirty
 *     - u8g2gl_set_tick_cb(): Set a callback to get current time
 */
#ifndef U8G2GL_CORE_H
#define U8G2GL_CORE_H

#include "u8g2gl_types.h"
#include "u8g2gl_obj.h"
#include <cstdint>

// Forward declare
class U8G2;

// --- Tick time source ---
// Pull-only: the framework calls this to get the current time.
// The user registers their millis() function once at startup.
using u8g2gl_tick_cb_t = uint32_t(*)();
void u8g2gl_set_tick_cb(u8g2gl_tick_cb_t cb);
uint32_t u8g2gl_tick_now();   // calls the registered callback

// --- Screen structure ---
// Represents a complete screen: its widget array, parent table, and lifecycle.
// Generated code creates one of these per screen (§13.12).
struct u8g2gl_screen {
    u8g2gl_obj* const* objs;   ///< Objects in document order, which is also draw order ([D-4])
    const uint8_t* parents;    ///< Parent index per object, parallel to @ref objs
    uint8_t obj_count;         ///< Number of entries in both arrays

    // Lifecycle functions emitted by the generator for this screen. Plain
    // function pointers rather than std::function: storing a std::function
    // risks a hidden heap allocation, which the runtime does not permit.
    void (*init_fn)();                          ///< Construct and configure, once at boot
    void (*activate_fn)();                      ///< Called when this screen becomes active
    void (*deactivate_fn)();                    ///< Called when switching away
    uint32_t (*tick_fn)(uint32_t now_ms);       ///< Tick all objects; returns the soonest deadline
    void (*render_fn)(U8G2& display);           ///< Draw every visible object

    bool dirty;   ///< Set when anything changed; gates the sendBuffer, not individual objects
};

// --- Screen management ---

/**
 * @brief Make a screen the active one.
 *
 * Calls the outgoing screen's deactivate_fn and the incoming screen's
 * activate_fn, and marks the frame dirty so the new screen paints immediately
 * rather than waiting for something else to change.
 *
 * @param screen The screen to activate. Screens are statically allocated by
 *               generated code, so this pointer is expected to remain valid for
 *               the life of the program.
 */
void u8g2gl_set_active_screen(u8g2gl_screen* screen);

/** @brief The currently active screen, or nullptr if none has been set. */
u8g2gl_screen* u8g2gl_get_active_screen();

/**
 * @brief Mark the active screen as needing a redraw.
 *
 * Called by subjects when a bound value changes and by widgets when animation
 * state advances. This raises a screen-level flag, not a per-object one: a full
 * frame is redrawn or none is ([D-4]), so the flag decides whether the frame
 * runs at all. What it saves is the sendBuffer — the SPI or I²C transfer — which
 * dominates the cost of a frame.
 */
void u8g2gl_mark_dirty();

// --- The main handler ---

/**
 * @brief Tick the active screen, redraw if needed, and report when to return.
 *
 * The one call an application makes each time round its loop. It is safe to
 * call as often as you like — if nothing has changed it ticks and returns
 * without touching the display.
 *
 * @param display The U8G2 instance. The application owns it, including its
 *                construction and its wiring; the framework only draws into it
 *                (§12.1).
 * @return Milliseconds until this needs calling again — the minimum deadline
 *         across every widget that is animating. U8G2GL_IDLE means nothing is
 *         animating and only an external change (a subject write, a screen
 *         switch) will require another frame.
 *
 *         Returning a deadline rather than a bool is what lets a battery-powered
 *         project sleep precisely instead of polling ([D-15]). Ignoring the
 *         return value and calling on a fixed interval is perfectly valid and
 *         costs only power.
 *
 * @code
 * void loop() {
 *     uint32_t idle_ms = ui_handler(u8g2);
 *     read_my_buttons();
 *     delay_or_sleep(idle_ms);
 * }
 * @endcode
 */
uint32_t ui_handler(U8G2& display);

/**
 * @brief ui_handler() rate-limited to at most once per period.
 *
 * Convenience for loops that call very frequently and would rather cap the
 * update rate than act on the returned deadline. Optional sugar over
 * ui_handler(); it adds no capability.
 *
 * @param display   The U8G2 instance.
 * @param period_ms Minimum interval between actual handler runs.
 * @return As ui_handler(), or the remaining time in the current period if the
 *         call was skipped.
 */
uint32_t ui_handler_run_in_period(U8G2& display, uint32_t period_ms);

#endif // U8G2GL_CORE_H
