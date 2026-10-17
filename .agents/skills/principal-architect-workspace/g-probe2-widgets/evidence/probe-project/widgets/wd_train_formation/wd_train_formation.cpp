/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_train_formation/wd_train_formation.cpp
 * Purpose: Implements wd_train_formation horizontal carriage strip rendering
 *          and collection ingestion API. Provides bounded static memory storage
 *          with atomic commit bracketing (§9.2).
 *
 * Description: Implementation of set_font, set_max_carriages, begin, add_carriage,
 *              commit, capacity, carriage_count, get_carriage, and pixel-arithmetic
 *              U8G2 draw dispatch.
 */
#include "wd_train_formation.hpp"

#include <cstdio>
#include <cstring>

#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// --- Configuration Setters ---

// wd_train_formation::set_font
// Stores font pointer and forwards to base object; marks dirty if changed.
//   font — pointer to U8G2 font data array
void wd_train_formation::set_font(const uint8_t* font) {
    if (font_ == font) {
        return;
    }
    font_ = font;
    u8g2gl_obj::set_font(font);
    mark_dirty();
}

// wd_train_formation::set_max_carriages
// Clamps requested carriage capacity to static bounds [1, DEFAULT_MAX_CARRIAGES].
//   max_carriages — requested capacity from manifest or host
void wd_train_formation::set_max_carriages(int16_t max_carriages) {
    if (max_carriages <= 0) {
        return;
    }
    size_t clamped = static_cast<size_t>(max_carriages);
    if (clamped > DEFAULT_MAX_CARRIAGES) {
        clamped = DEFAULT_MAX_CARRIAGES;
    }
    if (max_carriages_ != clamped) {
        max_carriages_ = clamped;
        mark_dirty();
    }
}

// --- Data Ingestion API (§9.2) ---

// wd_train_formation::begin
// Resets write index for incoming carriage batch.
void wd_train_formation::begin() {
    current_carriage_index_ = 0;
}

// wd_train_formation::add_carriage
// Parses class_type string and stages one carriage record into bounded storage.
//   number       — carriage coach number (1..99)
//   class_type   — class string ("first", "standard", "1st")
//   wheelchair   — whether carriage has wheelchair space
//   bike         — whether carriage has bicycle storage space
//   loading_pct  — passenger load percentage (0..100)
bool wd_train_formation::add_carriage(uint8_t number, const char* class_type, bool wheelchair, bool bike,
                                      uint8_t loading_pct) {
    const bool is_first = (class_type != nullptr) &&
                          (std::strcmp(class_type, "first") == 0 ||
                           std::strcmp(class_type, "1st") == 0 ||
                           std::strcmp(class_type, "1") == 0);
    return add_carriage(number, is_first, wheelchair, bike, loading_pct);
}

// wd_train_formation::add_carriage (overload)
// Stages one carriage record into bounded static storage.
//   number         — carriage coach number (1..99)
//   is_first_class — true for first class, false for standard
//   wheelchair     — whether carriage has wheelchair space
//   bike           — whether carriage has bicycle storage space
//   loading_pct    — passenger load percentage (0..100)
bool wd_train_formation::add_carriage(uint8_t number, bool is_first_class, bool wheelchair, bool bike,
                                      uint8_t loading_pct) {
    if (current_carriage_index_ >= max_carriages_) {
        return false;
    }

    u8g2gl_carriage_t& c = carriages_[current_carriage_index_];
    c.number = number;
    c.is_first_class = is_first_class;
    c.has_wheelchair = wheelchair;
    c.has_bike = bike;
    c.loading_pct = (loading_pct > 100) ? 100 : loading_pct;

    current_carriage_index_++;
    return true;
}

// wd_train_formation::commit
// Atomic publish: activates staged carriages and marks frame dirty.
void wd_train_formation::commit() {
    carriage_count_ = current_carriage_index_;
    mark_dirty();
}

size_t wd_train_formation::capacity() const {
    return max_carriages_;
}

size_t wd_train_formation::carriage_count() const {
    return carriage_count_;
}

const u8g2gl_carriage_t* wd_train_formation::get_carriage(size_t index) const {
    if (index >= carriage_count_) {
        return nullptr;
    }
    return &carriages_[index];
}

// --- Rendering Lifecycle ---

