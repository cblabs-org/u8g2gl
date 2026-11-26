/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_input.cpp
 *
 * Purpose: Implements dispatch, the focus ring and the screen stack (§12). The
 *          rules live here once, and both the firmware and the editor build run
 *          them, so focus cannot move one way on the device and another on the
 *          designer canvas.
 *
 *          The screen descriptor carries everything per screen — the generated
 *          ring and event tables, and the focus position — so this module's
 *          own state is the screen stack alone.
 *
 * Description: Focusability, focus movement with and without wrap, the press
 *              path (an element's own response, then its events), and the
 *              fixed-depth stack of (screen, focus position) behind load and
 *              back
 */
#include "u8g2gl/u8g2gl_input.h"
#include "u8g2gl/u8g2gl_config.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl_internal.h"

namespace {

// One remembered screen: where back returns to, and which member it focused.
struct stack_entry {
    u8g2gl_screen* screen;
    uint8_t focus_pos;
};

// The screen stack. Static, fixed-depth ([D-1]); the oldest entry is dropped
// when a load finds it full (§12.3).
stack_entry s_stack[U8G2GL_SCREEN_STACK_DEPTH] = {};
uint8_t s_stack_depth = 0;

// focusable
// Whether ring position @p pos may take focus now: its object exists, is not
// hidden by itself or any ancestor, and is not disabled (§12.2). Checked at
// every move rather than cached, because a binding can hide or disable a
// member at any time.
//   screen — the screen whose ring is read
//   pos    — ring position; out of range is not focusable
bool focusable(const u8g2gl_screen& screen, uint8_t pos) {
    if (screen.ring == nullptr || pos >= screen.ring_count) {
        return false;
    }
    const uint8_t index = screen.ring[pos].index;
    if (screen.objs == nullptr || index >= screen.obj_count || screen.objs[index] == nullptr) {
        return false;
    }
    return u8g2gl_is_effectively_visible(screen.objs, screen.parents, index) &&
           !screen.objs[index]->is_disabled();
}

// focus_at
// Moves focus to ring position @p pos (or nowhere), taking it from the member
// that held it. set_focused() marks each object dirty, so both repaint.
//   screen — the screen whose focus changes
//   pos    — new ring position, or U8G2GL_NO_FOCUS
void focus_at(u8g2gl_screen& screen, uint8_t pos) {
    if (screen.focus_pos == pos) {
        return;
    }
    if (screen.focus_pos < screen.ring_count) {
        const u8g2gl_focus_stop& old_stop = screen.ring[screen.focus_pos];
        if (old_stop.index < screen.obj_count && screen.objs[old_stop.index] != nullptr) {
            screen.objs[old_stop.index]->set_focused(false, old_stop.focus_style);
        }
    }
    screen.focus_pos = pos;
    if (pos < screen.ring_count) {
        const u8g2gl_focus_stop& stop = screen.ring[pos];
        screen.objs[stop.index]->set_focused(true, stop.focus_style);
    }
}

// first_focusable
// The ring's first focusable position from one end, or U8G2GL_NO_FOCUS.
//   screen  — the screen whose ring is searched
//   forward — true searches from the first entry, false from the last
uint8_t first_focusable(const u8g2gl_screen& screen, bool forward) {
    for (uint8_t k = 0; k < screen.ring_count; ++k) {
        const uint8_t pos = forward ? k : static_cast<uint8_t>(screen.ring_count - 1 - k);
        if (focusable(screen, pos)) {
            return pos;
        }
    }
    return U8G2GL_NO_FOCUS;
}

// move_focus
// Steps focus one focusable member forward or back. Unwrapped, the search
// stops at the end, so moving past it does nothing; wrapped, it continues from
// the other end and stops on returning to where it began. With nothing
// focused (no member was focusable when the screen activated), a move takes
// the first focusable member from the end it moves away from.
//   screen  — the active screen
//   forward — true for CW/NEXT, false for CCW/PREV
// Returns true when focus moved.
bool move_focus(u8g2gl_screen& screen, bool forward) {
    // --- Step 1: Nothing focused yet: enter the ring from its near end ---
    if (screen.focus_pos >= screen.ring_count) {
        const uint8_t pos = first_focusable(screen, forward);
        if (pos == U8G2GL_NO_FOCUS) {
            return false;
        }
        focus_at(screen, pos);
        return true;
    }

    // --- Step 2: Step past unfocusable members, to an end or round it ---
    // ring_count - 1 steps at most: the last would bring a wrapped search back
    // to the start, which is not a move.
    int16_t pos = screen.focus_pos;
    for (uint8_t step = 1; step < screen.ring_count; ++step) {
        pos = static_cast<int16_t>(pos + (forward ? 1 : -1));
        if (pos < 0 || pos >= screen.ring_count) {
            if (!screen.ring_wrap) {
                return false;
            }
            pos = forward ? 0 : static_cast<int16_t>(screen.ring_count - 1);
        }
        if (focusable(screen, static_cast<uint8_t>(pos))) {
            focus_at(screen, static_cast<uint8_t>(pos));
            return true;
        }
    }
    return false;
}

// run_events
// Runs the events of object @p index that fire on @p trigger, in table order,
// stopping once one changes the active screen: the remaining entries belong to
// a screen no longer showing, and on the editor target its objects may already
// have been rebuilt.
//   screen  — the screen the event reached
//   target  — the object at @p index
//   index   — the object's index in the screen's array
//   trigger — what fired
void run_events(u8g2gl_screen& screen, u8g2gl_obj& target, uint8_t index, u8g2gl_trigger_t trigger) {
    for (uint8_t i = 0; i < screen.event_count; ++i) {
        if (u8g2gl_get_active_screen() != &screen) {
            return;
        }
        const u8g2gl_obj_event& event = screen.events[i];
        if (event.index != index || event.trigger != trigger) {
            continue;
        }
        switch (event.action) {
            case U8G2GL_ACTION_SCREEN_LOAD:
                u8g2gl_screen_load(event.screen);
                break;
            case U8G2GL_ACTION_SCREEN_BACK:
                u8g2gl_screen_back();
                break;
            case U8G2GL_ACTION_CALLBACK:
                if (event.callback != nullptr) {
                    event.callback(target, trigger);
                }
                break;
        }
    }
}

// press_focused
// Delivers a press or a long press to the focused member: for a press, the
// element's own response first (a switch toggles), so its `press` callbacks
// see the new value; then its events for the trigger; then, if the press
// changed its value and the screen is still showing, its `value_changed`
// events. A member that became unfocusable while focused takes no press.
//   screen  — the active screen
//   trigger — PRESS or LONG_PRESS
// Returns true when the press reached a member.
bool press_focused(u8g2gl_screen& screen, u8g2gl_trigger_t trigger) {
    // --- Step 1: Find a focused member that can still take the press ---
    if (!focusable(screen, screen.focus_pos)) {
        return false;
    }
    const uint8_t index = screen.ring[screen.focus_pos].index;
    u8g2gl_obj& target = *screen.objs[index];

    // --- Step 2: The element's own response, before any event runs ---
    const bool changed = trigger == U8G2GL_TRIGGER_PRESS && target.on_press_input();

    // --- Step 3: Its events, then value_changed if input changed the value ---
    run_events(screen, target, index, trigger);
    if (changed) {
        run_events(screen, target, index, U8G2GL_TRIGGER_VALUE_CHANGED);
    }
    return true;
}

}  // namespace

// u8g2gl_focus_enter
// Focuses an activated screen: the remembered position when it is still
// focusable, else the ring's first focusable member, else nothing.
//   screen    — the screen just activated
//   focus_pos — position to restore, or U8G2GL_NO_FOCUS
void u8g2gl_focus_enter(u8g2gl_screen& screen, uint8_t focus_pos) {
    const uint8_t pos = focusable(screen, focus_pos) ? focus_pos : first_focusable(screen, true);
    focus_at(screen, pos);
}

// u8g2gl_focus_leave
// Unfocuses a screen being left, so its focused look and focus style are
// undone while it is off screen and a later load starts from the first member.
//   screen — the screen being deactivated
void u8g2gl_focus_leave(u8g2gl_screen& screen) {
    focus_at(screen, U8G2GL_NO_FOCUS);
}

// u8g2gl_dispatch
// Maps one event onto the active screen's ring: a move, a press, or nothing.
//   event — the event the application read from its hardware
bool u8g2gl_dispatch(u8g2gl_event_t event) {
    u8g2gl_screen* screen = u8g2gl_get_active_screen();
    if (screen == nullptr || screen->ring == nullptr || screen->ring_count == 0) {
        return false;  // §12.2: a screen with no ring ignores input
    }
    switch (event) {
        case U8G2GL_EVENT_ENCODER_CW:
        case U8G2GL_EVENT_BUTTON_NEXT:
            return move_focus(*screen, true);
        case U8G2GL_EVENT_ENCODER_CCW:
        case U8G2GL_EVENT_BUTTON_PREV:
            return move_focus(*screen, false);
        case U8G2GL_EVENT_ENCODER_CLICK:
        case U8G2GL_EVENT_BUTTON_PRESS:
            return press_focused(*screen, U8G2GL_TRIGGER_PRESS);
        case U8G2GL_EVENT_ENCODER_LONG_CLICK:
        case U8G2GL_EVENT_BUTTON_LONG_PRESS:
            return press_focused(*screen, U8G2GL_TRIGGER_LONG_PRESS);
        case U8G2GL_EVENT_NONE:
            break;
    }
    return false;
}

u8g2gl_obj* u8g2gl_get_focused() {
    u8g2gl_screen* screen = u8g2gl_get_active_screen();
    if (screen == nullptr || screen->focus_pos >= screen->ring_count) {
        return nullptr;
    }
    return screen->objs[screen->ring[screen->focus_pos].index];
}

// u8g2gl_screen_load
// Pushes the active screen with its focus position, dropping the oldest entry
// from a full stack, then activates the target at its first focusable member.
//   target — the screen to load
void u8g2gl_screen_load(u8g2gl_screen* target) {
    u8g2gl_screen* current = u8g2gl_get_active_screen();
    if (target == nullptr || target == current) {
        return;
    }
    if (current != nullptr) {
        // --- Step 1: Make room by dropping the oldest entry ---
        if (s_stack_depth == U8G2GL_SCREEN_STACK_DEPTH) {
            for (uint8_t i = 1; i < U8G2GL_SCREEN_STACK_DEPTH; ++i) {
                s_stack[i - 1] = s_stack[i];
            }
            --s_stack_depth;
        }
        // --- Step 2: Remember the screen and its focus before leaving it ---
        // Captured now: leaving the screen clears its focus position.
        s_stack[s_stack_depth] = { current, current->focus_pos };
        ++s_stack_depth;
    }
    u8g2gl_activate_screen(target, U8G2GL_NO_FOCUS);
}

// u8g2gl_screen_back
// Pops the stack and activates that screen at its remembered focus position.
bool u8g2gl_screen_back() {
    if (s_stack_depth == 0) {
        return false;
    }
    --s_stack_depth;
    const stack_entry entry = s_stack[s_stack_depth];
    u8g2gl_activate_screen(entry.screen, entry.focus_pos);
    return true;
}

uint8_t u8g2gl_screen_stack_depth() {
    return s_stack_depth;
}

void u8g2gl_screen_stack_clear() {
    s_stack_depth = 0;
}
