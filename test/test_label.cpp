/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_label.cpp
 *
 * Purpose: Verification suite for u8g2gl_label, including the marquee
 *          behaviour absorbed from the deleted u8g2gl_scrolling_label
 *          (PR-3R WO2, [D-19]). The scrolling-mode tests below are the former
 *          test_scrolling_label.cpp suite, moved and re-targeted at
 *          long_mode="scroll" rather than rewritten — the work order was a
 *          relocation, and a relocation that quietly altered timing would be
 *          a regression no test here would catch if the assertions had been
 *          rewritten instead of moved.
 *
 * Description: GoogleTest suite exercising the complete contract of
 *              u8g2gl_label across all four long_mode values.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8G2lib.h"
#include <iostream>
#include <string>

// Test dummy font array
static const uint8_t s_mock_font[4] = { 0x01, 0x02, 0x03, 0x04 };

// =====================================================================
// Core behaviour: construction, text, static (clip) rendering, alignment
// =====================================================================

TEST(Label, DefaultConstruction) {
    u8g2gl_label label;

    // Default label holds nullptr text, defaults to long_mode="clip", and
    // returns idle on tick (clip never animates).
    EXPECT_EQ(label.get_text(), nullptr);
    EXPECT_EQ(label.get_long_mode(), U8G2GL_LONG_CLIP);
    EXPECT_EQ(label.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(label.is_dirty());

    // Default marquee configuration, carried from the absorbed
    // u8g2gl_scrolling_label even though clip mode never uses it.
    EXPECT_EQ(label.get_scroll_px_per_sec(), 25);
    EXPECT_EQ(label.get_initial_delay_ms(), 3000);
    EXPECT_EQ(label.get_static_dwell_ms(), 5000);
}

TEST(Label, SetText) {
    u8g2gl_label label;
    const char* literal = "Hello";

    label.set_text(literal);
    EXPECT_EQ(label.get_text(), literal);

    // Clear back to nullptr
    label.set_text(nullptr);
    EXPECT_EQ(label.get_text(), nullptr);
}

TEST(Label, SetTextMarksDirty) {
    u8g2gl_label label;
    EXPECT_FALSE(label.is_dirty());

    label.set_text("Updated");
    EXPECT_TRUE(label.is_dirty());

    label.clear_dirty();
    EXPECT_FALSE(label.is_dirty());
}

TEST(Label, SetTextUnchangedDoesNotMarkDirty) {
    u8g2gl_label label;
    const char* literal = "Same";
    label.set_text(literal);
    label.clear_dirty();

    label.set_text(literal);  // identical pointer — no visible change
    EXPECT_FALSE(label.is_dirty());
}

TEST(Label, TickAlwaysIdleUnderClip) {
    u8g2gl_label label;
    label.set_text("Static");

    // Static text never animates regardless of timestamp
    EXPECT_EQ(label.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(label.tick(12345), U8G2GL_IDLE);
    EXPECT_EQ(label.tick(999999), U8G2GL_IDLE);
}

TEST(Label, RenderWithNullText) {
    u8g2gl_label label;
    U8G2 display;

    // render() with nullptr text must early-exit safely without drawing
    label.render(display);
    EXPECT_EQ(display.draw_utf8_count, 0);
}

TEST(Label, RenderEmptyTextDoesNotDraw) {
    u8g2gl_label label;
    label.set_text("");
    U8G2 display;

    // render() with empty string must also early-exit
    label.render(display);
    EXPECT_EQ(display.draw_utf8_count, 0);
}

TEST(Label, RenderDrawsText) {
    u8g2gl_label label;
    label.set_coords(10, 20, 60, 16);
    label.set_font(s_mock_font);
    label.set_text("Hello");

    U8G2 display;
    label.render(display);

    EXPECT_EQ(display.last_font, s_mock_font);
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_STREQ(display.last_draw_utf8_text, "Hello");
}

TEST(Label, AlignmentRenderingUnderClip) {
    U8G2 display;
    display.utf8_width_val = 30; // Mock width of text

    // 1. Left alignment (default)
    {
        u8g2gl_label label;
        label.set_coords(10, 5, 80, 20);
        label.set_align(U8G2GL_ALIGN_LEFT);
        label.set_text("Aligned");

        display.draw_utf8_count = 0;
        label.render(display);
        EXPECT_EQ(display.last_draw_utf8_x, 10);
    }

    // 2. Center alignment: x + (w - textWidth) / 2 = 10 + (80 - 30) / 2 = 35
    {
        u8g2gl_label label;
        label.set_coords(10, 5, 80, 20);
        label.set_align(U8G2GL_ALIGN_CENTER);
        label.set_text("Aligned");

        display.draw_utf8_count = 0;
        label.render(display);
        EXPECT_EQ(display.last_draw_utf8_x, 35);
    }

    // 3. Right alignment: x + (w - textWidth) = 10 + (80 - 30) = 60
    {
        u8g2gl_label label;
        label.set_coords(10, 5, 80, 20);
        label.set_align(U8G2GL_ALIGN_RIGHT);
        label.set_text("Aligned");

        display.draw_utf8_count = 0;
        label.render(display);
        EXPECT_EQ(display.last_draw_utf8_x, 60);
    }
}

TEST(Label, VerticalCentering) {
    U8G2 display;
    display.ascent_val = 10;
    display.descent_val = -2; // fontHeight = 10 - (-2) = 12

    // Positive height: h = 20, y = 5 -> yOffset = (20 - 12) / 2 = 4 -> drawY = 9
    {
        u8g2gl_label label;
        label.set_coords(0, 5, 50, 20);
        label.set_text("Centered");

        label.render(display);
        EXPECT_EQ(display.last_draw_utf8_y, 9);
    }

    // Zero height: h = 0 -> yOffset = 0 -> drawY = y
    {
        u8g2gl_label label;
        label.set_coords(0, 5, 50, 0);
        label.set_text("ZeroH");

        label.render(display);
        EXPECT_EQ(display.last_draw_utf8_y, 5);
    }
}

TEST(Label, StyleApplication) {
    u8g2gl_label label;
    label.set_text("Styled");
    label.set_draw_color(U8G2GL_COLOR_0);
    label.set_font_mode(U8G2GL_FONT_MODE_TRANSPARENT);

    U8G2 display;
    label.render(display);

    EXPECT_EQ(display.getDrawColor(), 0);
    EXPECT_EQ(display.last_font_mode, static_cast<uint8_t>(U8G2GL_FONT_MODE_TRANSPARENT));
}

TEST(Label, InheritsFromObj) {
    u8g2gl_label label;
    label.set_coords(1, 2, 30, 10);
    label.set_text("Polymorphic");

    // Static pointer conversion
    u8g2gl_obj* obj = &label;
    EXPECT_EQ(obj->get_x(), 1);
    EXPECT_EQ(obj->get_y(), 2);
    EXPECT_EQ(obj->get_w(), 30);
    EXPECT_EQ(obj->get_h(), 10);

    // Virtual dispatch for tick()
    EXPECT_EQ(obj->tick(500), U8G2GL_IDLE);

    // Virtual dispatch for render()
    U8G2 display;
    obj->render(display);
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_STREQ(display.last_draw_utf8_text, "Polymorphic");
}

// =====================================================================
// long_mode: default, guard, and dots coverage
// =====================================================================

TEST(Label, LongModeDefaultIsClip) {
    u8g2gl_label label;
    EXPECT_EQ(label.get_long_mode(), U8G2GL_LONG_CLIP);
}

TEST(Label, SetLongModeMarksDirty) {
    u8g2gl_label label;
    label.clear_dirty();
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    EXPECT_TRUE(label.is_dirty());
    EXPECT_EQ(label.get_long_mode(), U8G2GL_LONG_SCROLL);
}

TEST(Label, SetLongModeUnchangedDoesNotMarkDirty) {
    u8g2gl_label label;
    EXPECT_EQ(label.get_long_mode(), U8G2GL_LONG_CLIP);
    label.clear_dirty();
    label.set_long_mode(U8G2GL_LONG_CLIP);  // already clip — no visible change
    EXPECT_FALSE(label.is_dirty());
}

TEST(Label, DotsDrawsFullTextPlusEllipsisWhenOverflowing) {
    u8g2gl_label label;
    label.set_coords(0, 0, 50, 16);
    label.set_long_mode(U8G2GL_LONG_DOTS);
    label.set_text("This text is much wider than the widget");

    U8G2 display;
    display.utf8_width_val = 200; // wider than w=50
    display.custom_utf8_width = [](const char* s) -> int {
        std::string str(s);
        return (str == "...") ? 12 : 200;
    };

    label.render(display);

    // The framework's ambient clip window does the actual clipping (§11.3,
    // not exercised by the U8G2 stub); this label still issues the full-text
    // draw plus an ellipsis overdraw at the right edge.
    EXPECT_GE(display.draw_utf8_count, 2);
    // Last draw is the ellipsis, positioned at x + w - dots_width = 0+50-12 = 38
    EXPECT_EQ(display.last_draw_utf8_x, 38);
    EXPECT_STREQ(display.last_draw_utf8_text, "...");
}

TEST(Label, DotsDoesNotDrawEllipsisWhenTextFits) {
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 16);
    label.set_long_mode(U8G2GL_LONG_DOTS);
    label.set_text("Fits fine");

    U8G2 display;
    display.utf8_width_val = 40; // fits within w=100

    label.render(display);

    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_STREQ(display.last_draw_utf8_text, "Fits fine");
}

// =====================================================================
// long_mode="scroll" — the absorbed u8g2gl_scrolling_label suite, moved
// unchanged. Every assertion below is byte-for-byte the same expectation the
// deleted test_scrolling_label.cpp made; only the widget type and the
// long_mode="scroll" setup line differ.
// =====================================================================

TEST(LabelScroll, DefaultsBeforeUse) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);

    EXPECT_EQ(label.get_text(), nullptr);
    EXPECT_EQ(label.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(label.is_scroll_finished());
}

