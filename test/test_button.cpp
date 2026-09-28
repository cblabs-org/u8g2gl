/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_button.cpp
 *
 * Purpose: Verification suite for u8g2gl_button widget. Validates default state,
 *          zero-copy text assignment, border stroke width configuration, dirty
 *          tracking, static idle lifecycle, single and nested border rendering,
 *          focus state visual inversion (§12.2), disabled state interaction,
 *          text centering, polymorphism, memory limits, and the corner-radius
 *          bound applied to a style radius at draw time (PR-4R WO3).
 *
 * Description: GoogleTest test cases covering the complete specification of
 *              u8g2gl_button.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_button.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_types.h"
#include "U8g2lib.h"
#include <iostream>
#include <string>

static const uint8_t s_mock_font[4] = { 0x01, 0x02, 0x03, 0x04 };

TEST(Button, DefaultConstruction) {
    u8g2gl_button btn;

    EXPECT_EQ(btn.get_text(), nullptr);
    EXPECT_EQ(btn.get_border_width(), 1);
    EXPECT_EQ(btn.tick(0), U8G2GL_IDLE);
    EXPECT_FALSE(btn.is_dirty());
}

TEST(Button, SetText) {
    u8g2gl_button btn;
    const char* label = "OK";

    btn.set_text(label);
    EXPECT_EQ(btn.get_text(), label);
    EXPECT_TRUE(btn.is_dirty());

    btn.clear_dirty();
    btn.set_text(nullptr);
    EXPECT_EQ(btn.get_text(), nullptr);
    EXPECT_TRUE(btn.is_dirty());
}

TEST(Button, SetBorderWidth) {
    u8g2gl_button btn;

    btn.set_border_width(2);
    EXPECT_EQ(btn.get_border_width(), 2);
    EXPECT_TRUE(btn.is_dirty());

    btn.clear_dirty();
    // Setting identical border width should not mark dirty
    btn.set_border_width(2);
    EXPECT_FALSE(btn.is_dirty());

    btn.set_border_width(0);
    EXPECT_EQ(btn.get_border_width(), 0);
    EXPECT_TRUE(btn.is_dirty());
}

TEST(Button, TickAlwaysIdle) {
    u8g2gl_button btn;
    btn.set_text("Submit");

    EXPECT_EQ(btn.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(btn.tick(500), U8G2GL_IDLE);
    EXPECT_EQ(btn.tick(999999), U8G2GL_IDLE);
}

TEST(Button, RenderDefaultBorderAndText) {
    u8g2gl_button btn;
    btn.set_coords(10, 20, 60, 20);
    btn.set_text("OK");
    btn.set_font(s_mock_font);

    U8G2 display;
    display.ascent_val = 8;
    display.descent_val = -2; // fontHeight = 10 -> yOffset = (20 - 10)/2 = 5 -> draw_y = 25
    display.utf8_width_val = 20; // textWidth = 20 -> draw_x = 10 + (60 - 20)/2 = 30

    btn.render(display);

    // Single border frame
    EXPECT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 10);
    EXPECT_EQ(display.last_draw_rframe_y, 20);
    EXPECT_EQ(display.last_draw_rframe_w, 60);
    EXPECT_EQ(display.last_draw_rframe_h, 20);

    // Text rendered
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(display.last_draw_utf8_x, 30);
    EXPECT_EQ(display.last_draw_utf8_y, 25);
    EXPECT_STREQ(display.last_draw_utf8_text, "OK");
    EXPECT_EQ(display.getDrawColor(), 1);
}

TEST(Button, RenderNestedBorders) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 40, 20);
    btn.set_border_width(3);

    U8G2 display;
    btn.render(display);

    // Three nested frames drawn
    EXPECT_EQ(display.draw_rframe_count, 3);
    EXPECT_EQ(display.last_draw_rframe_x, 2);
    EXPECT_EQ(display.last_draw_rframe_y, 2);
    EXPECT_EQ(display.last_draw_rframe_w, 36);
    EXPECT_EQ(display.last_draw_rframe_h, 16);
}

TEST(Button, RenderNoBorder) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 40, 20);
    btn.set_border_width(0);
    btn.set_text("Flat");

    U8G2 display;
    btn.render(display);

    EXPECT_EQ(display.draw_rframe_count, 0);
    EXPECT_EQ(display.draw_utf8_count, 1);
}

TEST(Button, RenderInvertOnFocus) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 50, 16);
    btn.set_text("Focus");
    btn.set_invert(true); // Active focus style (§12.2)

    U8G2 display;
    btn.render(display);

    // Draws inverted background box
    EXPECT_EQ(display.draw_box_count, 1);
    EXPECT_EQ(display.last_draw_box_w, 50);
    EXPECT_EQ(display.last_draw_box_h, 16);

    // Text rendered with color 0
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(display.getDrawColor(), 0);
}

