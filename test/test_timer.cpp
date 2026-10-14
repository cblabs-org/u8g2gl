/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_timer.cpp
 * Purpose: Verifies host-owned timers (§11.1) at the level of the handler,
 *          without a screen: due-time scheduling that does not drift, one run
 *          and a resync after a stall, the LVGL-named controls, the handler's
 *          deadline, and the guards that let a callback rearrange the list it
 *          is being run from.
 *
 * Description: GoogleTest cases driving u8g2gl_timer_handler() directly with a
 *              fake tick. Every timer lives on a test's stack, so its
 *              destructor unlinks it and no test can leak a timer into the next.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_timer.h"
#include "u8g2gl/u8g2gl_types.h"

#include <cstdint>

namespace {

uint32_t s_now = 0;
uint32_t fake_tick() {
    return s_now;
}

/// Per-timer record a callback writes into, through the timer's user data.
struct run_log {
    int runs = 0;
    uint32_t last_run_ms = 0;
};

void count_run(u8g2gl_timer* t) {
    auto* log = static_cast<run_log*>(u8g2gl_timer_get_user_data(t));
    ++log->runs;
    log->last_run_ms = s_now;
}

class Timer : public ::testing::Test {
protected:
    void SetUp() override {
        s_now = 0;
        u8g2gl_set_tick_cb(fake_tick);
    }
    void TearDown() override {
        u8g2gl_set_tick_cb(nullptr);
    }

    /// Advance the fake clock and run one handler pass.
    static uint32_t run_at(uint32_t now) {
        s_now = now;
        return u8g2gl_timer_handler(now);
    }
};

}  // namespace

TEST_F(Timer, NoTimersIsIdle) {
    EXPECT_EQ(run_at(0), U8G2GL_IDLE);
    EXPECT_EQ(run_at(12345), U8G2GL_IDLE);
}

TEST_F(Timer, FirstRunIsOnePeriodAfterInit) {
    run_log log;
    u8g2gl_timer t;
    s_now = 40;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    EXPECT_EQ(run_at(40), 100u);
    EXPECT_EQ(run_at(139), 1u);
    EXPECT_EQ(log.runs, 0);
    EXPECT_EQ(run_at(140), 100u);   // due exactly: runs, next due at 240
    EXPECT_EQ(log.runs, 1);
}

// The headline property: an app that sleeps for the returned deadline and then
// wakes 0–3 ms late gets exactly one run per period, and every run stays within
// the jitter of its ideal time — lateness does not accumulate, as it does when
// the next run is scheduled from when the last one happened (LVGL).
TEST_F(Timer, DriftFreeOverThousandPeriodsWithJitter) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    uint32_t now = 0;
    uint32_t sleep_ms = run_at(now);
    uint32_t lcg = 12345;
    int max_lateness = 0;
    while (log.runs < 1000) {
        lcg = lcg * 1103515245u + 12345u;
        const uint32_t jitter = (lcg >> 16) % 4;   // 0..3 ms
        now += sleep_ms + jitter;
        const int before = log.runs;
        sleep_ms = run_at(now);
        ASSERT_NE(sleep_ms, 0u);
        if (log.runs != before) {
            const int lateness = static_cast<int>(now - static_cast<uint32_t>(log.runs) * 100u);
            ASSERT_GE(lateness, 0);
            ASSERT_LE(lateness, 3) << "run " << log.runs << " at " << now;
            if (lateness > max_lateness) {
                max_lateness = lateness;
            }
        }
    }
    EXPECT_EQ(log.runs, 1000);
    // 1000 periods of 100 ms end at 100 000 ms, plus at most the last jitter.
    EXPECT_GE(now, 100000u);
    EXPECT_LE(now, 100003u);
}

TEST_F(Timer, StallRunsOnceAndResyncs) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    // Ten periods missed: one run, not ten, and the next is a period from now.
    EXPECT_EQ(run_at(1050), 100u);
    EXPECT_EQ(log.runs, 1);
    EXPECT_EQ(run_at(1100), 50u);
    EXPECT_EQ(log.runs, 1);
    EXPECT_EQ(run_at(1150), 100u);
    EXPECT_EQ(log.runs, 2);
}

TEST_F(Timer, LateByLessThanPeriodKeepsPhase) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    EXPECT_EQ(run_at(199), 1u);     // 99 ms late: next still due at 200
    EXPECT_EQ(log.runs, 1);
    EXPECT_EQ(run_at(200), 100u);
    EXPECT_EQ(log.runs, 2);
}