TEST(LabelScroll, SetTextInvalidatesLayoutAndMarksDirty) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    const char* literal = "Platform 2 — 07:42 Departure to London Waterloo";

    label.set_text(literal);
    EXPECT_EQ(label.get_text(), literal);
    EXPECT_TRUE(label.is_dirty());

    label.clear_dirty();
    label.set_text(nullptr);
    EXPECT_EQ(label.get_text(), nullptr);
    EXPECT_TRUE(label.is_dirty());
}

TEST(LabelScroll, TickReturnsDeadlineNotIdle) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, InitialDelayBeforeScroll) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, ResetScroll) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, ConfigurableScrollSpeed) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, WrapAroundSignalsFinished) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

    // Now scroll_x should wrap to -w_ (-50) and scroll_finished becomes true —
    // only long_mode="scroll" latches this; see LabelScrollCircular below.
    EXPECT_TRUE(label.is_scroll_finished());

    // Next render should draw at x - scroll_x = 10 - (-50) = 60 (right edge)
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, 60);
}

TEST(LabelScroll, StaticTextDwell) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, RenderSetsClipWindow) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, RenderAnimationUpdate) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

TEST(LabelScroll, RenderAnimationUpdateNoOpOutsideScrollModes) {
    u8g2gl_label label;  // long_mode defaults to clip
    label.set_coords(0, 0, 50, 16);
    label.set_text("Not scrolling");

    U8G2 display;
    label.render(display);
    display.update_display_area_count = 0;

    label.render_animation_update(display, 3001);
    EXPECT_EQ(display.update_display_area_count, 0);
}

