/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_ambient_state.cpp
 *
 * Purpose: Proves, against real U8G2, the rule u8g2gl_state_saver enforces
 *          (§11.3): U8G2GL's ambient state is in force inside each object's
 *          render, and the caller's at every other moment. Each case is one
 *          way that rule was measured to fail:
 *          - a display with no font yet: restoring the null font through
 *            setFont() makes u8g2_SetFont() read a font header at address 0;
 *          - a caller in baseline position: every text widget assumes top
 *            positioning, and nothing established it, so text drew one font
 *            height higher (a downstream frame lit 15 pixels instead of 1392);
 *          - a caller in U8G2's default text reference-height mode: every text
 *            widget centres on getAscent() - getDescent(), which that mode
 *            measures from 'A' and 'g', so text sat a row away from where it
 *            sits under "all" (a downstream frame differed by 274 pixels);
 *          - font mode, bitmap mode, font position, direction and height mode
 *            the caller set must come back unchanged;
 *          - the blocked-loop repaints (render_animation_update(), [D-5]) drew
 *            outside any guard, so they did all of the above as well.
 *
 * Description: Compiles the runtime against real U8G2's headers and links real
 *              U8G2's C sources and fonts (extern/u8g2, tag 2.36.18) — never the
 *              host stub, which cannot dereference a font and so cannot show the
 *              null-font fault. Draws into a 128x64 full buffer and compares
 *              buffers byte for byte, or reads the state struct directly.
 */
#include <gtest/gtest.h>

#include <U8g2lib.h>

#include <cstring>

#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_xbm.h"

namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;
constexpr size_t kBufferBytes = kDisplayWidth * kDisplayHeight / 8;

// An 8x8 XBM with every pixel set, so bitmap mode has something to act on.
const uint8_t kSolidXbm[8] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// A real U8G2 C++ object over a full frame buffer, with no hardware behind it.
class real_display {
public:
    real_display() {
        // --- Step 1: The body of u8g2_Setup_ssd1306_128x64_noname_f() ---
        // Copied from u8g2_d_setup.c rather than linked, for the reason
        // test_rbox_bound.cpp gives: that file pulls in every display driver.
        u8g2_t* u8g2 = display_.getU8g2();
        uint8_t tile_buf_height = 0;
        u8g2_SetupDisplay(u8g2, u8x8_d_ssd1306_128x64_noname, u8x8_cad_001,
                          u8x8_byte_empty, u8x8_dummy_cb);
        uint8_t* buf = u8g2_m_16_8_f(&tile_buf_height);
        u8g2_SetupBuffer(u8g2, buf, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);

        // --- Step 2: Initialise and clear, as a frame does ---
        // u8g2_SetupBuffer() leaves the font null and the position baseline
        // (u8g2_setup.c) — exactly what a sketch that calls begin() and never
        // setFont() hands the framework.
        u8g2_InitDisplay(u8g2);
        display_.clearBuffer();
    }

    U8G2& display() { return display_; }

    // u8g2_m_16_8_f() returns one static buffer shared by every instance, so a
    // comparison must copy one frame out before the next is drawn.
    void snapshot(uint8_t (&out)[kBufferBytes]) {
        std::memcpy(out, display_.getBufferPtr(), kBufferBytes);
    }

    int lit_pixels() {
        int lit = 0;
        const uint8_t* buf = display_.getBufferPtr();
        for (size_t i = 0; i < kBufferBytes; ++i) {
            for (int bit = 0; bit < 8; ++bit) {
                lit += (buf[i] >> bit) & 1;
            }
        }
        return lit;
    }

private:
    U8G2 display_;
};

int lit_pixels(const uint8_t (&buf)[kBufferBytes]) {
    int lit = 0;
    for (size_t i = 0; i < kBufferBytes; ++i) {
        for (int bit = 0; bit < 8; ++bit) {
            lit += (buf[i] >> bit) & 1;
        }
    }
    return lit;
}

// Render one object as the only entry of a flat tree, as generated code does.
void render_alone(U8G2& display, u8g2gl_obj& obj) {
    u8g2gl_obj* const objs[] = {&obj};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};
    u8g2gl_render_object(display, objs, parents, 0);
}

