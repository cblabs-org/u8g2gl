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
 * Purpose: Verification suite for u8g2gl_label text widget. Validates memory
 *          bounds, zero-copy pointer semantics, static lifecycle guarantees,
 *          U8G2 rendering integration, alignment calculations, and polymorphism.
 *
 * Description: GoogleTest suite exercising the complete contract of u8g2gl_label.
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

TEST(Label, DefaultConstruction) {
    u8g2gl_label label;

    // Default label holds nullptr text and returns idle on tick
    EXPECT_EQ(label.get_text(), nullptr);
    EXPECT_EQ(label.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(label.is_dirty());
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

TEST(Label, TickAlwaysIdle) {
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

TEST(Label, AlignmentRendering) {
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

TEST(Label, SizeOf) {
    std::cout << "\n================ u8g2gl_label SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):   " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_label): " << sizeof(u8g2gl_label) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_label", std::to_string(sizeof(u8g2gl_label)));

    // Ensure memory contract: base object + pointer (8 bytes on 64-bit host) <= 72 bytes
    EXPECT_LE(sizeof(u8g2gl_label), 72u);
}
