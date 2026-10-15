/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_container_edge_pixels.cpp
 *
 * Purpose: Proves container-edge clipping and coordinate handling in real U8G2
 *          pixels against the pinned hardware library (extern/u8g2, tag 2.36.18).
 *          Guards the exclusive far-corner convention of u8g2gl_apply_clip()
 *          (§11.3, [D-18]), wrapped negative origins for partially off-screen
 *          containers (u8g2gl_coord_pos()), and line clipping inside a container
 *          clip scope.
 *
 * Description: Renders test elements into a 128x64 SSD1306 full buffer through
 *              real U8G2 drivers and verifies pixel-level containment:
 *              (a) An element whose clip is exactly its bounds draws right up to
 *                  its last column and last row with zero pixels outside;
 *              (b) An outline box at a negative container origin correctly draws
 *                  its on-screen visible portion with zero pixels off-screen;
 *              (c) A diagonal line extending past container boundaries is clipped
 *                  strictly at the container edges with zero pixels outside.
 */
#include <gtest/gtest.h>

#include <U8g2lib.h>

#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_progress_bar.h"

namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;

// real_display
// Manages a real U8G2 full-buffer display instance over an SSD1306 128x64 memory
// layout with a dummy callback, providing buffer inspection utilities.
class real_display {
public:
    real_display() {
        // --- Step 1: Initialize SSD1306 display structure ---
        // Setup display callbacks and full frame buffer allocation without hardware HAL.
        u8g2_t* u8g2 = display_.getU8g2();
        uint8_t tile_buf_height = 0;
        u8g2_SetupDisplay(u8g2, u8x8_d_ssd1306_128x64_noname, u8x8_cad_001,
                          u8x8_byte_empty, u8x8_dummy_cb);
        uint8_t* buf = u8g2_m_16_8_f(&tile_buf_height);
        u8g2_SetupBuffer(u8g2, buf, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);

        // --- Step 2: Initialize display state and clear buffer ---
        u8g2_InitDisplay(u8g2);
        display_.clearBuffer();
    }

    U8G2& display() { return display_; }

    // pixel
    // Reads a single pixel state from the SSD1306 vertical-top-LSB buffer.
    // Returns false if coordinates fall outside the display bounds.
    bool pixel(int x, int y) {
        if (x < 0 || x >= kDisplayWidth || y < 0 || y >= kDisplayHeight) {
            return false;
        }
        const uint8_t* buf = display_.getBufferPtr();
        return ((buf[(y / 8) * kDisplayWidth + x] >> (y % 8)) & 1) != 0;
    }

    // count_outside_rect
    // Counts pixels set outside the specified rectangle [rx, rx+rw) x [ry, ry+rh);
    // populates `inside` with the count of pixels set within the rectangle.
    int count_outside_rect(int16_t rx, int16_t ry, int16_t rw, int16_t rh, int& inside) {
        int outside = 0;
        inside = 0;
        for (int y = 0; y < kDisplayHeight; ++y) {
            for (int x = 0; x < kDisplayWidth; ++x) {
                if (!pixel(x, y)) {
                    continue;
                }
                const bool in_rect = (x >= rx && x < rx + rw && y >= ry && y < ry + rh);
                if (in_rect) {
                    ++inside;
                } else {
                    ++outside;
                }
            }
        }
        return outside;
    }

private:
    U8G2 display_;
};

}  // namespace