TEST_F(Timer, RepeatCountPausesWhenExhausted) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);
    u8g2gl_timer_set_repeat_count(&t, 3);

    run_at(100);
    run_at(200);
    EXPECT_EQ(run_at(300), U8G2GL_IDLE);   // third run exhausts it: paused
    EXPECT_EQ(log.runs, 3);
    EXPECT_EQ(run_at(400), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 3);

    // Still linked: a new count and a resume bring it back. Resumed after its
    // due time (400), it runs on the next pass and resyncs.
    u8g2gl_timer_set_repeat_count(&t, 1);
    u8g2gl_timer_resume(&t);
    EXPECT_EQ(run_at(450), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 4);
}

TEST_F(Timer, RepeatCountZeroPausesAtOnce) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);
    u8g2gl_timer_set_repeat_count(&t, 0);
    EXPECT_EQ(run_at(100), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 0);
}

namespace {
void extend_on_last_run(u8g2gl_timer* t) {
    count_run(t);
    auto* log = static_cast<run_log*>(u8g2gl_timer_get_user_data(t));
    if (log->runs == 1) {
        u8g2gl_timer_set_repeat_count(t, 2);   // two more after this one
    }
}
}  // namespace

TEST_F(Timer, CallbackCanExtendRepeatCountOnLastRun) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, extend_on_last_run, 100, &log);
    u8g2gl_timer_set_repeat_count(&t, 1);

    EXPECT_EQ(run_at(100), 100u);   // last run, but the callback extended it
    run_at(200);
    EXPECT_EQ(run_at(300), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 3);
}

TEST_F(Timer, PauseAndResume) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    u8g2gl_timer_pause(&t);
    EXPECT_EQ(run_at(100), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 0);

    // The kept due time (100) stands: resumed at 150, it runs on the next pass,
    // 50 ms late, so the phase is kept and the next run is due at 200.
    s_now = 150;
    u8g2gl_timer_resume(&t);
    EXPECT_EQ(run_at(150), 50u);
    EXPECT_EQ(log.runs, 1);
    EXPECT_EQ(run_at(160), 40u);
}

TEST_F(Timer, ResumeAfterLongPauseDoesNotWrapIntoFuture) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);   // due at 100
    u8g2gl_timer_pause(&t);

    // 2^31 + 50 ms later the kept due time looks 2^31 - 50 ms in the future.
    s_now = 100u + 0x80000000u + 50u;
    u8g2gl_timer_resume(&t);
    run_at(s_now);
    EXPECT_EQ(log.runs, 1);
}

TEST_F(Timer, ReadyMakesItDueNow) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    s_now = 30;
    u8g2gl_timer_ready(&t);
    EXPECT_EQ(run_at(30), 100u);   // runs, and resyncs a period from now
    EXPECT_EQ(log.runs, 1);
    EXPECT_EQ(run_at(129), 1u);
}

TEST_F(Timer, ResetRestartsThePeriodFromNow) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);

    s_now = 90;
    u8g2gl_timer_reset(&t);
    EXPECT_EQ(run_at(90), 100u);
    EXPECT_EQ(run_at(100), 90u);
    EXPECT_EQ(log.runs, 0);
    EXPECT_EQ(run_at(190), 100u);
    EXPECT_EQ(log.runs, 1);
}

TEST_F(Timer, SetPeriodMeasuresFromLastRun) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);
    run_at(100);                   // ran at 100; next due 200
    ASSERT_EQ(log.runs, 1);

    // Longer: due at last run + 300 = 400, whenever the change is made.
    s_now = 150;
    u8g2gl_timer_set_period(&t, 300);
    EXPECT_EQ(run_at(150), 250u);

    // Shorter, with that moment already passed: runs on the next pass.
    s_now = 180;
    u8g2gl_timer_set_period(&t, 50);   // due 100 + 50 = 150 < 180
    EXPECT_EQ(run_at(180), 20u);       // 30 ms late on a 50 ms period: next at 200
    EXPECT_EQ(log.runs, 2);
}

TEST_F(Timer, ZeroPeriodIsTreatedAsOneMillisecond) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 0, &log);
    EXPECT_EQ(run_at(0), 1u);
    EXPECT_EQ(run_at(1), 1u);
    EXPECT_EQ(log.runs, 1);
}

