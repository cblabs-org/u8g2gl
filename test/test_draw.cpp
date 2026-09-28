/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_draw.cpp
 *
 * Purpose: Verification suite for the u8g2gl_draw_* free functions ([D-18]).
 *          Every one of the eight primitives asserts the specific U8G2 call
 *          issued and its arguments, not merely "does not crash" — WO3b
 *          extended the test double (test/stubs/U8g2lib.h) precisely so this
 *          suite could stop being a smoke test. Degenerate geometry
 *          (zero/negative width, height or radius) is still checked
 *          separately: it must be a silent no-op rather than undefined
 *          behaviour. A rounded box's radius is held to 2r <= min(w, h) of the
 *          box drawn (PR-4R WO3), read from the call log.
 *
 * Description: GoogleTest suite covering all eight primitives — box, circle,
 *              ellipse, hline, line, pixel, triangle and vline.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_draw.h"
#include "U8g2lib.h"

#include <string>

// --- u8g2gl_draw_box ---

TEST(DrawBox, FilledSquareCorners) {
    U8G2 display;
    u8g2gl_draw_box(display, 1, 2, 10, 20, true, 0);

    EXPECT_EQ(display.draw_box_count, 1);
    EXPECT_EQ(display.last_draw_box_x, 1);
    EXPECT_EQ(display.last_draw_box_y, 2);
    EXPECT_EQ(display.last_draw_box_w, 10);
    EXPECT_EQ(display.last_draw_box_h, 20);
    EXPECT_EQ(display.draw_frame_count, 0);
    EXPECT_EQ(display.draw_rbox_count, 0);
    EXPECT_EQ(display.draw_rframe_count, 0);
}

TEST(DrawBox, OutlineSquareCorners) {
    U8G2 display;
    u8g2gl_draw_box(display, 1, 2, 10, 20, false, 0);

    EXPECT_EQ(display.draw_frame_count, 1);
    EXPECT_EQ(display.last_draw_frame_x, 1);
    EXPECT_EQ(display.last_draw_frame_y, 2);
    EXPECT_EQ(display.last_draw_frame_w, 10);
    EXPECT_EQ(display.last_draw_frame_h, 20);
    EXPECT_EQ(display.draw_box_count, 0);
}

TEST(DrawBox, FilledRoundedCorners) {
    U8G2 display;
    u8g2gl_draw_box(display, 1, 2, 10, 20, true, 3);

    EXPECT_EQ(display.draw_rbox_count, 1);
    EXPECT_EQ(display.last_draw_rbox_x, 1);
    EXPECT_EQ(display.last_draw_rbox_y, 2);
    EXPECT_EQ(display.last_draw_rbox_w, 10);
    EXPECT_EQ(display.last_draw_rbox_h, 20);
    EXPECT_EQ(display.last_draw_rbox_r, 3);
    EXPECT_EQ(display.draw_box_count, 0);
}

TEST(DrawBox, OutlineRoundedCorners) {
    U8G2 display;
    u8g2gl_draw_box(display, 1, 2, 10, 20, false, 3);

    EXPECT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 1);
    EXPECT_EQ(display.last_draw_rframe_y, 2);
    EXPECT_EQ(display.last_draw_rframe_w, 10);
    EXPECT_EQ(display.last_draw_rframe_h, 20);
    EXPECT_EQ(display.draw_frame_count, 0);
}

TEST(DrawBox, ZeroWidthIsNoOp) {
    U8G2 display;
    u8g2gl_draw_box(display, 0, 0, 0, 20, true, 0);
    EXPECT_EQ(display.draw_box_count, 0);
}

TEST(DrawBox, ZeroHeightIsNoOp) {
    U8G2 display;
    u8g2gl_draw_box(display, 0, 0, 10, 0, true, 0);
    EXPECT_EQ(display.draw_box_count, 0);
}

TEST(DrawBox, NegativeWidthIsNoOp) {
    U8G2 display;
    // Inverted/negative geometry must not reach U8G2's unsigned coordinate
    // type, where it would wrap to a very large value rather than draw
    // nothing.
    u8g2gl_draw_box(display, 0, 0, -5, 20, true, 0);
    EXPECT_EQ(display.draw_box_count, 0);
    EXPECT_EQ(display.draw_frame_count, 0);
    EXPECT_EQ(display.draw_rbox_count, 0);
    EXPECT_EQ(display.draw_rframe_count, 0);
}

