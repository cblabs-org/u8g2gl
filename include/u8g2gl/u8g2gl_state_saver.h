/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_state_saver.h
 * Purpose: The boundary between the application's U8G2 state and the
 *          framework's. The rule it enforces: U8G2GL's state inside each
 *          object's render; the caller's at every other moment (§11.3).
 *
 *          On construction it captures every piece of ambient U8G2 state that
 *          can be read back, then establishes the framework's text baseline:
 *          top font positioning (setFontPosTop()) and, where U8G2 is built with
 *          font rotation, direction 0. Every text widget computes its glyph
 *          box from the top edge, so it must not depend on what the caller
 *          left — a caller in U8G2's default baseline position would otherwise
 *          draw every label one font height too high. On destruction it puts
 *          back exactly what it captured, so a widget may change any of it
 *          without tidying up, and nothing a widget does leaks into the
 *          application's own drawing.
 *
 *          Font, draw colour, font mode and bitmap mode are captured but not
 *          established: each widget sets those from its own style, and that
 *          stays its job.
 *
 *          The framework constructs one inside u8g2gl_render_object() and
 *          u8g2gl_repaint_object() (u8g2gl_core.h), so widget authors normally
 *          never construct one themselves.
 *
 *          What it cannot save is the clip window. U8G2 has no clip getter, so
 *          nothing can save and restore it. Clip lifetime belongs to
 *          u8g2gl_clip_scope (u8g2gl_core.h), which u8g2gl_render_object()
 *          declares after this saver so the clip resets to the full display
 *          before the rest of the state is restored.
 *
 * Description: Scope guard that captures U8G2's ambient drawing state,
 *              establishes the framework's font position and direction, and
 *              restores the captured state on destruction
 *
 * Exported Classes:
 * - u8g2gl_state_saver: RAII guard — save, establish, restore
 */
#ifndef U8G2GL_STATE_SAVER_H
#define U8G2GL_STATE_SAVER_H

#include <cstdint>

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path; the forward
// declaration keeps this header usable where U8G2 is not on the path at all.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#else
class U8G2;
#endif

/**
 * @brief Saves the caller's U8G2 state, establishes the framework's, and
 *        restores the caller's when it goes out of scope.
 *
 * Captures every ambient item U8G2 lets it read, all from U8G2's state struct
 * (u8g2.h, through getU8g2()):
 *
 * | Item           | Field                          | Established here |
 * |----------------|--------------------------------|------------------|
 * | Draw colour    | `draw_color`                   | no — style       |
 * | Font           | `font`                         | no — style       |
 * | Font mode      | `font_decode.is_transparent`   | no — style       |
 * | Bitmap mode    | `bitmap_transparency`          | no — style       |
 * | Font position  | `font_calc_vref`               | yes — top        |
 * | Font direction | `font_decode.dir`              | yes — 0          |
 *
 * Font direction exists only when U8G2 is built with U8G2_WITH_FONT_ROTATION,
 * which u8g2.h defines by default; the guard follows that macro.
 *
 * It does not save the clip window — see the file header for why, and who is
 * responsible instead.
 *
 * Cost: byte and pointer copies plus one call per setter, each of which is a
 * single field assignment in U8G2; nothing allocates. setFont() reads a font
 * header only when the font actually changes.
 */
class u8g2gl_state_saver {
public:
    /**
     * @brief Capture the caller's state, then establish the framework's
     *        font position and direction.
     * @param display U8G2 instance to guard. Must outlive this guard.
     */
    explicit u8g2gl_state_saver(U8G2& display)
        : display_(display),
          // U8G2 has no getFont(), font-mode, bitmap-mode or font-position
          // getter: each is readable only from the state struct (U8g2lib.h
          // getU8g2(), u8g2.h struct u8g2_struct).
          saved_font_(display.getU8g2()->font),
          saved_font_position_(display.getU8g2()->font_calc_vref),
          saved_draw_color_(display.getDrawColor()),
          saved_font_mode_(display.getU8g2()->font_decode.is_transparent),
          saved_bitmap_mode_(display.getU8g2()->bitmap_transparency)
#ifdef U8G2_WITH_FONT_ROTATION
          ,
          saved_direction_(display.getU8g2()->font_decode.dir)
#endif
    {
        // Every text widget positions glyphs by their top edge (§11.3).
        display_.setFontPosTop();
#ifdef U8G2_WITH_FONT_ROTATION
        display_.setFontDirection(0);
#endif
    }

    /** @brief Restore every item captured at construction. */
    ~u8g2gl_state_saver() {
        display_.setDrawColor(saved_draw_color_);
        display_.setFontMode(saved_font_mode_);
        display_.setBitmapMode(saved_bitmap_mode_);
#ifdef U8G2_WITH_FONT_ROTATION
        display_.setFontDirection(saved_direction_);
#endif
        // No setter takes an arbitrary position function, so the captured
        // pointer is written back as it was read.
        display_.getU8g2()->font_calc_vref = saved_font_position_;

        // A null font is written back directly. setFont(nullptr) would make
        // u8g2_SetFont() read the font header at address 0 (u8g2_font.c), and
        // a display that has had begin() but never setFont() holds exactly
        // that. The widget's font metrics stay behind in the struct, which is
        // harmless: the next setFont() sees a different pointer and reads them
        // afresh.
        if (saved_font_ == nullptr) {
            display_.getU8g2()->font = nullptr;
        } else {
            display_.setFont(saved_font_);
        }
    }

    // Non-copyable, non-movable: a copy would restore the same state twice.
    u8g2gl_state_saver(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver& operator=(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver(u8g2gl_state_saver&&) = delete;
    u8g2gl_state_saver& operator=(u8g2gl_state_saver&&) = delete;

private:
    // Pointers first, then bytes, so the bytes share one trailing word.
    U8G2& display_;
    const uint8_t* saved_font_;
    u8g2_font_calc_vref_fnptr saved_font_position_;
    uint8_t saved_draw_color_;
    uint8_t saved_font_mode_;
    uint8_t saved_bitmap_mode_;
#ifdef U8G2_WITH_FONT_ROTATION
    uint8_t saved_direction_;
#endif
};

#endif // U8G2GL_STATE_SAVER_H
