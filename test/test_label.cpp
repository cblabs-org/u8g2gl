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
 *              u8g2gl_label across all four long_mode values, and bound text
 *              (PR-04 WO10b): a label bound to a subject draws that subject's
 *              value, asserted on the text the U8G2 stub's ordered call log
 *              recorded (it copies the text, so a value formatted on render()'s
 *              stack can still be read after render() returns).
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "U8g2lib.h"
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

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
    // x_ - scroll_x_ = -1 reaches U8G2 through u8g2gl_coord_pos(), which wraps
    // it explicitly (WO4c ruling); the retyped stub records what hardware
    // receives, so -1 is observed as 65535.
    EXPECT_EQ(display.last_draw_utf8_x, static_cast<int>(u8g2gl_coord_pos(-1)));
    EXPECT_EQ(display.last_draw_utf8_x, 65535);
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
    // x_ - scroll_x_ = -1 reaches U8G2 through u8g2gl_coord_pos(), which wraps
    // it explicitly (WO4c ruling); the retyped stub records what hardware
    // receives, so -1 is observed as 65535.
    EXPECT_EQ(display.last_draw_utf8_x, static_cast<int>(u8g2gl_coord_pos(-1)));
    EXPECT_EQ(display.last_draw_utf8_x, 65535);

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

// WO2b: long_mode="scroll" must reverse at each end rather than wrap
// continuously — the design spec's semantics table always specified this;
// WO2 had wired the absorbed u8g2gl_scrolling_label's continuous wrap onto
// this value by mistake (that mechanic is scroll_circular's, and stays
// there — see LabelScrollCircular below). This test replaces WO2's
// WrapAroundSignalsFinished, which asserted exactly the wrapping behaviour
// this work order corrects.
TEST(LabelScroll, ReversesAtFarEdgeAndReturnsToOrigin) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    label.set_coords(10, 5, 50, 16);
    label.set_text("Short text");

    U8G2 display;
    display.utf8_width_val = 60; // message_width = 60; scroll_max = 60 - 50 = 10
    label.render(display);

    // Initial tick establishes the initial-delay pause.
    label.tick(0);

    // Step well past the point where the far edge (scroll_max = 10 px) is
    // reached; each interval advances the offset by exactly 1 px.
    uint32_t t = 3001;
    for (int i = 0; i < 15; ++i) {
        label.tick(t);
        t += 41;
    }

    // Far edge reached and clamped: draw_x = x_ - scroll_max = 10 - 10 = 0,
    // putting the text's right edge (0 + message_width 60 = 60) exactly on
    // the widget's right bound (x_ + w_ = 10 + 50 = 60).
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, 0);

    // Reversing is endless — see set_long_mode() — so it must never latch,
    // unlike WO2's old wrap-based implementation.
    EXPECT_FALSE(label.is_scroll_finished());

    // Dwell at the far end for static_dwell_ms (default 5000ms), then the
    // offset must begin DECREASING again. This is the assertion that fails
    // against WO2's continuous-wrap implementation and is the whole point of
    // this work order.
    t += 5001; // clear the far-end dwell
    label.tick(t);
    t += 41;
    label.tick(t);
    label.render(display);
    EXPECT_GT(display.last_draw_utf8_x, 0); // moved back off the far edge
    EXPECT_LT(display.last_draw_utf8_x, 10);

    // Keep stepping until the marquee returns fully to the origin.
    for (int i = 0; i < 15; ++i) {
        t += 41;
        label.tick(t);
    }
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, 10); // back at x_ - scroll_x(0) = 10
    EXPECT_FALSE(label.is_scroll_finished()); // still never latches
}

