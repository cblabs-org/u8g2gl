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
 *          top font positioning (setFontPosTop()), reference height over every
 *          glyph (setFontRefHeightAll()) and, where U8G2 is built with font
 *          rotation, direction 0. Every text widget computes its glyph box
 *          from the top edge and centres on the font's reference height, so it
 *          must not depend on what the caller left — a caller in U8G2's default
 *          baseline position would otherwise draw every label one font height
 *          too high, and one in U8G2's default text height mode would centre on
 *          'A' and 'g' rather than on the tallest glyph the label's box must
 *          hold. On destruction it puts
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
 *              establishes the framework's font position, reference height and
 *              direction, and restores the captured state on destruction
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

// U8G2's top-position function (u8g2_font.c). setFontPosTop() stores it in
// font_calc_vref, and comparing against it is the only way to tell whether top
// positioning is already in force; u8g2.h defines it with external linkage but
// does not declare it. The host stub defines it under the same name.
extern "C" u8g2_uint_t u8g2_font_calc_vref_top(u8g2_t* u8g2);

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
 * | Height mode    | `font_height_mode`             | yes — all        |
 * | Font direction | `font_decode.dir`              | yes — 0          |
 *
 * Font direction exists only when U8G2 is built with U8G2_WITH_FONT_ROTATION,
 * which u8g2.h defines by default; the guard follows that macro.
 *
 * The height mode decides which glyphs U8G2's reference ascent and descent
 * cover (u8g2_UpdateRefHeight(), u8g2_font.c): `A` and `g` under text, the
 * font's whole bounding box under all. getAscent(), getDescent() and the top,
 * centre and bottom font positions all read those reference heights. A label
 * clips to its own box, so the framework establishes all: the height it centres
 * on covers every glyph the font can draw.
 *
 * It does not save the clip window — see the file header for why, and who is
 * responsible instead.
 *
 * Cost: it compares before it sets, both when establishing the baseline and
 * when restoring, and calls a setter only for an item that differs. Each U8G2
 * setter is a single field assignment, but an out-of-line call into U8G2's C
 * library, where a comparison is one load. Measured against real U8G2 2.36.18
 * on a 64-bit arm host (-O2, 10^7 iterations, caller in baseline position),
 * construct + destruct around a label's own style changes took 6.5-6.9 ns
 * setting every item and 3.8-4.0 ns comparing first. A caller in U8G2's
 * default text height mode adds the two height-mode setters, each of which
 * recomputes the reference heights: 7.4-8.1 ns against 4.0-4.3 ns before the
 * mode was established; a caller already in all pays nothing for it
 * (3.9-4.0 ns). Nothing allocates, and setFont() reads a font header only when
 * the font actually changes.
 */
class u8g2gl_state_saver {
public:
    /**
     * @brief Capture the caller's state, then establish the framework's
     *        font position, reference height and direction.
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
          saved_bitmap_mode_(display.getU8g2()->bitmap_transparency),
          saved_height_mode_(display.getU8g2()->font_height_mode)
#ifdef U8G2_WITH_FONT_ROTATION
          ,
          saved_direction_(display.getU8g2()->font_decode.dir)
#endif
    {
        // Every text widget positions glyphs by their top edge (§11.3).
        // Compare first: see the class doc for the measured cost.
        if (saved_font_position_ != u8g2_font_calc_vref_top) {
            display_.setFontPosTop();
        }
        // Every text widget centres on the reference height, which must cover
        // every glyph its box holds. The setter recomputes the reference
        // heights from the current font, which is still the caller's; the
        // widget's own setFont() recomputes them again under this mode.
        if (saved_height_mode_ != U8G2_FONT_HEIGHT_MODE_ALL) {
            display_.setFontRefHeightAll();
        }
#ifdef U8G2_WITH_FONT_ROTATION
        if (saved_direction_ != 0) {
            display_.setFontDirection(0);
        }
#endif
    }

    /**
     * @brief Restore every item captured at construction, calling a setter
     *        only for an item that differs from what was captured.
     */
    ~u8g2gl_state_saver() {
        // --- Step 1: Read what the render left ---
        u8g2_t* const state = display_.getU8g2();

        // --- Step 2: Restore each item that changed ---
        if (state->draw_color != saved_draw_color_) {
            display_.setDrawColor(saved_draw_color_);
        }
        if (state->font_decode.is_transparent != saved_font_mode_) {
            display_.setFontMode(saved_font_mode_);
        }
        if (state->bitmap_transparency != saved_bitmap_mode_) {
            display_.setBitmapMode(saved_bitmap_mode_);
        }
#ifdef U8G2_WITH_FONT_ROTATION
        if (state->font_decode.dir != saved_direction_) {
            display_.setFontDirection(saved_direction_);
        }
#endif
        // No setter takes an arbitrary position function, so the captured
        // pointer is written back as it was read.
        state->font_calc_vref = saved_font_position_;

        // --- Step 3: Restore the font, then the height mode ---
        // A null font is written back directly. setFont(nullptr) would make
        // u8g2_SetFont() read the font header at address 0 (u8g2_font.c), and
        // a display that has had begin() but never setFont() holds exactly
        // that. The widget's font metrics stay behind in the struct, which is
        // harmless: the next setFont() sees a different pointer and reads them
        // afresh. The comparison spares the call u8g2_SetFont() would make only
        // to find the font unchanged.
        if (state->font != saved_font_) {
            if (saved_font_ == nullptr) {
                state->font = nullptr;
            } else {
                display_.setFont(saved_font_);
            }
        }
        // The height mode comes after the font: each height-mode setter
        // recomputes the reference heights from the font current at the call
        // (u8g2_UpdateRefHeight(), u8g2_font.c), so restoring it last makes
        // that final computation the caller's own font in the caller's own
        // mode, whether or not setFont() ran above. On a null font the setter
        // returns before reading anything, and only the mode is put back;
        // the next setFont() computes the heights afresh.
        if (state->font_height_mode != saved_height_mode_) {
            restore_height_mode();
        }
    }

    // Non-copyable, non-movable: a copy would restore the same state twice.
    u8g2gl_state_saver(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver& operator=(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver(u8g2gl_state_saver&&) = delete;
    u8g2gl_state_saver& operator=(u8g2gl_state_saver&&) = delete;

private:
    // U8G2 has no setter that takes a mode value: one setter per mode (u8g2.h
    // U8G2_FONT_HEIGHT_MODE_*). u8g2_UpdateRefHeight() treats any value other
    // than text or extended text as all, so a value outside the three gets
    // all's reference heights and then its own value written back, which
    // returns the struct exactly as captured.
    void restore_height_mode() {
        switch (saved_height_mode_) {
            case U8G2_FONT_HEIGHT_MODE_TEXT:
                display_.setFontRefHeightText();
                break;
            case U8G2_FONT_HEIGHT_MODE_XTEXT:
                display_.setFontRefHeightExtendedText();
                break;
            default:
                display_.setFontRefHeightAll();
                display_.getU8g2()->font_height_mode = saved_height_mode_;
                break;
        }
    }

    // Pointers first, then bytes, so the bytes share one trailing word.
    U8G2& display_;
    const uint8_t* saved_font_;
    u8g2_font_calc_vref_fnptr saved_font_position_;
    uint8_t saved_draw_color_;
    uint8_t saved_font_mode_;
    uint8_t saved_bitmap_mode_;
    uint8_t saved_height_mode_;
#ifdef U8G2_WITH_FONT_ROTATION
    uint8_t saved_direction_;
#endif
};

#endif // U8G2GL_STATE_SAVER_H
