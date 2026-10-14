/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_clock.h
 *
 * Purpose: Real-time clock display widget with right-aligned digit columns,
 *          1Hz colon blink animation, and optional secondary font for seconds.
 *          Ports core behavior from legacy ClockWidget while adhering to U8G2GL's
 *          strict zero-heap memory discipline ([D-1], [PD-3]) and service-free
 *          component architecture. Rejects service dependency injection (such as
 *          TimeManager pointers); epoch seconds are received via set_time() or
 *          subject data binding.
 *
 * Description: Declarations for u8g2gl_clock widget class, including format
 *              selection (HH:MM or HH:MM:SS), secondary font assignment, blink
 *              animation control, epoch time input, and virtual lifecycle overrides.
 *
 * Exported Classes:
 * - u8g2gl_clock: Graphical clock widget inheriting from u8g2gl_obj.
 *
 *     Configuration:
 *     - set_format():         Select display format (HH_MM or HH_MM_SS)
 *     - set_secondary_font(): Set font used specifically for seconds digits
 *     - set_blink():          Enable or disable 1Hz colon blink animation
 *
 *     Time input:
 *     - set_time():           Update current time using raw epoch seconds (restarts the blink)
 *     - bind_time():          Drive the time from a time subject (§6.3, §8.1)
 *
 *     Query:
 *     - get_format():         Query configured clock format
 *     - get_secondary_font(): Query secondary font pointer
 *     - is_blink_enabled():   Query whether colon blinking is enabled
 *     - get_time():           Query current epoch seconds value
 *     - is_colon_visible():   Query current colon visibility state
 *
 *     Lifecycle (overrides):
 *     - tick():               Drift-free blink, locked to time changes; never 0
 *     - render():             Draw formatted time with dual-font baseline alignment
 *     - render_animation_update(): Targeted partial refresh during blocked loop
 *
 * Exported Types:
 * - u8g2gl_clock_format_t: Clock format enum (HH_MM or HH_MM_SS), explicit uint8_t base
 */
#ifndef U8G2GL_CLOCK_H
#define U8G2GL_CLOCK_H

#include <cstdint>
#include "u8g2gl_obj.h"
#include "u8g2gl_types.h"

// Forward declaration of U8G2 display class
class U8G2;

/// Clock display format
enum u8g2gl_clock_format_t : uint8_t {
    U8G2GL_CLOCK_HH_MM = 0,
    U8G2GL_CLOCK_HH_MM_SS = 1,
};

/**
 * @brief Real-time digital clock widget with blink animation and dual-font support.
 *
 * Renders formatted time (HH:MM or HH:MM:SS) with right-aligned digit columns to
 * eliminate horizontal jitter as digits transition. Supports an optional smaller
 * secondary font for seconds digits aligned to the primary font baseline.
 * Colon blinks at 1Hz (500ms on / 500ms off) when enabled.
 *
 * The time normally comes from a time subject that a u8g2gl_wall_clock keeps
 * current (bind_time()); the clock writes no seconds logic of its own. Its
 * tick() schedules only the blink, and the blink is locked to the time: each
 * change of value shows the colon and restarts the cycle, so with a wall clock
 * publishing on the second the colon appears with every new second.
 *
 * A time of U8G2GL_TIME_UNKNOWN renders as `--:--` (`--:--:--` in HH_MM_SS,
 * the seconds' dashes in the secondary font), in the same digit columns as a
 * real time, with a steady colon.
 */