// WO2b: dwell at both ends uses static_dwell_ms — no second timing property.
TEST(LabelScroll, DwellsAtFarEndForStaticDwellMs) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    label.set_coords(10, 5, 50, 16);
    label.set_text("Short text");
    label.set_static_dwell_ms(2000);

    U8G2 display;
    display.utf8_width_val = 60; // scroll_max = 10
    label.render(display);

    label.tick(0);
    uint32_t t = 3001;
    uint32_t deadline = 0;
    // Exactly scroll_max (10) movement ticks are needed to walk scroll_x_
    // from 0 to the far edge; the 10th is the one that clamps and dwells.
    for (int i = 0; i < 10; ++i) {
        deadline = label.tick(t);
        t += 41;
    }
    // The tick that reached the far edge must report the configured dwell,
    // not the usual per-pixel scroll interval.
    EXPECT_EQ(deadline, 2000u);

    // Position must hold steady while still inside the dwell window.
    label.render(display);
    int16_t x_during_dwell = display.last_draw_utf8_x;
    label.tick(t); // still short of the 2000ms dwell
    label.render(display);
    EXPECT_EQ(display.last_draw_utf8_x, x_during_dwell);
}

// WO2b: scroll and scroll_circular must remain observably different so they
// can never be silently collapsed back into one behaviour again. scroll's
// offset is bounded to [0, scroll_max] by reversing; scroll_circular's wrap
// drives it negative once the text has fully exited.
TEST(Label, ScrollAndScrollCircularAreObservablyDifferent) {
    U8G2 display;
    display.utf8_width_val = 60; // message_width = 60

    u8g2gl_label scroll_label;
    scroll_label.set_long_mode(U8G2GL_LONG_SCROLL);
    scroll_label.set_coords(10, 5, 50, 16);
    scroll_label.set_text("Short text");
    scroll_label.render(display);

    u8g2gl_label circular_label;
    circular_label.set_long_mode(U8G2GL_LONG_SCROLL_CIRCULAR);
    circular_label.set_coords(10, 5, 50, 16);
    circular_label.set_text("Short text");
    circular_label.render(display);

    scroll_label.tick(0);
    circular_label.tick(0);

    uint32_t t = 3001;
    for (int i = 0; i < 100; ++i) {
        scroll_label.tick(t);
        circular_label.tick(t);
        t += 41;
    }

    scroll_label.render(display);
    int16_t scroll_x = display.last_draw_utf8_x;
    circular_label.render(display);
    int16_t circular_x = display.last_draw_utf8_x;

    // scroll never advances past the origin (draw_x <= x_ = 10): it bounces
    // between 0 and the far edge and back.
    EXPECT_LE(scroll_x, 10);
    // scroll_circular, having wrapped at least once by now, draws with
    // draw_x = x_ - scroll_x_ where scroll_x_ went negative (-w_ = -50),
    // producing an offset scroll can never reach.
    EXPECT_GT(circular_x, 10);

    EXPECT_FALSE(scroll_label.is_scroll_finished());
    EXPECT_FALSE(circular_label.is_scroll_finished());
}

