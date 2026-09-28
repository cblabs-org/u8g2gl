/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_switch.cpp
 *
 * Purpose: Verification suite for u8g2gl_switch widget. Validates default
 *          state, binary value assignment, dirty tracking, static lifecycle
 *          guarantees, track and handle rendering in OFF and ON positions,
 *          degenerate geometry handling, polymorphism, strict memory budgets,
 *          and the default switch's pinned rounded-box arguments (PR-4R WO3,
 *          ruling D).
 *
 * Description: GoogleTest test cases covering the complete specification of
 *              u8g2gl_switch.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_switch.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8g2lib.h"
#include <iostream>
#include <string>

TEST(Switch, DefaultConstruction) {
    u8g2gl_switch sw;

    EXPECT_FALSE(sw.get_value());
    EXPECT_EQ(sw.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(sw.is_dirty());
}

TEST(Switch, SetValue) {
    u8g2gl_switch sw;

    sw.set_value(true);
    EXPECT_TRUE(sw.get_value());
    EXPECT_TRUE(sw.is_dirty());

    sw.clear_dirty();
    // Setting identical value should not mark dirty
    sw.set_value(true);
    EXPECT_FALSE(sw.is_dirty());

    sw.set_value(false);
    EXPECT_FALSE(sw.get_value());
    EXPECT_TRUE(sw.is_dirty());
}

TEST(Switch, TickAlwaysIdle) {
    u8g2gl_switch sw;
    sw.set_value(true);

    EXPECT_EQ(sw.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(sw.tick(1000), U8G2GL_IDLE);
    EXPECT_EQ(sw.tick(999999), U8G2GL_IDLE);
}

TEST(Switch, RenderOff) {
    u8g2gl_switch sw;
    sw.set_coords(10, 20, 30, 14);
    sw.set_value(false);

    U8G2 display;
    sw.render(display);

    // Track frame: x=10, y=20, w=30, h=14
    EXPECT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 10);
    EXPECT_EQ(display.last_draw_rframe_y, 20);
    EXPECT_EQ(display.last_draw_rframe_w, 30);
    EXPECT_EQ(display.last_draw_rframe_h, 14);

    // Handle off position: x = 10 + 1 = 11, y = 20 + 1 = 21, w = (30 / 2) - 1 = 14, h = 14 - 2 = 12
    EXPECT_EQ(display.draw_rbox_count, 1);
    EXPECT_EQ(display.last_draw_rbox_x, 11);
    EXPECT_EQ(display.last_draw_rbox_y, 21);
    EXPECT_EQ(display.last_draw_rbox_w, 14);
    EXPECT_EQ(display.last_draw_rbox_h, 12);
}

TEST(Switch, RenderOn) {
    u8g2gl_switch sw;
    sw.set_coords(10, 20, 30, 14);
    sw.set_value(true);

    U8G2 display;
    sw.render(display);

    // Track frame
    EXPECT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 10);
    EXPECT_EQ(display.last_draw_rframe_y, 20);

    // Handle on position: x = 10 + (30 / 2) = 25, y = 20 + 1 = 21, w = (30 / 2) - 1 = 14, h = 14 - 2 = 12
    EXPECT_EQ(display.draw_rbox_count, 1);
    EXPECT_EQ(display.last_draw_rbox_x, 25);
    EXPECT_EQ(display.last_draw_rbox_y, 21);
    EXPECT_EQ(display.last_draw_rbox_w, 14);
    EXPECT_EQ(display.last_draw_rbox_h, 12);
}

TEST(Switch, RenderCustomRadius) {
    u8g2gl_switch sw;
    sw.set_coords(0, 0, 40, 16);
    sw.set_radius(4);
    sw.set_value(false);

    U8G2 display;
    sw.render(display);

    EXPECT_EQ(display.last_draw_rframe_r, 4);
    // Handle radius = r - 1 = 3
    EXPECT_EQ(display.last_draw_rbox_r, 3);
}

TEST(Switch, RenderDegenerateGeometry) {
    u8g2gl_switch sw;
    sw.set_coords(0, 0, 2, 2);
    sw.set_value(true);

    U8G2 display;
    sw.render(display);

    EXPECT_EQ(display.draw_rframe_count, 0);
    EXPECT_EQ(display.draw_rbox_count, 0);
}