// wd_train_formation::render
// Draws horizontal carriage outline strip, loading gauge, and indicators.
//   display — U8G2 display driver instance
void wd_train_formation::render(U8G2& display) {
    // --- Step 1: Early exit guards ---
    if (carriage_count_ == 0) {
        return;
    }

    const int16_t w = get_w();
    const int16_t h = get_h();
    if (w <= 0 || h <= 0) {
        return;
    }

    const int16_t x = get_x();
    const int16_t y = get_y();

    // --- Step 2: Establish active font and metrics ---
    const uint8_t* active_font = font_;
    if (active_font == nullptr) {
        active_font = get_resolved_style().font;
    }
    if (active_font != nullptr) {
        display.setFont(active_font);
    }

    // --- Step 3: Compute carriage layout and horizontal distribution ---
    const size_t n = carriage_count_;
    constexpr int16_t gap = 1;
    const int16_t total_gaps = static_cast<int16_t>((n > 1) ? (n - 1) * gap : 0);
    const int16_t avail_w = static_cast<int16_t>(w - total_gaps);
    int16_t cell_w = static_cast<int16_t>(avail_w / static_cast<int16_t>(n));
    if (cell_w > 20) {
        cell_w = 20;
    }
    if (cell_w < 8) {
        cell_w = 8;
    }

    const int16_t total_span = static_cast<int16_t>(static_cast<int16_t>(n) * cell_w + total_gaps);
    const int16_t left_margin = (w > total_span) ? static_cast<int16_t>((w - total_span) / 2) : 0;

    // --- Step 4: Vertical partitioning between label area and carriage box ---
    const int16_t font_ascent = static_cast<int16_t>(display.getAscent());
    int16_t label_h = (font_ascent > 0) ? static_cast<int16_t>(font_ascent + 2) : 10;
    if (label_h > h / 2) {
        label_h = static_cast<int16_t>(h / 2);
    }

    const int16_t box_y = static_cast<int16_t>(y + label_h);
    const int16_t box_h = static_cast<int16_t>(h - label_h);
    if (box_h < 4) {
        return;
    }

    const int16_t inner_h = static_cast<int16_t>(box_h - 2);
    const int16_t inner_w = static_cast<int16_t>(cell_w - 2);

    // --- Step 5: Render each carriage ---
    for (size_t i = 0; i < n; ++i) {
        const int16_t box_x = static_cast<int16_t>(x + left_margin + static_cast<int16_t>(i) * (cell_w + gap));
        const int16_t inner_x = static_cast<int16_t>(box_x + 1);
        const int16_t inner_y = static_cast<int16_t>(box_y + 1);

        // 5a. Carriage number label above the box (setFontPosTop ensures y is top of glyph box)
        if (carriages_[i].number > 0) {
            char num_buf[8];
            std::snprintf(num_buf, sizeof(num_buf), "%u", carriages_[i].number);
            const int16_t num_w = static_cast<int16_t>(display.getUTF8Width(num_buf));
            const int16_t num_x = static_cast<int16_t>(box_x + (cell_w - num_w) / 2);
            display.drawUTF8(
                static_cast<u8g2_uint_t>(num_x),
                static_cast<u8g2_uint_t>(y),
                num_buf
            );
        }

        // 5b. Carriage outline (1px border rectangle)
        display.drawFrame(
            static_cast<u8g2_uint_t>(box_x),
            static_cast<u8g2_uint_t>(box_y),
            static_cast<u8g2_uint_t>(cell_w),
            static_cast<u8g2_uint_t>(box_h)
        );

        // 5c. Loading gauge (filled bar from bottom proportional to loading percentage)
        if (carriages_[i].loading_pct > 0 && inner_h > 0 && inner_w > 0) {
            int16_t gauge_h = static_cast<int16_t>(
                (static_cast<int32_t>(carriages_[i].loading_pct) * inner_h + 50) / 100
            );
            if (gauge_h == 0) {
                gauge_h = 1;
            }
            if (gauge_h > inner_h) {
                gauge_h = inner_h;
            }
            const int16_t gauge_y = static_cast<int16_t>(inner_y + inner_h - gauge_h);
            display.setDrawColor(1);
            display.drawBox(
                static_cast<u8g2_uint_t>(inner_x),
                static_cast<u8g2_uint_t>(gauge_y),
                static_cast<u8g2_uint_t>(inner_w),
                static_cast<u8g2_uint_t>(gauge_h)
            );
        }

        // 5d. Indicators (Class, Wheelchair, Bike) with draw color 2 (XOR)
        // Draw color 2 inverts foreground pixels, ensuring visibility whether inside
        // empty space or overdrawn on the filled loading gauge.
        if (inner_w >= 14 && inner_h >= 6) {
            display.setDrawColor(2);

            // First-class indicator: filled rectangle at top-left corner
            if (carriages_[i].is_first_class) {
                display.drawBox(
                    static_cast<u8g2_uint_t>(inner_x + 1),
                    static_cast<u8g2_uint_t>(inner_y + 1),
                    4,
                    4
                );
            }

            // Wheelchair indicator: "W" glyph
            if (carriages_[i].has_wheelchair) {
                int16_t w_pos = static_cast<int16_t>(inner_x + 6);
                if (w_pos + 6 > inner_x + inner_w) {
                    w_pos = static_cast<int16_t>(inner_x + inner_w - 6);
                }
                display.drawUTF8(
                    static_cast<u8g2_uint_t>(w_pos),
                    static_cast<u8g2_uint_t>(inner_y + 1),
                    "W"
                );
            }

            // Bike indicator: "B" glyph
            if (carriages_[i].has_bike) {
                int16_t b_pos = static_cast<int16_t>(inner_x + 12);
                if (b_pos + 6 > inner_x + inner_w) {
                    b_pos = static_cast<int16_t>(inner_x + inner_w - 6);
                }
                display.drawUTF8(
                    static_cast<u8g2_uint_t>(b_pos),
                    static_cast<u8g2_uint_t>(inner_y + 1),
                    "B"
                );
            }

            // Restore draw color 1 for next iterations / ambient drawing
            display.setDrawColor(1);
        }
    }
}