// The caller's ambient state, read straight from U8G2's state struct (u8g2.h):
// every item u8g2gl_state_saver captures.
struct ambient_state {
    uint8_t draw_color;
    const uint8_t* font;
    uint8_t font_mode;
    uint8_t bitmap_mode;
    u8g2_font_calc_vref_fnptr font_position;
#ifdef U8G2_WITH_FONT_ROTATION
    uint8_t direction;
#endif
    uint8_t height_mode;
    // The reference heights U8G2 derives from the font and the height mode
    // (u8g2_UpdateRefHeight(), u8g2_font.c): what getAscent()/getDescent()
    // and every font position but baseline read.
    int8_t ref_ascent;
    int8_t ref_descent;

    static ambient_state read(U8G2& display) {
        const u8g2_t* u8g2 = display.getU8g2();
        ambient_state s = {};
        s.draw_color = u8g2->draw_color;
        s.font = u8g2->font;
        s.font_mode = u8g2->font_decode.is_transparent;
        s.bitmap_mode = u8g2->bitmap_transparency;
        s.font_position = u8g2->font_calc_vref;
#ifdef U8G2_WITH_FONT_ROTATION
        s.direction = u8g2->font_decode.dir;
#endif
        s.height_mode = u8g2->font_height_mode;
        s.ref_ascent = u8g2->font_ref_ascent;
        s.ref_descent = u8g2->font_ref_descent;
        return s;
    }
};

void expect_state_equal(const ambient_state& expected, const ambient_state& actual) {
    EXPECT_EQ(actual.draw_color, expected.draw_color) << "draw colour";
    EXPECT_EQ(actual.font, expected.font) << "font";
    EXPECT_EQ(actual.font_mode, expected.font_mode) << "font mode";
    EXPECT_EQ(actual.bitmap_mode, expected.bitmap_mode) << "bitmap mode";
    EXPECT_TRUE(actual.font_position == expected.font_position) << "font position";
#ifdef U8G2_WITH_FONT_ROTATION
    EXPECT_EQ(actual.direction, expected.direction) << "font direction";
#endif
    EXPECT_EQ(actual.height_mode, expected.height_mode) << "reference-height mode";
    EXPECT_EQ(actual.ref_ascent, expected.ref_ascent) << "reference ascent";
    EXPECT_EQ(actual.ref_descent, expected.ref_descent) << "reference descent";
}

// A caller that has set every ambient item away from the framework's choice:
// draw colour 1, a font other than the widgets', transparent text, transparent
// bitmaps, baseline positioning.
void set_caller_state(U8G2& display) {
    display.setDrawColor(1);
    display.setFont(u8g2_font_5x7_tf);
    display.setFontMode(1);
    display.setBitmapMode(1);
    display.setFontPosBaseline();
}

void configure_label(u8g2gl_label& label) {
    label.set_coords(4, 4, 80, 16);
    label.set_font(u8g2_font_6x10_tf);
    label.set_text("Ambient");
}

}  // namespace

// --- A display with no font: the null font comes back, and rendering repeats ---
TEST(AmbientState, NullFontIsRestoredAndASecondRenderWorks) {
    real_display real;
    U8G2& display = real.display();
    ASSERT_EQ(display.getU8g2()->font, nullptr) << "precondition: begin() sets no font";
    u8g2gl_label label;
    configure_label(label);

    render_alone(display, label);
    EXPECT_EQ(display.getU8g2()->font, nullptr);
    const int first = real.lit_pixels();
    EXPECT_GT(first, 0) << "nothing drawn: the check would be vacuous";

    display.clearBuffer();
    render_alone(display, label);
    EXPECT_EQ(display.getU8g2()->font, nullptr);
    EXPECT_EQ(real.lit_pixels(), first);
}

