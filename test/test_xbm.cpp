/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_xbm.cpp
 *
 * Purpose: Verification suite for u8g2gl_xbm bitmap display widget. Validates
 *          default initialization, zero-copy pointer semantics, static idle
 *          tick guarantees, null-safety during rendering, style integration
 *          (draw color and bitmap mode), polymorphism, and memory bounds.
 *
 * Description: GoogleTest suite exercising the complete contract of u8g2gl_xbm.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_xbm.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8G2lib.h"
#include <iostream>
#include <string>

// Sample 8x8 checkerboard XBM bitmap
static const uint8_t s_mock_xbm_bits[8] = {
    0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55
};

TEST(Xbm, DefaultConstruction) {
    u8g2gl_xbm xbm;

    // Default XBM widget has null source pointer and returns idle on tick
    EXPECT_EQ(xbm.get_src(), nullptr);
    EXPECT_EQ(xbm.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(xbm.is_dirty());
}

TEST(Xbm, SetSrc) {
    u8g2gl_xbm xbm;

    xbm.set_src(s_mock_xbm_bits);
    EXPECT_EQ(xbm.get_src(), s_mock_xbm_bits);
    EXPECT_TRUE(xbm.is_dirty());

    xbm.clear_dirty();
    EXPECT_FALSE(xbm.is_dirty());

    // Reset back to nullptr
    xbm.set_src(nullptr);
    EXPECT_EQ(xbm.get_src(), nullptr);
    EXPECT_TRUE(xbm.is_dirty());
}

TEST(Xbm, TickAlwaysIdle) {
    u8g2gl_xbm xbm;
    xbm.set_src(s_mock_xbm_bits);

    // Static XBM widget never animates regardless of timestamp
    EXPECT_EQ(xbm.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(xbm.tick(5000), U8G2GL_IDLE);
    EXPECT_EQ(xbm.tick(999999), U8G2GL_IDLE);
}

TEST(Xbm, RenderWithNullSrc) {
    u8g2gl_xbm xbm;
    U8G2 display;

    // render() with null bitmap must safely early-exit without calling drawXBMP
    xbm.render(display);
    EXPECT_EQ(display.draw_xbmp_count, 0);
}

TEST(Xbm, RenderDrawsXBMP) {
    u8g2gl_xbm xbm;
    xbm.set_coords(12, 24, 16, 16);
    xbm.set_src(s_mock_xbm_bits);
    xbm.set_draw_color(U8G2GL_COLOR_1);
    xbm.set_bitmap_mode(U8G2GL_BITMAP_MODE_TRANSPARENT);

    U8G2 display;
    xbm.render(display);

    EXPECT_EQ(display.draw_xbmp_count, 1);
    EXPECT_EQ(display.last_draw_xbmp_x, 12);
    EXPECT_EQ(display.last_draw_xbmp_y, 24);
    EXPECT_EQ(display.last_draw_xbmp_w, 16);
    EXPECT_EQ(display.last_draw_xbmp_h, 16);
    EXPECT_EQ(display.last_draw_xbmp_bitmap, s_mock_xbm_bits);
    EXPECT_EQ(display.getDrawColor(), static_cast<uint8_t>(U8G2GL_COLOR_1));
    EXPECT_EQ(display.last_bitmap_mode, static_cast<uint8_t>(U8G2GL_BITMAP_MODE_TRANSPARENT));
}

TEST(Xbm, NegativeOriginIsSkippedNotWrapped) {
    // SKIP rule (u8g2gl_draw.h): a bitmap cannot be shortened without shifting
    // the image, so one left of or above the display is not drawn. Before WO4c
    // this reached U8G2 as x = 65532.
    u8g2gl_xbm xbm;
    xbm.set_coords(-4, 2, 8, 8);
    xbm.set_src(s_mock_xbm_bits);

    U8G2 display;
    xbm.render(display);
    EXPECT_EQ(display.draw_xbmp_count, 0);

    xbm.set_coords(2, -1, 8, 8);
    xbm.render(display);
    EXPECT_EQ(display.draw_xbmp_count, 0);
}

TEST(Xbm, InheritsFromObj) {
    u8g2gl_xbm xbm;
    xbm.set_coords(4, 8, 32, 32);
    xbm.set_src(s_mock_xbm_bits);

    u8g2gl_obj* obj = &xbm;
    EXPECT_EQ(obj->get_x(), 4);
    EXPECT_EQ(obj->get_y(), 8);
    EXPECT_EQ(obj->get_w(), 32);
    EXPECT_EQ(obj->get_h(), 32);

    EXPECT_EQ(obj->tick(123), U8G2GL_IDLE);

    U8G2 display;
    obj->render(display);
    EXPECT_EQ(display.draw_xbmp_count, 1);
}

TEST(Xbm, SizeOf) {
    std::cout << "\n================= u8g2gl_xbm SIZEOF REPORT =================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj): " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_xbm): " << sizeof(u8g2gl_xbm) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_xbm", std::to_string(sizeof(u8g2gl_xbm)));

    // Ensure memory contract: base object + pointer (8 bytes on 64-bit host) <= 80 bytes
    EXPECT_LE(sizeof(u8g2gl_xbm), 80u);
}
