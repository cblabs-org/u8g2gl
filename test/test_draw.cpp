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
 *          Two different guarantees are being checked per function: that
 *          degenerate geometry (zero/negative width, height or radius) is a
 *          silent no-op rather than undefined behaviour, and — where the test
 *          double supports it — that the correct underlying U8G2 call was
 *          issued with the right arguments.
 *
 *          The single authoritative U8G2 test double (test/stubs/U8G2lib.h,
 *          per cpp.md §3) only instruments drawBox/drawFrame/drawRBox/
 *          drawRFrame/drawPixel with call counters and captured arguments.
 *          drawHLine, drawVLine, drawLine, drawCircle, drawDisc and
 *          drawTriangle exist there as unconditional no-ops, so calls into
 *          them can only be smoke-tested (does not crash) — the exact call
 *          cannot be asserted without extending that stub, which is outside
 *          WO3's boundary box. Reported in the WO3 Completion Report rather
 *          than worked around here. u8g2gl_draw_ellipse has no test at all:
 *          it is declared but deliberately not defined, for the same reason
 *          (drawEllipse/drawFilledEllipse do not exist on the stub at all)
 *          — see the @note on its declaration in u8g2gl_draw.h.
 *
 * Description: GoogleTest suite covering box, circle, hline, line, pixel,
 *              triangle and vline.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_draw.h"
#include "U8G2lib.h"

// --- u8g2gl_draw_box ---
// Fully instrumented by the stub: all four filled x radius combinations can
// be asserted precisely.

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
// The stub's drawCircle/drawDisc are unconditional no-ops with no counters,
// so only "does not crash" can be verified here.

TEST(DrawCircle, OutlineDoesNotCrash) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, 10, false, U8G2GL_DRAW_SEGMENT_ALL);
    SUCCEED();
}

TEST(DrawCircle, FilledDoesNotCrash) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, 10, true, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);
    SUCCEED();
}

TEST(DrawCircle, ZeroRadiusIsNoOp) {
    U8G2 display;
    // Nothing to assert beyond "does not crash" (see file header), but a
    // zero radius must take the early-return path.
    u8g2gl_draw_circle(display, 32, 32, 0);
    SUCCEED();
}

TEST(DrawCircle, NegativeRadiusIsNoOp) {
    U8G2 display;
    u8g2gl_draw_circle(display, 32, 32, -4);
    SUCCEED();
}

// --- u8g2gl_draw_hline / u8g2gl_draw_vline ---
// The stub's drawHLine/drawVLine are unconditional no-ops with no counters.

TEST(DrawHLine, DoesNotCrash) {
    U8G2 display;
    u8g2gl_draw_hline(display, 0, 10, 64);
    SUCCEED();
}

TEST(DrawHLine, ZeroWidthIsNoOp) {
    U8G2 display;
    u8g2gl_draw_hline(display, 0, 10, 0);
    SUCCEED();
}

TEST(DrawHLine, NegativeWidthIsNoOp) {
    U8G2 display;
    u8g2gl_draw_hline(display, 0, 10, -8);
    SUCCEED();
}

TEST(DrawVLine, DoesNotCrash) {
    U8G2 display;
    u8g2gl_draw_vline(display, 10, 0, 32);
    SUCCEED();
}

TEST(DrawVLine, ZeroHeightIsNoOp) {
    U8G2 display;
    u8g2gl_draw_vline(display, 10, 0, 0);
    SUCCEED();
}

TEST(DrawVLine, NegativeHeightIsNoOp) {
    U8G2 display;
    u8g2gl_draw_vline(display, 10, 0, -8);
    SUCCEED();
}

// --- u8g2gl_draw_line ---
// The stub's drawLine is an unconditional no-op with no counters.

TEST(DrawLine, DoesNotCrash) {
    U8G2 display;
    u8g2gl_draw_line(display, 0, 0, 20, 20);
    SUCCEED();
}

TEST(DrawLine, ReversedEndpointsIsNotDegenerate) {
    U8G2 display;
    // drawLine accepts endpoints in either order — start > end is normal
    // input, not a degenerate case to guard against.
    u8g2gl_draw_line(display, 20, 20, 0, 0);
    SUCCEED();
}

// --- u8g2gl_draw_pixel ---
// Fully instrumented by the stub.

TEST(DrawPixel, DrawsAtCoordinate) {
    U8G2 display;
    u8g2gl_draw_pixel(display, 5, 9);

    EXPECT_EQ(display.draw_pixel_count, 1);
    EXPECT_EQ(display.last_draw_pixel_x, 5);
    EXPECT_EQ(display.last_draw_pixel_y, 9);
}

// --- u8g2gl_draw_triangle ---
// The stub's drawTriangle is an unconditional no-op with no counters.

TEST(DrawTriangle, FilledDoesNotCrash) {
    U8G2 display;
    u8g2gl_draw_triangle(display, 0, 0, 10, 0, 5, 10, true);
    SUCCEED();
}

TEST(DrawTriangle, UnfilledStillDoesNotCrash) {
    U8G2 display;
    // U8G2 has no unfilled-triangle primitive; `filled=false` currently has
    // no observable effect (see the @note on the declaration). This only
    // guards against a crash, not against the flag being honoured.
    u8g2gl_draw_triangle(display, 0, 0, 10, 0, 5, 10, false);
    SUCCEED();
}

TEST(DrawTriangle, DegenerateZeroAreaDoesNotCrash) {
    U8G2 display;
    // All three vertices coincide — a zero-area triangle, which U8G2 handles
    // without special-casing, but worth a regression test since it is exactly
    // the "bad value in the render loop" case this module exists to survive.
    u8g2gl_draw_triangle(display, 5, 5, 5, 5, 5, 5, true);
    SUCCEED();
}