TEST(LabelScroll, InheritsFromObj) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
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

// =====================================================================
// long_mode="scroll_circular" — same marquee mechanics, distinguished only
// by never latching is_scroll_finished(). See u8g2gl_label.h's
// set_long_mode() doc for why no separate reversing/bounce timing was
// implemented, and WO2's Completion Report for the full reasoning.
// =====================================================================

TEST(LabelScrollCircular, WrapsWithoutSignalingFinished) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL_CIRCULAR);
    label.set_coords(10, 5, 50, 16);
    label.set_text("Short text");

    U8G2 display;
    display.utf8_width_val = 60; // message_width = 60
    label.render(display);

    label.tick(0);

    // Step well past the point where long_mode="scroll" would have wrapped
    // and latched finished (see LabelScroll.WrapAroundSignalsFinished).
    uint32_t t = 3001;
    for (int i = 0; i < 200; ++i) {
        label.tick(t);
        t += 41;
    }

    // The marquee still wraps (pixel offset resets), but scroll_circular never
    // reports a finished cycle — there is no external controller to signal.
    EXPECT_FALSE(label.is_scroll_finished());
}

TEST(LabelScrollCircular, StillMarquees) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL_CIRCULAR);
    label.set_coords(0, 0, 50, 16);
    label.set_text("Circular marquee text");

    U8G2 display;
    display.utf8_width_val = 120;
    label.render(display);

    label.tick(0);
    label.tick(3001);

    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, -1);
}

// =====================================================================
// Memory footprint
// =====================================================================

TEST(Label, SizeOf) {
    std::cout << "\n================ u8g2gl_label SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):   " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_label): " << sizeof(u8g2gl_label) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_label", std::to_string(sizeof(u8g2gl_label)));

    // u8g2gl_label absorbed u8g2gl_scrolling_label's members (PR-3R WO2,
    // [D-19]); every label now carries marquee state whether it scrolls or
    // not. Measured at 80 bytes on this 64-bit host (sizeof(u8g2gl_obj) here
    // is 48 bytes) — up from the pre-WO2 label's 56 bytes, a +24 byte cost.
    // [D-19] estimated roughly +16 bytes from the gap between the old label
    // (56 B) and the old scrolling_label (72 B); the measured figure is
    // larger because the merged class also carries the `overflow_` flag and
    // the `long_mode_` selector that scrolling_label never needed, on top of
    // the moved marquee state. Per §1.3, this ceiling is the measured number,
    // not the estimate — see WO2's Completion Report.
    EXPECT_LE(sizeof(u8g2gl_label), 80u);
}