TEST(Button, RenderDisabledIgnoresInvert) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 50, 16);
    btn.set_text("Disabled");
    btn.set_invert(true);
    btn.set_disabled(true); // Explicitly disabled

    U8G2 display;
    btn.render(display);

    // When disabled, invert highlight must not be drawn
    EXPECT_EQ(display.draw_box_count, 0);
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(display.getDrawColor(), 1);
}

TEST(Button, RenderAlignmentOverride) {
    u8g2gl_button btn;
    btn.set_coords(10, 0, 80, 20);
    btn.set_text("Left");
    btn.set_border_width(2);
    btn.set_padding(4);
    btn.set_align(U8G2GL_ALIGN_LEFT);

    U8G2 display;
    display.utf8_width_val = 20;

    btn.render(display);

    // Left alignment accounts for border + padding: 10 + 2 + 4 = 16
    EXPECT_EQ(display.last_draw_utf8_x, 16);
}

TEST(Button, RenderDegenerateGeometry) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 0, 0);
    btn.set_text("Zero");

    U8G2 display;
    btn.render(display);

    EXPECT_EQ(display.draw_rframe_count, 0);
    EXPECT_EQ(display.draw_utf8_count, 0);
    EXPECT_EQ(display.draw_box_count, 0);
}

// WO4c ruling (H1): a border partly off the left and top edges is drawn with
// explicitly wrapped origins, which U8G2 clips to the visible part.
TEST(Button, BorderPartlyOffEdgeDrawsWithWrappedOrigin) {
    u8g2gl_button btn;
    btn.set_coords(-5, -2, 40, 16);   // default border width 1

    U8G2 display;
    btn.render(display);

    ASSERT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 65531);
    EXPECT_EQ(display.last_draw_rframe_y, 65534);
    EXPECT_EQ(display.last_draw_rframe_w, 40);
    EXPECT_EQ(display.last_draw_rframe_h, 16);

    // Nested borders: every layer is drawn, the outer one wrapped.
    u8g2gl_button nested;
    nested.set_coords(-1, 0, 40, 16);
    nested.set_border_width(2);
    U8G2 display2;
    nested.render(display2);
    EXPECT_EQ(display2.draw_rframe_count, 2);
    EXPECT_EQ(display2.last_draw_rframe_x, 0);   // inner layer at (-1 + 1, 0 + 1)
    EXPECT_EQ(display2.last_draw_rframe_y, 1);
}

// PR-04 WO10b: the button's manifest declares bind_text, and its render()
// read only the literal, the same defect as the label's. A bound button draws
// the subject's text, in preference to a literal set in either order.
// --- PR-4R WO3: a style radius larger than the button is clamped at draw time ---
// A radius arriving through a style is invisible to the validator, and past
// 2r <= min(w, h) U8G2 draws far outside the box (u8g2gl_coord_corner_radius()).
// Each rounded call is read from the call log and held to the bound of the box
// it actually draws — for nested borders, each layer's own size.

namespace {

// One drawRBox / drawRFrame from the log: its op and its x, y, w, h, r.
struct rounded_call {
    std::string op;
    int32_t args[5];
};

// Collects every rounded-box call, in order, and asserts none breaks the bound.
int collect_rounded(const U8G2& display, rounded_call* out, int capacity) {
    int n = 0;
    for (int i = 0; i < display.call_log_count && n < capacity; ++i) {
        const u8g2_stub_call& call = display.call_log[i];
        const std::string op = call.op;
        if (op != "drawRBox" && op != "drawRFrame") {
            continue;
        }
        rounded_call& rc = out[n++];
        rc.op = op;
        for (int a = 0; a < 5; ++a) {
            rc.args[a] = call.args[a];
        }
        const int32_t smaller = (rc.args[2] < rc.args[3]) ? rc.args[2] : rc.args[3];
        EXPECT_LE(2 * rc.args[4], smaller)
            << op << " " << rc.args[2] << "x" << rc.args[3] << " r=" << rc.args[4];
    }
    return n;
}

}  // namespace

TEST(ButtonRadiusBound, StyleRadiusLargerThanButtonIsClamped) {
    u8g2gl_button btn;
    btn.set_coords(3, 4, 40, 10);
    btn.set_radius(12);   // bound for 40x10 is 5

    U8G2 display;
    btn.render(display);

    rounded_call calls[4];
    ASSERT_EQ(collect_rounded(display, calls, 4), 1);
    EXPECT_EQ(calls[0].op, "drawRFrame");
    EXPECT_EQ(calls[0].args[0], 3);
    EXPECT_EQ(calls[0].args[1], 4);
    EXPECT_EQ(calls[0].args[2], 40);
    EXPECT_EQ(calls[0].args[3], 10);
    EXPECT_EQ(calls[0].args[4], 5);
}