// --- u8g2gl_draw_box: the corner-radius bound (PR-4R WO3) ---
// Past 2r <= min(w, h) U8G2's rounded boxes draw far outside the box
// (u8g2gl_coord_corner_radius(); measured in test_rbox_bound.cpp), so the
// radius is clamped at draw time to the box actually drawn. These read the call
// log, so a second or stray rounded call would be seen too.

namespace {

// Asserts the log holds exactly one call, `op`, and returns its arguments.
const int32_t* only_call(const U8G2& display, const char* op) {
    EXPECT_EQ(display.call_log_count, 1);
    if (display.call_log_count != 1) {
        return nullptr;
    }
    EXPECT_STREQ(display.call_log[0].op, op);
    return display.call_log[0].args;
}

}  // namespace

TEST(DrawBoxRadiusBound, RadiusAboveHalfTheSizeIsClampedFilledAndOutline) {
    // 10x20 box, r = 9: the bound is min(10, 20) / 2 = 5.
    for (bool filled : {true, false}) {
        SCOPED_TRACE(filled ? "filled" : "outline");
        U8G2 display;
        u8g2gl_draw_box(display, 1, 2, 10, 20, filled, 9);
        const int32_t* args = only_call(display, filled ? "drawRBox" : "drawRFrame");
        ASSERT_NE(args, nullptr);
        EXPECT_EQ(args[0], 1);
        EXPECT_EQ(args[1], 2);
        EXPECT_EQ(args[2], 10);
        EXPECT_EQ(args[3], 20);
        EXPECT_EQ(args[4], 5);
    }
}

TEST(DrawBoxRadiusBound, NoRadiusReachingU8g2ExceedsTheBound) {
    // Every radius from 0 to beyond both sides, at odd, even and non-square
    // sizes: whatever is issued satisfies 2r <= min(w, h), and a radius already
    // inside the bound is passed through unchanged.
    const int sizes[][2] = {{10, 10}, {11, 11}, {20, 8}, {8, 20}, {7, 12}, {2, 2}, {3, 9}};
    for (const auto& size : sizes) {
        const int w = size[0];
        const int h = size[1];
        const int smaller = (w < h) ? w : h;
        for (int r = 0; r <= smaller + 2; ++r) {
            for (bool filled : {true, false}) {
                SCOPED_TRACE(testing::Message() << w << "x" << h << " r=" << r
                                                << (filled ? " filled" : " outline"));
                U8G2 display;
                u8g2gl_draw_box(display, 0, 0, static_cast<int16_t>(w),
                                static_cast<int16_t>(h), filled, static_cast<int16_t>(r));
                ASSERT_EQ(display.call_log_count, 1);
                const u8g2_stub_call& call = display.call_log[0];
                const bool rounded = std::string(call.op) == "drawRBox" ||
                                     std::string(call.op) == "drawRFrame";
                const int32_t issued = rounded ? call.args[4] : 0;
                EXPECT_LE(2 * issued, smaller);
                EXPECT_EQ(issued, (2 * r <= smaller) ? r : smaller / 2);
            }
        }
    }
}

TEST(DrawBoxRadiusBound, SmallRuntimeSizeClampsTheRadius) {
    // The bound-size case: a literal radius the validator accepted against the
    // authored size, drawn at a size that shrank at run time. w = 6, r = 5 -> 3.
    U8G2 display;
    u8g2gl_draw_box(display, 4, 4, 6, 30, true, 5);
    const int32_t* args = only_call(display, "drawRBox");
    ASSERT_NE(args, nullptr);
    EXPECT_EQ(args[2], 6);
    EXPECT_EQ(args[4], 3);

    U8G2 outline;
    u8g2gl_draw_box(outline, 4, 4, 30, 6, false, 5);
    args = only_call(outline, "drawRFrame");
    ASSERT_NE(args, nullptr);
    EXPECT_EQ(args[3], 6);
    EXPECT_EQ(args[4], 3);
}

