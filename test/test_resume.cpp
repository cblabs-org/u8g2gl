/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_resume.cpp
 * Purpose: Verifies the resume callback (§11.1): that it wakes a sleeping loop
 *          on exactly the events that give it work — the active screen going
 *          clean to dirty, and the timer calls that make a timer due — fires
 *          once per transition rather than once per write, stays quiet inside
 *          ui_handler(), and can be cleared.
 *
 * Description: GoogleTest cases against the U8G2 stub with a counting callback.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_timer.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8g2lib.h"

#include <cstdint>

namespace {

uint32_t s_now = 0;
uint32_t fake_tick() {
    return s_now;
}

int s_resume_count = 0;
void* s_resume_seen_data = nullptr;
void count_resume(void* user_data) {
    ++s_resume_count;
    s_resume_seen_data = user_data;
}

u8g2gl_subject_int s_level;
u8g2gl_screen s_screen;
int s_render_writes = 0;

/// Render path that writes a subject bound to the frame (see §11.2 ordering).
void render_writes_subject(U8G2& /*display*/) {
    if (s_render_writes > 0) {
        --s_render_writes;
        s_level.set(s_level.get() + 1);
    }
}

/// Timer callback that writes the bound subject, as the wall clock does.
void timer_writes_subject(u8g2gl_timer* /*t*/) {
    s_level.set(s_level.get() + 1);
}

void noop_timer(u8g2gl_timer* /*t*/) {}

class Resume : public ::testing::Test {
protected:
    void SetUp() override {
        s_now = 0;
        s_resume_count = 0;
        s_resume_seen_data = nullptr;
        s_render_writes = 0;
        // The subject is static, so its one observer is added once; assigning a
        // fresh subject over it would copy a pointer into a temporary's slots.
        static bool s_observer_added = false;
        if (!s_observer_added) {
            ASSERT_TRUE(s_level.add_observer(nullptr, u8g2gl_frame_dirty_observer));
            s_observer_added = true;
        }
        s_level.set(0);
        s_screen = u8g2gl_screen{};
        s_screen.render_fn = render_writes_subject;
        u8g2gl_set_tick_cb(fake_tick);
        u8g2gl_set_resume_cb(nullptr, nullptr);
        u8g2gl_set_active_screen(&s_screen);
        ui_handler(display_);              // draw the activation frame: now clean
        ASSERT_FALSE(s_screen.dirty);
        u8g2gl_set_resume_cb(count_resume, &s_screen);
    }
    void TearDown() override {
        u8g2gl_set_resume_cb(nullptr, nullptr);
        u8g2gl_set_active_screen(nullptr);
        u8g2gl_set_tick_cb(nullptr);
    }

    U8G2 display_;
};

}  // namespace

TEST_F(Resume, FiresOnSubjectWriteToCleanBoundFrame) {
    s_level.set(1);
    EXPECT_EQ(s_resume_count, 1);
    EXPECT_EQ(s_resume_seen_data, &s_screen);   // user_data is passed back
}

TEST_F(Resume, DoesNotFireAgainWhileAlreadyDirty) {
    s_level.set(1);
    s_level.set(2);
    u8g2gl_mark_dirty();
    EXPECT_EQ(s_resume_count, 1);
}

TEST_F(Resume, FiresAgainAfterTheFrameIsDrawnClean) {
    s_level.set(1);
    ui_handler(display_);
    ASSERT_FALSE(s_screen.dirty);
    s_level.set(2);
    EXPECT_EQ(s_resume_count, 2);
}

TEST_F(Resume, FiresOnMarkDirtyAndOnActivation) {
    u8g2gl_mark_dirty();
    EXPECT_EQ(s_resume_count, 1);

    ui_handler(display_);
    u8g2gl_screen other{};
    u8g2gl_set_active_screen(&other);   // activation forces the first frame
    EXPECT_EQ(s_resume_count, 2);
    u8g2gl_set_active_screen(&s_screen);
}

TEST_F(Resume, FiresOnEachTimerCallThatGivesWork) {
    u8g2gl_timer timer;
    u8g2gl_timer_init(&timer, noop_timer, 100, nullptr);
    EXPECT_EQ(s_resume_count, 1);
    u8g2gl_timer_pause(&timer);
    EXPECT_EQ(s_resume_count, 1);           // pausing gives no work
    u8g2gl_timer_resume(&timer);
    EXPECT_EQ(s_resume_count, 2);
    u8g2gl_timer_set_period(&timer, 200);
    EXPECT_EQ(s_resume_count, 3);
    u8g2gl_timer_ready(&timer);
    EXPECT_EQ(s_resume_count, 4);
    u8g2gl_timer_reset(&timer);
    EXPECT_EQ(s_resume_count, 5);
}

TEST_F(Resume, ReinitialisingALinkedTimerStillFires) {
    u8g2gl_timer timer;
    u8g2gl_timer_init(&timer, noop_timer, 100, nullptr);
    u8g2gl_timer_init(&timer, noop_timer, 50, nullptr);
    EXPECT_EQ(s_resume_count, 2);
}

TEST_F(Resume, SilentInsideUiHandlerWhenATimerWritesASubject) {
    u8g2gl_timer timer;
    u8g2gl_timer_init(&timer, timer_writes_subject, 100, nullptr);
    s_resume_count = 0;

    s_now = 100;
    ui_handler(display_);
    ASSERT_EQ(s_level.get(), 1);            // the timer did write the subject
    // The timer wrote the subject during the call: no wake, the loop was awake.
    EXPECT_EQ(s_resume_count, 0);
}

TEST_F(Resume, SilentInsideUiHandlerWhenARenderWritesASubject) {
    s_level.set(1);
    s_resume_count = 0;
    s_render_writes = 1;

    EXPECT_EQ(ui_handler(display_), 0u);    // left dirty by the render: no sleep
    EXPECT_EQ(s_resume_count, 0);
    EXPECT_TRUE(s_screen.dirty);
}

TEST_F(Resume, SilentInsideUiHandlerForATimerReadyingItself) {
    u8g2gl_timer timer;
    u8g2gl_timer_init(
        &timer,
        [](u8g2gl_timer* t) { u8g2gl_timer_ready(t); },
        100, nullptr);
    s_resume_count = 0;

    s_now = 100;
    EXPECT_EQ(ui_handler(display_), 0u);    // the readied timer is due: no sleep
    EXPECT_EQ(s_resume_count, 0);
}

TEST_F(Resume, FiresAgainOnceTheHandlerHasReturned) {
    s_render_writes = 1;
    s_level.set(1);
    ui_handler(display_);                   // render re-dirties, silently
    ui_handler(display_);                   // draws it, now clean
    ASSERT_FALSE(s_screen.dirty);
    s_resume_count = 0;
    s_level.set(10);
    EXPECT_EQ(s_resume_count, 1);           // the suppression did not stick
}

TEST_F(Resume, NullptrClearsIt) {
    u8g2gl_set_resume_cb(nullptr, nullptr);
    s_level.set(1);
    u8g2gl_timer timer;
    u8g2gl_timer_init(&timer, noop_timer, 100, nullptr);
    EXPECT_EQ(s_resume_count, 0);
}

TEST_F(Resume, NoCallbackSetHasNoEffect) {
    u8g2gl_set_resume_cb(nullptr, nullptr);
    s_level.set(1);
    EXPECT_TRUE(s_screen.dirty);
    ui_handler(display_);
    EXPECT_FALSE(s_screen.dirty);
}
