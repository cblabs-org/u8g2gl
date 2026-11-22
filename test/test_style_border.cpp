/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_style_border.cpp
 *
 * Purpose: Proves, in real U8G2 pixels, that a style's `border` draws what §10
 *          promises: a one-pixel frame on the element's own box, in its draw
 *          colour and corner radius, for every element, by the framework rather
 *          than by each widget. The schema, the manifests and the designer all
 *          said `border` drew an outline long before the runtime drew one, so
 *          an author who set it saw nothing and had no diagnostic. These tests
 *          are what keeps that promise true.
 *
 * Description: Compiles the runtime against real U8G2's headers and links its C
 *              sources and fonts (extern/u8g2, tag 2.36.18), as
 *              test_ambient_state.cpp does, and draws into a 128x64 full buffer
 *              through u8g2gl_render_object() and u8g2gl_repaint_object().
 *              Covers:
 *              - every element type: `border` false draws no outline; true adds
 *                exactly the frame on its box and nothing else;
 *              - the three ways `border` is set (attribute, `style_border`,
 *                named style) draw the same, and the element's own `false`
 *                beats a named style's `true`;
 *              - a corner radius at the §10 bound and one past it, clamped;
 *              - an outline partly off the display, and one partly outside a
 *                container's clip;
 *              - a container's child drawing over the container's outline;
 *              - the button at border_width 0, 1 and 2 under draw colours 0, 1
 *                and xor: its own frame stands in for the outline, once;
 *              - the repaint path drawing the frame path's outline;
 *              - the caller's draw colour surviving both paths.
 */
#include <gtest/gtest.h>

#include <U8g2lib.h>

#include <array>
#include <cstring>

#include "u8g2gl/u8g2gl_button.h"
#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_glyph.h"
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_progress_bar.h"
#include "u8g2gl/u8g2gl_style.h"
#include "u8g2gl/u8g2gl_switch.h"
#include "u8g2gl/u8g2gl_xbm.h"

namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;
constexpr size_t kBufferBytes = kDisplayWidth * kDisplayHeight / 8;

using frame_t = std::array<uint8_t, kBufferBytes>;

// An 8x8 XBM with every pixel set, so a draw-colour-0 bitmap clears a square.
const uint8_t kSolidXbm[8] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// A 16x8 XBM checkerboard: something to draw that is not itself a frame.
const uint8_t kCheckerXbm[16] = {0x55, 0x55, 0xAA, 0xAA, 0x55, 0x55, 0xAA, 0xAA,
                                 0x55, 0x55, 0xAA, 0xAA, 0x55, 0x55, 0xAA, 0xAA};

// The box every element in the sweep occupies: well inside the display, large
// enough for every widget to draw, and wider than tall so a radius clamps on h.
constexpr int16_t kX = 10;
constexpr int16_t kY = 8;
constexpr int16_t kW = 40;
constexpr int16_t kH = 16;

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
        u8g2_InitDisplay(u8g2);
        display_.clearBuffer();
    }

    U8G2& display() { return display_; }

    // u8g2_m_16_8_f() returns one static buffer shared by every instance, so a
    // comparison copies each frame out before the next is drawn.
    frame_t snapshot() {
        frame_t out{};
        std::memcpy(out.data(), display_.getBufferPtr(), kBufferBytes);
        return out;
    }

    // Starts a frame on an empty buffer, or on a lit one so that draw colour 0
    // has something to clear.
    void begin(bool lit) {
        display_.clearBuffer();
        if (lit) {
            std::memset(display_.getBufferPtr(), 0xFF, kBufferBytes);
        }
    }

private:
    U8G2 display_;
};

// pixel
// One pixel of a snapshot, in the SSD1306 vertical-top-LSB layout; false off
// the display.
bool pixel(const frame_t& f, int x, int y) {
    if (x < 0 || x >= kDisplayWidth || y < 0 || y >= kDisplayHeight) {
        return false;
    }
    return ((f[(y / 8) * kDisplayWidth + x] >> (y % 8)) & 1) != 0;
}

// on_square_frame
// Whether (x, y) lies on the one-pixel square frame of box (bx, by, bw, bh):
// the pixels drawRFrame lights at radius 0, worked out independently of it.
bool on_square_frame(int x, int y, int bx, int by, int bw, int bh) {
    const bool in_box = x >= bx && x < bx + bw && y >= by && y < by + bh;
    const bool on_edge = x == bx || x == bx + bw - 1 || y == by || y == by + bh - 1;
    return in_box && on_edge;
}

