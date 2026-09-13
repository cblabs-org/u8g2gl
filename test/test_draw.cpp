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
 *          extended the test double (test/stubs/U8G2lib.h) precisely so this
 *          suite could stop being a smoke test. Degenerate geometry
 *          (zero/negative width, height or radius) is still checked
 *          separately: it must be a silent no-op rather than undefined
 *          behaviour.
 *
 * Description: GoogleTest suite covering all eight primitives — box, circle,
 *              ellipse, hline, line, pixel, triangle and vline.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_draw.h"
#include "U8G2lib.h"

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

TEST(DrawTriangle, DegenerateZeroAreaDoesNotCrash) {
    U8G2 display;
    // All three vertices coincide — a zero-area triangle, which U8G2 handles
    // without special-casing, but worth a regression test since it is exactly
    // the "bad value in the render loop" case this module exists to survive.
    u8g2gl_draw_triangle(display, 5, 5, 5, 5, 5, 5, true);
    EXPECT_EQ(display.draw_triangle_count, 1);
}
