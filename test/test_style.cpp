#include <gtest/gtest.h>
#include <iostream>
#include <string>

#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_style.h"
#include "u8g2gl/u8g2gl_obj.h"

static const uint8_t dummy_font_a[] = { 0x01, 0x02 };
static const uint8_t dummy_font_b[] = { 0x03, 0x04 };

TEST(Style, DefaultState) {
    u8g2gl_style s;
    EXPECT_EQ(s.set_mask, 0);
    EXPECT_FALSE(s.has(U8G2GL_STYLE_FONT));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_DRAW_COLOR));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_INVERT));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_PADDING));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_BORDER));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_RADIUS));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_ALIGN));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_TRUNCATE));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_FONT_MODE));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_BITMAP_MODE));
}

TEST(Style, SetMarksFlag) {
    u8g2gl_style s;
    s.set_font(dummy_font_a);
    EXPECT_TRUE(s.has(U8G2GL_STYLE_FONT));
    EXPECT_EQ(s.font, dummy_font_a);
    EXPECT_EQ(s.set_mask, U8G2GL_STYLE_FONT);

    // Other properties still unset
    EXPECT_FALSE(s.has(U8G2GL_STYLE_DRAW_COLOR));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_INVERT));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_PADDING));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_BORDER));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_RADIUS));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_ALIGN));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_TRUNCATE));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_FONT_MODE));
    EXPECT_FALSE(s.has(U8G2GL_STYLE_BITMAP_MODE));
}

TEST(Style, SetAllProperties) {
    u8g2gl_style s;
    s.set_font(dummy_font_a);
    s.set_draw_color(U8G2GL_COLOR_0);
    s.set_invert(true);
    s.set_padding(4);
    s.set_border(true);
    s.set_radius(3);
    s.set_align(U8G2GL_ALIGN_RIGHT);
    s.set_truncate(true);
    s.set_font_mode(U8G2GL_FONT_MODE_TRANSPARENT);
    s.set_bitmap_mode(U8G2GL_BITMAP_MODE_TRANSPARENT);

    uint16_t expected_mask = U8G2GL_STYLE_FONT |
                             U8G2GL_STYLE_DRAW_COLOR |
                             U8G2GL_STYLE_INVERT |
                             U8G2GL_STYLE_PADDING |
                             U8G2GL_STYLE_BORDER |
                             U8G2GL_STYLE_RADIUS |
                             U8G2GL_STYLE_ALIGN |
                             U8G2GL_STYLE_TRUNCATE |
                             U8G2GL_STYLE_FONT_MODE |
                             U8G2GL_STYLE_BITMAP_MODE;

    EXPECT_EQ(s.set_mask, expected_mask);
    EXPECT_TRUE(s.has(U8G2GL_STYLE_FONT));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_DRAW_COLOR));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_INVERT));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_PADDING));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_BORDER));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_RADIUS));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_ALIGN));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_TRUNCATE));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_FONT_MODE));
    EXPECT_TRUE(s.has(U8G2GL_STYLE_BITMAP_MODE));

    EXPECT_EQ(s.font, dummy_font_a);
    EXPECT_EQ(s.draw_color, U8G2GL_COLOR_0);
    EXPECT_TRUE(s.invert);
    EXPECT_EQ(s.padding, 4);
    EXPECT_TRUE(s.border);
    EXPECT_EQ(s.radius, 3);
    EXPECT_EQ(s.align, U8G2GL_ALIGN_RIGHT);
    EXPECT_TRUE(s.truncate);
    EXPECT_EQ(s.font_mode, U8G2GL_FONT_MODE_TRANSPARENT);
    EXPECT_EQ(s.bitmap_mode, U8G2GL_BITMAP_MODE_TRANSPARENT);
}

TEST(Style, Clear) {
    u8g2gl_style s;
    s.set_font(dummy_font_a);
    s.set_draw_color(U8G2GL_COLOR_XOR);
    s.set_invert(true);
    s.set_padding(8);
    EXPECT_NE(s.set_mask, 0);

    s.clear();
    EXPECT_EQ(s.set_mask, 0);
    EXPECT_EQ(s.font, nullptr);
    EXPECT_EQ(s.draw_color, U8G2GL_COLOR_1);
    EXPECT_FALSE(s.invert);
    EXPECT_EQ(s.padding, 0);
    EXPECT_FALSE(s.border);
    EXPECT_EQ(s.radius, 0);
    EXPECT_EQ(s.align, U8G2GL_ALIGN_LEFT);
    EXPECT_FALSE(s.truncate);
    EXPECT_EQ(s.font_mode, U8G2GL_FONT_MODE_SOLID);
    EXPECT_EQ(s.bitmap_mode, U8G2GL_BITMAP_MODE_SOLID);
    EXPECT_FALSE(s.has(U8G2GL_STYLE_FONT));
}

TEST(Style, MergeOverwritesSetProps) {
    u8g2gl_style base;
    base.set_font(dummy_font_a);
    base.set_align(U8G2GL_ALIGN_LEFT);

    u8g2gl_style overlay;
    overlay.set_align(U8G2GL_ALIGN_CENTER);

    base.merge_from(overlay);

    EXPECT_EQ(base.font, dummy_font_a);
    EXPECT_EQ(base.align, U8G2GL_ALIGN_CENTER);
    EXPECT_TRUE(base.has(U8G2GL_STYLE_FONT));
    EXPECT_TRUE(base.has(U8G2GL_STYLE_ALIGN));
}