// frame_union
// Every pixel lit in either snapshot.
frame_t frame_union(const frame_t& a, const frame_t& b) {
    frame_t out{};
    for (size_t i = 0; i < kBufferBytes; ++i) {
        out[i] = static_cast<uint8_t>(a[i] | b[i]);
    }
    return out;
}

// render_scene
// Renders a whole scene the way a generated screen does: one
// u8g2gl_render_object() per object, in document order.
frame_t render_scene(real_display& real, u8g2gl_obj* const* objs, const uint8_t* parents,
                     uint8_t count, bool lit = false) {
    real.begin(lit);
    for (uint8_t i = 0; i < count; ++i) {
        u8g2gl_render_object(real.display(), objs, parents, i);
    }
    return real.snapshot();
}

frame_t render_one(real_display& real, u8g2gl_obj& obj, bool lit = false) {
    u8g2gl_obj* const objs[] = {&obj};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};
    return render_scene(real, objs, parents, 1, lit);
}

// reference_frame
// The outline drawn alone, with nothing else, as the expected pixels.
frame_t reference_frame(real_display& real, int16_t x, int16_t y, int16_t w, int16_t h,
                        int16_t r, uint8_t color = 1, bool lit = false) {
    real.begin(lit);
    real.display().setDrawColor(color);
    u8g2gl_draw_frame(real.display(), x, y, w, h, r);
    return real.snapshot();
}

// Every element type the runtime ships, by the class generated code constructs.
// The button appears twice because its border_width decides the outcome.
enum element_kind : uint8_t {
    KIND_OBJ,
    KIND_LABEL,
    KIND_BUTTON_WIDTH_0,
    KIND_BUTTON_WIDTH_1,
    KIND_SWITCH,
    KIND_PROGRESS_BAR,
    KIND_CLOCK,
    KIND_XBM,
    KIND_GLYPH,
};

const element_kind kAllKinds[] = {
    KIND_OBJ,    KIND_LABEL,        KIND_BUTTON_WIDTH_0, KIND_BUTTON_WIDTH_1, KIND_SWITCH,
    KIND_PROGRESS_BAR, KIND_CLOCK, KIND_XBM,            KIND_GLYPH,
};

const char* kind_name(element_kind k) {
    switch (k) {
        case KIND_OBJ: return "u8g2gl_obj";
        case KIND_LABEL: return "u8g2gl_label";
        case KIND_BUTTON_WIDTH_0: return "u8g2gl_button border_width=0";
        case KIND_BUTTON_WIDTH_1: return "u8g2gl_button border_width=1";
        case KIND_SWITCH: return "u8g2gl_switch";
        case KIND_PROGRESS_BAR: return "u8g2gl_progress_bar";
        case KIND_CLOCK: return "u8g2gl_clock";
        case KIND_XBM: return "u8g2gl_xbm";
        case KIND_GLYPH: return "u8g2gl_glyph";
    }
    return "?";
}

// One instance of each element type, so a test can build any of them in place.
struct element_set {
    u8g2gl_obj obj;
    u8g2gl_label label;
    u8g2gl_button button;
    u8g2gl_switch sw;
    u8g2gl_progress_bar bar;
    u8g2gl_clock clock;
    u8g2gl_xbm image;
    u8g2gl_glyph glyph;
};

// make_element
// Configures one element of `kind` on the sweep's box, drawing something of its
// own wherever the type can, and returns it.
u8g2gl_obj& make_element(element_set& set, element_kind kind) {
    switch (kind) {
        case KIND_OBJ:
            set.obj.set_coords(kX, kY, kW, kH);
            return set.obj;
        case KIND_LABEL:
            set.label.set_coords(kX, kY, kW, kH);
            set.label.set_font(u8g2_font_6x10_tf);
            set.label.set_text("Hi");
            return set.label;
        case KIND_BUTTON_WIDTH_0:
        case KIND_BUTTON_WIDTH_1:
            set.button.set_coords(kX, kY, kW, kH);
            set.button.set_font(u8g2_font_6x10_tf);
            set.button.set_text("OK");
            set.button.set_border_width(kind == KIND_BUTTON_WIDTH_0 ? 0 : 1);
            return set.button;
        case KIND_SWITCH:
            set.sw.set_coords(kX, kY, kW, kH);
            set.sw.set_value(true);
            return set.sw;
        case KIND_PROGRESS_BAR:
            set.bar.set_coords(kX, kY, kW, kH);
            set.bar.set_value(50);
            set.bar.tick(0);
            return set.bar;
        case KIND_CLOCK:
            set.clock.set_coords(kX, kY, kW, kH);
            set.clock.set_font(u8g2_font_6x10_tf);
            set.clock.set_time(12 * 3600 + 34 * 60);
            return set.clock;
        case KIND_XBM:
            set.image.set_coords(kX, kY, 16, 8);
            set.image.set_src(kCheckerXbm);
            return set.image;
        case KIND_GLYPH:
            set.glyph.set_coords(kX, kY, kW, kH);
            set.glyph.set_font(u8g2_font_6x10_tf);
            set.glyph.set_glyph('A');
            return set.glyph;
    }
    return set.obj;
}

}  // namespace

