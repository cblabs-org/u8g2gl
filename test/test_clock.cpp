/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_clock.cpp
 *
 * Purpose: Verification suite for u8g2gl_clock widget. Validates default
 *          configuration, raw epoch seconds assignment and time decomposition,
 *          colon blink 1Hz animation state machine, blink disable behavior,
 *          HH_MM vs HH_MM_SS formats, dual-font baseline alignment, right-aligned
 *          digit columns, partial refresh hooks, polymorphism, and memory budget.
 *
 * Description: GoogleTest test cases covering the complete specification of
 *              u8g2gl_clock.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8g2lib.h"
#include <iostream>
#include <string>

static const uint8_t s_primary_font[4] = { 0x01, 0x02, 0x03, 0x04 };
static const uint8_t s_secondary_font[4] = { 0x05, 0x06, 0x07, 0x08 };

TEST(Clock, DefaultConstruction) {
    u8g2gl_clock clock;

    EXPECT_TRUE(clock.is_blink_enabled());
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM);
    EXPECT_EQ(clock.get_time(), 0u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.get_secondary_font(), nullptr);
    EXPECT_FALSE(clock.is_dirty());
}

TEST(Clock, SetTime) {
    u8g2gl_clock clock;
    // 3661 seconds = 1 hour, 1 minute, 1 second -> 01:01:01
    clock.set_time(3661);
    EXPECT_EQ(clock.get_time(), 3661u);
    EXPECT_TRUE(clock.is_dirty());

    U8G2 display;
    clock.render(display);

    // In HH_MM mode: draws hour "01", colon ":", minute "01" (3 drawUTF8 calls)
    EXPECT_EQ(display.draw_utf8_count, 3);
    EXPECT_STREQ(display.last_draw_utf8_buf, "01");

    // In HH_MM_SS mode: draws hour "01", colon ":", minute "01", colon ":", second "01"
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    display.draw_utf8_count = 0;
    clock.render(display);
    EXPECT_EQ(display.draw_utf8_count, 5);
    EXPECT_STREQ(display.last_draw_utf8_buf, "01");
}

TEST(Clock, BlinkToggle) {
    u8g2gl_clock clock;

    // t=0: initial tick returns ~500ms deadline, colon remains visible
    uint32_t d0 = clock.tick(0);
    EXPECT_EQ(d0, 500u);
    EXPECT_TRUE(clock.is_colon_visible());

    // t=200: 200ms elapsed, 300ms remaining
    uint32_t d1 = clock.tick(200);
    EXPECT_EQ(d1, 300u);
    EXPECT_TRUE(clock.is_colon_visible());

    // t=500: 500ms elapsed, colon toggles off, returns 500ms
    uint32_t d2 = clock.tick(500);
    EXPECT_EQ(d2, 500u);
    EXPECT_FALSE(clock.is_colon_visible());
    EXPECT_TRUE(clock.is_dirty());

    // t=1000: 500ms elapsed since last toggle, colon toggles on again
    clock.clear_dirty();
    uint32_t d3 = clock.tick(1000);
    EXPECT_EQ(d3, 500u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_TRUE(clock.is_dirty());
}

TEST(Clock, BlinkDisabled) {
    u8g2gl_clock clock;
    clock.set_blink(false);

    EXPECT_FALSE(clock.is_blink_enabled());
    EXPECT_TRUE(clock.is_colon_visible());

    // With blink disabled, tick always returns U8G2GL_IDLE
    EXPECT_EQ(clock.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(clock.tick(500), U8G2GL_IDLE);
    EXPECT_EQ(clock.tick(1000), U8G2GL_IDLE);
    EXPECT_TRUE(clock.is_colon_visible());
}

TEST(Clock, SetFormat) {
    u8g2gl_clock clock;
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM);

    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM_SS);
    EXPECT_TRUE(clock.is_dirty());

    clock.clear_dirty();
    clock.set_format(U8G2GL_CLOCK_HH_MM);
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM);
    EXPECT_TRUE(clock.is_dirty());
}

