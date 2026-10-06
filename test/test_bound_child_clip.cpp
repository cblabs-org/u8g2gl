/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_bound_child_clip.cpp
 *
 * Purpose: Proves, in real U8G2 pixels, that how a drawing element inside a
 *          container is realised cannot be seen ([D-18], §13.5). A drawing
 *          element has no class, so the generator emits it as a draw call; an
 *          object child is clipped to its container by u8g2gl_render_object()
 *          (§11.3), and a draw call whose geometry is bound must be clipped the
 *          same way, or a bound value that overhangs the container paints
 *          outside it where an object would not.
 *
 *          The draw-call cases run exactly the statements the generator emits
 *          for such a child (cli/src/core/generator/emit/screen.ts; the CLI's
 *          emission tests pin that spelling), so they fail if the clip scope is
 *          removed from either side: without it, the bound-position box sets 30
 *          pixels outside the container and the bound-size box 56, measured.
 *          The object cases are the control: a class-backed element with the
 *          same rectangle, rendered through u8g2gl_render_object(), must set no
 *          pixel outside either.
 *
 * Description: Compiles the runtime against real U8G2's headers and links real
 *              U8G2's C sources (extern/u8g2, tag 2.36.18) — never the host
 *              stub, whose setClipWindow() only records its arguments — so the
 *              clip window is the one U8G2 itself enforces. Draws into a
 *              128x64 full buffer and counts pixels set outside the
 *              container's rectangle.
 */
#include <gtest/gtest.h>

#include <U8g2lib.h>

#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_progress_bar.h"
#include "u8g2gl/u8g2gl_subject.h"

namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;

// The container: columns 10..49, rows 10..29. Clear of every display edge, so
// an overhang has room to appear rather than being clipped by the display.
constexpr int16_t kContainerX = 10;
constexpr int16_t kContainerY = 10;
constexpr int16_t kContainerW = 40;
constexpr int16_t kContainerH = 20;

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

    // Pixels set outside the container's rectangle; `inside` receives the rest.
    int count_outside_container(int& inside) {
        int outside = 0;
        inside = 0;
        for (int y = 0; y < kDisplayHeight; ++y) {
            for (int x = 0; x < kDisplayWidth; ++x) {
                if (!pixel(x, y)) {
                    continue;
                }
                const bool in_container = x >= kContainerX && x < kContainerX + kContainerW &&
                                          y >= kContainerY && y < kContainerY + kContainerH;
                (in_container ? inside : outside) += 1;
            }
        }
        return outside;
    }

private:
    // The SSD1306 full buffer is vertical_top_lsb: a byte per column per
    // 8-row page, bit 0 the top row of the page.
    bool pixel(int x, int y) {
        const uint8_t* buf = display_.getBufferPtr();
        return ((buf[(y / 8) * kDisplayWidth + x] >> (y % 8)) & 1) != 0;
    }

    U8G2 display_;
};

// The flat tree the generator emits for one container and nothing else: the
// container is object 0, directly under <view>.
struct one_container {
    u8g2gl_obj container;
    u8g2gl_obj* objs[1] = {&container};
    uint8_t parents[1] = {U8G2GL_NO_PARENT};

    one_container() { container.set_coords(kContainerX, kContainerY, kContainerW, kContainerH); }
};

}  // namespace

// --- Draw-call child, bound position overhanging the right edge ---
// <u8g2gl_box x="35" y="5" width="10" height="6" bind_x="n"/> inside the
// container, n = 35: columns 45..54, so 50..54 overhang by five columns.
TEST(BoundChildClip, BoundPositionDrawCallStaysInsideContainer) {
    real_display real;
    U8G2& display = real.display();
    one_container tree;
    u8g2gl_subject_int n(35);

    // The statements the generator emits for this child: its container's
    // visibility guard, then the call inside the container's clip scope.
    u8g2gl_render_object(display, tree.objs, tree.parents, 0);
    if (!tree.container.is_hidden()) {
        u8g2gl_clip_scope clip(display, tree.objs, tree.parents, 0);
        if (clip.drawable()) {
            u8g2gl_draw_box(display, u8g2gl_coord_bound(kContainerX, n.get()), 15, 10, 6, true, 0);
        }
    }

    int inside = 0;
    EXPECT_EQ(real.count_outside_container(inside), 0);
    EXPECT_EQ(inside, 5 * 6) << "the part inside the container must still be drawn";
}

// --- Draw-call child, bound size overhanging the bottom edge ---
// <u8g2gl_box x="10" y="15" width="8" bind_height="n"/> inside the container,
// n = 12: rows 25..36, so 30..36 overhang by seven rows.
TEST(BoundChildClip, BoundSizeDrawCallStaysInsideContainer) {
    real_display real;
    U8G2& display = real.display();
    one_container tree;
    u8g2gl_subject_int n(12);

    u8g2gl_render_object(display, tree.objs, tree.parents, 0);
    if (!tree.container.is_hidden()) {
        u8g2gl_clip_scope clip(display, tree.objs, tree.parents, 0);
        if (clip.drawable()) {
            u8g2gl_draw_box(display, 20, 25, 8, u8g2gl_coord_bound(0, n.get()), true, 0);
        }
    }

    int inside = 0;
    EXPECT_EQ(real.count_outside_container(inside), 0);
    EXPECT_EQ(inside, 8 * 5) << "the part inside the container must still be drawn";
}

// --- Control: the same rectangles realised as objects ---
// A class-backed child (a full solid progress bar, which paints its whole
// rectangle) rendered through u8g2gl_render_object(). This passes with or
// without the draw-call clip; it is what the draw-call cases must match.
TEST(BoundChildClip, ObjectChildWithTheSameRectStaysInsideContainer) {
    const int16_t rects[][4] = {
        {45, 15, 10, 6},   // the bound-position case's rectangle
        {20, 25, 8, 12},   // the bound-size case's rectangle
    };
    for (const auto& rect : rects) {
        SCOPED_TRACE(testing::Message() << "object at " << rect[0] << "," << rect[1] << " "
                                        << rect[2] << "x" << rect[3]);
        real_display real;
        U8G2& display = real.display();
        u8g2gl_obj container;
        u8g2gl_progress_bar child;
        container.set_coords(kContainerX, kContainerY, kContainerW, kContainerH);
        child.set_coords(rect[0], rect[1], rect[2], rect[3]);
        child.set_fill_style(U8G2GL_FILL_SOLID);
        child.set_value(100);
        u8g2gl_obj* const objs[] = {&container, &child};
        const uint8_t parents[] = {U8G2GL_NO_PARENT, 0};

        u8g2gl_render_object(display, objs, parents, 0);
        u8g2gl_render_object(display, objs, parents, 1);

        int inside = 0;
        EXPECT_EQ(real.count_outside_container(inside), 0);
        EXPECT_GT(inside, 0) << "nothing drawn: the check would be vacuous";
    }
}