// --- Every element type: false draws nothing, true adds exactly the frame ---

TEST(StyleBorder, EveryElementTypeAddsExactlyItsBoxFrameAndNothingElse) {
    real_display real;
    for (const element_kind kind : kAllKinds) {
        SCOPED_TRACE(kind_name(kind));

        // --- Step 1: The element with no `border` written at all ---
        element_set unset_set;
        u8g2gl_obj& unset = make_element(unset_set, kind);
        const frame_t plain = render_one(real, unset);

        // --- Step 2: `border` false draws exactly the same ---
        element_set off_set;
        u8g2gl_obj& off = make_element(off_set, kind);
        off.set_border(false);
        EXPECT_EQ(render_one(real, off), plain) << "border=false must draw no outline";

        // --- Step 3: `border` true adds the frame on its box, and only that ---
        element_set on_set;
        u8g2gl_obj& on = make_element(on_set, kind);
        on.set_border(true);
        const frame_t bordered = render_one(real, on);
        const frame_t outline = reference_frame(real, on.get_x(), on.get_y(), on.get_w(),
                                                on.get_h(), 0);
        EXPECT_EQ(bordered, frame_union(plain, outline));

        // The frame is the square one on the box, by an independent reckoning.
        for (int y = 0; y < kDisplayHeight; ++y) {
            for (int x = 0; x < kDisplayWidth; ++x) {
                if (on_square_frame(x, y, on.get_x(), on.get_y(), on.get_w(), on.get_h())) {
                    ASSERT_TRUE(pixel(bordered, x, y)) << "frame pixel (" << x << ", " << y << ")";
                }
            }
        }
    }
}

// --- The three ways to set `border` agree, and the element's own value wins ---

TEST(StyleBorder, AttributeStyleBorderAndNamedStyleDrawTheSameOutline) {
    real_display real;

    // The attribute and `style_border` both reach the runtime as set_border()
    // (the generator emits the same call for each); the named style is
    // apply_style(), as generated init() runs it.
    u8g2gl_label by_attribute;
    by_attribute.set_coords(kX, kY, kW, kH);
    by_attribute.set_border(true);

    u8g2gl_style named;
    named.set_border(true);
    u8g2gl_label by_style;
    by_style.set_coords(kX, kY, kW, kH);
    by_style.apply_style(named);

    const frame_t expected = reference_frame(real, kX, kY, kW, kH, 0);
    EXPECT_EQ(render_one(real, by_attribute), expected);
    EXPECT_EQ(render_one(real, by_style), expected);

    // Named styles are applied before properties, and the element's own
    // `border="false"` beats the style's true (§10).
    u8g2gl_label overridden;
    overridden.set_coords(kX, kY, kW, kH);
    overridden.apply_style(named);
    overridden.set_border(false);
    const frame_t blank = reference_frame(real, kX, kY, 0, 0, 0);
    EXPECT_EQ(render_one(real, overridden), blank);
}

// --- The corner radius follows §10's bound ---

