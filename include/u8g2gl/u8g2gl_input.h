/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_input.h
 *
 * Purpose: Turns the semantic events an application dispatches into focus
 *          movement, element events and screen navigation (§12). The
 *          application owns the hardware — wiring, debounce, encoder decoding
 *          and the timing of a long press (§12.1) — and hands the framework one
 *          event at a time; this module decides what that event means on the
 *          active screen.
 *
 *          Everything it reads is data the generator emits beside each screen:
 *          the screen's focus ring and its elements' events, as const tables
 *          the u8g2gl_screen descriptor points at. Nothing is registered at run
 *          time and nothing allocates ([D-1]); the only mutable state is the
 *          focus position in each descriptor and the fixed-depth screen stack
 *          here.
 *
 * Description: The ring and event table types the generator emits, the
 *              `<event_cb>` callback signature, dispatch, and the screen stack
 *              behind `<screen_load_event>` and `<screen_back_event>`
 *
 * Exported Types:
 * - u8g2gl_event_cb_t:  The `<event_cb>` callback signature
 * - u8g2gl_action_t:    What an element's event does
 * - u8g2gl_focus_stop:  One focus-ring entry: an object index and its focus style
 * - u8g2gl_obj_event:   One element event: object, trigger and action
 * - U8G2GL_NO_FOCUS:    The ring position meaning nothing is focused
 *
 * Exported Functions:
 *     Input:
 *     - u8g2gl_dispatch():          Apply one event to the active screen
 *     - u8g2gl_get_focused():       The object holding focus, if any
 *
 *     Navigation:
 *     - u8g2gl_screen_load():       Push the active screen, then activate another
 *     - u8g2gl_screen_back():       Return to the screen on top of the stack
 *     - u8g2gl_screen_stack_depth(): Screens back can return through now
 *     - u8g2gl_screen_stack_clear(): Forget every screen on the stack
 */
#ifndef U8G2GL_INPUT_H
#define U8G2GL_INPUT_H

#include "u8g2gl_types.h"
#include <cstdint>

class u8g2gl_obj;
struct u8g2gl_style;
struct u8g2gl_screen;

/**
 * @brief The signature of an `<event_cb>` callback (§12.3).
 *
 * Generated `ui.hpp` declares each callback a project names, and the
 * application defines it, so a missing definition is a link error naming it.
 * One callback may serve many elements and triggers; the arguments say which.
 *
 * @param target  The element whose event fired.
 * @param trigger What fired it.
 */
using u8g2gl_event_cb_t = void (*)(u8g2gl_obj& target, u8g2gl_trigger_t trigger);

/** @brief What an element's event does when its trigger fires (§12.3). */
enum u8g2gl_action_t : uint8_t {
    U8G2GL_ACTION_SCREEN_LOAD = 0,   ///< `<screen_load_event>`: push, then activate the target
    U8G2GL_ACTION_SCREEN_BACK,       ///< `<screen_back_event>`: pop and return
    U8G2GL_ACTION_CALLBACK,          ///< `<event_cb>`: call the application's function
};

/// A ring position meaning "nothing is focused".
static constexpr uint8_t U8G2GL_NO_FOCUS = UINT8_MAX;

/**
 * @brief One entry of a screen's focus ring, in the ring's order.
 *
 * The ring is exactly the `<focus name>` entries the author wrote: nothing
 * joins it on its own (§12.2).
 */
struct u8g2gl_focus_stop {
    const u8g2gl_style* focus_style;  ///< The element's `focus_style`, or nullptr
    uint8_t index;                    ///< The element's index in the screen's object array
};

/**
 * @brief One element event (§12.3): when @ref trigger fires on the object at
 *        @ref index, do @ref action.
 *
 * A screen's events are one table, grouped by object, each object's in
 * document order; dispatch runs an object's matching entries in that order.
 * Only the field the action reads is set: @ref screen for a load, @ref
 * callback for a callback.
 */
struct u8g2gl_obj_event {
    u8g2gl_screen* screen;            ///< SCREEN_LOAD's target; nullptr otherwise
    u8g2gl_event_cb_t callback;       ///< CALLBACK's function; nullptr otherwise
    uint8_t index;                    ///< The element's index in the screen's object array
    u8g2gl_trigger_t trigger;         ///< What fires it
    u8g2gl_action_t action;           ///< What it does
};

/**
 * @brief Apply one input event to the active screen (§12).
 *
 * - **CW and NEXT** move focus forward, **CCW and PREV** back, skipping members
 *   that are hidden (by themselves or an ancestor) or disabled. With the ring's
 *   `wrap` false, moving past either end does nothing. A focus change marks
 *   both objects dirty.
 * - **CLICK and PRESS** reach the focused element: its own response first (a
 *   switch toggles, u8g2gl_obj::on_press_input()), then its `press` events, then
 *   — when the press changed its value — its `value_changed` events.
 * - **The two long events** run the focused element's `long_press` events.
 *
 * An element's events run in table order, and stop as soon as one changes the
 * active screen: the rest belong to a screen that is no longer showing.
 *
 * A screen with no ring ignores every event. Dispatch is synchronous, allocates
 * nothing and never times anything (§12.1). Not re-entrant: do not call it
 * from a callback it runs.
 *
 * @param event The event; U8G2GL_EVENT_NONE does nothing.
 * @return true if the event did something: focus moved, or a press reached a
 *         focused element. false if the screen has no ring, nothing is
 *         focusable, or a move was refused at an end of an unwrapped ring.
 */
bool u8g2gl_dispatch(u8g2gl_event_t event);

/**
 * @brief The object holding focus on the active screen.
 * @return The focused object, or nullptr when nothing is focused.
 */
u8g2gl_obj* u8g2gl_get_focused();

/**
 * @brief Push the active screen and its focus position, then activate @p target.
 *
 * What a `<screen_load_event>` does. A full stack (U8G2GL_SCREEN_STACK_DEPTH)
 * drops its oldest entry to make room. The target's focus goes to its ring's
 * first visible, enabled member.
 *
 * @param target The screen to load. nullptr, or the screen already active, does
 *               nothing.
 */
void u8g2gl_screen_load(u8g2gl_screen* target);

/**
 * @brief Pop the screen stack and activate that screen, restoring its focus
 *        position.
 *
 * What a `<screen_back_event>` does. If the remembered member is no longer
 * focusable, focus falls to the ring's first visible, enabled member, as on a
 * load.
 *
 * @return false, doing nothing, when the stack is empty.
 */
bool u8g2gl_screen_back();

/** @brief How many screens u8g2gl_screen_back() can return through now. */
uint8_t u8g2gl_screen_stack_depth();

/**
 * @brief Forget every screen on the stack, so back does nothing until the next
 *        load. For an application jumping home with u8g2gl_set_active_screen(),
 *        which leaves the stack as it is.
 */
void u8g2gl_screen_stack_clear();

#endif // U8G2GL_INPUT_H