TEST_F(Timer, DeadlineIsTheEarliestTimer) {
    run_log a;
    run_log b;
    run_log c;
    u8g2gl_timer ta;
    u8g2gl_timer tb;
    u8g2gl_timer tc;
    u8g2gl_timer_init(&ta, count_run, 300, &a);
    u8g2gl_timer_init(&tb, count_run, 70, &b);
    u8g2gl_timer_init(&tc, count_run, 20, &c);
    u8g2gl_timer_pause(&tc);   // paused timers do not count

    EXPECT_EQ(run_at(0), 70u);
    EXPECT_EQ(run_at(70), 70u);    // b ran, due 140; a due 300
    EXPECT_EQ(run_at(290), 10u);   // b ran late and resynced to 360; a is due at 300
    EXPECT_EQ(a.runs, 0);
    EXPECT_EQ(c.runs, 0);
}

TEST_F(Timer, DeleteUnlinkedIsANoOp) {
    u8g2gl_timer never_linked;
    u8g2gl_timer_delete(&never_linked);
    u8g2gl_timer_delete(nullptr);

    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);
    u8g2gl_timer_delete(&t);
    u8g2gl_timer_delete(&t);        // second delete: nothing to do
    EXPECT_EQ(run_at(100), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 0);
}

TEST_F(Timer, DoubleInitDoesNotLinkTwice) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, count_run, 100, &log);
    u8g2gl_timer_init(&t, count_run, 50, &log);   // re-initialised in place

    EXPECT_EQ(run_at(50), 50u);
    EXPECT_EQ(log.runs, 1);   // linked twice would run it twice in one pass

    // One delete unlinks it completely; a second link would survive and run.
    u8g2gl_timer_delete(&t);
    EXPECT_EQ(run_at(100), U8G2GL_IDLE);
    EXPECT_EQ(log.runs, 1);
}

TEST_F(Timer, DestructorUnlinks) {
    run_log outer_log;
    u8g2gl_timer outer;
    u8g2gl_timer_init(&outer, count_run, 500, &outer_log);
    {
        run_log log;
        u8g2gl_timer scoped;
        u8g2gl_timer_init(&scoped, count_run, 100, &log);
        EXPECT_EQ(run_at(0), 100u);
    }
    // The scoped timer's storage is gone; the handler must not reach it.
    EXPECT_EQ(run_at(100), 400u);
    EXPECT_EQ(run_at(500), 500u);
    EXPECT_EQ(outer_log.runs, 1);
}

namespace {
struct self_deleting {
    u8g2gl_timer timer;
    int runs = 0;
};
void delete_self(u8g2gl_timer* t) {
    auto* s = static_cast<self_deleting*>(u8g2gl_timer_get_user_data(t));
    ++s->runs;
    u8g2gl_timer_delete(t);
}

struct deletes_other {
    u8g2gl_timer timer;
    u8g2gl_timer* victim = nullptr;
    int runs = 0;
};
void delete_victim(u8g2gl_timer* t) {
    auto* s = static_cast<deletes_other*>(u8g2gl_timer_get_user_data(t));
    ++s->runs;
    u8g2gl_timer_delete(s->victim);
}
}  // namespace

TEST_F(Timer, CallbackDeletesItself) {
    run_log other_log;
    u8g2gl_timer other;
    self_deleting s;
    u8g2gl_timer_init(&other, count_run, 100, &other_log);
    u8g2gl_timer_init(&s.timer, delete_self, 100, &s);

    EXPECT_EQ(run_at(100), 100u);   // both due; the other still runs
    EXPECT_EQ(s.runs, 1);
    EXPECT_EQ(other_log.runs, 1);
    run_at(200);
    EXPECT_EQ(s.runs, 1);
    EXPECT_EQ(other_log.runs, 2);
}

