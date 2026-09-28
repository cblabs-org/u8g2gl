/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_rbox_bound.cpp
 *
 * Purpose: Keeps the measurement behind the rounded-box radius bound,
 *          2r <= min(w, h), as a test against the pinned U8G2 itself (PR-4R
 *          WO3). u8g2gl_coord_corner_radius() and the validator's
 *          checkCornerRadius() both cite one number; this is where that number
 *          is proved, in both directions:
 *          - every radius the helper can return draws nothing outside the box;
 *          - one more than the largest (min(w, h) / 2 + 1) DOES draw outside it.
 *          The second half is what makes the bound exact rather than merely
 *          safe: a U8G2 bump that moves the boundary either way fails here.
 *
 *          This tests U8G2, not U8G2GL, so unlike the stub-based suites it
 *          passes on the base too. It is the empirical record the PA's
 *          one-off harness (.agents/skills/principal-architect-workspace/
 *          pr-4r-corrections/evidence/rbox-bound/rbox.c) produced, made
 *          permanent.
 *
 * Description: Links U8G2's real C sources (extern/u8g2/csrc, tag 2.36.18) and
 *              never the host stub — the two must not meet in one link, which
 *              is why this is its own executable (test/CMakeLists.txt). Draws
 *              u8g2_DrawRBox and u8g2_DrawRFrame into a 128x64 full buffer and
 *              counts pixels set outside the box.
 */
#include <gtest/gtest.h>

// U8G2's C header first: u8g2gl_coord.h names u8g2_uint_t and would otherwise
// look for U8g2lib.h, which this target deliberately does not put on the path
// (the C++ wrapper needs Arduino headers; the C API does not).
#include "u8g2.h"
#include "u8g2gl/u8g2gl_coord.h"

namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;

// Where each box is drawn: clear of every edge, so a stray band has room to
// appear rather than being clipped away by the display (as in rbox.c).
constexpr int kBoxX = 40;
constexpr int kBoxY = 20;

// A U8G2 full-buffer display with no hardware behind it.
class real_u8g2 {
public:
    real_u8g2() {
        // --- Step 1: The body of u8g2_Setup_ssd1306_128x64_noname_f() ---
        // Copied from u8g2_d_setup.c:294 rather than linked: that file holds
        // the setup function of every display U8G2 supports, and linking it
        // pulls in every display driver. The byte and GPIO callbacks are
        // U8G2's own no-op ones, as in the PA's harness.
        uint8_t tile_buf_height = 0;
        u8g2_SetupDisplay(&u8g2_, u8x8_d_ssd1306_128x64_noname, u8x8_cad_001,
                          u8x8_byte_empty, u8x8_dummy_cb);
        uint8_t* buf = u8g2_m_16_8_f(&tile_buf_height);
        u8g2_SetupBuffer(&u8g2_, buf, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb,
                         U8G2_R0);

        // --- Step 2: Initialise, as a sketch's begin() would ---
        u8g2_InitDisplay(&u8g2_);
    }

    // Draws one rounded box into a cleared buffer and returns how many pixels
    // are set outside [x, x + w) x [y, y + h); `inside` receives the rest.
    int draw_and_count_outside(bool filled, int w, int h, u8g2_uint_t r, int& inside) {
        u8g2_ClearBuffer(&u8g2_);
        const auto uw = static_cast<u8g2_uint_t>(w);
        const auto uh = static_cast<u8g2_uint_t>(h);
        if (filled) {
            u8g2_DrawRBox(&u8g2_, kBoxX, kBoxY, uw, uh, r);
        } else {
            u8g2_DrawRFrame(&u8g2_, kBoxX, kBoxY, uw, uh, r);
        }

        int outside = 0;
        inside = 0;
        for (int y = 0; y < kDisplayHeight; ++y) {
            for (int x = 0; x < kDisplayWidth; ++x) {
                if (!pixel(x, y)) {
                    continue;
                }
                const bool in_box = x >= kBoxX && x < kBoxX + w && y >= kBoxY && y < kBoxY + h;
                (in_box ? inside : outside) += 1;
            }
        }
        return outside;
    }

private:
    // The SSD1306 full buffer is vertical_top_lsb: a byte per column per
    // 8-row page, bit 0 the top row of the page.
    bool pixel(int x, int y) {
        const uint8_t* buf = u8g2_GetBufferPtr(&u8g2_);
        return ((buf[(y / 8) * kDisplayWidth + x] >> (y % 8)) & 1) != 0;
    }

    u8g2_t u8g2_{};
};

// Odd, even, square and non-square — including the PA's five (10x10, 11x11,
// 20x8, 8x20, 2x2) — and each orientation of a long thin box.
const int kSizes[][2] = {
    {10, 10}, {11, 11}, {20, 8}, {8, 20}, {2, 2},  {3, 3},  {7, 12},
    {12, 7},  {16, 16}, {31, 9}, {9, 31}, {5, 40}, {40, 5}, {1, 6},
};

}  // namespace

TEST(RealU8g2RoundedBoxBound, EveryRadiusTheHelperReturnsStaysInsideTheBox) {
    real_u8g2 display;
    for (const auto& size : kSizes) {
        const int w = size[0];
        const int h = size[1];
        const int smaller = (w < h) ? w : h;
        // Requests well past both sides, so every value the helper can return
        // for this size — 0 up to min / 2 — is drawn.
        for (int requested = -1; requested <= 2 * smaller + 2; ++requested) {
            const u8g2_uint_t r = u8g2gl_coord_corner_radius(requested, w, h);
            for (bool filled : {true, false}) {
                SCOPED_TRACE(testing::Message()
                             << (filled ? "u8g2_DrawRBox " : "u8g2_DrawRFrame ") << w << "x"
                             << h << " requested r=" << requested << " -> r=" << r);
                int inside = 0;
                EXPECT_EQ(display.draw_and_count_outside(filled, w, h, r, inside), 0);
                EXPECT_GT(inside, 0) << "nothing drawn: the check would be vacuous";
            }
        }
    }
}

TEST(RealU8g2RoundedBoxBound, OneMoreThanTheBoundDrawsOutsideTheBox) {
    // The other direction. If this starts passing radii U8G2 draws cleanly,
    // the bound has become stricter than U8G2 needs; if the first test starts
    // failing, U8G2 has become stricter than the bound. Either way the number
    // in u8g2gl_coord.h and validate-geometry.ts must be re-measured.
    real_u8g2 display;
    for (const auto& size : kSizes) {
        const int w = size[0];
        const int h = size[1];
        const int smaller = (w < h) ? w : h;
        // One more than the largest radius the helper will ever return — which
        // must be min / 2 exactly, or the helper is stricter than U8G2 needs.
        const u8g2_uint_t largest = u8g2gl_coord_corner_radius(32767, w, h);
        ASSERT_EQ(largest, smaller / 2) << w << "x" << h;
        const auto r = static_cast<u8g2_uint_t>(largest + 1);
        for (bool filled : {true, false}) {
            SCOPED_TRACE(testing::Message()
                         << (filled ? "u8g2_DrawRBox " : "u8g2_DrawRFrame ") << w << "x" << h
                         << " r=" << r);
            int inside = 0;
            EXPECT_GT(display.draw_and_count_outside(filled, w, h, r, inside), 0);
        }
    }
}