// --- The caller's font position does not move text ---
// Both callers hold a font, so this case isolates position from the null-font
// fault above.
TEST(AmbientState, BaselineCallerDrawsTheSamePixelsAsTopCaller) {
    u8g2gl_label label;
    configure_label(label);

    uint8_t top[kBufferBytes];
    {
        real_display real;
        real.display().setFont(u8g2_font_5x7_tf);
        real.display().setFontPosTop();
        render_alone(real.display(), label);
        real.snapshot(top);
    }
    uint8_t baseline[kBufferBytes];
    {
        real_display real;
        real.display().setFont(u8g2_font_5x7_tf);
        real.display().setFontPosBaseline();
        render_alone(real.display(), label);
        real.snapshot(baseline);
    }

    const int top_lit = lit_pixels(top);
    const int baseline_lit = lit_pixels(baseline);
    RecordProperty("top_lit_pixels", top_lit);
    RecordProperty("baseline_lit_pixels", baseline_lit);
    EXPECT_GT(top_lit, 0) << "nothing drawn: the check would be vacuous";
    EXPECT_EQ(baseline_lit, top_lit);
    EXPECT_EQ(std::memcmp(top, baseline, kBufferBytes), 0)
        << "lit pixels: top " << top_lit << ", baseline " << baseline_lit;
}

// --- The caller's reference-height mode does not move text ---
// A caller in U8G2's default mode (text: the ascent of 'A', the descent of 'g')
// and one in "all" (every glyph) draw the same label. 6x10's reference ascent is
// 7 under text and 8 under all, and every text widget centres on
// getAscent() - getDescent(), so a guard that leaves the mode alone moves text.
TEST(AmbientState, CallerReferenceHeightDrawsTheSamePixels) {
    u8g2gl_label label;
    configure_label(label);

    uint8_t text_mode[kBufferBytes];
    {
        real_display real;
        real.display().setFont(u8g2_font_5x7_tf);
        real.display().setFontPosTop();
        real.display().setFontRefHeightText();
        render_alone(real.display(), label);
        real.snapshot(text_mode);
    }
    uint8_t all_mode[kBufferBytes];
    {
        real_display real;
        real.display().setFont(u8g2_font_5x7_tf);
        real.display().setFontPosTop();
        real.display().setFontRefHeightAll();
        render_alone(real.display(), label);
        real.snapshot(all_mode);
    }

    const int text_lit = lit_pixels(text_mode);
    const int all_lit = lit_pixels(all_mode);
    EXPECT_GT(all_lit, 0) << "nothing drawn: the check would be vacuous";
    EXPECT_EQ(std::memcmp(text_mode, all_mode, kBufferBytes), 0)
        << "lit pixels: text " << text_lit << ", all " << all_lit;
}

// --- Each reference-height mode comes back, with its reference heights ---
// The caller's font is helvR08, whose reference ascent is 8 under text and 11
// under all, so a mode or height left over from the render shows in the
// struct; the label's 6x10 differs from it, so the font is restored as well.
TEST(AmbientState, CallerReferenceHeightComesBackAfterRender) {
    struct mode_case {
        const char* name;
        void (U8G2::*set)();
        uint8_t mode;
    };
    const mode_case cases[] = {
        {"text", &U8G2::setFontRefHeightText, U8G2_FONT_HEIGHT_MODE_TEXT},
        {"extended text", &U8G2::setFontRefHeightExtendedText, U8G2_FONT_HEIGHT_MODE_XTEXT},
        {"all", &U8G2::setFontRefHeightAll, U8G2_FONT_HEIGHT_MODE_ALL},
    };
    u8g2gl_label label;
    configure_label(label);

    for (const mode_case& c : cases) {
        SCOPED_TRACE(c.name);
        real_display real;
        U8G2& display = real.display();
        display.setFont(u8g2_font_helvR08_tf);
        (display.*c.set)();
        const ambient_state before = ambient_state::read(display);
        ASSERT_EQ(before.height_mode, c.mode) << "precondition: the setter took";

        render_alone(display, label);
        expect_state_equal(before, ambient_state::read(display));
    }
}

// --- With no font, establishing and restoring the mode reads nothing ---
// u8g2_UpdateRefHeight() returns early on a null font (u8g2_font.c), so the
// height-mode setters are safe here; the mode itself must still come back.
TEST(AmbientState, NullFontKeepsTheCallerReferenceHeightMode) {
    real_display real;
    U8G2& display = real.display();
    ASSERT_EQ(display.getU8g2()->font, nullptr) << "precondition: begin() sets no font";
    ASSERT_EQ(display.getU8g2()->font_height_mode, U8G2_FONT_HEIGHT_MODE_TEXT)
        << "precondition: u8g2_SetupBuffer() leaves the text mode";
    u8g2gl_label label;
    configure_label(label);

    render_alone(display, label);
    EXPECT_EQ(display.getU8g2()->font, nullptr);
    EXPECT_EQ(display.getU8g2()->font_height_mode, U8G2_FONT_HEIGHT_MODE_TEXT);
    EXPECT_GT(real.lit_pixels(), 0) << "nothing drawn: the check would be vacuous";
}

