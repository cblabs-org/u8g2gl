/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_clock_baseline.cpp
 *
 * Purpose: Proves, against real U8G2, that an HH:MM:SS clock with a secondary
 *          font draws its seconds digits on the same baseline as its HH:MM
 *          digits. The stub display cannot show this: the baseline depends on
 *          each font's real ascent and descent. The defect it guards was
 *          measured on the panel: with helvB12 and helvR08 the seconds sat 2 px
 *          low, because the placement lined up the bottoms of the two fonts'
 *          descender boxes (4 px and 2 px deep) instead of their baselines.
 *
 * Description: Renders a real u8g2gl_clock through u8g2gl_render_object() (so the
 *              state saver's top font position and "all" reference height are in
 *              force, as on a device) into a 256x64 full buffer, the SSD1322
 *              setup the device uses. The lowest lit row is read separately for
 *              the HH:MM columns and the seconds columns, and must be equal.
 *              The time shows no descenders, so the lowest lit row is the
 *              baseline row.
 */
#include <gtest/gtest.h>

#include <U8g2lib.h>

#include <cstdint>
#include <cstring>

#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_core.h"

namespace {

constexpr int kDisplayWidth = 256;
constexpr int kDisplayHeight = 64;

// 12:34:56 — no digit has a descender, so the lowest lit row is the baseline.
constexpr uint32_t kTime = 12 * 3600 + 34 * 60 + 56;

// A real U8G2 C++ object over a 256x64 full buffer, with no hardware behind it.
class real_display {
public:
    real_display() {
        // Mirrors u8g2_Setup_ssd1322_nhd_256x64_f() (u8g2_d_setup.c), which is
        // not linked: that file pulls in every display driver.
        u8g2_t* u8g2 = display_.getU8g2();
        uint8_t tile_buf_height = 0;
        u8g2_SetupDisplay(u8g2, u8x8_d_ssd1322_nhd_256x64, u8x8_cad_011,
                          u8x8_byte_empty, u8x8_dummy_cb);
        uint8_t* buf = u8g2_m_32_8_f(&tile_buf_height);
        u8g2_SetupBuffer(u8g2, buf, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);
        u8g2_InitDisplay(u8g2);
        display_.clearBuffer();
    }

    U8G2& display() { return display_; }

    bool lit(int x, int y) {
        const uint8_t* buf = display_.getBufferPtr();
        return (buf[(y / 8) * kDisplayWidth + x] >> (y & 7)) & 1;
    }

    // Lowest lit row within columns [x0, x1), or -1 when none is lit.
    int lowest_row(int x0, int x1) {
        for (int y = kDisplayHeight - 1; y >= 0; --y) {
            for (int x = x0; x < x1; ++x) {
                if (lit(x, y)) return y;
            }
        }
        return -1;
    }

    // Rightmost lit column, or -1 when none is lit.
    int rightmost_column() {
        for (int x = kDisplayWidth - 1; x >= 0; --x) {
            if (lowest_row(x, x + 1) >= 0) return x;
        }
        return -1;
    }

private:
    U8G2 display_;
};

void render_alone(U8G2& display, u8g2gl_obj& obj) {
    u8g2gl_obj* const objs[] = {&obj};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};
    u8g2gl_render_object(display, objs, parents, 0);
}

struct font_pair {
    const char* name;
    const uint8_t* main_font;
    const uint8_t* secondary_font;
    int16_t y;  ///< Clock bounds
    int16_t h;
};

// The clock's bounds are the panel's (y=18, h=20, the owner's measured case)
// unless a pair's glyphs would be clipped by them: the clock draws inside its
// bounds, and a clipped bottom row would read as a baseline that is not one.
void configure(u8g2gl_clock& clock, const font_pair& pair,
               u8g2gl_clock_format_t format) {
    clock.set_coords(4, pair.y, 248, pair.h);
    const uint8_t* main_font = pair.main_font;
    clock.set_font(main_font);
    clock.set_format(format);
    clock.set_time(kTime);
}


// Descender differences: helvB12/helvR08 differ by 2 (the device pair), the others by other amounts.
const font_pair kPairs[] = {
    {"helvB12/helvR08", u8g2_font_helvB12_tr, u8g2_font_helvR08_tr, 18, 20},
    {"profont22/6x10", u8g2_font_profont22_tr, u8g2_font_6x10_tr, 10, 44},
    {"helvB18/helvR10", u8g2_font_helvB18_tr, u8g2_font_helvR10_tr, 10, 44},
};

