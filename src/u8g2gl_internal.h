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
 * Description: Cross-module hooks between the frame (u8g2gl_core.cpp) and the
 *              timers (u8g2gl_timer.cpp)
 *
 * Exported Classes:
 * - u8g2gl_resume_notify(): Fire the registered resume callback
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

#endif // U8G2GL_INTERNAL_H