TEST(DrawBoxRadiusBound, RadiusClampingToZeroSelectsSquarePrimitive) {
    // w = 1: min(1, h) / 2 = 0, so the box is square, and it must be drawn with
    // drawBox / drawFrame exactly as a literal radius of 0 is — never drawRBox
    // with r = 0.
    U8G2 filled;
    u8g2gl_draw_box(filled, 2, 3, 1, 10, true, 4);
    const int32_t* args = only_call(filled, "drawBox");
    ASSERT_NE(args, nullptr);
    EXPECT_EQ(args[0], 2);
    EXPECT_EQ(args[1], 3);
    EXPECT_EQ(args[2], 1);
    EXPECT_EQ(args[3], 10);

    U8G2 outline;
    u8g2gl_draw_box(outline, 2, 3, 10, 1, false, 4);
    args = only_call(outline, "drawFrame");
    ASSERT_NE(args, nullptr);
    EXPECT_EQ(args[2], 10);
    EXPECT_EQ(args[3], 1);
}

TEST(DrawBoxRadiusBound, NegativeRadiusDrawsSquareCornersAsBefore) {
    U8G2 filled;
    u8g2gl_draw_box(filled, 1, 2, 10, 20, true, -3);
    const int32_t* args = only_call(filled, "drawBox");
    ASSERT_NE(args, nullptr);
    EXPECT_EQ(args[2], 10);
    EXPECT_EQ(args[3], 20);

    U8G2 outline;
    u8g2gl_draw_box(outline, 1, 2, 10, 20, false, -3);
    args = only_call(outline, "drawFrame");
    ASSERT_NE(args, nullptr);
    EXPECT_EQ(args[2], 10);
    EXPECT_EQ(args[3], 20);
}

// --- u8g2gl_draw_circle ---

TEST(DrawCircle, OutlineIssuesDrawCircleWithArguments) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, 10, false, U8G2GL_DRAW_SEGMENT_ALL);

    EXPECT_EQ(display.draw_circle_count, 1);
    EXPECT_EQ(display.last_draw_circle_x, 32);
    EXPECT_EQ(display.last_draw_circle_y, 32);
    EXPECT_EQ(display.last_draw_circle_r, 10);
    EXPECT_EQ(display.last_draw_circle_option,
              static_cast<uint8_t>(U8G2GL_DRAW_SEGMENT_ALL));
    EXPECT_EQ(display.draw_disc_count, 0);
}

TEST(DrawCircle, FilledIssuesDrawDiscWithArguments) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, 10, true, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);

    EXPECT_EQ(display.draw_disc_count, 1);
    EXPECT_EQ(display.last_draw_disc_x, 32);
    EXPECT_EQ(display.last_draw_disc_y, 32);
    EXPECT_EQ(display.last_draw_disc_r, 10);
    EXPECT_EQ(display.last_draw_disc_option,
              static_cast<uint8_t>(U8G2GL_DRAW_SEGMENT_UPPER_LEFT));
    EXPECT_EQ(display.draw_circle_count, 0);
}

TEST(DrawCircle, ZeroRadiusIsNoOp) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, 0);
    EXPECT_EQ(display.draw_circle_count, 0);
    EXPECT_EQ(display.draw_disc_count, 0);
}

TEST(DrawCircle, NegativeRadiusIsNoOp) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, -4);
    EXPECT_EQ(display.draw_circle_count, 0);
    EXPECT_EQ(display.draw_disc_count, 0);
}

// --- u8g2gl_draw_ellipse ---
// Mirrors u8g2gl_draw_circle's test shape exactly, per the WORKORDER.

TEST(DrawEllipse, OutlineIssuesDrawEllipseWithArguments) {
    U8G2 display;
    u8g2gl_draw_ellipse(display, 32, 20, 12, 8, false, U8G2GL_DRAW_SEGMENT_ALL);

    EXPECT_EQ(display.draw_ellipse_count, 1);
    EXPECT_EQ(display.last_draw_ellipse_x, 32);
    EXPECT_EQ(display.last_draw_ellipse_y, 20);
    EXPECT_EQ(display.last_draw_ellipse_rx, 12);
    EXPECT_EQ(display.last_draw_ellipse_ry, 8);
    EXPECT_EQ(display.last_draw_ellipse_option,
              static_cast<uint8_t>(U8G2GL_DRAW_SEGMENT_ALL));
    EXPECT_EQ(display.draw_filled_ellipse_count, 0);
}