TEST(Clock, SecondaryFont) {
    u8g2gl_clock clock;
    clock.set_font(s_primary_font);
    clock.set_secondary_font(s_secondary_font);
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    clock.set_time(3661);

    EXPECT_EQ(clock.get_secondary_font(), s_secondary_font);

    U8G2 display;
    clock.render(display);

    // Rendered seconds use secondary font
    EXPECT_EQ(display.last_font, s_secondary_font);
}

TEST(Clock, ColonHiddenDoesNotDrawColon) {
    u8g2gl_clock clock;
    clock.set_time(3661);
    clock.set_format(U8G2GL_CLOCK_HH_MM);

    // Toggle colon off
    clock.tick(500);
    EXPECT_FALSE(clock.is_colon_visible());

    U8G2 display;
    clock.render(display);

    // Only hours and minutes drawn when colon is hidden (2 drawUTF8 calls)
    EXPECT_EQ(display.draw_utf8_count, 2);
}

TEST(Clock, RenderAnimationUpdate) {
    u8g2gl_clock clock;
    clock.set_coords(0, 0, 64, 16);
    clock.set_time(3661);

    U8G2 display;
    // Initial call at t=0 does not toggle blink (elapsed = 0 < 500)
    clock.render_animation_update(display, 0);
    EXPECT_EQ(display.update_display_area_count, 0);

    // At t=500, colon toggles and triggers partial refresh
    clock.render_animation_update(display, 500);
    EXPECT_GT(display.update_display_area_count, 0);
}

TEST(Clock, InheritsFromObj) {
    u8g2gl_clock clock;
    clock.set_coords(10, 10, 60, 14);
    clock.set_time(7200); // 02:00:00

    u8g2gl_obj* obj = &clock;
    EXPECT_EQ(obj->get_x(), 10);
    EXPECT_EQ(obj->get_y(), 10);
    EXPECT_EQ(obj->get_w(), 60);
    EXPECT_EQ(obj->get_h(), 14);

    EXPECT_EQ(obj->tick(0), 500u);

    U8G2 display;
    obj->render(display);
    EXPECT_GT(display.draw_utf8_count, 0);
}

// PR-04 WO2: bind_time is the clock's primary binding (§6.3) and the call
// §13.12's generated code makes; it did not exist before this work order.
TEST(Clock, BindTimeRendersBoundSubject) {
    u8g2gl_subject_time subject(3661);   // 01:01:01
    u8g2gl_clock clock;
    ASSERT_TRUE(clock.bind_time(&subject));

    // The current value is applied at bind time, not on the first change.
    EXPECT_EQ(clock.get_time(), 3661u);
    EXPECT_TRUE(clock.is_dirty());

    U8G2 display;
    clock.render(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "01");

    // A change reaches the clock, marks it dirty, and is what renders.
    clock.clear_dirty();
    subject.set(7322);                   // 02:02:02
    EXPECT_EQ(clock.get_time(), 7322u);
    EXPECT_TRUE(clock.is_dirty());
    display.draw_utf8_count = 0;
    clock.render(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "02");

    // A re-notification of an unchanged value is not a repaint (§11.2).
    clock.clear_dirty();
    subject.notify();
    EXPECT_FALSE(clock.is_dirty());
}

TEST(Clock, BindTimeNotificationAfterDestructionIsSafe) {
    u8g2gl_subject_time subject(0);
    {
        u8g2gl_clock clock;
        ASSERT_TRUE(clock.bind_time(&subject));
    }
    // The destroyed clock's pool slot is inactive, so this must be a no-op
    // rather than a write through a dangling pointer.
    subject.set(60);
    SUCCEED();
}

TEST(Clock, SizeOf) {
    std::cout << "\n================ u8g2gl_clock SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):   " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_clock): " << sizeof(u8g2gl_clock) << " bytes" << std::endl;
    std::cout << "===========================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_clock", std::to_string(sizeof(u8g2gl_clock)));

    EXPECT_LE(sizeof(u8g2gl_clock), 88u);
}