// WO4c ruling (H1): a switch partly off the left and top edges is drawn with
// explicitly wrapped origins, which U8G2 clips to the visible part — not
// skipped, as the first pass did.
TEST(Switch, PartlyOffEdgeDrawsWithWrappedOrigin) {
    u8g2gl_switch sw;
    sw.set_coords(-5, -2, 30, 14);
    sw.set_value(false);

    U8G2 display;
    sw.render(display);

    ASSERT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 65531);
    EXPECT_EQ(display.last_draw_rframe_y, 65534);
    EXPECT_EQ(display.last_draw_rframe_w, 30);
    EXPECT_EQ(display.last_draw_rframe_h, 14);

    // Handle off position: (-5 + 1, -2 + 1) = (-4, -1), wrapped.
    ASSERT_EQ(display.draw_rbox_count, 1);
    EXPECT_EQ(display.last_draw_rbox_x, 65532);
    EXPECT_EQ(display.last_draw_rbox_y, 65535);
    EXPECT_EQ(display.last_draw_rbox_w, 14);
    EXPECT_EQ(display.last_draw_rbox_h, 12);
}

// PR-4R WO3, CA ruling D: the default switch renders identically before and
// after the rounded-box radius bound (2r <= min(w, h), u8g2gl_coord_corner_radius()).
// THIS TEST EXISTS TO FAIL when someone tightens that bound: a default switch is a
// capsule (r = h / 2), which sits exactly on it, so any stricter bound changes
// these arguments at once.
//
// The expected values are not derived: they were captured from the base's call
// log (runtime at main @ ca398ac, before WO3 changed any runtime code) by
// rendering each case below at (3, 5) and recording every drawRFrame and
// drawRBox, then hard-coded here. Sizes cover even and odd heights, a narrow
// switch (w < h, where the track radius is held to w / 2), the 4x4 minimum,
// and both states.
TEST(Switch, DefaultCallArgumentsPinned) {
    struct pinned_case {
        int w;
        int h;
        bool on;
        int32_t track[5];   // drawRFrame x, y, w, h, r
        int32_t handle[5];  // drawRBox   x, y, w, h, r
    };
    const pinned_case cases[] = {
    {30, 14, false, {3, 5, 30, 14, 7}, {4, 6, 14, 12, 6}},
    {30, 14, true,  {3, 5, 30, 14, 7}, {18, 6, 14, 12, 6}},
    {30, 15, false, {3, 5, 30, 15, 7}, {4, 6, 14, 13, 6}},
    {30, 15, true,  {3, 5, 30, 15, 7}, {18, 6, 14, 13, 6}},
    {20, 10, false, {3, 5, 20, 10, 5}, {4, 6, 9, 8, 4}},
    {20, 10, true,  {3, 5, 20, 10, 5}, {13, 6, 9, 8, 4}},
    {21, 11, false, {3, 5, 21, 11, 5}, {4, 6, 9, 9, 4}},
    {21, 11, true,  {3, 5, 21, 11, 5}, {13, 6, 9, 9, 4}},
    {40, 16, false, {3, 5, 40, 16, 8}, {4, 6, 19, 14, 7}},
    {40, 16, true,  {3, 5, 40, 16, 8}, {23, 6, 19, 14, 7}},
    {16,  9, false, {3, 5, 16, 9, 4},  {4, 6, 7, 7, 3}},
    {16,  9, true,  {3, 5, 16, 9, 4},  {11, 6, 7, 7, 3}},
    {12, 20, false, {3, 5, 12, 20, 6}, {4, 6, 5, 18, 2}},
    {12, 20, true,  {3, 5, 12, 20, 6}, {9, 6, 5, 18, 2}},
    { 9, 17, false, {3, 5, 9, 17, 4},  {4, 6, 3, 15, 1}},
    { 9, 17, true,  {3, 5, 9, 17, 4},  {7, 6, 3, 15, 1}},
    { 4,  4, false, {3, 5, 4, 4, 2},   {4, 6, 1, 2, 0}},
    { 4,  4, true,  {3, 5, 4, 4, 2},   {5, 6, 1, 2, 0}},
    { 5,  5, false, {3, 5, 5, 5, 2},   {4, 6, 1, 3, 0}},
    { 5,  5, true,  {3, 5, 5, 5, 2},   {5, 6, 1, 3, 0}},
    { 8,  4, false, {3, 5, 8, 4, 2},   {4, 6, 3, 2, 1}},
    { 8,  4, true,  {3, 5, 8, 4, 2},   {7, 6, 3, 2, 1}},
    { 6,  7, false, {3, 5, 6, 7, 3},   {4, 6, 2, 5, 1}},
    { 6,  7, true,  {3, 5, 6, 7, 3},   {6, 6, 2, 5, 1}},
    };

    for (const pinned_case& c : cases) {
        SCOPED_TRACE(testing::Message() << "w=" << c.w << " h=" << c.h << " on=" << c.on);
        u8g2gl_switch sw;
        sw.set_coords(3, 5, static_cast<int16_t>(c.w), static_cast<int16_t>(c.h));
        sw.set_value(c.on);

        U8G2 display;
        sw.render(display);

        // Exactly one track frame and one handle box, in that order, and no
        // other shape — a square-cornered fallback would show up here too.
        int rounded = 0;
        for (int i = 0; i < display.call_log_count; ++i) {
            const u8g2_stub_call& call = display.call_log[i];
            const std::string op = call.op;
            if (op == "drawRFrame") {
                ASSERT_EQ(rounded, 0) << "track must be drawn first";
                for (int a = 0; a < 5; ++a) {
                    EXPECT_EQ(call.args[a], c.track[a]) << "drawRFrame argument " << a;
                }
                ++rounded;
            } else if (op == "drawRBox") {
                ASSERT_EQ(rounded, 1) << "handle must follow the track";
                for (int a = 0; a < 5; ++a) {
                    EXPECT_EQ(call.args[a], c.handle[a]) << "drawRBox argument " << a;
                }
                ++rounded;
            } else {
                EXPECT_TRUE(op != "drawFrame" && op != "drawBox") << "unexpected " << op;
            }
        }
        EXPECT_EQ(rounded, 2);
    }
}