TEST(DrawEllipse, FilledIssuesDrawFilledEllipseWithArguments) {
    U8G2 display;
    u8g2gl_draw_ellipse(display, 32, 20, 12, 8, true,
                         U8G2GL_DRAW_SEGMENT_LOWER_RIGHT);

    EXPECT_EQ(display.draw_filled_ellipse_count, 1);
    EXPECT_EQ(display.last_draw_filled_ellipse_x, 32);
    EXPECT_EQ(display.last_draw_filled_ellipse_y, 20);
    EXPECT_EQ(display.last_draw_filled_ellipse_rx, 12);
    EXPECT_EQ(display.last_draw_filled_ellipse_ry, 8);
    EXPECT_EQ(display.last_draw_filled_ellipse_option,
              static_cast<uint8_t>(U8G2GL_DRAW_SEGMENT_LOWER_RIGHT));
    EXPECT_EQ(display.draw_ellipse_count, 0);
}

TEST(DrawEllipse, ZeroRxIsNoOp) {
    U8G2 display;
    u8g2gl_draw_ellipse(display, 32, 20, 0, 8);
    EXPECT_EQ(display.draw_ellipse_count, 0);
    EXPECT_EQ(display.draw_filled_ellipse_count, 0);
}

TEST(DrawEllipse, ZeroRyIsNoOp) {
    U8G2 display;
    u8g2gl_draw_ellipse(display, 32, 20, 12, 0);
    EXPECT_EQ(display.draw_ellipse_count, 0);
    EXPECT_EQ(display.draw_filled_ellipse_count, 0);
}

TEST(DrawEllipse, NegativeRadiusIsNoOp) {
    U8G2 display;
    u8g2gl_draw_ellipse(display, 32, 20, -3, -3);
    EXPECT_EQ(display.draw_ellipse_count, 0);
    EXPECT_EQ(display.draw_filled_ellipse_count, 0);
}

// --- u8g2gl_draw_hline / u8g2gl_draw_vline ---

TEST(DrawHLine, IssuesDrawHLineWithArguments) {
    U8G2 display;
    u8g2gl_draw_hline(display, 0, 10, 64);

    EXPECT_EQ(display.draw_hline_count, 1);
    EXPECT_EQ(display.last_draw_hline_x, 0);
    EXPECT_EQ(display.last_draw_hline_y, 10);
    EXPECT_EQ(display.last_draw_hline_w, 64);
}

TEST(DrawHLine, ZeroWidthIsNoOp) {
    U8G2 display;
    u8g2gl_draw_hline(display, 0, 10, 0);
    EXPECT_EQ(display.draw_hline_count, 0);
}

TEST(DrawHLine, NegativeWidthIsNoOp) {
    U8G2 display;
    u8g2gl_draw_hline(display, 0, 10, -8);
    EXPECT_EQ(display.draw_hline_count, 0);
}

TEST(DrawVLine, IssuesDrawVLineWithArguments) {
    U8G2 display;
    u8g2gl_draw_vline(display, 10, 0, 32);

    EXPECT_EQ(display.draw_vline_count, 1);
    EXPECT_EQ(display.last_draw_vline_x, 10);
    EXPECT_EQ(display.last_draw_vline_y, 0);
    EXPECT_EQ(display.last_draw_vline_h, 32);
}

TEST(DrawVLine, ZeroHeightIsNoOp) {
    U8G2 display;
    u8g2gl_draw_vline(display, 10, 0, 0);
    EXPECT_EQ(display.draw_vline_count, 0);
}

TEST(DrawVLine, NegativeHeightIsNoOp) {
    U8G2 display;
    u8g2gl_draw_vline(display, 10, 0, -8);
    EXPECT_EQ(display.draw_vline_count, 0);
}

// --- u8g2gl_draw_line ---

TEST(DrawLine, IssuesDrawLineWithArguments) {
    U8G2 display;
    u8g2gl_draw_line(display, 0, 0, 20, 20);

    EXPECT_EQ(display.draw_line_count, 1);
    EXPECT_EQ(display.last_draw_line_x1, 0);
    EXPECT_EQ(display.last_draw_line_y1, 0);
    EXPECT_EQ(display.last_draw_line_x2, 20);
    EXPECT_EQ(display.last_draw_line_y2, 20);
}

