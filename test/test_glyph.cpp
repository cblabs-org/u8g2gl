/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_glyph.cpp
 *
 * Purpose: Verification suite for u8g2gl_glyph single-codepoint display widget.
 *          Validates default construction (codepoint 0), codepoint assignment,
 *          dirty marking, static idle tick guarantees, zero-glyph early exit,
 *          U8G2 font/color/glyph rendering, polymorphism, and memory bounds.
 *
 * Description: GoogleTest suite exercising the complete contract of u8g2gl_glyph.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_glyph.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8G2lib.h"
#include <iostream>
#include <string>

static const uint8_t s_mock_font[4] = { 0x01, 0x02, 0x03, 0x04 };

TEST(Glyph, DefaultConstruction) {
    u8g2gl_glyph glyph;

    // Default glyph widget has codepoint 0 and returns idle on tick
    EXPECT_EQ(glyph.get_glyph(), 0);
    EXPECT_EQ(glyph.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(glyph.is_dirty());
}

TEST(Glyph, SetGlyph) {
    u8g2gl_glyph glyph;

    glyph.set_glyph(0x0041); // 'A'
    EXPECT_EQ(glyph.get_glyph(), 0x0041);
    EXPECT_TRUE(glyph.is_dirty());

    glyph.clear_dirty();
    EXPECT_FALSE(glyph.is_dirty());

    // Reset back to 0
    glyph.set_glyph(0);
    EXPECT_EQ(glyph.get_glyph(), 0);
    EXPECT_TRUE(glyph.is_dirty());
}

TEST(Glyph, TickAlwaysIdle) {
    u8g2gl_glyph glyph;
    glyph.set_glyph(0x2713); // checkmark

    // Static glyph widget never animates regardless of timestamp
    EXPECT_EQ(glyph.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(glyph.tick(1234), U8G2GL_IDLE);
    EXPECT_EQ(glyph.tick(999999), U8G2GL_IDLE);
}

TEST(Glyph, RenderWithZeroGlyph) {
    u8g2gl_glyph glyph;
    U8G2 display;

    // render() with codepoint 0 must early-exit safely without drawing
    glyph.render(display);
    EXPECT_EQ(display.draw_glyph_count, 0);
}

TEST(Glyph, RenderDrawsGlyph) {
    u8g2gl_glyph glyph;
    glyph.set_coords(15, 30, 16, 16);
    glyph.set_font(s_mock_font);
    glyph.set_draw_color(U8G2GL_COLOR_1);
    glyph.set_glyph(0x260E); // telephone icon

    U8G2 display;
    glyph.render(display);

    EXPECT_EQ(display.draw_glyph_count, 1);
    EXPECT_EQ(display.last_draw_glyph_x, 15);
    EXPECT_EQ(display.last_draw_glyph_y, 30);
    EXPECT_EQ(display.last_draw_glyph_codepoint, 0x260E);
    EXPECT_EQ(display.last_font, s_mock_font);
    EXPECT_EQ(display.getDrawColor(), static_cast<uint8_t>(U8G2GL_COLOR_1));
}

TEST(Glyph, InheritsFromObj) {
    u8g2gl_glyph glyph;
    glyph.set_coords(3, 7, 20, 20);
    glyph.set_glyph(0x0024); // '$'

    u8g2gl_obj* obj = &glyph;
    EXPECT_EQ(obj->get_x(), 3);
    EXPECT_EQ(obj->get_y(), 7);
    EXPECT_EQ(obj->get_w(), 20);
    EXPECT_EQ(obj->get_h(), 20);

    EXPECT_EQ(obj->tick(50), U8G2GL_IDLE);

    U8G2 display;
    obj->render(display);
    EXPECT_EQ(display.draw_glyph_count, 1);
    EXPECT_EQ(display.last_draw_glyph_codepoint, 0x0024);
}

TEST(Glyph, SizeOf) {
    std::cout << "\n================ u8g2gl_glyph SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):   " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_glyph): " << sizeof(u8g2gl_glyph) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_glyph", std::to_string(sizeof(u8g2gl_glyph)));

    // Ensure memory contract: base object + uint16_t <= 72 bytes
    EXPECT_LE(sizeof(u8g2gl_glyph), 72u);
}