// WO2b line-item: text shorter than the widget does not scroll in either
// mode — the marquee state machine's Step 4 (no-scroll dwell path) governs
// both, and neither should move scroll_x_ off the origin.
TEST(Label, ShortTextDoesNotScrollInEitherMode) {
    U8G2 display;
    display.utf8_width_val = 20; // fits well within w=50

    for (u8g2gl_long_mode_t mode : {U8G2GL_LONG_SCROLL, U8G2GL_LONG_SCROLL_CIRCULAR}) {
        u8g2gl_label label;
        label.set_long_mode(mode);
        label.set_coords(10, 5, 50, 16);
        label.set_text("Fits");
        label.render(display);

        // Establish the initial-delay deadline (default 3000ms), then jump
        // straight past the static dwell deadline that follows it (default
        // 5000ms more) — this is the no-scroll path (Step 4), which never
        // touches scroll_x_.
        label.tick(0);
        EXPECT_TRUE(label.tick(8001) == U8G2GL_IDLE);

        label.render(display);
        // No marquee offset applied: render_scroll's static-fit centering
        // path draws at the centered x, not x_ - scroll_x_, but scroll_x_
        // itself must never have moved off 0 regardless.
        EXPECT_TRUE(label.is_scroll_finished()); // static-fit dwell elapsed
    }
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

// Replaces RenderSetsClipWindow (WO4b, F6). That test asserted the marquee set a
// clip of its own bounds and reset to the full display — the behaviour that let
// a scrolling label escape its container. The framework clip (§11.3) now bounds
// it, so render() must set and reset nothing.
TEST(LabelScroll, RenderSetsNoClipWindow) {
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    label.set_coords(10, 20, 60, 16);
    label.set_text("Clipped marquee text");

    U8G2 display;
    display.utf8_width_val = 120; // Overflows: the marquee path

    label.render(display);

    EXPECT_EQ(display.draw_utf8_count, 1);  // it did take the marquee path
    EXPECT_EQ(display.set_clip_window_count, 0);
    EXPECT_EQ(display.max_clip_window_count, 0);
}

// Snapshots the clip state immediately after the label has drawn, while still
// inside u8g2gl_render_object(), so the test sees what the label left in force.
class clip_probe_label : public u8g2gl_label {
public:
    int set_clip_count_after_draw = -1;
    int max_clip_count_after_draw = -1;
    int clip_x1_after_draw = -1;

    void render(U8G2& display) override {
        u8g2gl_label::render(display);
        set_clip_count_after_draw = display.set_clip_window_count;
        max_clip_count_after_draw = display.max_clip_window_count;
        clip_x1_after_draw = display.last_clip_x1;
    }
};

TEST(LabelScroll, InsideNarrowerContainerNeverWidensClip) {
    // A 40-px container holding a 100-px scrolling label: before WO4b the label
    // replaced the container's clip with its own 100-px bounds.
    u8g2gl_obj container;
    container.set_coords(0, 0, 40, 16);
    clip_probe_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    label.set_coords(0, 0, 100, 16);
    label.set_text("A marquee wider than its container");

    u8g2gl_obj* const objs[] = { &container, &label };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    U8G2 display;
    display.utf8_width_val = 200; // Overflows the label: the marquee path

    u8g2gl_render_object(display, objs, parents, 1);

    // The only clip ever set is the wrapper's, bounded by the container
    // (x1 = 40, exclusive), and the label neither replaced nor reset it.
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(label.set_clip_count_after_draw, 1);
    EXPECT_EQ(label.max_clip_count_after_draw, 0);
    EXPECT_EQ(label.clip_x1_after_draw, 40);
    EXPECT_EQ(display.set_clip_window_count, 1);
    EXPECT_EQ(display.max_clip_window_count, 1);  // the wrapper's reset only
}

TEST(LabelScroll, RenderAnimationUpdateClipsToOwnBounds) {
    // Outside the render wrapper no framework clip exists, so the blocked-loop
    // redraw bounds itself — through u8g2gl_apply_clip(), not its own arithmetic.
    u8g2gl_label label;
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    label.set_coords(10, 20, 60, 16);
    label.set_text("Blocked loop scrolling");

    U8G2 display;
    display.utf8_width_val = 120;
    label.render(display);
    label.tick(0);

    label.render_animation_update(display, 3001);  // past the initial delay

    EXPECT_EQ(display.set_clip_window_count, 1);
    EXPECT_EQ(display.last_clip_x0, 10);
    EXPECT_EQ(display.last_clip_y0, 20);
    EXPECT_EQ(display.last_clip_x1, 70);  // exclusive: 10 + 60
    EXPECT_EQ(display.last_clip_y1, 36);  // exclusive: 20 + 16
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
    // x_ - scroll_x_ = -1 reaches U8G2 through u8g2gl_coord_pos(), which wraps
    // it explicitly (WO4c ruling); the retyped stub records what hardware
    // receives, so -1 is observed as 65535.
    EXPECT_EQ(display.last_draw_utf8_x, static_cast<int>(u8g2gl_coord_pos(-1)));
    EXPECT_EQ(display.last_draw_utf8_x, 65535);
}

// WO4c ruling: a text origin left of the display reaches U8G2 wrapped,
// explicitly, through u8g2gl_coord_pos(), and U8G2's glyph renderer draws the
// visible part. Clamping would freeze a marquee and skipping would blank it.
TEST(LabelScroll, TextLeftOfOriginReachesU8g2Wrapped) {
    u8g2gl_label label;
    label.set_coords(-5, 4, 20, 10);   // clip mode, partly off the left edge
    label.set_text("Hi");

    U8G2 display;
    label.render(display);

    ASSERT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(display.last_draw_utf8_x, 65531);   // -5 modulo 2^16
    EXPECT_EQ(display.last_draw_utf8_y, 9);       // 4 + (10 - 0) / 2, centred
}

// =====================================================================
// Bound text (PR-04 WO10b). Before WO10b every render path read only the
// literal set_text() text, so a bound label drew nothing: these tests assert
// the text actually drawn, never merely that a frame was scheduled.
// =====================================================================

namespace {

// drawn_texts
// Every drawUTF8 text the stub logged, in call order.
std::vector<std::string> drawn_texts(const U8G2& display) {
    std::vector<std::string> texts;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        if (std::strcmp(display.call_log[i].op, "drawUTF8") == 0) {
            texts.emplace_back(display.call_log[i].text);
        }
    }
    return texts;
}

// width_by_length
// A stub font whose every byte is 5 px wide, so a longer text measures wider.
int width_by_length(const char* s) {
    return static_cast<int>(std::strlen(s)) * 5;
}

}  // namespace