// Width in columns of the ink of "56" in the secondary font. The seconds digits
// are right-aligned, so their ink is the last this-many columns of the clock; the
// seconds colon sits to their left and some fonts (6x10) hang its dot below the
// digits' baseline, so it must not be counted.
int seconds_ink_width(const uint8_t* secondary_font) {
    real_display real;
    real.display().setFont(secondary_font);
    real.display().setFontPosTop();
    real.display().setFontRefHeightAll();
    real.display().drawUTF8(0, 0, "56");
    return real.rightmost_column() + 1;
}

// Lowest lit rows of the HH:MM columns (everything left of the seconds colon,
// found from an HH:MM-only clock, which draws the same at the same x) and of the
// seconds digits.
struct rows {
    int hh_mm;
    int seconds;
};

rows measure(const font_pair& pair) {
    int hh_mm_right = 0;
    {
        real_display real;
        u8g2gl_clock hh_mm;
        configure(hh_mm, pair, U8G2GL_CLOCK_HH_MM);
        render_alone(real.display(), hh_mm);
        hh_mm_right = real.rightmost_column();
    }
    // The frame buffer is one static shared by every real_display, so the probe
    // render must finish before the clock's own begins.
    const int ink_width = seconds_ink_width(pair.secondary_font);
    real_display real;
    u8g2gl_clock clock;
    configure(clock, pair, U8G2GL_CLOCK_HH_MM_SS);
    clock.set_secondary_font(pair.secondary_font);
    render_alone(real.display(), clock);
    const int digits_right = real.rightmost_column();
    const int digits_left = digits_right + 1 - ink_width;
    return {real.lowest_row(0, hh_mm_right + 1),
            real.lowest_row(digits_left, digits_right + 1)};
}

}  // namespace

TEST(ClockBaseline, SecondsShareTheMainBaseline) {
    for (const font_pair& pair : kPairs) {
        SCOPED_TRACE(pair.name);
        rows r = measure(pair);
        EXPECT_GE(r.hh_mm, 0);
        EXPECT_GE(r.seconds, 0);
        EXPECT_EQ(r.seconds, r.hh_mm);
    }
}

TEST(ClockBaseline, WithoutSecondaryFontTheSecondsStillShareTheBaseline) {
    // One font for all three groups: the same rows by construction, before and
    // after the fix. This pins that the no-secondary-font path did not move.
    int hh_mm_right = 0;
    {
        real_display real;
        u8g2gl_clock hh_mm;
        configure(hh_mm, kPairs[0], U8G2GL_CLOCK_HH_MM);
        render_alone(real.display(), hh_mm);
        hh_mm_right = real.rightmost_column();
    }
    real_display real;
    u8g2gl_clock clock;
    configure(clock, kPairs[0], U8G2GL_CLOCK_HH_MM_SS);
    render_alone(real.display(), clock);
    // Same font throughout, so the seconds colon shares the digits' baseline too.
    EXPECT_EQ(real.lowest_row(hh_mm_right + 1, kDisplayWidth),
              real.lowest_row(0, hh_mm_right + 1));
}

TEST(ClockBaseline, HhMmPixelsAreUnchangedByTheSecondsGroup) {
    // The HH:MM columns of an HH:MM:SS clock match an HH:MM-only clock's pixels:
    // the main digits' placement does not depend on the format.
    const font_pair& pair = kPairs[0];
    uint8_t hh_mm_only[kDisplayWidth * kDisplayHeight / 8];
    int hh_mm_right = 0;
    {
        real_display real;
        u8g2gl_clock clock;
        configure(clock, pair, U8G2GL_CLOCK_HH_MM);
        clock.set_secondary_font(pair.secondary_font);
        render_alone(real.display(), clock);
        hh_mm_right = real.rightmost_column();
        std::memcpy(hh_mm_only, real.display().getBufferPtr(), sizeof(hh_mm_only));
    }
    real_display real;
    u8g2gl_clock clock;
    configure(clock, pair, U8G2GL_CLOCK_HH_MM_SS);
    clock.set_secondary_font(pair.secondary_font);
    render_alone(real.display(), clock);
    for (int y = 0; y < kDisplayHeight; ++y) {
        for (int x = 0; x <= hh_mm_right; ++x) {
            const bool a = (hh_mm_only[(y / 8) * kDisplayWidth + x] >> (y & 7)) & 1;
            ASSERT_EQ(a, real.lit(x, y)) << "x=" << x << " y=" << y;
        }
    }
}
