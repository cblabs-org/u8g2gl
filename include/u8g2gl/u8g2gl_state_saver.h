/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_state_saver.h
 * Purpose: An RAII guard that saves and restores U8G2 drawing state around a
 *          widget's render(). It exists so a widget can set font, draw colour
 *          and clip freely without having to restore them, and so that one
 *          widget forgetting to tidy up cannot corrupt everything drawn after
 *          it.
 *
 *          The framework wraps every render() call in one of these (§11.3), so
 *          widget authors normally never construct one themselves.
 *
 * Description: Scope guard capturing font, draw colour and clip window on
 *              construction and restoring them on destruction
 *
 * Exported Classes:
 * - u8g2gl_state_saver: RAII guard that saves and restores U8G2 drawing state
 */
#ifndef U8G2GL_STATE_SAVER_H
#define U8G2GL_STATE_SAVER_H

#include <cstdint>

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#else
class U8G2;
#endif

class u8g2gl_state_saver {
public:
    explicit u8g2gl_state_saver(U8G2& display)
        : display_(display),
          saved_draw_color_(display.getDrawColor()),
          saved_font_(display.getFont()) {
    }

    ~u8g2gl_state_saver() {
        display_.setDrawColor(saved_draw_color_);
        display_.setFont(saved_font_);
    }

    // Non-copyable, non-movable
    u8g2gl_state_saver(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver& operator=(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver(u8g2gl_state_saver&&) = delete;
    u8g2gl_state_saver& operator=(u8g2gl_state_saver&&) = delete;

private:
    U8G2& display_;
    uint8_t saved_draw_color_;
    const uint8_t* saved_font_;
};

#endif // U8G2GL_STATE_SAVER_H