// --- Test (a): Element whose clip is exactly its bounds ---
// An element occupying the full width and height of its container (20, 10, 40, 20),
// drawing to its last column (59) and last row (29).
// Verifies that:
// 1. Zero pixels land outside the container rectangle.
// 2. Boundary pixels at (59, 29) are set (no off-by-one under-drawing).
// Tested both for a direct solid box draw call within a clip scope and for an
// object child (progress bar with 100% solid fill) rendered via u8g2gl_render_object().
TEST(ContainerEdgePixels, ElementWhoseClipIsExactlyItsBoundsBox) {
    real_display real;
    U8G2& display = real.display();

    // --- Step 1: Establish container geometry at (20, 10, 40, 20) ---
    u8g2gl_obj container;
    container.set_coords(20, 10, 40, 20);
    u8g2gl_obj* const objs[] = {&container};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};

    // --- Step 2: Draw solid box filling the entire container inside clip scope ---
    {
        u8g2gl_clip_scope clip(display, objs, parents, 0);
        ASSERT_TRUE(clip.drawable());
        u8g2gl_draw_box(display, 20, 10, 40, 20, true, 0);
    }

    // --- Step 3: Verify zero pixels outside and exact edge pixels set ---
    int inside = 0;
    EXPECT_EQ(real.count_outside_rect(20, 10, 40, 20, inside), 0);
    EXPECT_EQ(inside, 40 * 20) << "All 800 pixels inside the box must be set";

    // Near corner (20, 10) and far corner (59, 29)
    EXPECT_TRUE(real.pixel(20, 10)) << "First column and row must be set";
    EXPECT_TRUE(real.pixel(59, 10)) << "Last column, first row must be set";
    EXPECT_TRUE(real.pixel(20, 29)) << "First column, last row must be set";
    EXPECT_TRUE(real.pixel(59, 29)) << "Last column and row must be set (boundary check)";

    // Adjacent pixels outside container must not be set
    EXPECT_FALSE(real.pixel(19, 10));
    EXPECT_FALSE(real.pixel(60, 29));
    EXPECT_FALSE(real.pixel(59, 30));
}

TEST(ContainerEdgePixels, ElementWhoseClipIsExactlyItsBoundsObject) {
    real_display real;
    U8G2& display = real.display();

    // --- Step 1: Establish container and 100% solid progress bar at identical coordinates ---
    u8g2gl_obj container;
    container.set_coords(20, 10, 40, 20);

    u8g2gl_progress_bar bar;
    bar.set_coords(20, 10, 40, 20);
    bar.set_fill_style(U8G2GL_FILL_SOLID);
    bar.set_value(100);

    u8g2gl_obj* const objs[] = {&container, &bar};
    const uint8_t parents[] = {U8G2GL_NO_PARENT, 0};

    // --- Step 2: Render container and child through the framework render pipeline ---
    u8g2gl_render_object(display, objs, parents, 0);
    u8g2gl_render_object(display, objs, parents, 1);

    // --- Step 3: Verify containment and boundary pixels ---
    int inside = 0;
    EXPECT_EQ(real.count_outside_rect(20, 10, 40, 20, inside), 0);
    EXPECT_GT(inside, 0) << "Progress bar must draw non-empty content";

    // Progress bar outer frame reaches the outermost boundary pixels
    EXPECT_TRUE(real.pixel(20, 10)) << "Top-left boundary pixel (20, 10) must be set";
    EXPECT_TRUE(real.pixel(59, 29)) << "Bottom-right boundary pixel (59, 29) must be set";
    EXPECT_FALSE(real.pixel(60, 29)) << "Pixel (60, 29) outside container must NOT be set";
    EXPECT_FALSE(real.pixel(59, 30)) << "Pixel (59, 30) outside container must NOT be set";
}

