/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_wall_clock.cpp
 * Purpose: Verifies the wall-clock helper (§11.1) against a fake host clock:
 *          the subject is published at once and then on each second boundary,
 *          the deadline is the time to that boundary, an unknown time is
 *          published as U8G2GL_TIME_UNKNOWN until it becomes known, and a loop
 *          that sleeps for the returned deadline sees every second exactly
 *          once — with wake-up jitter, and with a host clock that runs slow
 *          against the tick.
 *
 * Description: GoogleTest cases driving u8g2gl_timer_handler() directly with a
 *              fake tick and a fake time function derived from it.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_timer.h"
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_wall_clock.h"

#include <cstdint>

namespace {

uint32_t s_now = 0;                 // the tick, in ms
uint64_t s_host_offset_ms = 0;      // host wall time at tick 0, in ms
uint32_t s_host_rate_ppm = 1000000; // host ms per 10^6 tick ms (1 000 000 = in step)
bool s_time_known = true;
int s_time_fn_calls = 0;

uint32_t fake_tick() {
    return s_now;
}

uint64_t host_ms() {
    return s_host_offset_ms + static_cast<uint64_t>(s_now) * s_host_rate_ppm / 1000000u;
}

bool fake_time(uint32_t* epoch_seconds, uint16_t* millis_into_second) {
    ++s_time_fn_calls;
    if (!s_time_known) {
        return false;
    }
    const uint64_t ms = host_ms();
    *epoch_seconds = static_cast<uint32_t>(ms / 1000u);
    *millis_into_second = static_cast<uint16_t>(ms % 1000u);
    return true;
}

/// Records every change the subject notifies, and when it arrived.
struct change_log {
    u8g2gl_subject_time_base* subject = nullptr;
    int changes = 0;
    uint32_t last_value = 0;
    uint32_t last_change_tick = 0;
};

void on_change(void* user_data) {
    auto* log = static_cast<change_log*>(user_data);
    ++log->changes;
    log->last_value = log->subject->get();
    log->last_change_tick = s_now;
}

class WallClock : public ::testing::Test {
protected:
    void SetUp() override {
        s_now = 0;
        s_host_offset_ms = 1700000000ull * 1000u + 250u;   // 250 ms into a second
        s_host_rate_ppm = 1000000;
        s_time_known = true;
        s_time_fn_calls = 0;
        u8g2gl_set_tick_cb(fake_tick);
    }
    void TearDown() override {
        u8g2gl_set_tick_cb(nullptr);
    }

    static uint32_t run_at(uint32_t now) {
        s_now = now;
        return u8g2gl_timer_handler(now);
    }
};

}  // namespace

TEST_F(WallClock, PublishesAtOnceOnInit) {
    u8g2gl_subject_time subject(0);
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, fake_time);
    EXPECT_EQ(subject.get(), 1700000000u);
    EXPECT_EQ(s_time_fn_calls, 1);
}

TEST_F(WallClock, DeadlineIsTheTimeToTheNextBoundary) {
    u8g2gl_subject_time subject(0);
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, fake_time);   // 250 ms into the second

    EXPECT_EQ(run_at(0), 750u);
    EXPECT_EQ(run_at(600), 150u);
    EXPECT_EQ(subject.get(), 1700000000u);
}

TEST_F(WallClock, PublishesTheNewSecondAtTheBoundary) {
    u8g2gl_subject_time subject(0);
    change_log log;
    log.subject = &subject;
    ASSERT_TRUE(subject.add_observer(&log, on_change));
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, fake_time);
    log.changes = 0;

    EXPECT_EQ(run_at(749), 1u);
    EXPECT_EQ(log.changes, 0);
    EXPECT_EQ(run_at(750), 1000u);   // exactly on the boundary: next is a second away
    EXPECT_EQ(log.changes, 1);
    EXPECT_EQ(subject.get(), 1700000001u);

    // Woken 7 ms late: published, and the next deadline lands on the boundary.
    EXPECT_EQ(run_at(1757), 993u);
    EXPECT_EQ(subject.get(), 1700000002u);
}