TEST(StyleBorder, RadiusAtTheBoundIsHonouredAndPastItIsClamped) {
    real_display real;
    // 2r <= min(w, h): for a 40x16 box the bound is r = 8.
    constexpr int16_t kBound = kH / 2;

    u8g2gl_obj at_bound;
    at_bound.set_coords(kX, kY, kW, kH);
    at_bound.set_border(true);
    at_bound.set_radius(kBound);
    const frame_t drawn_at_bound = render_one(real, at_bound);
    EXPECT_EQ(drawn_at_bound, reference_frame(real, kX, kY, kW, kH, kBound));

    // A rounded frame really is rounded: the box's corner pixel is not lit,
    // while the middle of the top edge is.
    EXPECT_FALSE(pixel(drawn_at_bound, kX, kY));
    EXPECT_TRUE(pixel(drawn_at_bound, kX + kW / 2, kY));

    u8g2gl_obj past_bound;
    past_bound.set_coords(kX, kY, kW, kH);
    past_bound.set_border(true);
    past_bound.set_radius(kBound + 5);
    EXPECT_EQ(render_one(real, past_bound), drawn_at_bound)
        << "a radius past the bound is clamped to it, not drawn outside the box";

    // Nothing of either lands outside the box.
    for (int y = 0; y < kDisplayHeight; ++y) {
        for (int x = 0; x < kDisplayWidth; ++x) {
            const bool in_box = x >= kX && x < kX + kW && y >= kY && y < kY + kH;
            if (!in_box) {
                ASSERT_FALSE(pixel(drawn_at_bound, x, y)) << "(" << x << ", " << y << ")";
            }
        }
    }
}

// --- Only the visible, clipped part of an outline is drawn ---

TEST(StyleBorder, OutlinePartlyOffTheLeftAndTopEdgesDrawsItsVisiblePart) {
    real_display real;
    u8g2gl_obj obj;
    obj.set_coords(-5, -3, 20, 10);
    obj.set_border(true);
    const frame_t drawn = render_one(real, obj);

    int lit = 0;
    for (int y = 0; y < kDisplayHeight; ++y) {
        for (int x = 0; x < kDisplayWidth; ++x) {
            EXPECT_EQ(pixel(drawn, x, y), on_square_frame(x, y, -5, -3, 20, 10))
                << "(" << x << ", " << y << ")";
            lit += pixel(drawn, x, y) ? 1 : 0;
        }
    }
    // The right edge (x = 14, rows 0..6) and the bottom edge (y = 6, columns
    // 0..14), sharing the corner: the left and top edges are off the display.
    EXPECT_EQ(lit, 7 + 15 - 1);
}

TEST(StyleBorder, OutlinePartlyOutsideItsContainerIsClippedToTheContainer) {
    real_display real;
    u8g2gl_obj container;
    container.set_coords(20, 10, 30, 20);
    u8g2gl_obj child;
    child.set_coords(40, 15, 20, 10);
    child.set_border(true);
    u8g2gl_obj* const objs[] = {&container, &child};
    const uint8_t parents[] = {U8G2GL_NO_PARENT, 0};
    const frame_t drawn = render_scene(real, objs, parents, 2);

    for (int y = 0; y < kDisplayHeight; ++y) {
        for (int x = 0; x < kDisplayWidth; ++x) {
            const bool in_container = x >= 20 && x < 50 && y >= 10 && y < 30;
            const bool expected = in_container && on_square_frame(x, y, 40, 15, 20, 10);
            EXPECT_EQ(pixel(drawn, x, y), expected) << "(" << x << ", " << y << ")";
        }
    }
    // The child's right edge, at x = 59, is outside the container's x < 50.
    EXPECT_FALSE(pixel(drawn, 59, 20));
    EXPECT_TRUE(pixel(drawn, 49, 15));
}

// --- A child draws over its container's outline ---

TEST(StyleBorder, ContainerChildDrawsOverTheContainerOutline) {
    real_display real;
    u8g2gl_obj container;
    container.set_coords(kX, kY, kW, kH);
    container.set_border(true);

    // A solid bitmap in draw colour 0 over the container's top-left corner:
    // drawn after the container, it clears the outline where it overlaps.
    u8g2gl_xbm child;
    child.set_coords(kX, kY, 8, 8);
    child.set_src(kSolidXbm);
    child.set_draw_color(U8G2GL_COLOR_0);

    u8g2gl_obj* const objs[] = {&container, &child};
    const uint8_t parents[] = {U8G2GL_NO_PARENT, 0};
    const frame_t drawn = render_scene(real, objs, parents, 2);

    for (int y = 0; y < kDisplayHeight; ++y) {
        for (int x = 0; x < kDisplayWidth; ++x) {
            const bool under_child = x >= kX && x < kX + 8 && y >= kY && y < kY + 8;
            const bool expected = !under_child && on_square_frame(x, y, kX, kY, kW, kH);
            EXPECT_EQ(pixel(drawn, x, y), expected) << "(" << x << ", " << y << ")";
        }
    }
}