// --- Test (b): Frame at negative origin (wrapped origins) ---
// Container at (-10, 5, 30, 15) with its left edge off-screen by 10 pixels.
// An outlined box occupies the full container.
// Verifies that:
// 1. Visible columns [0..19] and rows [5..19] contain the expected frame pixels:
//    - Top edge at row 5 across columns 0..19
//    - Bottom edge at row 19 across columns 0..19
//    - Right vertical edge at column 19 across rows 5..19
// 2. Zero pixels land outside the visible container rectangle.
// 3. Interior of the frame has no pixels set.
TEST(ContainerEdgePixels, FrameAtNegativeOrigin) {
    real_display real;
    U8G2& display = real.display();

    // --- Step 1: Establish container at negative origin (-10, 5, 30, 15) ---
    u8g2gl_obj container;
    container.set_coords(-10, 5, 30, 15);
    u8g2gl_obj* const objs[] = {&container};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};

    // --- Step 2: Draw outline box filling the full container under clip scope ---
    {
        u8g2gl_clip_scope clip(display, objs, parents, 0);
        ASSERT_TRUE(clip.drawable());
        u8g2gl_draw_box(display, -10, 5, 30, 15, false, 0);
    }

    // --- Step 3: Verify pixels outside visible container bounds are zero ---
    // Visible container region on screen is columns 0..19, rows 5..19
    int inside = 0;
    EXPECT_EQ(real.count_outside_rect(0, 5, 20, 15, inside), 0)
        << "Zero pixels may land outside the visible container region [0,19]x[5,19]";

    // --- Step 4: Verify visible edges ---
    // Top edge: row 5, columns 0..19
    for (int x = 0; x <= 19; ++x) {
        EXPECT_TRUE(real.pixel(x, 5)) << "Top edge pixel at (" << x << ", 5) must be set";
    }

    // Bottom edge: row 19, columns 0..19
    for (int x = 0; x <= 19; ++x) {
        EXPECT_TRUE(real.pixel(x, 19)) << "Bottom edge pixel at (" << x << ", 19) must be set";
    }

    // Right vertical edge: column 19, rows 5..19
    for (int y = 5; y <= 19; ++y) {
        EXPECT_TRUE(real.pixel(19, y)) << "Right edge pixel at (19, " << y << ") must be set";
    }

    // Hollow interior of the frame should be unpainted
    for (int y = 6; y <= 18; ++y) {
        for (int x = 0; x <= 18; ++x) {
            EXPECT_FALSE(real.pixel(x, y))
                << "Interior pixel at (" << x << ", " << y << ") must NOT be set";
        }
    }
}

// --- Test (c): Clipped line ---
// Container at (30, 20, 30, 20), covering columns 30..59 and rows 20..39.
// A diagonal line from (30, 20) to (70, 50) extends beyond right and bottom edges.
// Verifies that:
// 1. Zero pixels land outside the container boundary.
// 2. The line draws from origin (30, 20) to the clipping boundary.
// 3. Allows ~1 px endpoint rounding at the clipping boundary where line exits.
TEST(ContainerEdgePixels, ClippedLineStaysInsideContainer) {
    real_display real;
    U8G2& display = real.display();

    // --- Step 1: Establish container at (30, 20, 30, 20) ---
    u8g2gl_obj container;
    container.set_coords(30, 20, 30, 20);
    u8g2gl_obj* const objs[] = {&container};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};

    // --- Step 2: Draw overhanging diagonal line inside clip scope ---
    {
        u8g2gl_clip_scope clip(display, objs, parents, 0);
        ASSERT_TRUE(clip.drawable());
        u8g2gl_draw_line(display, 30, 20, 70, 50);
    }

    // --- Step 3: Verify containment and termination at boundary ---
    int inside = 0;
    EXPECT_EQ(real.count_outside_rect(30, 20, 30, 20, inside), 0)
        << "Zero pixels may land outside the container rectangle";
    EXPECT_GT(inside, 0) << "Line must draw pixels within the container";

    // Origin pixel must be set
    EXPECT_TRUE(real.pixel(30, 20)) << "Start of line at (30, 20) must be set";

    // The line has slope 30/40 = 0.75, so y = 20 + 0.75 * (x - 30).
    // It crosses bottom edge y = 39 at x = 30 + 19/0.75 = 55.33.
    // Near the clipping boundary (y = 39), allowing ~1 px rounding:
    const bool edge_pixel_set = real.pixel(55, 39) || real.pixel(56, 39);
    EXPECT_TRUE(edge_pixel_set)
        << "Line must reach bottom boundary row 39 at approximately column 55 or 56";

    // Immediate outside pixels must not be set
    EXPECT_FALSE(real.pixel(55, 40));
    EXPECT_FALSE(real.pixel(56, 40));
    EXPECT_FALSE(real.pixel(57, 40));
    EXPECT_FALSE(real.pixel(60, 39));
}