TEST_F(WallClock, UnknownThenKnown) {
    s_time_known = false;
    u8g2gl_subject_time subject(42);
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, fake_time);

    EXPECT_EQ(subject.get(), U8G2GL_TIME_UNKNOWN);
    EXPECT_EQ(run_at(0), 1000u);     // retried in a second
    EXPECT_EQ(run_at(1000), 1000u);
    EXPECT_EQ(subject.get(), U8G2GL_TIME_UNKNOWN);

    // NTP syncs at 1500 ms; the next retry, at 2000, finds the time and aligns.
    s_time_known = true;
    const uint32_t deadline = run_at(2000);
    const uint64_t host = host_ms();
    EXPECT_EQ(subject.get(), static_cast<uint32_t>(host / 1000u));
    EXPECT_EQ(deadline, 1000u - static_cast<uint32_t>(host % 1000u));
}

TEST_F(WallClock, KnownThenLost) {
    u8g2gl_subject_time subject(0);
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, fake_time);
    s_time_known = false;
    EXPECT_EQ(run_at(750), 1000u);
    EXPECT_EQ(subject.get(), U8G2GL_TIME_UNKNOWN);
}

TEST_F(WallClock, NullTimeFunctionIsNeverKnown) {
    u8g2gl_subject_time subject(0);
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, nullptr);
    EXPECT_EQ(subject.get(), U8G2GL_TIME_UNKNOWN);
    EXPECT_EQ(run_at(0), 1000u);
}

TEST_F(WallClock, MillisecondsOutOfRangeNeverGiveZeroDelay) {
    struct leap {
        static bool fn(uint32_t* secs, uint16_t* ms) {
            *secs = 100;
            *ms = 1000;   // a leap second, or a careless conversion
            return true;
        }
    };
    u8g2gl_subject_time subject(0);
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, leap::fn);
    EXPECT_EQ(run_at(0), 1u);
}

TEST_F(WallClock, DestroyedWallClockStopsPublishing) {
    u8g2gl_subject_time subject(0);
    {
        u8g2gl_wall_clock wc;
        u8g2gl_wall_clock_init(&wc, &subject, fake_time);
    }
    EXPECT_EQ(run_at(750), U8G2GL_IDLE);
    EXPECT_EQ(subject.get(), 1700000000u);
}

namespace {

// Drives a loop that sleeps for the deadline and wakes 0–3 ms late, for
// `seconds` host seconds, and checks every second arrives once, in order,
// within `max_late_ms` of its boundary on the host clock.
void run_for_seconds(int seconds, uint32_t max_late_ms) {
    u8g2gl_subject_time subject(0);
    change_log log;
    log.subject = &subject;
    ASSERT_TRUE(subject.add_observer(&log, on_change));
    u8g2gl_wall_clock wc;
    u8g2gl_wall_clock_init(&wc, &subject, fake_time);
    const uint32_t first = subject.get();
    log.changes = 0;

    uint32_t now = 0;
    uint32_t sleep_ms = u8g2gl_timer_handler(now);
    uint32_t lcg = 777;
    int prev_changes = 0;
    while (log.changes < seconds) {
        lcg = lcg * 1103515245u + 12345u;
        now += sleep_ms + (lcg >> 16) % 4;
        s_now = now;
        sleep_ms = u8g2gl_timer_handler(now);
        ASSERT_NE(sleep_ms, 0u);
        ASSERT_NE(sleep_ms, U8G2GL_IDLE);
        ASSERT_LT(now, 1000u * static_cast<uint32_t>(seconds + 2)) << "stalled";
        if (log.changes != prev_changes) {
            ASSERT_EQ(log.changes, prev_changes + 1);
            // No second skipped, none repeated.
            ASSERT_EQ(log.last_value, first + static_cast<uint32_t>(log.changes));
            // Published within the jitter (plus any host-rate catch-up) of the
            // host boundary it belongs to.
            const uint32_t into_second = static_cast<uint32_t>(host_ms() % 1000u);
            ASSERT_LE(into_second, max_late_ms) << "second " << log.changes;
            prev_changes = log.changes;
        }
    }
    EXPECT_EQ(log.changes, seconds);
}

}  // namespace

TEST_F(WallClock, NoSkippedOrDuplicatedSecondsOver120sWithJitter) {
    run_for_seconds(120, 3);
}

// A host clock 0.1% slow against the tick wakes the timer just before each
// boundary. It must republish the unchanged second (no notification) and wake
// again at the boundary, not skip or duplicate.
TEST_F(WallClock, HostClockRunningSlowNeitherSkipsNorRepeats) {
    s_host_rate_ppm = 999000;
    run_for_seconds(120, 4);
}

TEST_F(WallClock, HostClockRunningFastNeitherSkipsNorRepeats) {
    s_host_rate_ppm = 1001000;
    run_for_seconds(120, 4);
}
