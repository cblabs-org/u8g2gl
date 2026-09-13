/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_label.h
 *
 * Purpose: The single text widget. Displays string literals and bound text
 *          subjects, with overflow behaviour selected by `long_mode`
 *          ([D-19], design_spec.md §6.3) rather than by choosing between two
 *          widget classes. PR-3R WO2 absorbed the former
 *          u8g2gl_scrolling_label here as `long_mode="scroll_circular"`'s
 *          continuous-wrap marquee. PR-3R WO2b corrected `long_mode="scroll"`
 *          itself to reverse at each end, per design_spec.md §6 and [D-19] —
 *          it had inherited the wrap mechanic by mistake; see
 *          set_long_mode() for the full account.
 *
 *          Designed without internal string buffers to eliminate RAM
 *          duplication on constrained microcontrollers; text is referenced by
 *          pointer from code flash or subject storage. The scroll-state
 *          members below are the accepted cost of the merge — every label now
 *          carries them, whether it scrolls or not — see [D-19]'s cost
 *          analysis for why that is cheap in practice.
 *
 * Description: Declarations for the u8g2gl_label widget class: text and
 *              overflow-mode accessors, marquee scroll configuration, and the
 *              style-driven rendering and tick lifecycles.
 *
 * Exported Classes:
 * - u8g2gl_label: The framework's text display widget, inheriting from u8g2gl_obj.
 *
 *     Content:
 *     - set_text():              Set pointer to text string (zero-copy)
 *     - get_text():              Retrieve current text pointer
 *
 *     Overflow:
 *     - set_long_mode():         Select clip / dots / scroll / scroll_circular
 *     - get_long_mode():         Query the current overflow mode
 *
 *     Scroll configuration (meaningful only under a scrolling long_mode):
 *     - set_scroll_px_per_sec(): Set scroll speed in pixels per second
 *     - set_initial_delay_ms():  Set delay before scrolling starts
 *     - set_static_dwell_ms():   Set dwell duration for text that fits
 *     - is_scroll_finished():    Whether a scroll cycle or dwell has elapsed
 *     - reset_scroll():          Rewind scroll offset and reset timers
 *
 *     Lifecycle (overrides):
 *     - tick():                  Advance marquee state; idle outside scroll modes
 *     - render():                Draw text per the resolved long_mode
 *     - render_animation_update(): Targeted partial refresh during blocked loop
 */
#ifndef U8G2GL_LABEL_H
#define U8G2GL_LABEL_H

#include <cstdint>
#include "u8g2gl_obj.h"
#include "u8g2gl_types.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief The framework's text display widget.
 *
 * Renders static or bound text on monochrome U8G2 displays. Holds only a
 * pointer to the string (`text_`) to guarantee zero-copy operation and minimal
 * memory footprint. Styling (font, draw color, font mode, alignment) is
 * inherited from the base `u8g2gl_obj` style definition; overflow behaviour is
 * this class's own `long_mode` property ([D-19]).
 */
