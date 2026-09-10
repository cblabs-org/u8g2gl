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
 *          degenerate geometry handling, polymorphism, and strict memory budgets.
 *
 * Description: GoogleTest test cases covering the complete specification of
 *              u8g2gl_switch.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_switch.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8G2lib.h"
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

TEST(Switch, SizeOf) {
    std::cout << "\n================ u8g2gl_switch SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):    " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_switch): " << sizeof(u8g2gl_switch) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_switch", std::to_string(sizeof(u8g2gl_switch)));

    EXPECT_LE(sizeof(u8g2gl_switch), 72u);
}