// --- The button: its own frame stands in for the outline (B2a) ---

TEST(StyleBorder, ButtonFrameAppearsExactlyOnceAtEveryBorderWidthAndColour) {
    real_display real;
    const u8g2gl_color_t colours[] = {U8G2GL_COLOR_0, U8G2GL_COLOR_1, U8G2GL_COLOR_XOR};
    for (const u8g2gl_color_t colour : colours) {
        // Colour 0 can only show on a lit buffer; 1 and xor on an empty one.
        const bool lit = colour == U8G2GL_COLOR_0;
        for (uint8_t width = 0; width <= 2; ++width) {
            SCOPED_TRACE(testing::Message() << "colour " << static_cast<int>(colour)
                                            << " border_width " << static_cast<int>(width));
            u8g2gl_button without;
            without.set_coords(kX, kY, kW, kH);
            without.set_border_width(width);
            without.set_draw_color(colour);
            const frame_t plain = render_one(real, without, lit);

            u8g2gl_button with;
            with.set_coords(kX, kY, kW, kH);
            with.set_border_width(width);
            with.set_draw_color(colour);
            with.set_border(true);
            const frame_t bordered = render_one(real, with, lit);

            if (width == 0) {
                // No frame of its own, so the framework draws the outline: the
                // pixels of one frame drawn alone in this colour.
                EXPECT_FALSE(with.draws_own_outline());
                EXPECT_EQ(bordered, reference_frame(real, kX, kY, kW, kH, 0,
                                                    static_cast<uint8_t>(colour), lit));
                EXPECT_NE(bordered, plain);
            } else {
                // Its own frame already is the outline: `border` changes nothing,
                // so the frame is drawn once, and under xor it is not cancelled.
                EXPECT_TRUE(with.draws_own_outline());
                EXPECT_EQ(bordered, plain);
            }

            // Either way the middle of the top edge shows the frame: lit, or
            // cleared under colour 0. Under xor a second pass would clear it.
            EXPECT_EQ(pixel(bordered, kX + kW / 2, kY), !lit);
        }
    }
}

// --- The repaint path draws the frame path's outline ---

TEST(StyleBorder, RepaintDrawsTheSameOutlineAsTheFramePath) {
    real_display real;
    const int16_t radii[] = {0, 3};
    for (const int16_t radius : radii) {
        SCOPED_TRACE(testing::Message() << "radius " << radius);
        u8g2gl_label label;
        label.set_coords(kX, kY, kW, kH);
        label.set_font(u8g2_font_6x10_tf);
        label.set_text("Hi");
        label.set_radius(radius);
        label.set_border(true);

        const frame_t framed = render_one(real, label);

        // On a lit buffer, so the repaint's own clear is part of what is checked.
        real.begin(true);
        ASSERT_TRUE(u8g2gl_repaint_object(real.display(), label));
        const frame_t repainted = real.snapshot();

        for (int y = 0; y < kDisplayHeight; ++y) {
            for (int x = 0; x < kDisplayWidth; ++x) {
                const bool in_box = x >= kX && x < kX + kW && y >= kY && y < kY + kH;
                if (in_box) {
                    ASSERT_EQ(pixel(repainted, x, y), pixel(framed, x, y))
                        << "(" << x << ", " << y << ")";
                } else {
                    ASSERT_TRUE(pixel(repainted, x, y)) << "repaint left its bounds at ("
                                                        << x << ", " << y << ")";
                }
            }
        }
    }
}

// --- No draw colour leaks to the caller ---

TEST(StyleBorder, CallerDrawColourIsUnchangedAfterEitherPath) {
    real_display real;
    U8G2& display = real.display();
    u8g2gl_obj obj;
    obj.set_coords(kX, kY, kW, kH);
    obj.set_draw_color(U8G2GL_COLOR_XOR);
    obj.set_border(true);
    u8g2gl_obj* const objs[] = {&obj};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};

    display.setDrawColor(0);
    u8g2gl_render_object(display, objs, parents, 0);
    EXPECT_EQ(display.getU8g2()->draw_color, 0);

    display.setDrawColor(0);
    ASSERT_TRUE(u8g2gl_repaint_object(display, obj));
    EXPECT_EQ(display.getU8g2()->draw_color, 0);
}
