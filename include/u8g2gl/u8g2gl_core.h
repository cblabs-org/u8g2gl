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
 *
 *     Support for generated code (§11.3, §13.5):
 *     - u8g2gl_render_object():        Render one object with visibility, clip and state saved
 *     - u8g2gl_frame_dirty_observer(): Subject observer that marks the active screen dirty
 *
 *     Clipping:
 *     - u8g2gl_apply_clip():           The one place a rect becomes a setClipWindow() call
 */
#ifndef U8G2GL_CORE_H
#define U8G2GL_CORE_H

#include "u8g2gl_types.h"
#include "u8g2gl_obj.h"
#include "u8g2gl_tree.h"
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

/**
 * @brief Subject observer that marks the active screen dirty.
 *
 * Has the u8g2gl_observer_cb signature, so it registers directly on any subject:
 *
 * @code
 * ui_subject_level.add_observer(nullptr, u8g2gl_frame_dirty_observer);
 * @endcode
 *
 * It exists for elements the generator compiles to draw calls (§13.5). Those
 * read a bound value at draw time and have no object observing the subject, so
 * without this nothing would schedule a frame when the value changes. The
 * generator registers it once per such subject — not once per binding, and not
 * once per screen, because u8g2gl_mark_dirty() already targets whichever screen
 * is active.
 *
 * @param user_data Ignored; pass nullptr. Present only to match
 *                  u8g2gl_observer_cb.
 */
void u8g2gl_frame_dirty_observer(void* user_data);

// --- Clipping ---

/**
 * @brief Set the display's clip window to a rectangle. The single owner of
 *        U8G2's clip-corner convention; no other runtime code calls
 *        setClipWindow().
 *
 * CLIP-CORNER CONVENTION — THE FAR CORNER IS EXCLUSIVE, SETTLED FROM SOURCE.
 * A rect {x, y, w, h} becomes setClipWindow(x, y, x + w, y + h), so the rect's
 * last column (x + w - 1) and last row (y + h - 1) remain drawable. design_spec
 * §11.3's x+w-1, y+h-1 form would lose the last column and row.
 *
 * Source: U8G2 2.36.18, now pinned at extern/u8g2. u8g2.h:352/354 document
 * clip_x1 and clip_y1 as "(excluded)", and u8g2_clip_intersection2()
 * (u8g2_hvline.c), which clips every line U8G2 draws against the window,
 * agrees: it clips "against c (included) to d (excluded)".
 *
 * PR-06's container-edge pixel test — an object whose clip is exactly its
 * bounds, drawing its last column and row — now guards this convention rather
 * than discovering it. If it ever fails, change this function and nothing
 * else; Core.ApplyClipPinsExclusiveCornerConvention pins it on the host.
 *
 * Both corners are clamped to the display before they are converted to U8G2's
 * unsigned coordinate type: the near corner at 0, because a negative origin
 * would otherwise wrap to a huge value rather than clip, and the far corner at
 * the display's width and height. A rect with no pixel on the display is
 * rejected.
 *
 * @param display U8G2 instance whose clip window is set.
 * @param clip    Region to allow drawing into, in device pixels.
 * @return true if the clip window was set. false — and the display untouched —
 *         if the rect is empty or lies wholly outside the display; the caller
 *         must then draw nothing, because the previous clip is still in force.
 */
bool u8g2gl_apply_clip(U8G2& display, const u8g2gl_rect& clip);

// --- Per-object rendering ---

/**
 * @brief Render one object of a screen's flat tree inside the framework's
 *        containment (§11.3).
 *
 * In order: skips the object if it or any ancestor is hidden; skips it if its
 * effective clip (own bounds intersected with every ancestor's) is empty;
 * otherwise saves draw colour and font with u8g2gl_state_saver, sets the clip
 * window to the effective clip through u8g2gl_apply_clip(), calls the object's
 * render(), and resets the clip window to the full display.
 *
 * Clip lifetime is this function's responsibility, not the state saver's: it
 * sets the clip, renders, and resets it. U8G2 cannot report its clip window, so
 * nothing can save and restore it, and a widget must not set one of its own —
 * it would replace the ancestor-intersected clip rather than narrow it.
 *
 * Generated screen render functions call this once per object in document
 * order, and the editor build calls the same function, so the firmware and the
 * editor cannot contain two versions of the rule. The arguments are exactly a
 * u8g2gl_screen's arrays: `u8g2gl_render_object(d, s.objs, s.parents, i)`.
 *
 * @param display U8G2 instance to draw into.
 * @param objs    The screen's object array, in document order. A null array or a
 *                null entry on the ancestry chain renders nothing.
 * @param parents The parallel parent-index array, or nullptr to use each
 *                object's own parent index (as for u8g2gl_effective_clip()).
 * @param index   Index of the object to render. Not bounds-checked — the arrays
 *                carry no length — so it must be less than the screen's
 *                object count.
 *
 * @note On return the clip window is the full display, not whatever it was
 *       before the call. U8G2 has no getter for the clip window, so it cannot be
 *       saved; and because each object's clip is computed from its ancestors
 *       rather than nested inside a parent's active clip, the full display is
 *       the correct state between objects.
 */
void u8g2gl_render_object(
    U8G2& display,
    u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

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
 * @return As ui_handler() when the period has elapsed and the handler ran.
 *         **Returns 0 when the call was skipped**, which means "do not sleep" —
 *         so a caller that feeds this straight into a sleep will spin until the
 *         period expires. Callers wanting to idle should use ui_handler()
 *         directly and act on its deadline, which is the mechanism designed for
 *         that ([D-15]).
 */
uint32_t ui_handler_run_in_period(U8G2& display, uint32_t period_ms);

#endif // U8G2GL_CORE_H
