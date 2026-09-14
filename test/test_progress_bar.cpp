/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_progress_bar.cpp
 *
 * Purpose: Verification suite for u8g2gl_progress_bar widget. Validates default
 *          state, clamped value assignment, instant snapping vs smooth linear
 *          interpolation, deadline reporting from tick(), solid/stipple rendering,
 *          percentage string overlay, partial hardware refresh hooks,
 *          polymorphism, and strict memory budgets.
 *
 * Description: GoogleTest test cases covering the complete specification of
 *              u8g2gl_progress_bar.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_progress_bar.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8G2lib.h"
#include <iostream>
#include <string>

static const uint8_t s_mock_font[4] = { 0x01, 0x02, 0x03, 0x04 };

TEST(ProgressBar, DefaultConstruction) {
    u8g2gl_progress_bar bar;

    EXPECT_EQ(bar.get_value(), 0);
    EXPECT_EQ(bar.get_target_value(), 0);
    EXPECT_EQ(bar.get_animate_duration_ms(), 0);
    EXPECT_EQ(bar.get_fill_style(), U8G2GL_FILL_STIPPLE);
    EXPECT_FALSE(bar.get_show_percent_text());
    EXPECT_EQ(bar.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(bar.is_dirty());
}

TEST(ProgressBar, SetValueClamped) {
    u8g2gl_progress_bar bar;

    bar.set_value(50);
    EXPECT_EQ(bar.get_value(), 50);
    EXPECT_TRUE(bar.is_dirty());

    bar.clear_dirty();
    bar.set_value(150);
    EXPECT_EQ(bar.get_value(), 100);
    EXPECT_TRUE(bar.is_dirty());

    bar.clear_dirty();
    bar.set_value(200);
    EXPECT_EQ(bar.get_value(), 100);
}

// PR-04 WO4 (carried W3): set_value() used to mark dirty unconditionally, so
// writing an unchanged value scheduled a frame (§11.2). Check the object's flag
// and the active screen's frame flag: the frame flag is what gates sendBuffer().
TEST(ProgressBar, SameValueSetLeavesFrameClean) {
    u8g2gl_screen screen{};
    u8g2gl_set_active_screen(&screen);
    u8g2gl_progress_bar bar;

    // --- Instant: an identical value ---
    bar.set_value(50);
    EXPECT_TRUE(bar.is_dirty());
    EXPECT_TRUE(screen.dirty);
    bar.clear_dirty();
    screen.dirty = false;

    bar.set_value(50);
    EXPECT_FALSE(bar.is_dirty());
    EXPECT_FALSE(screen.dirty);

    // --- Instant: different requests that clamp to the same value ---
    bar.set_value(150);
    EXPECT_TRUE(screen.dirty);
    bar.clear_dirty();
    screen.dirty = false;

    bar.set_value(200);
    EXPECT_FALSE(bar.is_dirty());
    EXPECT_FALSE(screen.dirty);

    // --- Animated: re-setting the target neither dirties nor restarts ---
    u8g2gl_progress_bar anim;
    anim.set_animate_duration_ms(1000);
    anim.set_value(100);
    anim.tick(0);                     // animation starts at t=0
    anim.tick(500);
    uint8_t midway = anim.get_value();
    anim.clear_dirty();
    screen.dirty = false;

    anim.set_value(100);
    EXPECT_FALSE(anim.is_dirty());
    EXPECT_FALSE(screen.dirty);
    anim.tick(1000);                  // a restart would still be mid-way here
    EXPECT_GT(midway, 0);
    EXPECT_EQ(anim.get_value(), 100);

    u8g2gl_set_active_screen(nullptr);
}

TEST(ProgressBar, InstantTransition) {
    u8g2gl_progress_bar bar;

    bar.set_animate_duration_ms(0);
    bar.set_value(75);
    EXPECT_EQ(bar.get_value(), 75);
    EXPECT_EQ(bar.tick(0), U8G2GL_IDLE);
}

TEST(ProgressBar, AnimatedTransition) {
    u8g2gl_progress_bar bar;

    bar.set_animate_duration_ms(1000);
    bar.set_value(100);

    // Initial tick starts animation and returns non-IDLE deadline
    uint32_t d0 = bar.tick(0);
    EXPECT_NE(d0, U8G2GL_IDLE);
    EXPECT_EQ(bar.get_value(), 0);

    // Mid-way tick at 500ms
    uint32_t d1 = bar.tick(500);
    EXPECT_NE(d1, U8G2GL_IDLE);
    EXPECT_EQ(bar.get_value(), 50);

    // Completion tick at 1000ms snaps to target and returns U8G2GL_IDLE
    uint32_t d2 = bar.tick(1000);
    EXPECT_EQ(d2, U8G2GL_IDLE);
    EXPECT_EQ(bar.get_value(), 100);

    // Subsequent tick remains idle
    EXPECT_EQ(bar.tick(1100), U8G2GL_IDLE);
}

TEST(ProgressBar, AnimatedTransitionDescending) {
    u8g2gl_progress_bar bar;
    bar.set_value(80); // Instant set to 80%

    bar.set_animate_duration_ms(1000);
    bar.set_value(20); // Animate down to 20%

    bar.tick(100); // anim_start_ms_ = 100
    EXPECT_EQ(bar.get_value(), 80);

    bar.tick(600); // 500ms elapsed -> 80 + (-60 * 500) / 1000 = 50%
    EXPECT_EQ(bar.get_value(), 50);

    uint32_t d = bar.tick(1100); // 1000ms elapsed -> complete
    EXPECT_EQ(d, U8G2GL_IDLE);
    EXPECT_EQ(bar.get_value(), 20);
}

TEST(ProgressBar, FillStyleConfiguration) {
    u8g2gl_progress_bar bar;
    EXPECT_EQ(bar.get_fill_style(), U8G2GL_FILL_STIPPLE);

    bar.set_fill_style(U8G2GL_FILL_SOLID);
    EXPECT_EQ(bar.get_fill_style(), U8G2GL_FILL_SOLID);
    EXPECT_TRUE(bar.is_dirty());

    bar.clear_dirty();
    bar.set_fill_style(U8G2GL_FILL_STIPPLE);
    EXPECT_EQ(bar.get_fill_style(), U8G2GL_FILL_STIPPLE);
    EXPECT_TRUE(bar.is_dirty());
}

TEST(ProgressBar, ShowPercentTextToggle) {
    u8g2gl_progress_bar bar;
    EXPECT_FALSE(bar.get_show_percent_text());

    bar.set_show_percent_text(true);
    EXPECT_TRUE(bar.get_show_percent_text());
    EXPECT_TRUE(bar.is_dirty());

    bar.clear_dirty();
    bar.set_show_percent_text(false);
    EXPECT_FALSE(bar.get_show_percent_text());
    EXPECT_TRUE(bar.is_dirty());
}

TEST(ProgressBar, RenderSolid) {
    u8g2gl_progress_bar bar;
    bar.set_coords(10, 20, 102, 12);
    bar.set_fill_style(U8G2GL_FILL_SOLID);
    bar.set_value(50);

    U8G2 display;
    bar.render(display);

    // Should draw outer frame at (10, 20, 102, 12)
    EXPECT_EQ(display.draw_frame_count, 1);
    EXPECT_EQ(display.last_draw_frame_x, 10);
    EXPECT_EQ(display.last_draw_frame_y, 20);
    EXPECT_EQ(display.last_draw_frame_w, 102);
    EXPECT_EQ(display.last_draw_frame_h, 12);

    // Inner area: inner_w = 100, fill = 50% * 100 = 50
    EXPECT_EQ(display.draw_box_count, 1);
    EXPECT_EQ(display.last_draw_box_x, 11);
    EXPECT_EQ(display.last_draw_box_y, 21);
    EXPECT_EQ(display.last_draw_box_w, 50);
    EXPECT_EQ(display.last_draw_box_h, 10);
}

TEST(ProgressBar, RenderStipple) {
    u8g2gl_progress_bar bar;
    bar.set_coords(0, 0, 102, 12);
    bar.set_fill_style(U8G2GL_FILL_STIPPLE);
    bar.set_value(20);

    U8G2 display;
    bar.render(display);

    EXPECT_EQ(display.draw_frame_count, 1);
    // Stipple fill draws pixels rather than a solid box
    EXPECT_EQ(display.draw_box_count, 0);
    EXPECT_GT(display.draw_pixel_count, 0);
}

TEST(ProgressBar, RenderPercentText) {
    u8g2gl_progress_bar bar;
    bar.set_coords(0, 0, 102, 12);
    bar.set_font(s_mock_font);
    bar.set_value(45);
    bar.set_show_percent_text(true);

    U8G2 display;
    bar.render(display);

    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_STREQ(display.last_draw_utf8_buf, "45%");
}

TEST(ProgressBar, RenderDegenerateGeometry) {
    u8g2gl_progress_bar bar;
    bar.set_coords(0, 0, 2, 2); // Too small for 1px frame + inner area
    bar.set_value(50);

    U8G2 display;
    bar.render(display);

    // Early exit without drawing
    EXPECT_EQ(display.draw_frame_count, 0);
    EXPECT_EQ(display.draw_box_count, 0);
    EXPECT_EQ(display.draw_pixel_count, 0);
}

TEST(ProgressBar, RenderAnimationUpdate) {
    u8g2gl_progress_bar bar;
    bar.set_coords(0, 0, 102, 12);
    bar.set_animate_duration_ms(1000);
    bar.set_value(100);

    U8G2 display;
    // At t=0, anim starts (value is still 0), no visual change from initial 0
    bar.render_animation_update(display, 0);
    EXPECT_EQ(display.update_display_area_count, 0);

    // At t=500, percent changes to 50, triggering redraw and partial refresh
    bar.render_animation_update(display, 500);
    EXPECT_GT(display.update_display_area_count, 0);
}

TEST(ProgressBar, InheritsFromObj) {
    u8g2gl_progress_bar bar;
    bar.set_coords(5, 10, 50, 10);
    bar.set_value(60);

    u8g2gl_obj* obj = &bar;
    EXPECT_EQ(obj->get_x(), 5);
    EXPECT_EQ(obj->get_y(), 10);
    EXPECT_EQ(obj->get_w(), 50);
    EXPECT_EQ(obj->get_h(), 10);

    EXPECT_EQ(obj->tick(0), U8G2GL_IDLE);

    U8G2 display;
    obj->render(display);
    EXPECT_EQ(display.draw_frame_count, 1);
}

// PR-04 WO2: bind_value was declared by the manifest but never implemented.
TEST(ProgressBar, BindValueUpdatesFromSubjectAndMarksDirty) {
    u8g2gl_subject_int subject(40);
    u8g2gl_progress_bar bar;
    ASSERT_TRUE(bar.bind_value(&subject));

    // Applied at bind time; animate_duration_ms is 0, so it snaps.
    EXPECT_EQ(bar.get_value(), 40u);
    EXPECT_TRUE(bar.is_dirty());

    bar.clear_dirty();
    subject.set(75);
    EXPECT_EQ(bar.get_value(), 75u);
    EXPECT_TRUE(bar.is_dirty());

    // Out-of-range ints clamp before narrowing to a percentage, rather than
    // wrapping (300 would otherwise become 44, -1 would become 255 -> 100).
    subject.set(300);
    EXPECT_EQ(bar.get_value(), 100u);
    subject.set(-1);
    EXPECT_EQ(bar.get_value(), 0u);

    // A notification that leaves the clamped target unchanged is not a repaint.
    bar.clear_dirty();
    subject.set(-50);
    EXPECT_EQ(bar.get_value(), 0u);
    EXPECT_FALSE(bar.is_dirty());
}

TEST(ProgressBar, BindValueAnimatesLikeSetValue) {
    u8g2gl_subject_int subject(0);
    u8g2gl_progress_bar bar;
    bar.set_animate_duration_ms(100);
    ASSERT_TRUE(bar.bind_value(&subject));

    subject.set(100);
    EXPECT_EQ(bar.get_target_value(), 100u);
    EXPECT_EQ(bar.get_value(), 0u);
    bar.tick(0);
    bar.tick(100);
    EXPECT_EQ(bar.get_value(), 100u);
}

TEST(ProgressBar, SizeOf) {
    std::cout << "\n================ u8g2gl_progress_bar SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):          " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_progress_bar): " << sizeof(u8g2gl_progress_bar) << " bytes" << std::endl;
    std::cout << "===================================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_progress_bar", std::to_string(sizeof(u8g2gl_progress_bar)));

    EXPECT_LE(sizeof(u8g2gl_progress_bar), 80u);
}