TEST(Switch, InheritsFromObj) {
    u8g2gl_switch sw;
    sw.set_coords(5, 5, 20, 10);
    sw.set_value(true);

    u8g2gl_obj* obj = &sw;
    EXPECT_EQ(obj->get_x(), 5);
    EXPECT_EQ(obj->get_y(), 5);
    EXPECT_EQ(obj->get_w(), 20);
    EXPECT_EQ(obj->get_h(), 10);

    EXPECT_EQ(obj->tick(0), U8G2GL_IDLE);

    U8G2 display;
    obj->render(display);
    EXPECT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.draw_rbox_count, 1);
}

// PR-04 WO2: bind_value was declared by the manifest but never implemented.
TEST(Switch, BindValueUpdatesFromSubjectAndMarksDirty) {
    u8g2gl_subject_bool subject(true);
    u8g2gl_switch sw;
    ASSERT_TRUE(sw.bind_value(&subject));

    // Applied at bind time, not on the first change.
    EXPECT_TRUE(sw.get_value());
    EXPECT_TRUE(sw.is_dirty());

    sw.clear_dirty();
    subject.set(false);
    EXPECT_FALSE(sw.get_value());
    EXPECT_TRUE(sw.is_dirty());

    // The rendered handle follows the bound state (thumb left when OFF).
    sw.set_coords(0, 0, 20, 10);
    U8G2 display;
    sw.render(display);
    EXPECT_EQ(display.last_draw_rbox_x, 1);

    // A re-notification of an unchanged value is not a repaint (§11.2).
    sw.clear_dirty();
    subject.notify();
    EXPECT_FALSE(sw.is_dirty());
}

TEST(Switch, SizeOf) {
    std::cout << "\n================ u8g2gl_switch SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):    " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_switch): " << sizeof(u8g2gl_switch) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_switch", std::to_string(sizeof(u8g2gl_switch)));

    EXPECT_LE(sizeof(u8g2gl_switch), 72u);
}
