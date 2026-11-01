/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_probe_box/wd_probe_box.cpp
 * Purpose: Implements wd_probe_box rendering and fill_height mutator.
 *          Demonstrates proper dirty tracking and bounded draw behavior.
 *
 * Description: Implementation of set_fill_height, get_fill_height, and render.
 */
#include "wd_probe_box.hpp"

#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

void wd_probe_box::set_fill_height(int16_t h) {
    if (fill_height_ == h) {
        return;
    }
    fill_height_ = h;
    mark_dirty();
}

int16_t wd_probe_box::get_fill_height() const {
    return fill_height_;
}

void wd_probe_box::render(U8G2& display) {
    // Step 1: Query object bounds
    int16_t x = get_x();
    int16_t y = get_y();
    int16_t w = get_w();
    int16_t max_h = get_h();

    // Step 2: Clamp fill height to allocated geometry
    int16_t h = fill_height_;
    if (h > max_h) {
        h = max_h;
    }

    // Step 3: Draw filled box if positive dimensions
    if (w > 0 && h > 0) {
        display.drawBox(
            static_cast<u8g2_uint_t>(x),
            static_cast<u8g2_uint_t>(y),
            static_cast<u8g2_uint_t>(w),
            static_cast<u8g2_uint_t>(h)
        );
    }
}