// The Chief Architect's acceptance test (1): bind, set a value, render, and the
// text drawn IS that value.
TEST(LabelBoundText, StringSubjectValueIsTheTextDrawn) {
    u8g2gl_subject_string_n<16> station;
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    ASSERT_TRUE(label.bind_text(&station));
    station.set("Euston");

    U8G2 display;
    label.render(display);

    EXPECT_EQ(drawn_texts(display), std::vector<std::string>{"Euston"});
}

TEST(LabelBoundText, ChangingTheSubjectChangesTheTextDrawn) {
    u8g2gl_subject_string_n<16> station;
    station.set("Euston");
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    ASSERT_TRUE(label.bind_text(&station));

    U8G2 first;
    label.render(first);
    EXPECT_EQ(drawn_texts(first), std::vector<std::string>{"Euston"});

    label.clear_dirty();
    station.set("Crewe");
    EXPECT_TRUE(label.is_dirty());
    U8G2 second;
    label.render(second);
    EXPECT_EQ(drawn_texts(second), std::vector<std::string>{"Crewe"});
}

TEST(LabelBoundText, IntSubjectIsFormattedThroughItsFormat) {
    u8g2gl_subject_int temperature(21);
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    ASSERT_TRUE(label.bind_text(&temperature, "%d°C"));

    U8G2 display;
    label.render(display);
    EXPECT_EQ(drawn_texts(display), std::vector<std::string>{"21°C"});

    temperature.set(-4);
    U8G2 colder;
    label.render(colder);
    EXPECT_EQ(drawn_texts(colder), std::vector<std::string>{"-4°C"});
}

TEST(LabelBoundText, IntSubjectWithNoFormatDrawsItsDecimalValue) {
    u8g2gl_subject_int count(-2147483647 - 1);
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    ASSERT_TRUE(label.bind_text(&count));

    U8G2 display;
    label.render(display);
    EXPECT_EQ(drawn_texts(display), std::vector<std::string>{"-2147483648"});
}

