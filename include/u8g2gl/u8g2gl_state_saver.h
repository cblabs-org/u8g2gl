/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_state_saver.h
 * Purpose: An RAII guard that saves and restores the U8G2 drawing state that
 *          can be read back, around a widget's render(). It exists so a widget
 *          can set draw colour and font freely without restoring them, and so
 *          one widget forgetting to tidy up cannot corrupt everything drawn
 *          after it.
 *
 *          The framework wraps every render() call in one of these, inside
 *          u8g2gl_render_object() (§11.3), so widget authors normally never
 *          construct one themselves.
 *
 *          It can only restore what U8G2 lets it read. What it does NOT save:
 *          - The clip window. U8G2 has no clip getter. Clip lifetime belongs to
 *            u8g2gl_render_object(), which sets the clip, renders, and resets
 *            it to the full display.
 *          - Font mode and bitmap mode. U8G2's C++ API exposes setFontMode() and
 *            setBitmapMode() but no getter for either, and neither does the test
 *            stub, so a value cannot be captured to restore. A widget that draws
 *            text or bitmaps must set the mode it needs itself rather than rely
 *            on whatever the previous widget left.
 *
 * Description: Scope guard capturing draw colour and font on construction and
 *              restoring them on destruction
 *
 * Exported Classes:
 * - u8g2gl_state_saver: RAII guard restoring draw colour and font
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

/**
 * @brief Restores draw colour and font when it goes out of scope.
 *
 * Saves exactly two pieces of state: draw colour and font. It does not save the
 * clip window, font mode or bitmap mode — see the file header for why each
 * cannot be read back, and who is responsible instead.
 */
class u8g2gl_state_saver {
public:
    /**
     * @brief Capture the current draw colour and font.
     * @param display U8G2 instance to guard. Must outlive this guard.
     */
    explicit u8g2gl_state_saver(U8G2& display)
        : display_(display),
          saved_draw_color_(display.getDrawColor()),
          // U8G2 has no getFont(): the current font is only readable from its
          // state struct (U8g2lib.h getU8g2(), u8g2.h `const uint8_t *font`).
          // A getFont() once existed in the test stub alone, so this compiled
          // on the host and not against real U8G2 (WO4b G1, fixed in WO4c).
          saved_font_(display.getU8g2()->font) {
    }

    /** @brief Restore the draw colour and font captured at construction. */
    ~u8g2gl_state_saver() {
        display_.setDrawColor(saved_draw_color_);
        display_.setFont(saved_font_);
    }

    // Non-copyable, non-movable: a copy would restore the same state twice.
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
