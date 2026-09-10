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
 * Purpose: Memory footprint report and regression assertions for all PR-03
 *          widgets and base visual objects on 64-bit host architecture.
 *
 * Description: Instantiates sizeof checks for u8g2gl_obj and all 8 concrete
 *              widgets (label, scrolling_label, xbm, glyph, progress_bar,
 *              clock, switch, button), printing their exact footprint and
 *              asserting strict upper bounds to prevent memory budget bloat.
 */
#include <gtest/gtest.h>
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

TEST(SizeOfReport, AllWidgets) {
    // Host is 64-bit; 32-bit target estimates noted in comments.
    // Pointers: 8 bytes on 64-bit, 4 bytes on 32-bit.
    // vptr: 8 bytes on 64-bit, 4 bytes on 32-bit.
    std::cout << "[          ] === Widget Size Report (64-bit host) ===" << std::endl;

#define REPORT(type) do { \
        std::cout << "[          ] sizeof(" #type ") = " << sizeof(type) << " bytes" << std::endl; \
        RecordProperty("sizeof_" #type, std::to_string(sizeof(type))); \
    } while (0)

    REPORT(u8g2gl_obj);
    REPORT(u8g2gl_label);
    REPORT(u8g2gl_scrolling_label);
    REPORT(u8g2gl_xbm);
    REPORT(u8g2gl_glyph);
    REPORT(u8g2gl_progress_bar);
    REPORT(u8g2gl_clock);
    REPORT(u8g2gl_switch);
    REPORT(u8g2gl_button);

#undef REPORT

    // Budget assertions — no widget should exceed 96 bytes on 64-bit host
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