class u8g2gl_label : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a label with null text, `long_mode="clip"`, default object
     * coordinates and flags, and the marquee defaults documented on
     * set_scroll_px_per_sec() / set_initial_delay_ms() / set_static_dwell_ms().
     * Required by the §13.7 declarative instantiation contract.
     */
    u8g2gl_label() = default;

    // --- Content ---

    /**
     * @brief Set the text string to be displayed.
     *
     * Stores the pointer directly without copying or allocating memory. The
     * caller (or owning subject) must ensure the buffer remains valid while in
     * use. A pointer that actually changes invalidates measured layout (so
     * `dots` and the scrolling modes remeasure on the next render), resets
     * scroll-finished state, and marks the object dirty; re-setting the same
     * pointer is a no-op.
     *
     * @param text Pointer to null-terminated UTF-8 string, or nullptr to clear.
     */
    void set_text(const char* text);

    /**
     * @brief Retrieve the current text pointer.
     *
     * @return Pointer to null-terminated UTF-8 string, or nullptr if none set.
     */
    const char* get_text() const;

    // --- Overflow ([D-19]) ---

    /**
     * @brief Select how text wider than the widget is handled.
     *
     * | Value               | Behaviour                                        |
     * |---------------------|---------------------------------------------------|
     * | U8G2GL_LONG_CLIP    | Hard clip at the widget bounds. **Default.**       |
     * | U8G2GL_LONG_DOTS    | Truncate with an ellipsis.                         |
     * | U8G2GL_LONG_SCROLL  | Marquee; see below.                                |
     * | U8G2GL_LONG_SCROLL_CIRCULAR | Marquee that never signals completion.     |
     *
     * There is no `wrap` value. U8G2GL labels are single-line by design — there
     * is no runtime layout pass to re-flow a second line into ([D-7]) — so a
     * user arriving from LVGL Pro, where `long_mode` includes `LV_LABEL_LONG_WRAP`,
     * will meet this omission. It is deliberate, not an oversight.
     *
     * `U8G2GL_LONG_SCROLL` and `U8G2GL_LONG_SCROLL_CIRCULAR` share the same
     * marquee mechanics but diverge in what happens once the text reaches an
     * end — matching LVGL exactly (`LV_LABEL_LONG_SCROLL` bounces,
     * `LV_LABEL_LONG_SCROLL_CIRCULAR` wraps continuously), because §1.4 makes
     * that familiarity a goal:
     *
     * - `U8G2GL_LONG_SCROLL` **reverses**: it scrolls left until the text's
     *   far edge reaches the widget's opposite bound, dwells there for
     *   `static_dwell_ms` (the same property that governs the static-fit
     *   dwell — one timing concept, not two), then scrolls back to the
     *   origin, dwells again, and repeats indefinitely. Because it never
     *   terminates, is_scroll_finished() always reports `false` for it — the
     *   same answer as `U8G2GL_LONG_SCROLL_CIRCULAR`, for the same reason:
     *   there is nothing for a message-rotation controller to wait on when a
     *   mode is designed to run forever. (PR-3R WO2 originally moved
     *   `u8g2gl_scrolling_label`'s continuous-wrap behaviour onto this value
     *   and latched completion on the first wrap; WO2b corrected both — the
     *   design spec's semantics table always specified reversing, and only
     *   the old widget's wrap survives under `scroll_circular` below.)
     * - `U8G2GL_LONG_SCROLL_CIRCULAR` **wraps**: it scrolls left continuously,
     *   re-entering smoothly from the right edge once the text has fully
     *   exited, and never signals completion — it is meant to loop forever
     *   with no external controller watching it.
     *
     * Changing the mode marks the frame dirty and invalidates measured layout
     * if the value actually changes.
     *
     * @param mode One of the U8G2GL_LONG_* values above.
     */
    void set_long_mode(u8g2gl_long_mode_t mode);

    /**
     * @brief Query the current overflow mode.
     * @return The value last passed to set_long_mode(), or U8G2GL_LONG_CLIP.
     */
    u8g2gl_long_mode_t get_long_mode() const;

    // --- Scroll configuration ---
    // Meaningful only when long_mode is U8G2GL_LONG_SCROLL or
    // U8G2GL_LONG_SCROLL_CIRCULAR; stored unconditionally so switching modes
    // at runtime does not lose a previously configured speed or timing.

    /**
     * @brief Set scroll speed in pixels per second.
     * @param px Speed in pixels per second (default: 25).
     */
    void set_scroll_px_per_sec(uint8_t px);

    /**
     * @brief Query configured scroll speed.
     * @return Speed in pixels per second.
     */
    uint8_t get_scroll_px_per_sec() const;

    /**
     * @brief Set initial pause delay before scrolling animation begins.
     * @param ms Delay in milliseconds (default: 3000).
     */
    void set_initial_delay_ms(uint16_t ms);

    /**
     * @brief Query initial pause delay.
     * @return Initial delay in milliseconds.
     */
    uint16_t get_initial_delay_ms() const;

    /**
     * @brief Set dwell timeout for text that fits (no scrolling needed) before
     *        signaling completion.
     * @param ms Dwell timeout in milliseconds past initial delay (default: 5000).
     */
    void set_static_dwell_ms(uint16_t ms);

    /**
     * @brief Query static dwell timeout.
     * @return Dwell timeout in milliseconds.
     */
    uint16_t get_static_dwell_ms() const;

    // --- Query ---

    /**
     * @brief Query whether a scroll cycle or static dwell has completed.
     *
     * Under U8G2GL_LONG_SCROLL and U8G2GL_LONG_SCROLL_CIRCULAR alike: always
     * false — both modes run their marquee indefinitely (one reversing, one
     * wrapping; see set_long_mode()), so neither has a cycle to signal as
     * finished. For text that fits (no scroll needed), true after the dwell
     * timeout expires. Meaningless outside a scrolling long_mode.
     *
     * @return true if the cycle or dwell has finished, false otherwise.
     */
    bool is_scroll_finished() const;

    /**
     * @brief Rewind scroll offset to origin and restart timing delays.
     */
    void reset_scroll();

    // --- Lifecycle ---

    /**
     * @brief Advance marquee animation state and report next deadline.
     *
     * Outside U8G2GL_LONG_SCROLL / U8G2GL_LONG_SCROLL_CIRCULAR this always
     * returns U8G2GL_IDLE — clip and dots are static text and never animate.
     *
     * @param now_ms Current timestamp in milliseconds.
     * @return Milliseconds until next tick deadline, or U8G2GL_IDLE.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the label into the U8G2 display buffer.
     *
     * Applies resolved styling (font, draw color, font mode), computes
     * vertical centering within widget bounds, and draws per the resolved
     * `long_mode` — see set_long_mode() for what each value does.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

    /**
     * @brief Targeted redraw for marquee animation while the main loop is blocked.
     *
     * No-op outside U8G2GL_LONG_SCROLL / U8G2GL_LONG_SCROLL_CIRCULAR. Advances
     * tick state, clears own bounding box, re-renders, and pushes updated
     * pixels via u8g2gl_partial_refresh().
     *
     * @param display U8G2 display context to draw into.
     * @param now_ms  Current timestamp in milliseconds.
     */
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    // u8g2gl_label::render_scroll
    // Marquee render path for U8G2GL_LONG_SCROLL / U8G2GL_LONG_SCROLL_CIRCULAR,
    // extracted so render()'s per-mode dispatch stays a single switch rather
    // than one long function mixing three unrelated drawing strategies.
    //   display — U8G2 display driver instance
    //   draw_y  — vertically-centered baseline-independent top y, already computed
    void render_scroll(U8G2& display, int16_t draw_y);

    // u8g2gl_label::render_static
    // Non-marquee render path shared by clip and dots: draws once, aligned
    // per style_.align, relying on the framework's ambient clip window (§11.3)
    // to hard-clip at the bounds. dots additionally overdraws an ellipsis when
    // the measured text is wider than the widget — see the .cpp for why this
    // needs no truncated copy of the string.
    //   display — U8G2 display driver instance
    //   draw_y  — vertically-centered top y, already computed
    //   dots    — true to overdraw the ellipsis when text overflows
    void render_static(U8G2& display, int16_t draw_y, bool dots);

    // Members ordered largest-alignment-first to prevent struct padding holes:
    // pointer (8B) -> uint32_t (4B) -> int16_t/uint16_t (2B) -> uint8_t/bool (1B).
    // Measured, not estimated (§1.3): sizeof(u8g2gl_label) is 80 bytes on a
    // 64-bit host, verified PR-3R WO9 — the ordering claim above is a
    // rationale, not a substitute for checking it against a real build (see
    // docs/decisions/d19-label-long-mode.md's cost correction, where an
    // arithmetic-only +16-byte estimate had missed 8 of the actual +24).
    // last_scroll_ms_ through scroll_finished_ are the former
    // u8g2gl_scrolling_label's members, moved unchanged (PR-3R WO2, [D-19]).
    const char* text_ = nullptr;          ///< Zero-copy string pointer
    uint32_t last_scroll_ms_ = 0;         ///< Timestamp of last or next scheduled tick step
    int16_t scroll_x_ = 0;                ///< Current marquee horizontal pixel offset
    int16_t message_width_ = 0;           ///< Measured text pixel width under active font
    uint16_t initial_delay_ms_ = 3000;    ///< Milliseconds before scroll begins
    uint16_t static_dwell_ms_ = 5000;     ///< Milliseconds before static text finishes
    uint8_t scroll_px_per_sec_ = 25;      ///< Marquee speed in pixels per second
    u8g2gl_long_mode_t long_mode_ = U8G2GL_LONG_CLIP;  ///< Overflow behaviour ([D-19])
    bool needs_scroll_ = false;           ///< True if a scrolling mode's text width > widget width
    bool needs_layout_ = true;            ///< True if text measurement is required
    bool scroll_finished_ = false;        ///< True when cycle or dwell completes
    bool overflow_ = false;               ///< True if measured text is wider than the widget
    bool scroll_forward_ = true;          ///< U8G2GL_LONG_SCROLL only: true while advancing away
                                           ///< from the origin, false while reversing back to it
                                           ///< (WO2b, [D-19]); unused by scroll_circular's wrap.
};

#endif // U8G2GL_LABEL_H