TEST(Style, MergeDoesNotOverwriteUnsetProps) {
    u8g2gl_style base;
    base.set_font(dummy_font_a);
    base.set_draw_color(U8G2GL_COLOR_1);

    u8g2gl_style overlay;
    overlay.set_font(dummy_font_b); // draw_color NOT set in overlay

    base.merge_from(overlay);

    EXPECT_EQ(base.font, dummy_font_b);
    EXPECT_EQ(base.draw_color, U8G2GL_COLOR_1);
    EXPECT_TRUE(base.has(U8G2GL_STYLE_FONT));
    EXPECT_TRUE(base.has(U8G2GL_STYLE_DRAW_COLOR));
}

TEST(Style, MergeOntoEmpty) {
    u8g2gl_style base; // empty base (set_mask=0)
    u8g2gl_style overlay;
    overlay.set_font(dummy_font_a);

    base.merge_from(overlay);

    EXPECT_EQ(base.font, dummy_font_a);
    EXPECT_EQ(base.set_mask, U8G2GL_STYLE_FONT);
    EXPECT_TRUE(base.has(U8G2GL_STYLE_FONT));
    EXPECT_FALSE(base.has(U8G2GL_STYLE_ALIGN));
}

TEST(Style, MultipleMerges) {
    u8g2gl_style base;
    base.set_font(dummy_font_a);
    base.set_align(U8G2GL_ALIGN_LEFT);

    u8g2gl_style style1;
    style1.set_align(U8G2GL_ALIGN_CENTER);
    style1.set_padding(5);

    u8g2gl_style style2;
    style2.set_align(U8G2GL_ALIGN_RIGHT);
    style2.set_border(true);

    base.merge_from(style1);
    base.merge_from(style2);

    // Last merge wins for overlapping properties (align)
    EXPECT_EQ(base.align, U8G2GL_ALIGN_RIGHT);
    // Non-overlapping properties accumulate
    EXPECT_EQ(base.font, dummy_font_a);
    EXPECT_EQ(base.padding, 5);
    EXPECT_TRUE(base.border);

    EXPECT_TRUE(base.has(U8G2GL_STYLE_FONT));
    EXPECT_TRUE(base.has(U8G2GL_STYLE_ALIGN));
    EXPECT_TRUE(base.has(U8G2GL_STYLE_PADDING));
    EXPECT_TRUE(base.has(U8G2GL_STYLE_BORDER));
    EXPECT_FALSE(base.has(U8G2GL_STYLE_RADIUS));
}

TEST(ObjStyle, ApplyStyle) {
    u8g2gl_obj obj;
    u8g2gl_style s;
    s.set_font(dummy_font_a);
    s.set_align(U8G2GL_ALIGN_CENTER);

    obj.apply_style(s);

    const u8g2gl_style& resolved = obj.get_resolved_style();
    EXPECT_TRUE(resolved.has(U8G2GL_STYLE_FONT));
    EXPECT_TRUE(resolved.has(U8G2GL_STYLE_ALIGN));
    EXPECT_EQ(resolved.font, dummy_font_a);
    EXPECT_EQ(resolved.align, U8G2GL_ALIGN_CENTER);
}

TEST(ObjStyle, InlineOverrideWins) {
    u8g2gl_obj obj;
    u8g2gl_style s;
    s.set_align(U8G2GL_ALIGN_LEFT);

    obj.apply_style(s);
    obj.set_align(U8G2GL_ALIGN_CENTER);

    EXPECT_EQ(obj.get_resolved_style().align, U8G2GL_ALIGN_CENTER);
    EXPECT_TRUE(obj.get_resolved_style().has(U8G2GL_STYLE_ALIGN));
}

TEST(ObjStyle, MultipleStylesStack) {
    u8g2gl_obj obj;
    u8g2gl_style base_style;
    base_style.set_font(dummy_font_a);
    base_style.set_align(U8G2GL_ALIGN_LEFT);
    base_style.set_padding(2);

    u8g2gl_style override_style;
    override_style.set_align(U8G2GL_ALIGN_RIGHT);
    override_style.set_border(true);

    obj.apply_style(base_style);
    obj.apply_style(override_style);

    const u8g2gl_style& resolved = obj.get_resolved_style();
    EXPECT_EQ(resolved.font, dummy_font_a);
    EXPECT_EQ(resolved.align, U8G2GL_ALIGN_RIGHT);
    EXPECT_EQ(resolved.padding, 2);
    EXPECT_TRUE(resolved.border);
}

TEST(ObjStyle, SizeUnchanged) {
    std::cout << "[          ] sizeof(u8g2gl_style) = " << sizeof(u8g2gl_style) << " bytes" << std::endl;
    std::cout << "[          ] sizeof(u8g2gl_obj)   = " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    RecordProperty("sizeof_u8g2gl_style", std::to_string(sizeof(u8g2gl_style)));
    RecordProperty("sizeof_u8g2gl_obj", std::to_string(sizeof(u8g2gl_obj)));
    EXPECT_GT(sizeof(u8g2gl_obj), 24u);
}