TEST(DrawLine, ReversedEndpointsIsNotDegenerate) {
    U8G2 display;
    // drawLine accepts endpoints in either order — start > end is normal
    // input, not a degenerate case to guard against.
    u8g2gl_draw_line(display, 20, 20, 0, 0);

    EXPECT_EQ(display.draw_line_count, 1);
    EXPECT_EQ(display.last_draw_line_x1, 20);
    EXPECT_EQ(display.last_draw_line_y1, 20);
    EXPECT_EQ(display.last_draw_line_x2, 0);
    EXPECT_EQ(display.last_draw_line_y2, 0);
}

// --- u8g2gl_draw_pixel ---

TEST(DrawPixel, DrawsAtCoordinate) {
    U8G2 display;
    u8g2gl_draw_pixel(display, 5, 9);

    EXPECT_EQ(display.draw_pixel_count, 1);
    EXPECT_EQ(display.last_draw_pixel_x, 5);
    EXPECT_EQ(display.last_draw_pixel_y, 9);
}

// --- u8g2gl_draw_triangle ---

TEST(DrawTriangle, FilledIssuesDrawTriangleWithArguments) {
    U8G2 display;
    u8g2gl_draw_triangle(display, 0, 0, 10, 0, 5, 10, true);

    EXPECT_EQ(display.draw_triangle_count, 1);
    EXPECT_EQ(display.last_draw_triangle_x0, 0);
    EXPECT_EQ(display.last_draw_triangle_y0, 0);
    EXPECT_EQ(display.last_draw_triangle_x1, 10);
    EXPECT_EQ(display.last_draw_triangle_y1, 0);
    EXPECT_EQ(display.last_draw_triangle_x2, 5);
    EXPECT_EQ(display.last_draw_triangle_y2, 10);
    EXPECT_EQ(display.draw_line_count, 0);
}

TEST(DrawTriangle, UnfilledIssuesThreeDrawLineCallsBetweenVertices) {
    U8G2 display;
    // U8G2 has no unfilled-triangle primitive, so filled=false composes the
    // outline from three drawLine calls, one per edge, in vertex order.
    u8g2gl_draw_triangle(display, 0, 0, 10, 0, 5, 10, false);

    EXPECT_EQ(display.draw_triangle_count, 0);
    ASSERT_EQ(display.draw_line_count, 3);

    EXPECT_EQ(display.draw_line_x1[0], 0);
    EXPECT_EQ(display.draw_line_y1[0], 0);
    EXPECT_EQ(display.draw_line_x2[0], 10);
    EXPECT_EQ(display.draw_line_y2[0], 0);

    EXPECT_EQ(display.draw_line_x1[1], 10);
    EXPECT_EQ(display.draw_line_y1[1], 0);
    EXPECT_EQ(display.draw_line_x2[1], 5);
    EXPECT_EQ(display.draw_line_y2[1], 10);

    EXPECT_EQ(display.draw_line_x1[2], 5);
    EXPECT_EQ(display.draw_line_y1[2], 10);
    EXPECT_EQ(display.draw_line_x2[2], 0);
    EXPECT_EQ(display.draw_line_y2[2], 0);
}

// --- Negative origins (WO4c, PA ruling after the first pass) ---
// Positions wrap explicitly through u8g2gl_coord_pos(), and the draw still
// happens: U8G2 clips a wrapped negative origin to its visible part (the source
// evidence is on u8g2gl_coord_pos()). The retyped stub records what hardware
// receives, so -5 is observed as 65531. Sizes never wrap — the ZeroWidth and
// NegativeWidth tests above pin that a size <= 0 draws nothing.

TEST(DrawNegativeOrigin, FilledBoxOriginWrapsAndIsDrawn) {
    U8G2 display;
    u8g2gl_draw_box(display, -5, -3, 20, 10, true, 0);

    ASSERT_EQ(display.draw_box_count, 1);
    EXPECT_EQ(display.last_draw_box_x, 65531);
    EXPECT_EQ(display.last_draw_box_y, 65533);
    EXPECT_EQ(display.last_draw_box_w, 20);   // the size is not shortened
    EXPECT_EQ(display.last_draw_box_h, 10);
}

