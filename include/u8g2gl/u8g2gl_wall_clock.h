/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_wall_clock.h
 * Purpose: Keeps a time subject equal to the wall-clock time, second by second,
 *          with no code in the application's loop. A developer who adds a clock
 *          should not have to write seconds logic: they declare one of these,
 *          point it at the subject their clock binds to, and give it a function
 *          that reads the time. ui_handler() does the rest (§11.1).
 *
 *          It is the timer-writes-a-subject idiom (u8g2gl_timer.h) applied to
 *          the one time source every clock needs. Its timer is re-aimed at the
 *          next second boundary on every run, so the subject changes within a
 *          millisecond of the second changing and the loop sleeps in between —
 *          rather than polling, or running a 1 s timer that drifts against the
 *          host's clock.
 *
 *          Deliberately generic. Where the time comes from — NTP, an RTC, a
 *          GPS — and which time zone it is in are the host's business; the
 *          library makes no platform call. Concrete sources belong to the host
 *          project.
 *
 * Description: The host's time-function type, the u8g2gl_wall_clock object the
 *              host declares, and its init function.
 *
 *              Thread safety: none, as for timers. The time function is called
 *              from inside ui_handler(), on its thread.
 *
 * Exported Types:
 * - u8g2gl_wall_time_cb_t: Host time function; false while the time is unknown
 * - u8g2gl_wall_clock:     Host-owned helper containing its timer
 *
 * Exported Functions:
 * - u8g2gl_wall_clock_init(): Publish the time now, then on every second boundary
 */
#ifndef U8G2GL_WALL_CLOCK_H
#define U8G2GL_WALL_CLOCK_H

#include <cstdint>
#include "u8g2gl_subject.h"
#include "u8g2gl_timer.h"

/**
 * @brief The host's time function: the only thing the host supplies.
 *
 * @param[out] epoch_seconds      The time to display, in seconds. Return the
 *                                **local** epoch the clock should show: the
 *                                library applies no time zone or daylight
 *                                saving, so a host that keeps UTC adds its
 *                                offset here.
 * @param[out] millis_into_second How far into that second the time is, 0–999.
 *                                This is what aligns the next update to the
 *                                second boundary; a host whose source has only
 *                                whole seconds passes 0, and updates then land
 *                                up to a second late.
 * @return false while the time is unknown (before NTP has synced, say); the
 *         outputs are then ignored.
 */
using u8g2gl_wall_time_cb_t = bool (*)(uint32_t* epoch_seconds, uint16_t* millis_into_second);

/**
 * @brief Publishes the wall-clock time to a time subject on every second
 *        boundary.
 *
 * Declare one (static, or a member of the host's own object) and call
 * u8g2gl_wall_clock_init(). Each run of its timer reads the time and:
 * - **time known** — sets the subject to the epoch seconds, then schedules the
 *   next run for the next second boundary, `1000 − millis_into_second` ms away
 *   (at least 1 ms);
 * - **time unknown** — sets the subject to U8G2GL_TIME_UNKNOWN and tries again
 *   in 1000 ms.
 *
 * The subject notifies only when its value changes, so a bound u8g2gl_clock
 * redraws once per second and not on every run.
 *
 * Destroying the object unlinks its timer. Non-copyable and non-movable, like
 * the timer it contains.
 *
 * @code
 * static u8g2gl_wall_clock s_wall_clock;
 *
 * static bool read_time(uint32_t* secs, uint16_t* ms) {
 *     timeval tv;
 *     gettimeofday(&tv, nullptr);
 *     if (tv.tv_sec < 1700000000) return false;   // not synced yet
 *     *secs = static_cast<uint32_t>(tv.tv_sec + LOCAL_OFFSET_S);
 *     *ms = static_cast<uint16_t>(tv.tv_usec / 1000);
 *     return true;
 * }
 *
 * void setup() {
 *     u8g2gl_set_tick_cb(millis);
 *     u8g2gl_wall_clock_init(&s_wall_clock, &ui_subject_time, read_time);
 * }
 * @endcode
 */
class u8g2gl_wall_clock {
public:
    u8g2gl_wall_clock() = default;

private:
    friend void u8g2gl_wall_clock_init(u8g2gl_wall_clock*, u8g2gl_subject_time_base*, u8g2gl_wall_time_cb_t);

    /**
     * @brief Timer callback: publish, then re-aim the timer at the next boundary.
     * @param timer This wall clock's timer; its user data is the wall clock.
     */
    static void on_timer(u8g2gl_timer* timer);

    /**
     * @brief Read the time, write the subject, and say when to read it again.
     * @return Milliseconds to the next run, at least 1.
     */
    uint32_t publish();

    u8g2gl_timer timer_;                              ///< Runs publish(); linked by init
    u8g2gl_subject_time_base* subject_ = nullptr;     ///< Where the time is published
    u8g2gl_wall_time_cb_t time_fn_ = nullptr;         ///< The host's time function
};

/**
 * @brief Start publishing the wall-clock time to @p subject.
 *
 * Sets the subject at once — to the current time, or to U8G2GL_TIME_UNKNOWN —
 * so a bound clock never shows a stale value, then schedules the first update
 * for the next second boundary (or 1000 ms later, if the time is unknown).
 * Calling it again re-initialises the same wall clock; its timer is not linked
 * twice.
 *
 * Register the tick callback (u8g2gl_set_tick_cb()) first: the schedule is
 * measured on it.
 *
 * @param wall_clock Host-owned storage. Must stay at this address while in use.
 *                   Ignored if nullptr.
 * @param subject    Time subject to publish to. Must outlive @p wall_clock.
 *                   nullptr publishes nothing but keeps the timer running.
 * @param time_fn    The host's time function. nullptr is treated as a time
 *                   that is never known.
 */
void u8g2gl_wall_clock_init(u8g2gl_wall_clock* wall_clock,
                            u8g2gl_subject_time_base* subject,
                            u8g2gl_wall_time_cb_t time_fn);

#endif // U8G2GL_WALL_CLOCK_H