TEST(ButtonRadiusBound, FocusedFillAndBorderAreBothClamped) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 9, 30);   // odd, narrow: bound is 9 / 2 = 4
    btn.set_radius(20);
    btn.set_invert(true);

    U8G2 display;
    btn.render(display);

    rounded_call calls[4];
    ASSERT_EQ(collect_rounded(display, calls, 4), 2);
    EXPECT_EQ(calls[0].op, "drawRBox");     // the focus fill
    EXPECT_EQ(calls[0].args[4], 4);
    EXPECT_EQ(calls[1].op, "drawRFrame");   // the border
    EXPECT_EQ(calls[1].args[4], 4);
}

TEST(ButtonRadiusBound, NestedBorderClampsEachLayerToItsOwnSize) {
    u8g2gl_button btn;
    btn.set_coords(0, 0, 40, 10);
    btn.set_border_width(3);
    btn.set_radius(12);

    U8G2 display;
    btn.render(display);

    // Layer i is inset by i on every side and asks for radius 12 - i; each is
    // held to half its own height: 40x10 -> 5, 38x8 -> 4, 36x6 -> 3.
    rounded_call calls[4];
    ASSERT_EQ(collect_rounded(display, calls, 4), 3);
    const int32_t expected[3][5] = {
        {0, 0, 40, 10, 5},
        {1, 1, 38, 8, 4},
        {2, 2, 36, 6, 3},
    };
    for (int layer = 0; layer < 3; ++layer) {
        SCOPED_TRACE(testing::Message() << "layer " << layer);
        EXPECT_EQ(calls[layer].op, "drawRFrame");
        for (int a = 0; a < 5; ++a) {
            EXPECT_EQ(calls[layer].args[a], expected[layer][a]) << "argument " << a;
        }
    }
}

TEST(ButtonRadiusBound, RadiusInsideTheBoundIsUnchanged) {
    // A capsule — 2r == h — is the bound itself and passes through untouched.
    u8g2gl_button btn;
    btn.set_coords(0, 0, 40, 10);
    btn.set_border_width(2);
    btn.set_radius(5);

    U8G2 display;
    btn.render(display);

    rounded_call calls[4];
    ASSERT_EQ(collect_rounded(display, calls, 4), 2);
    EXPECT_EQ(calls[0].args[4], 5);   // 40x10, capsule
    EXPECT_EQ(calls[1].args[4], 4);   // 38x8,  capsule
}

TEST(Button, BoundStringSubjectIsTheTextDrawn) {
    u8g2gl_subject_string_n<8> caption;
    caption.set("Go");
    u8g2gl_button btn;
    btn.set_coords(0, 0, 60, 20);
    btn.set_text("Literal");
    ASSERT_TRUE(btn.bind_text(&caption));

    U8G2 display;
    btn.render(display);
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_STREQ(display.last_draw_utf8_buf, "Go");

    caption.set("Stop");
    btn.set_text("Later literal");
    U8G2 after;
    btn.render(after);
    EXPECT_STREQ(after.last_draw_utf8_buf, "Stop");
}

TEST(Button, BoundIntSubjectIsFormatted) {
    u8g2gl_subject_int count(3);
    u8g2gl_button btn;
    btn.set_coords(0, 0, 60, 20);
    ASSERT_TRUE(btn.bind_text(&count, "%d left"));

    U8G2 display;
    btn.render(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "3 left");
}

TEST(Button, InheritsFromObj) {
    u8g2gl_button btn;
    btn.set_coords(2, 4, 40, 15);
    btn.set_text("Poly");

    u8g2gl_obj* obj = &btn;
    EXPECT_EQ(obj->get_x(), 2);
    EXPECT_EQ(obj->get_y(), 4);
    EXPECT_EQ(obj->get_w(), 40);
    EXPECT_EQ(obj->get_h(), 15);

    EXPECT_EQ(obj->tick(0), U8G2GL_IDLE);

    U8G2 display;
    obj->render(display);
    EXPECT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.draw_utf8_count, 1);
}

TEST(Button, SizeOf) {
    std::cout << "\n================ u8g2gl_button SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):    " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_button): " << sizeof(u8g2gl_button) << " bytes" << std::endl;
    std::cout << "============================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_button", std::to_string(sizeof(u8g2gl_button)));

    EXPECT_LE(sizeof(u8g2gl_button), 80u);
}