TEST(DrawNegativeOrigin, OutlineAndRoundedBoxesWrapAndAreDrawn) {
    U8G2 display;
    u8g2gl_draw_box(display, -5, 2, 20, 10, false, 0);
    ASSERT_EQ(display.draw_frame_count, 1);
    EXPECT_EQ(display.last_draw_frame_x, 65531);
    EXPECT_EQ(display.last_draw_frame_y, 2);
    EXPECT_EQ(display.last_draw_frame_w, 20);

    u8g2gl_draw_box(display, 2, -5, 20, 10, true, 3);
    ASSERT_EQ(display.draw_rbox_count, 1);
    EXPECT_EQ(display.last_draw_rbox_x, 2);
    EXPECT_EQ(display.last_draw_rbox_y, 65531);
    EXPECT_EQ(display.last_draw_rbox_r, 3);

    u8g2gl_draw_box(display, -1, -1, 20, 10, false, 3);
    ASSERT_EQ(display.draw_rframe_count, 1);
    EXPECT_EQ(display.last_draw_rframe_x, 65535);
    EXPECT_EQ(display.last_draw_rframe_y, 65535);
}

TEST(DrawNegativeOrigin, HVLineOriginsWrapAndLengthsDoNot) {
    U8G2 display;
    u8g2gl_draw_hline(display, -5, -1, 20);
    ASSERT_EQ(display.draw_hline_count, 1);
    EXPECT_EQ(display.last_draw_hline_x, 65531);
    EXPECT_EQ(display.last_draw_hline_y, 65535);
    EXPECT_EQ(display.last_draw_hline_w, 20);

    u8g2gl_draw_vline(display, -2, -4, 10);
    ASSERT_EQ(display.draw_vline_count, 1);
    EXPECT_EQ(display.last_draw_vline_x, 65534);
    EXPECT_EQ(display.last_draw_vline_y, 65532);
    EXPECT_EQ(display.last_draw_vline_h, 10);
}

TEST(DrawNegativeOrigin, PointPositionsWrapAndAreDrawn) {
    U8G2 display;
    u8g2gl_draw_pixel(display, -1, 5);
    ASSERT_EQ(display.draw_pixel_count, 1);
    EXPECT_EQ(display.last_draw_pixel_x, 65535);

    // Lines are the exception and never wrap: see DrawLineClip below.

    u8g2gl_draw_circle(display, -1, 10, 4, false);
    ASSERT_EQ(display.draw_circle_count, 1);
    EXPECT_EQ(display.last_draw_circle_x, 65535);
    EXPECT_EQ(display.last_draw_circle_r, 4);

    u8g2gl_draw_circle(display, 10, -1, 4, true);
    ASSERT_EQ(display.draw_disc_count, 1);
    EXPECT_EQ(display.last_draw_disc_y, 65535);

    u8g2gl_draw_ellipse(display, -3, 10, 4, 2, false);
    ASSERT_EQ(display.draw_ellipse_count, 1);
    EXPECT_EQ(display.last_draw_ellipse_x, 65533);
}

TEST(DrawNegativeOrigin, FilledTrianglePassesSignedVerticesThrough) {
    U8G2 display;
    // U8G2 declares drawTriangle with int16_t, so no conversion applies.
    u8g2gl_draw_triangle(display, -5, 0, 10, 0, 5, 10, true);
    ASSERT_EQ(display.draw_triangle_count, 1);
    EXPECT_EQ(display.last_draw_triangle_x0, -5);
}

// --- Lines clip before they convert (WO4c, PA ruling after the second pass) ---
// U8G2's drawLine has no intersection check and measures the line from unsigned
// end points (u8g2_line.c:49–52, :78), so a wrapped end point draws a
// 65,000-pixel run at the wrong slope. u8g2gl_draw_line() clips the segment to
// the display (the stub reports 128 x 64) before converting.

// Both end points of a recorded line lie on the 128 x 64 display, which also
// rules out every wrapped value (>= 32768).
static void expect_line_on_display(int x1, int y1, int x2, int y2) {
    for (int x : { x1, x2 }) {
        EXPECT_GE(x, 0);
        EXPECT_LE(x, 127);
    }
    for (int y : { y1, y2 }) {
        EXPECT_GE(y, 0);
        EXPECT_LE(y, 63);
    }
}

