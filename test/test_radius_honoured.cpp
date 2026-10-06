/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_radius_honoured.cpp
 *
 * Purpose: Pins which corner radius the button and the switch hand to U8G2 for
 *          their OUTERMOST shape, so the validator's build-time bound
 *          (checkCornerRadius(), cli/src/core/validator/validate-geometry.ts)
 *          is known to be the same bound the runtime clamps to, for objects as
 *          well as for the drawing box. The finding: the outer radius reaches
 *          U8G2 unchanged exactly when 2r <= min(w, h), and is clamped to
 *          min(w, h) / 2 beyond it (u8g2gl_coord_corner_radius(), §10).
 *
 * Description: Sweeps odd, even, wide, narrow and square sizes, including the
 *              sizes test_rbox_bound.cpp measures against the real U8G2, over
 *              every radius from 0 to min(w, h) / 2 + 2, and reads the radius
 *              of the recorded U8G2 call from the host test double:
 *              - button: border layer 0 (drawRFrame) and the focused fill
 *                (drawRBox);
 *              - switch: the track (drawRFrame).
 *              Inner border layers and the switch handle derive their radius
 *              from the outer one by design (r - 1 per layer, clamped to their
 *              own smaller box) and are not the author's radius, so they are
 *              not asserted here.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_button.h"
#include "u8g2gl/u8g2gl_switch.h"
#include "U8g2lib.h"

namespace {

// The sizes test_rbox_bound.cpp measures, so the two suites speak of the same
// boxes. The switch needs at least 4x4 to draw anything (u8g2gl_switch::render).
const int kSizes[][2] = {
    {10, 10}, {11, 11}, {20, 8}, {8, 20}, {2, 2},  {3, 3},  {7, 12},
    {12, 7},  {16, 16}, {31, 9}, {9, 31}, {5, 40}, {40, 5}, {1, 6},
    {20, 6},  {6, 20},  {4, 4},  {5, 5},
};

int smaller_of(int w, int h) { return (w < h) ? w : h; }

}  // namespace

TEST(RadiusHonoured, ButtonBorderLayerZeroIsHonouredExactlyWithinTheBound) {
    for (const auto& size : kSizes) {
        const int w = size[0];
        const int h = size[1];
        const int smaller = smaller_of(w, h);
        for (int r = 0; r <= smaller / 2 + 2; ++r) {
            SCOPED_TRACE(testing::Message() << "button " << w << "x" << h << " r=" << r);
            u8g2gl_button btn;
            btn.set_coords(10, 10, static_cast<int16_t>(w), static_cast<int16_t>(h));
            btn.set_radius(static_cast<int16_t>(r));
            U8G2 display;
            btn.render(display);
            ASSERT_EQ(display.draw_rframe_count, 1);
            EXPECT_EQ(display.last_draw_rframe_r == r, 2 * r <= smaller);
            EXPECT_EQ(display.last_draw_rframe_r, r < smaller / 2 ? r : smaller / 2);
        }
    }
}

TEST(RadiusHonoured, ButtonFocusedFillIsHonouredExactlyWithinTheBound) {
    for (const auto& size : kSizes) {
        const int w = size[0];
        const int h = size[1];
        const int smaller = smaller_of(w, h);
        // Radius 0 selects the plain drawBox (no radius to honour), so the sweep
        // starts at 1.
        for (int r = 1; r <= smaller / 2 + 2; ++r) {
            SCOPED_TRACE(testing::Message() << "button fill " << w << "x" << h << " r=" << r);
            u8g2gl_button btn;
            btn.set_coords(10, 10, static_cast<int16_t>(w), static_cast<int16_t>(h));
            btn.set_border_width(0);
            btn.set_invert(true);
            btn.set_radius(static_cast<int16_t>(r));
            U8G2 display;
            btn.render(display);
            if (smaller / 2 == 0) {
                // A box under 2 pixels across clamps the radius to 0, and a
                // zero radius is the plain drawBox.
                EXPECT_EQ(display.draw_rbox_count, 0);
                continue;
            }
            ASSERT_EQ(display.draw_rbox_count, 1);
            EXPECT_EQ(display.last_draw_rbox_r == r, 2 * r <= smaller);
            EXPECT_EQ(display.last_draw_rbox_r, r < smaller / 2 ? r : smaller / 2);
        }
    }
}

TEST(RadiusHonoured, SwitchTrackIsHonouredExactlyWithinTheBound) {
    for (const auto& size : kSizes) {
        const int w = size[0];
        const int h = size[1];
        if (w < 4 || h < 4) {
            continue;  // Nothing is drawn below 4x4.
        }
        const int smaller = smaller_of(w, h);
        // Radius 0 means "none written": the switch defaults to h / 2, which is
        // the runtime's choice and not an author's radius.
        for (int r = 1; r <= smaller / 2 + 2; ++r) {
            SCOPED_TRACE(testing::Message() << "switch " << w << "x" << h << " r=" << r);
            u8g2gl_switch sw;
            sw.set_coords(10, 10, static_cast<int16_t>(w), static_cast<int16_t>(h));
            sw.set_radius(static_cast<int16_t>(r));
            U8G2 display;
            sw.render(display);
            ASSERT_EQ(display.draw_rframe_count, 1);
            EXPECT_EQ(display.last_draw_rframe_r == r, 2 * r <= smaller);
            EXPECT_EQ(display.last_draw_rframe_r, r < smaller / 2 ? r : smaller / 2);
        }
    }
}

TEST(RadiusHonoured, SwitchWithNoRadiusDefaultsToHalfItsHeightWithinTheBound) {
    u8g2gl_switch sw;
    sw.set_coords(10, 10, 30, 14);
    U8G2 display;
    sw.render(display);
    EXPECT_EQ(display.last_draw_rframe_r, 7);
}
