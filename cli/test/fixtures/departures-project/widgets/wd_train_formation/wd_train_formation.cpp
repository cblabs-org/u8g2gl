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
 *          and collection ingestion API, with atomic commit bracketing over the
 *          row storage the generator allocates for each instance (§9.2).
 *
 * Description: Implementation of set_font, set_max_carriages, begin, add_carriage,
 *              commit, capacity, carriage_count, get_carriage, attach_rows, and
 *              pixel-arithmetic U8G2 draw dispatch. Every carriage is read and
 *              written through the attached u8g2gl_rows view, by the field
 *              indices the manifest's `<data>` declares them in.
 */
#include "wd_train_formation.hpp"

#include <cstdio>
#include <cstring>

#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

namespace {

// The carriages <data>'s fields, in the manifest's declaration order: the
// indices the generated layout gives them.
constexpr uint8_t kNumber = 0;
constexpr uint8_t kClassType = 1;
constexpr uint8_t kWheelchair = 2;
constexpr uint8_t kBike = 3;
constexpr uint8_t kLoadingPct = 4;

// class_type's values="standard,first": an enum field stores its value's index.
constexpr uint8_t kStandardClass = 0;
constexpr uint8_t kFirstClass = 1;

}  // namespace

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
// The generator sizes this instance's storage from max_carriages (§9.2); the
// widget's capacity is the attached view's, so there is nothing to store.
void wd_train_formation::set_max_carriages(int16_t /*max_carriages*/) {
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
    if (current_carriage_index_ >= rows_.capacity()) {
        return false;
    }

    const size_t row = current_carriage_index_;
    rows_.set_int(row, kNumber, number);
    rows_.set_enum(row, kClassType, is_first_class ? kFirstClass : kStandardClass);
    rows_.set_bool(row, kWheelchair, wheelchair);
    rows_.set_bool(row, kBike, bike);
    rows_.set_int(row, kLoadingPct, (loading_pct > 100) ? 100 : loading_pct);

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
    return rows_.capacity();
}

size_t wd_train_formation::carriage_count() const {
    return carriage_count_;
}

// wd_train_formation::get_carriage
// One committed carriage, read back field by field from the row storage.
//   index — the carriage, below carriage_count()
//   out   — receives it
bool wd_train_formation::get_carriage(size_t index, u8g2gl_carriage_t* out) const {
    if (index >= carriage_count_ || out == nullptr) {
        return false;
    }
    out->number = static_cast<uint8_t>(rows_.get_int(index, kNumber));
    out->is_first_class = rows_.get_enum(index, kClassType) == kFirstClass;
    out->has_wheelchair = rows_.get_bool(index, kWheelchair);
    out->has_bike = rows_.get_bool(index, kBike);
    out->loading_pct = static_cast<uint8_t>(rows_.get_int(index, kLoadingPct));
    return true;
}

// --- Collection Storage (§9.2) ---

// wd_train_formation::attach_rows
// Keeps the view over this instance's carriages. A new view starts empty:
// carriages written to an earlier one are not this storage's.
//   data_index — the <data>'s declaration index; this widget has one, `carriages`
//   rows       — the generated storage
void wd_train_formation::attach_rows(uint8_t data_index, const u8g2gl_rows& rows) {
    if (data_index != 0) {
        return;
    }
    rows_ = rows;
    current_carriage_index_ = 0;
    carriage_count_ = 0;
    mark_dirty();
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
        u8g2gl_carriage_t carriage{};
        get_carriage(i, &carriage);
        const int16_t box_x = static_cast<int16_t>(x + left_margin + static_cast<int16_t>(i) * (cell_w + gap));
        const int16_t inner_x = static_cast<int16_t>(box_x + 1);
        const int16_t inner_y = static_cast<int16_t>(box_y + 1);

        // 5a. Carriage number label above the box (setFontPosTop ensures y is top of glyph box)
        if (carriage.number > 0) {
            char num_buf[8];
            std::snprintf(num_buf, sizeof(num_buf), "%u", carriage.number);
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
        if (carriage.loading_pct > 0 && inner_h > 0 && inner_w > 0) {
            int16_t gauge_h = static_cast<int16_t>(
                (static_cast<int32_t>(carriage.loading_pct) * inner_h + 50) / 100
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
            if (carriage.is_first_class) {
                display.drawBox(
                    static_cast<u8g2_uint_t>(inner_x + 1),
                    static_cast<u8g2_uint_t>(inner_y + 1),
                    4,
                    4
                );
            }

            // Wheelchair indicator: "W" glyph
            if (carriage.has_wheelchair) {
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
            if (carriage.has_bike) {
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