TEST(DrawLineClip, PartlyOffLeftEdgeReachesU8g2InsideDisplay) {
    U8G2 display;
    u8g2gl_draw_line(display, -2, 0, 10, 10);

    ASSERT_EQ(display.draw_line_count, 1);
    expect_line_on_display(display.last_draw_line_x1, display.last_draw_line_y1,
                           display.last_draw_line_x2, display.last_draw_line_y2);
    // The start moves along the true line to x = 0: y = 10 * 2 / 12 = 1.67 -> 2.
    EXPECT_EQ(display.last_draw_line_x1, 0);
    EXPECT_EQ(display.last_draw_line_y1, 2);
    EXPECT_EQ(display.last_draw_line_x2, 10);   // the on-screen end is untouched
    EXPECT_EQ(display.last_draw_line_y2, 10);
}

TEST(DrawLineClip, WhollyOffScreenLineIsNotDrawn) {
    U8G2 display;
    u8g2gl_draw_line(display, -10, -5, -1, -1);    // above and left
    u8g2gl_draw_line(display, 130, 0, 140, 10);    // right of the display
    u8g2gl_draw_line(display, 0, 64, 127, 90);     // below the display
    EXPECT_EQ(display.draw_line_count, 0);
}

TEST(DrawLineClip, FullyOnScreenLineIsPassedThroughUnchanged) {
    U8G2 display;
    u8g2gl_draw_line(display, 3, 4, 120, 60);
    ASSERT_EQ(display.draw_line_count, 1);
    EXPECT_EQ(display.last_draw_line_x1, 3);
    EXPECT_EQ(display.last_draw_line_y1, 4);
    EXPECT_EQ(display.last_draw_line_x2, 120);
    EXPECT_EQ(display.last_draw_line_y2, 60);

    // The display's corners are on the display, not beyond it.
    u8g2gl_draw_line(display, 0, 0, 127, 63);
    ASSERT_EQ(display.draw_line_count, 2);
    EXPECT_EQ(display.last_draw_line_x2, 127);
    EXPECT_EQ(display.last_draw_line_y2, 63);
}

TEST(DrawLineClip, LineCrossingBothSidesIsClippedAtEachEnd) {
    U8G2 display;
    u8g2gl_draw_line(display, -10, 32, 200, 32);
    ASSERT_EQ(display.draw_line_count, 1);
    EXPECT_EQ(display.last_draw_line_x1, 0);
    EXPECT_EQ(display.last_draw_line_y1, 32);
    EXPECT_EQ(display.last_draw_line_x2, 127);
    EXPECT_EQ(display.last_draw_line_y2, 32);
}

TEST(DrawLineClip, OutlineTriangleVertexOffLeftDrawsThreeInDisplayLines) {
    U8G2 display;
    u8g2gl_draw_triangle(display, -5, 0, 10, 0, 5, 10, false);

    ASSERT_EQ(display.draw_line_count, 3);
    for (int i = 0; i < 3; ++i) {
        expect_line_on_display(display.draw_line_x1[i], display.draw_line_y1[i],
                               display.draw_line_x2[i], display.draw_line_y2[i]);
    }
    // Edge v0-v1 (-5, 0)-(10, 0): clipped at x = 0.
    EXPECT_EQ(display.draw_line_x1[0], 0);
    EXPECT_EQ(display.draw_line_y1[0], 0);
    EXPECT_EQ(display.draw_line_x2[0], 10);
    // Edge v1-v2 is wholly on screen and unchanged.
    EXPECT_EQ(display.draw_line_x1[1], 10);
    EXPECT_EQ(display.draw_line_x2[1], 5);
    EXPECT_EQ(display.draw_line_y2[1], 10);
    // Edge v2-v0 (5, 10)-(-5, 0): its end moves along the line to (0, 5).
    EXPECT_EQ(display.draw_line_x1[2], 5);
    EXPECT_EQ(display.draw_line_y1[2], 10);
    EXPECT_EQ(display.draw_line_x2[2], 0);
    EXPECT_EQ(display.draw_line_y2[2], 5);
}

TEST(DrawTriangle, DegenerateZeroAreaDoesNotCrash) {
    U8G2 display;
    // All three vertices coincide — a zero-area triangle, which U8G2 handles
    // without special-casing, but worth a regression test since it is exactly
    // the "bad value in the render loop" case this module exists to survive.
    u8g2gl_draw_triangle(display, 5, 5, 5, 5, 5, 5, true);
    EXPECT_EQ(display.draw_triangle_count, 1);
}
