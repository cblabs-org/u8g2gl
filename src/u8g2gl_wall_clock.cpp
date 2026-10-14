/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_wall_clock.cpp
 * Purpose: Implements the wall-clock helper (§11.1): one timer, re-aimed at the
 *          next second boundary each time it runs, writing a time subject from
 *          the host's time function. Everything platform-specific stays behind
 *          that function.
 *
 * Description: u8g2gl_wall_clock_init(), the timer callback, and publish(),
 *              which holds the boundary arithmetic.
 */
#include "u8g2gl/u8g2gl_wall_clock.h"
#include "u8g2gl/u8g2gl_types.h"

// The retry interval while the time is unknown. A second is often enough that
// a clock shows the time within a second of NTP syncing, and rare enough to
// cost nothing.
static constexpr uint32_t U8G2GL_WALL_CLOCK_RETRY_MS = 1000;

// u8g2gl_wall_clock_init
// Publishes at once, then links the timer with the first delay publish()
// computed. publish() runs before the timer exists, which is why it returns a
// delay rather than rescheduling the timer itself.
//   wall_clock — host-owned storage
//   subject    — time subject to write; may be nullptr
//   time_fn    — host time function; may be nullptr (time never known)
void u8g2gl_wall_clock_init(u8g2gl_wall_clock* wall_clock,
                            u8g2gl_subject_time_base* subject,
                            u8g2gl_wall_time_cb_t time_fn) {
    if (wall_clock == nullptr) {
        return;
    }
    wall_clock->subject_ = subject;
    wall_clock->time_fn_ = time_fn;
    const uint32_t first_delay_ms = wall_clock->publish();
    u8g2gl_timer_init(&wall_clock->timer_, &u8g2gl_wall_clock::on_timer, first_delay_ms, wall_clock);
}

// u8g2gl_wall_clock::on_timer
// Each run measures afresh how far it is to the next boundary, so the timer's
// "period" is really the gap to that boundary and changes every run. Reset
// (rather than the timer's own due-time step) is right here: the boundary is
// measured from the moment the time function was read, which is now.
//   timer — this wall clock's timer
void u8g2gl_wall_clock::on_timer(u8g2gl_timer* timer) {
    auto* wall_clock = static_cast<u8g2gl_wall_clock*>(u8g2gl_timer_get_user_data(timer));
    if (wall_clock == nullptr) {
        return;
    }
    const uint32_t delay_ms = wall_clock->publish();
    u8g2gl_timer_set_period(timer, delay_ms);
    u8g2gl_timer_reset(timer);
}

// u8g2gl_wall_clock::publish
// Reads the host's time once and writes the subject; returns the delay to the
// next read.
uint32_t u8g2gl_wall_clock::publish() {
    // --- Step 1: Read the time; unknown if the host says so or gave no function ---
    uint32_t epoch_seconds = 0;
    uint16_t millis_into_second = 0;
    const bool known = (time_fn_ != nullptr) && time_fn_(&epoch_seconds, &millis_into_second);

    // --- Step 2: Write the subject, and pick the delay to the next read ---
    if (!known) {
        if (subject_ != nullptr) {
            subject_->set(U8G2GL_TIME_UNKNOWN);
        }
        return U8G2GL_WALL_CLOCK_RETRY_MS;
    }
    if (subject_ != nullptr) {
        subject_->set(epoch_seconds);
    }

    // The next boundary is 1000 - ms away. A host reporting 1000 or more (a
    // leap second, or a careless conversion) is treated as the last
    // millisecond, so the delay stays at least 1 and the loop never spins.
    if (millis_into_second > 999) {
        millis_into_second = 999;
    }
    return 1000u - millis_into_second;
}