TEST_F(Timer, CallbackDeletesAnotherTimer) {
    // Both orders: the victim may already have run this pass, or be next.
    for (int order = 0; order < 2; ++order) {
        run_log victim_log;
        u8g2gl_timer victim;
        deletes_other killer;
        killer.victim = &victim;
        if (order == 0) {
            u8g2gl_timer_init(&victim, count_run, 100, &victim_log);
            u8g2gl_timer_init(&killer.timer, delete_victim, 100, &killer);
        } else {
            u8g2gl_timer_init(&killer.timer, delete_victim, 100, &killer);
            u8g2gl_timer_init(&victim, count_run, 100, &victim_log);
        }
        const uint32_t start = 1000u * static_cast<uint32_t>(order);
        s_now = start;
        u8g2gl_timer_reset(&victim);
        u8g2gl_timer_reset(&killer.timer);

        run_at(start + 100);
        EXPECT_EQ(killer.runs, 1);
        EXPECT_LE(victim_log.runs, 1);   // ran only if it came first
        const int victim_runs = victim_log.runs;
        run_at(start + 200);
        EXPECT_EQ(victim_log.runs, victim_runs) << "order " << order;
        u8g2gl_timer_delete(&killer.timer);
    }
}

namespace {
struct spawner {
    u8g2gl_timer timer;
    u8g2gl_timer* child = nullptr;
    run_log* child_log = nullptr;
    uint32_t child_period = 0;
};
void spawn_child(u8g2gl_timer* t) {
    auto* s = static_cast<spawner*>(u8g2gl_timer_get_user_data(t));
    u8g2gl_timer_init(s->child, count_run, s->child_period, s->child_log);
}
}  // namespace

TEST_F(Timer, CallbackInitialisesNewTimer) {
    run_log child_log;
    u8g2gl_timer child;
    spawner s;
    s.child = &child;
    s.child_log = &child_log;
    s.child_period = 30;
    u8g2gl_timer_init(&s.timer, spawn_child, 100, &s);

    // The child is linked at the head mid-pass; it is not due, so it must not
    // run in this pass, and the deadline is now its 30 ms.
    EXPECT_EQ(run_at(100), 30u);
    EXPECT_EQ(child_log.runs, 0);
    EXPECT_EQ(run_at(130), 30u);
    EXPECT_EQ(child_log.runs, 1);
}

namespace {
void reinit_self(u8g2gl_timer* t) {
    count_run(t);
    u8g2gl_timer_init(t, reinit_self, 100, u8g2gl_timer_get_user_data(t));
}
void ready_self(u8g2gl_timer* t) {
    count_run(t);
    auto* log = static_cast<run_log*>(u8g2gl_timer_get_user_data(t));
    if (log->runs == 1) {
        u8g2gl_timer_ready(t);
    }
}
}  // namespace

TEST_F(Timer, CallbackReinitialisesItself) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, reinit_self, 100, &log);
    EXPECT_EQ(run_at(100), 100u);
    EXPECT_EQ(log.runs, 1);
    u8g2gl_timer_delete(&t);
    EXPECT_EQ(run_at(200), U8G2GL_IDLE);   // linked once, so one delete suffices
}

TEST_F(Timer, ReadyFromOwnCallbackReturnsZeroAndRunsNextPass) {
    run_log log;
    u8g2gl_timer t;
    u8g2gl_timer_init(&t, ready_self, 100, &log);

    EXPECT_EQ(run_at(100), 0u);    // became due during the pass
    EXPECT_EQ(log.runs, 1);        // but did not run twice in it
    EXPECT_EQ(run_at(100), 100u);
    EXPECT_EQ(log.runs, 2);
}

TEST_F(Timer, SurvivesTickWraparound) {
    run_log log;
    u8g2gl_timer t;
    s_now = UINT32_MAX - 49u;      // 50 ms before the wrap
    u8g2gl_timer_init(&t, count_run, 100, &log);   // due at 50 after the wrap

    EXPECT_EQ(run_at(UINT32_MAX), 51u);
    EXPECT_EQ(log.runs, 0);
    EXPECT_EQ(run_at(50), 100u);
    EXPECT_EQ(log.runs, 1);
    EXPECT_EQ(run_at(150), 100u);
    EXPECT_EQ(log.runs, 2);
}

TEST_F(Timer, UserData) {
    int context = 0;
    u8g2gl_timer t;
    EXPECT_EQ(u8g2gl_timer_get_user_data(&t), nullptr);
    EXPECT_EQ(u8g2gl_timer_get_user_data(nullptr), nullptr);
    u8g2gl_timer_init(&t, nullptr, 100, &context);
    EXPECT_EQ(u8g2gl_timer_get_user_data(&t), &context);
    EXPECT_EQ(run_at(100), 100u);   // a null callback keeps its schedule
}