// --- Every ambient item the caller set comes back after a normal render ---
TEST(AmbientState, CallerStateComesBackAfterRender) {
    real_display real;
    U8G2& display = real.display();
    set_caller_state(display);
    display.setDrawColor(0);
#ifdef U8G2_WITH_FONT_ROTATION
    display.setFontDirection(2);
#endif
    const ambient_state before = ambient_state::read(display);

    u8g2gl_label label;
    configure_label(label);
    render_alone(display, label);
    SCOPED_TRACE("after a label");
    expect_state_equal(before, ambient_state::read(display));

    u8g2gl_xbm image;
    image.set_coords(100, 4, 8, 8);
    image.set_src(kSolidXbm);
    render_alone(display, image);
    SCOPED_TRACE("after an XBM");
    expect_state_equal(before, ambient_state::read(display));
}

// --- The marquee's blocked-loop repaint: caller's state kept, same pixels ---
TEST(AmbientState, MarqueeRepaintKeepsCallerStateAndMatchesRender) {
    u8g2gl_label label;
    label.set_coords(4, 4, 30, 16);
    label.set_font(u8g2_font_6x10_tf);
    label.set_text("A marquee wider than its label");
    label.set_long_mode(U8G2GL_LONG_SCROLL);
    label.set_initial_delay_ms(0);

    // --- Step 1: Repaint while the main loop is blocked ---
    // The first call measures and starts the timer; the later calls each
    // advance the marquee one pixel and repaint.
    uint8_t repainted[kBufferBytes];
    {
        real_display real;
        U8G2& display = real.display();
        set_caller_state(display);
        const ambient_state before = ambient_state::read(display);
        for (uint32_t now = 1000; now <= 1400; now += 100) {
            label.render_animation_update(display, now);
        }
        expect_state_equal(before, ambient_state::read(display));
        real.snapshot(repainted);
    }

    // --- Step 2: The normal path, same marquee offset, framework baseline ---
    // A caller holding a font and top positioning: what a correct frame sees.
    uint8_t rendered[kBufferBytes];
    {
        real_display real;
        real.display().setFont(u8g2_font_5x7_tf);
        real.display().setFontPosTop();
        render_alone(real.display(), label);
        real.snapshot(rendered);
    }

    EXPECT_GT(lit_pixels(rendered), 0) << "nothing drawn: the check would be vacuous";
    EXPECT_EQ(std::memcmp(repainted, rendered, kBufferBytes), 0)
        << "lit pixels: repaint " << lit_pixels(repainted) << ", render "
        << lit_pixels(rendered);
}

// --- The clock's colon-blink repaint: caller's state kept, same pixels ---
TEST(AmbientState, ClockRepaintKeepsCallerStateAndMatchesRender) {
    u8g2gl_clock clock;
    clock.set_coords(4, 24, 60, 16);
    clock.set_font(u8g2_font_6x10_tf);
    clock.set_time(12 * 3600 + 34 * 60);
    clock.set_blink(true);

    uint8_t repainted[kBufferBytes];
    {
        real_display real;
        U8G2& display = real.display();
        set_caller_state(display);
        const ambient_state before = ambient_state::read(display);
        clock.render_animation_update(display, 1000);  // 1000 ms since 0: toggles
        expect_state_equal(before, ambient_state::read(display));
        real.snapshot(repainted);
    }

    uint8_t rendered[kBufferBytes];
    {
        real_display real;
        real.display().setFont(u8g2_font_5x7_tf);
        real.display().setFontPosTop();
        render_alone(real.display(), clock);
        real.snapshot(rendered);
    }

    EXPECT_GT(lit_pixels(rendered), 0) << "nothing drawn: the check would be vacuous";
    EXPECT_EQ(std::memcmp(repainted, rendered, kBufferBytes), 0)
        << "lit pixels: repaint " << lit_pixels(repainted) << ", render "
        << lit_pixels(rendered);
}
