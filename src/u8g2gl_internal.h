/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_internal.h
 * Purpose: Declarations shared between the library's own translation units;
 *          not part of the public API; never installed. Anything a host must
 *          not call, but two of the library's .cpp files must, lives here
 *          rather than in include/u8g2gl/, so it never becomes API surface
 *          that a later release would have to keep.
 *
 * Description: Cross-module hooks between the frame (u8g2gl_core.cpp), the
 *              timers (u8g2gl_timer.cpp) and input (u8g2gl_input.cpp)
 *
 * Exported Functions:
 * - u8g2gl_resume_notify():   Fire the registered resume callback
 * - u8g2gl_activate_screen(): Switch screens, entering focus at a given position
 * - u8g2gl_focus_enter():     Give an activated screen its focus
 * - u8g2gl_focus_leave():     Take focus from a screen being left
 */
#ifndef U8G2GL_INTERNAL_H
#define U8G2GL_INTERNAL_H

/**
 * @brief Library-internal: fire the resume callback, unless inside ui_handler().
 *
 * Called by the frame when the active screen goes clean to dirty, and by the
 * timer calls that give a timer work. Inside ui_handler() it does nothing: the
 * loop is awake by definition and the returned deadline already accounts for
 * the work. Host code has no reason to call it, which is why it is declared
 * here and not in the public u8g2gl_core.h.
 */
void u8g2gl_resume_notify();

#include <cstdint>

struct u8g2gl_screen;

/**
 * @brief Library-internal: make @p screen active, entering its focus at
 *        @p focus_pos.
 *
 * The one implementation behind u8g2gl_set_active_screen() (first focusable
 * member) and the screen stack's back (the remembered position). Lives in
 * u8g2gl_core.cpp, which owns the active screen.
 *
 * @param screen    The screen to activate, or nullptr for none.
 * @param focus_pos Ring position to restore, or U8G2GL_NO_FOCUS for the first.
 */
void u8g2gl_activate_screen(u8g2gl_screen* screen, uint8_t focus_pos);

/**
 * @brief Library-internal: focus @p screen's ring at @p focus_pos if that member
 *        is focusable, else at its first focusable member, else nowhere.
 */
void u8g2gl_focus_enter(u8g2gl_screen& screen, uint8_t focus_pos);

/**
 * @brief Library-internal: the focused member of @p screen loses focus, and the
 *        screen is left with nothing focused.
 */
void u8g2gl_focus_leave(u8g2gl_screen& screen);

#endif // U8G2GL_INTERNAL_H