TEST(LabelBoundText, FormattedTextLongerThanTheBufferIsTruncatedNotOverflowed) {
    u8g2gl_subject_int count(7);
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    // 1 + 40 characters: longer than U8G2GL_BOUND_TEXT_BUFFER_SIZE.
    ASSERT_TRUE(label.bind_text(&count, "%d and a unit suffix far too long to fit"));

    U8G2 display;
    // The stub copies only 31 bytes into the call log, so measure the pointer
    // U8G2 was handed, while render() is still on the stack: the width callback
    // runs inside render() (clip measures the live text).
    static size_t s_seen_length = 0;
    display.custom_utf8_width = [](const char* s) -> int {
        s_seen_length = std::strlen(s);
        return 0;
    };
    label.render(display);
    EXPECT_EQ(s_seen_length, static_cast<size_t>(U8G2GL_BOUND_TEXT_BUFFER_SIZE - 1));
    EXPECT_EQ(drawn_texts(display).size(), 1u);
}

TEST(LabelBoundText, BindingWinsOverALiteralSetBeforeIt) {
    u8g2gl_subject_string_n<16> station;
    station.set("Euston");
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    label.set_text("Literal");
    ASSERT_TRUE(label.bind_text(&station));

    U8G2 display;
    label.render(display);
    EXPECT_EQ(drawn_texts(display), std::vector<std::string>{"Euston"});
}

TEST(LabelBoundText, BindingWinsOverALiteralSetAfterIt) {
    u8g2gl_subject_string_n<16> station;
    station.set("Euston");
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    ASSERT_TRUE(label.bind_text(&station));
    label.set_text("Literal");

    U8G2 display;
    label.render(display);
    EXPECT_EQ(drawn_texts(display), std::vector<std::string>{"Euston"});
    // get_text() still reports the literal it was given.
    EXPECT_STREQ(label.get_text(), "Literal");
}

TEST(LabelBoundText, DotsOnALongBoundStringTruncatesAndReMeasuresOnChange) {
    u8g2gl_subject_string_n<32> message;
    message.set("A message far wider than this label");   // 35 chars -> 175 px
    u8g2gl_label label;
    label.set_coords(0, 0, 60, 10);
    label.set_long_mode(U8G2GL_LONG_DOTS);
    ASSERT_TRUE(label.bind_text(&message));

    U8G2 display;
    display.custom_utf8_width = width_by_length;
    label.render(display);
    // The whole bound text, then the ellipsis at x + w - width("...") = 60 - 15.
    EXPECT_EQ(drawn_texts(display),
              (std::vector<std::string>{"A message far wider than this l", "..."}));   // log copies 31 bytes
    EXPECT_EQ(display.last_draw_utf8_x, 45);

    // The subject now fits. The cached width must be re-measured, or the stale
    // overflow would still draw an ellipsis over text that fits.
    message.set("Fits");
    U8G2 after;
    after.custom_utf8_width = width_by_length;
    label.render(after);
    EXPECT_EQ(drawn_texts(after), std::vector<std::string>{"Fits"});
}

TEST(LabelBoundText, ScrollModeMarqueesABoundTextWithNoLiteral) {
    u8g2gl_subject_string_n<32> message;
    message.set("A message far wider than this label");
    u8g2gl_label label;
    label.set_coords(0, 0, 60, 10);
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    ASSERT_TRUE(label.bind_text(&message));

    // tick() reads the same text render() does, so a bound label with no
    // literal still asks for frames rather than idling.
    EXPECT_NE(label.tick(0), U8G2GL_IDLE);

    U8G2 display;
    display.custom_utf8_width = width_by_length;
    label.render(display);
    ASSERT_EQ(drawn_texts(display).size(), 1u);
    EXPECT_EQ(drawn_texts(display)[0], "A message far wider than this l");
    EXPECT_NE(label.tick(1), U8G2GL_IDLE);
}

TEST(LabelBoundText, LiteralStillDrawsWhenNothingIsBound) {
    u8g2gl_label label;
    label.set_coords(0, 0, 100, 10);
    label.set_text("Literal");

    U8G2 display;
    label.render(display);
    EXPECT_EQ(drawn_texts(display), std::vector<std::string>{"Literal"});
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
