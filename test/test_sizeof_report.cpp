/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_sizeof_report.cpp
 *
 * Purpose: Memory footprint report and regression assertions for the base visual
 *          object and every PR-03 widget. The §18 budget is a claim about RAM on
 *          a 32-bit target, but this suite is normally run on a 64-bit host, so
 *          the report states the width it actually measured rather than letting a
 *          reader assume the two are the same. §1.3 forbids a figure the
 *          measurement cannot substantiate.
 *
 * Description: Prints sizeof for u8g2gl_obj and the 8 concrete widgets (label,
 *              scrolling_label, xbm, glyph, progress_bar, clock, switch, button)
 *              and asserts upper bounds that hold on any supported pointer width.
 *              A second test measures the 32-bit target width; it runs only in a
 *              build whose pointers are 4 bytes, and skips with an explanation
 *              otherwise, so an unmeasured width is visible as a skip rather than
 *              being quietly reported as a pass.
 */
#include <gtest/gtest.h>
#include <cstddef>
#include <iostream>
#include <string>

#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_scrolling_label.h"
#include "u8g2gl/u8g2gl_xbm.h"
#include "u8g2gl/u8g2gl_glyph.h"
#include "u8g2gl/u8g2gl_progress_bar.h"
#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_switch.h"
#include "u8g2gl/u8g2gl_button.h"

namespace {

/// Pointer width of the build under test, in bits. Both the vptr and every
/// member pointer scale with this, and they dominate widget size — which is why
/// a 64-bit figure cannot stand in for the 32-bit target the §18 budget is about.
constexpr std::size_t kPointerBits = sizeof(void*) * 8u;

/// True when this build actually targets the 32-bit width §18's budget describes.
constexpr bool kIsThirtyTwoBit = (sizeof(void*) == 4u);

#define U8G2GL_REPORT_SIZE(type)                                                 \
    do {                                                                         \
        std::cout << "[          ] sizeof(" #type ") = " << sizeof(type)         \
                  << " bytes" << std::endl;                                      \
        ::testing::Test::RecordProperty("sizeof_" #type,                         \
                                        std::to_string(sizeof(type)));           \
    } while (0)

/// Emits the full size table and tags it with the width it was measured at.
void report_all_sizes() {
    std::cout << "[          ] === Widget Size Report (" << kPointerBits
              << "-bit pointers) ===" << std::endl;
    ::testing::Test::RecordProperty("pointer_bits", std::to_string(kPointerBits));

    U8G2GL_REPORT_SIZE(u8g2gl_obj);
    U8G2GL_REPORT_SIZE(u8g2gl_label);
    U8G2GL_REPORT_SIZE(u8g2gl_scrolling_label);
    U8G2GL_REPORT_SIZE(u8g2gl_xbm);
    U8G2GL_REPORT_SIZE(u8g2gl_glyph);
    U8G2GL_REPORT_SIZE(u8g2gl_progress_bar);
    U8G2GL_REPORT_SIZE(u8g2gl_clock);
    U8G2GL_REPORT_SIZE(u8g2gl_switch);
    U8G2GL_REPORT_SIZE(u8g2gl_button);
}

}  // namespace

// Reports every widget's footprint at the build's own pointer width and holds it
// against ceilings sized for the widest supported width. A narrower build is
// strictly smaller, so these bounds are valid on 32-bit too — they are a
// regression guard, not the §18 target budget, which ThirtyTwoBitTarget covers.
TEST(SizeOfReport, AllWidgets) {
    report_all_sizes();

    // --- Ceilings for the widest supported pointer width (64-bit) ---
    EXPECT_LE(sizeof(u8g2gl_obj), 64u);
    EXPECT_LE(sizeof(u8g2gl_label), 72u);
    EXPECT_LE(sizeof(u8g2gl_scrolling_label), 96u);
    EXPECT_LE(sizeof(u8g2gl_xbm), 80u);
    EXPECT_LE(sizeof(u8g2gl_glyph), 72u);
    EXPECT_LE(sizeof(u8g2gl_progress_bar), 88u);
    EXPECT_LE(sizeof(u8g2gl_clock), 96u);
    EXPECT_LE(sizeof(u8g2gl_switch), 72u);
    EXPECT_LE(sizeof(u8g2gl_button), 80u);
}

// Measures the width the §18 RAM budget is actually a claim about. ESP32,
// RP2040 and STM32 are all ILP32, as is the Wasm build, so the target figure is
// the 32-bit one; a 64-bit host measurement over-states it and cannot be
// substituted. Run this suite from a 32-bit or cross build to populate it —
// on a 64-bit build it skips loudly rather than passing silently.
TEST(SizeOfReport, ThirtyTwoBitTarget) {
    if (!kIsThirtyTwoBit) {
        report_all_sizes();
        GTEST_SKIP() << "Build has " << kPointerBits
                     << "-bit pointers; the 32-bit target figures in the §18 "
                        "budget were NOT measured by this run. Re-run this suite "
                        "from a 32-bit or cross-compiled build to populate them.";
    }

    report_all_sizes();

    // The ceilings asserted here are deliberately the 64-bit ones. A narrower
    // pointer can only shrink these objects, so they are guaranteed to hold —
    // and a tighter 32-bit budget has not been written because no 32-bit
    // measurement exists yet to derive one from. Inventing one would put an
    // unsubstantiated figure in the suite, which §1.3 forbids. Tighten these
    // from the first real 32-bit run; the printed table above is that run's
    // evidence.
    EXPECT_LE(sizeof(u8g2gl_obj), 64u);
    EXPECT_LE(sizeof(u8g2gl_label), 72u);
    EXPECT_LE(sizeof(u8g2gl_scrolling_label), 96u);
    EXPECT_LE(sizeof(u8g2gl_xbm), 80u);
    EXPECT_LE(sizeof(u8g2gl_glyph), 72u);
    EXPECT_LE(sizeof(u8g2gl_progress_bar), 88u);
    EXPECT_LE(sizeof(u8g2gl_clock), 96u);
    EXPECT_LE(sizeof(u8g2gl_switch), 72u);
    EXPECT_LE(sizeof(u8g2gl_button), 80u);
}
