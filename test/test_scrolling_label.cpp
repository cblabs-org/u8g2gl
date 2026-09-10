/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_scrolling_label.cpp
 *
 * Purpose: Verification suite for u8g2gl_scrolling_label animated marquee widget.
 *          Validates default configuration, zero-copy text assignment, tick
 *          state machine progression, initial delay pauses, marquee pixel
 *          shifting, wrap-around looping, static text dwell timers, partial
 *          hardware refresh hooks, polymorphism, and strict memory budgets.
 *
 * Description: GoogleTest suite exercising the complete contract of
 *              u8g2gl_scrolling_label.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_scrolling_label.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8G2lib.h"
#include <iostream>
#include <string>

static const uint8_t s_mock_font[4] = { 0x01, 0x02, 0x03, 0x04 };

TEST(ScrollingLabel, DefaultConstruction) {
    u8g2gl_scrolling_label label;

    // Default label holds nullptr text and returns idle on tick
    EXPECT_EQ(label.get_text(), nullptr);
    EXPECT_EQ(label.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(label.is_dirty());
    EXPECT_FALSE(label.is_scroll_finished());

    // Default scroll configuration
    EXPECT_EQ(label.get_scroll_px_per_sec(), 25);
    EXPECT_EQ(label.get_initial_delay_ms(), 3000);
    EXPECT_EQ(label.get_static_dwell_ms(), 5000);
}

TEST(ScrollingLabel, SetText) {
    u8g2gl_scrolling_label label;
    const char* literal = "Platform 2 — 07:42 Departure to London Waterloo";

    label.set_text(literal);
    EXPECT_EQ(label.get_text(), literal);
    EXPECT_TRUE(label.is_dirty());

    // Clearing back to nullptr
    label.clear_dirty();
    label.set_text(nullptr);
    EXPECT_EQ(label.get_text(), nullptr);
    EXPECT_TRUE(label.is_dirty());
}

TEST(ScrollingLabel, TickReturnsDeadlineNotIdle) {
    u8g2gl_scrolling_label label;
    label.set_coords(0, 0, 60, 16);
    label.set_text("Calling at all stations");

    // Before render(), needs_layout_ is true: requests immediate frame (returns 1)
    EXPECT_EQ(label.tick(0), 1u);

    // After layout measurement in render(), tick returns initial delay deadline
    U8G2 display;
    display.utf8_width_val = 120; // text wider than widget width (60)
    label.render(display);

    uint32_t deadline = label.tick(100);
    EXPECT_NE(deadline, U8G2GL_IDLE);
    EXPECT_GT(deadline, 0u);
}

TEST(ScrollingLabel, InitialDelayBeforeScroll) {
    u8g2gl_scrolling_label label;
    label.set_coords(0, 0, 50, 16);
    label.set_text("Delayed train notice");

    U8G2 display;
    display.utf8_width_val = 150; // Requires scrolling
    label.render(display);

    // First tick at t=1000 establishes initial pause of 3000ms
    uint32_t d1 = label.tick(1000);
    EXPECT_EQ(d1, 3000u);

    // Subsequent tick during delay (t=2000) returns remaining 2000ms
    uint32_t d2 = label.tick(2000);
    EXPECT_EQ(d2, 2000u);

    // Verify offset has not moved yet
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, 0);

    // Once initial delay elapses (t=4001 > 4000), scrolling begins
    uint32_t d3 = label.tick(4001);
    EXPECT_EQ(d3, 40u); // 1000ms / 25 fps = 40ms interval

    // Verify pixel offset has incremented to 1 (drawn at x - scroll_x = 0 - 1 = -1)
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, -1);
}

TEST(ScrollingLabel, ResetScroll) {
    u8g2gl_scrolling_label label;
    label.set_coords(0, 0, 50, 16);
    label.set_text("Reset test text");

    U8G2 display;
    display.utf8_width_val = 100;
    label.render(display);

    // Advance past initial delay
    label.tick(0);
    label.tick(3001);

    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, -1);

    // Reset rewinds offset back to 0
    label.reset_scroll();
    EXPECT_TRUE(label.is_dirty());
    EXPECT_FALSE(label.is_scroll_finished());

    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, 0);
}

TEST(ScrollingLabel, ConfigurableScrollSpeed) {
    u8g2gl_scrolling_label label;
    label.set_coords(0, 0, 40, 16);
    label.set_text("High speed text");

    // Configure 50 px/sec (20ms interval) and 500ms initial delay
    label.set_scroll_px_per_sec(50);
    label.set_initial_delay_ms(500);
    label.set_static_dwell_ms(2000);

    EXPECT_EQ(label.get_scroll_px_per_sec(), 50);
    EXPECT_EQ(label.get_initial_delay_ms(), 500);
    EXPECT_EQ(label.get_static_dwell_ms(), 2000);

    U8G2 display;
    display.utf8_width_val = 100;
    label.render(display);

    // First tick at t=0 returns initial delay of 500ms
    EXPECT_EQ(label.tick(0), 500u);

    // Tick at t=501 advances scroll and returns 1000 / 50 = 20ms interval
    EXPECT_EQ(label.tick(501), 20u);
}