class u8g2gl_clock : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a clock widget defaulting to HH_MM format with blinking enabled
     * and epoch seconds at 0 (00:00).
     */
    u8g2gl_clock() = default;

    // --- Configuration ---

    /**
     * @brief Set the clock display format.
     *
     * @param fmt U8G2GL_CLOCK_HH_MM or U8G2GL_CLOCK_HH_MM_SS.
     */
    void set_format(u8g2gl_clock_format_t fmt);

    /**
     * @brief Set an optional secondary font for seconds digits.
     *
     * In HH_MM_SS mode, seconds digits and the preceding colon are rendered
     * using this font and bottom-aligned with the primary font baseline.
     *
     * @param font Pointer to U8G2 font data array, or nullptr to use primary font.
     */
    void set_secondary_font(const uint8_t* font);

    /**
     * @brief Toggle the 1Hz colon blink animation.
     *
     * When disabled, the colon remains continuously visible.
     *
     * @param enable True to blink every 500ms, false for solid colon.
     */
    void set_blink(bool enable);

    // --- Time input ---

    /**
     * @brief Update the clock time with raw epoch seconds.
     *
     * Decomposes seconds into hours, minutes, and seconds via integer arithmetic.
     * Does not require framework time services or external clock objects.
     *
     * A change of value shows the colon and restarts the blink cycle from the
     * next tick(), so seconds and colon move together. Setting the value it
     * already holds changes nothing.
     *
     * @param epoch_seconds Seconds since UNIX epoch (or seconds since midnight),
     *                      or U8G2GL_TIME_UNKNOWN to render `--:--`.
     */
    void set_time(uint32_t epoch_seconds);

    /**
     * @brief Drive the displayed time from a time subject.
     *
     * The clock's primary binding (§6.3) and the call §13.12's generated code
     * emits for `bind_time=`. The subject's current value is applied at once,
     * and every later change goes through set_time(), so the frame is marked
     * dirty only when the time actually changes.
     *
     * Consumes one binding-pool slot and one observer slot on @p subject.
     *
     * @param subject Time subject (Unix epoch seconds). Must outlive this object.
     * @return false if @p subject is null, or the binding pool or the subject's
     *         observer capacity is exhausted; no binding is registered.
     */
    bool bind_time(u8g2gl_subject_time_base* subject);

    // --- Query ---

    /**
     * @brief Retrieve the active clock format.
     *
     * @return U8G2GL_CLOCK_HH_MM or U8G2GL_CLOCK_HH_MM_SS.
     */
    u8g2gl_clock_format_t get_format() const;

    /**
     * @brief Retrieve the secondary font pointer.
     *
     * @return Pointer to secondary font, or nullptr if none set.
     */
    const uint8_t* get_secondary_font() const;

    /**
     * @brief Query whether colon blinking is enabled.
     *
     * @return True if blinking is active, false if solid.
     */
    bool is_blink_enabled() const;

    /**
     * @brief Retrieve the current epoch seconds value.
     *
     * @return Epoch seconds stored in widget.
     */
    uint32_t get_time() const;

    /**
     * @brief Query whether the colon is currently visible in the blink cycle.
     *
     * @return True if colon is visible, false if hidden during blink phase.
     */
    bool is_colon_visible() const;

    // --- Lifecycle ---

    /**
     * @brief Update blink animation state and return next deadline.
     *
     * When blink is enabled, toggles the colon every 500 ms, each toggle due
     * 500 ms after the previous one's due time; a call 500 ms or more late
     * toggles once and resyncs from @p now_ms. The first tick after a time
     * change or after blink is enabled starts a new cycle with the colon shown.
     *
     * Blink off, or the time unknown, returns U8G2GL_IDLE: the per-second
     * deadline belongs to the wall clock's timer, not to this widget.
     *
     * @param now_ms Current system timestamp in milliseconds.
     * @return Milliseconds until the next blink toggle, never 0; or U8G2GL_IDLE.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the clock into the U8G2 display buffer.
     *
     * Draws hours, colon, minutes, and optional seconds using right-aligned
     * digit columns and baseline alignment.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

    /**
     * @brief Targeted redraw during blocked execution loops.
     *
     * Advances blink state, and if visual state changed, redraws widget bounds
     * and pushes updated pixels via u8g2gl_partial_refresh().
     *
     * @param display U8G2 display context to draw into.
     * @param now_ms Current timestamp in milliseconds.
     */
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    /**
     * @brief Observer callback for bind_time(); applies the subject's value.
     * @param binding Binding handle from u8g2gl_obj::add_value_binding().
     */
    static void on_time_changed(void* binding);

    // Members ordered largest-alignment-first to prevent struct padding holes:
    // pointer (8B) -> uint32_t (4B) -> uint8_t/bool/enum (1B)
    const uint8_t* secondary_font_ = nullptr;            ///< Optional font for seconds digits
    uint32_t epoch_seconds_ = 0;                         ///< Stored epoch time in seconds
    uint32_t next_blink_due_ms_ = 0;                     ///< When the next colon toggle is due
    u8g2gl_clock_format_t format_ = U8G2GL_CLOCK_HH_MM;  ///< Active display format mode
    bool show_colon_ = true;                             ///< Current colon visibility state
    bool blink_enabled_ = true;                          ///< Whether colon blink animation is enabled
    /// The next tick() starts a new blink cycle. Also the "not started" state: a
    /// due time of 0 is a legitimate tick, so it cannot double as a sentinel.
    bool blink_restart_ = true;
};

#endif // U8G2GL_CLOCK_H