TEST(ScrollingLabel, WrapAroundAndFinish) {
    u8g2gl_scrolling_label label;
    label.set_coords(10, 5, 50, 16);
    label.set_text("Short text");

    U8G2 display;
    display.utf8_width_val = 60; // message_width = 60
    label.render(display);

    // Initial tick establishes pause
    label.tick(0);

    // Step until scroll_x exceeds message_width + 30 = 90
    uint32_t t = 3001;
    for (int i = 0; i < 91; ++i) {
        label.tick(t);
        t += 41;
    }

    // Now scroll_x should wrap to -w_ (-50) and scroll_finished becomes true
    EXPECT_TRUE(label.is_scroll_finished());

    // Next render should draw at x - scroll_x = 10 - (-50) = 60 (right edge)
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, 60);
}

TEST(ScrollingLabel, StaticTextDwell) {
    u8g2gl_scrolling_label label;
    label.set_coords(0, 0, 80, 16);
    label.set_text("Fits fine");

    U8G2 display;
    display.utf8_width_val = 40; // Less than w=80, no scrolling needed
    label.render(display);

    // First tick at t=1000 returns initial delay of 3000ms
    EXPECT_EQ(label.tick(1000), 3000u);
    EXPECT_FALSE(label.is_scroll_finished());

    // Tick at t=4000: last_scroll_ms is 4000, dwell_deadline is 4000 + 5000 = 9000
    // Remaining dwell = 9000 - 4000 = 5000
    EXPECT_EQ(label.tick(4000), 5000u);
    EXPECT_FALSE(label.is_scroll_finished());

    // Tick at t=9000: dwell finished! Returns U8G2GL_IDLE
    EXPECT_EQ(label.tick(9000), U8G2GL_IDLE);
    EXPECT_TRUE(label.is_scroll_finished());

    // Subsequent tick stays idle
    EXPECT_EQ(label.tick(9500), U8G2GL_IDLE);
}

TEST(ScrollingLabel, RenderSetsClipWindow) {
    u8g2gl_scrolling_label label;
    label.set_coords(10, 20, 60, 16);
    label.set_text("Clipped marquee text");

    U8G2 display;
    display.utf8_width_val = 120; // Requires scroll and clipping

    label.render(display);

    EXPECT_EQ(display.set_clip_window_count, 1);
    EXPECT_EQ(display.last_clip_x0, 10);
    EXPECT_EQ(display.last_clip_y0, 20);
    EXPECT_EQ(display.last_clip_x1, 69); // 10 + 60 - 1
    EXPECT_EQ(display.last_clip_y1, 35); // 20 + 16 - 1
    EXPECT_EQ(display.max_clip_window_count, 1);
}

TEST(ScrollingLabel, RenderAnimationUpdate) {
    u8g2gl_scrolling_label label;
    label.set_coords(0, 0, 50, 16);
    label.set_text("Blocked loop scrolling");

    U8G2 display;
    display.utf8_width_val = 100;
    label.render(display);

    // Initial delay tick
    label.tick(0);

    display.update_display_area_count = 0;
    display.draw_box_count = 0;

    // During delay (t=1000), no coordinate change -> no partial update
    label.render_animation_update(display, 1000);
    EXPECT_EQ(display.update_display_area_count, 0);

    // After delay (t=3001), scroll_x advances -> partial refresh triggered
    label.render_animation_update(display, 3001);
    EXPECT_GT(display.update_display_area_count, 0);
    EXPECT_GT(display.draw_box_count, 0);
}

TEST(ScrollingLabel, InheritsFromObj) {
    u8g2gl_scrolling_label label;
    label.set_coords(5, 10, 40, 12);
    label.set_font(s_mock_font);
    label.set_text("Polymorphic label");

    u8g2gl_obj* obj = &label;
    EXPECT_EQ(obj->get_x(), 5);
    EXPECT_EQ(obj->get_y(), 10);
    EXPECT_EQ(obj->get_w(), 40);
    EXPECT_EQ(obj->get_h(), 12);

    U8G2 display;
    display.utf8_width_val = 30; // Fits statically
    obj->render(display);

    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(display.last_font, s_mock_font);
}

TEST(ScrollingLabel, SizeOf) {
    std::cout << "\n=========== u8g2gl_scrolling_label SIZEOF REPORT ===========" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):             " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_scrolling_label): " << sizeof(u8g2gl_scrolling_label) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_scrolling_label", std::to_string(sizeof(u8g2gl_scrolling_label)));

    // Ensure memory contract: maximum 88 bytes on 64-bit host
    EXPECT_LE(sizeof(u8g2gl_scrolling_label), 88u);
}
