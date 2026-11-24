/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_service_list/wd_service_list.cpp
 * Purpose: Implements wd_service_list tabular rendering and collection API,
 *          with atomic commit bracketing over the row storage the generator
 *          allocates for each instance (§9.2).
 *
 * Description: Implementation of add_column, begin, add_row, commit, capacity,
 *              attach_rows and multi-column U8G2 draw dispatch. Every cell is
 *              read and written through the attached u8g2gl_rows view, so the
 *              widget never indexes storage it did not size.
 */
#include "wd_service_list.hpp"

#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// --- Configuration Setters ---

void wd_service_list::set_font(const uint8_t* font) {
    if (font_ == font) {
        return;
    }
    font_ = font;
    u8g2gl_obj::set_font(font);
    mark_dirty();
}

// The three sizing props are read by the generator, which allocates this
// instance's rows from them (§9.2); the view attach_rows() hands over is the
// only capacity the widget has, so there is nothing for these to store.
void wd_service_list::set_max_rows(int16_t /*rows*/) {
}

void wd_service_list::set_max_cols(int16_t /*cols*/) {
}

void wd_service_list::set_max_cell_chars(int16_t /*chars*/) {
}

void wd_service_list::set_scroll_dwell_ms(int32_t dwell_ms) {
    scroll_dwell_ms_ = dwell_ms;
}

void wd_service_list::set_scroll_duration_ms(int32_t duration_ms) {
    scroll_duration_ms_ = duration_ms;
}

// --- Column Definition API ---

void wd_service_list::add_column(int16_t width, u8g2gl_align_t align) {
    if (column_count_ >= DEFAULT_MAX_COLS) {
        return;
    }
    columns_[column_count_].width = width;
    columns_[column_count_].align = align;
    column_count_++;
    mark_dirty();
}

void wd_service_list::clear_columns() {
    column_count_ = 0;
    mark_dirty();
}

// --- Data Ingestion API (§9.2) ---

void wd_service_list::begin() {
    // Reset write index for incoming batch
    current_row_index_ = 0;
}

// wd_service_list::add_row
// Stages one row in place: each cell through the view, which truncates it at
// max_cell_chars. Cells past the storage's columns are dropped; missing or null
// ones are stored empty, so a short row never shows a previous batch's text.
//   cells — the row's texts, nullptr for an empty cell
//   n     — how many `cells` holds
bool wd_service_list::add_row(const char* const* cells, size_t n) {
    if (current_row_index_ >= rows_.capacity()) {
        return false;
    }
    const uint32_t columns = rows_.repeat(0);
    for (uint32_t c = 0; c < columns; ++c) {
        rows_.set_string(current_row_index_, 0, c < n ? cells[c] : nullptr, c);
    }
    current_row_index_++;
    return true;
}

bool wd_service_list::add_row(std::initializer_list<const char*> cells) {
    return add_row(cells.begin(), cells.size());
}

void wd_service_list::commit() {
    // Atomic publish: make staged rows active and request repaint
    row_count_ = current_row_index_;
    mark_dirty();
}

size_t wd_service_list::capacity() const {
    return rows_.capacity();
}

size_t wd_service_list::row_count() const {
    return row_count_;
}

// --- Collection Storage (§9.2) ---

// wd_service_list::attach_rows
// Keeps the view over this instance's rows. A new view starts empty: rows
// written to an earlier one are not this storage's.
//   data_index — the <data>'s declaration index; this widget has one, `rows`
//   rows       — the generated storage
void wd_service_list::attach_rows(uint8_t data_index, const u8g2gl_rows& rows) {
    if (data_index != 0) {
        return;
    }
    rows_ = rows;
    current_row_index_ = 0;
    row_count_ = 0;
    mark_dirty();
}

// --- Rendering Lifecycle ---

void wd_service_list::render(U8G2& display) {
    // Step 1: Early exit if no data or no columns
    if (row_count_ == 0 || column_count_ == 0) {
        return;
    }

    int16_t x = get_x();
    int16_t y = get_y();
    int16_t w = get_w();
    int16_t h = get_h();
    if (w <= 0 || h <= 0) {
        return;
    }

    // Step 2: Establish active font
    const uint8_t* active_font = font_;
    if (active_font == nullptr) {
        active_font = get_resolved_style().font;
    }
    if (active_font != nullptr) {
        display.setFont(active_font);
    }

    // Step 3: Compute font metrics and row layout
    int font_ascent = static_cast<int>(display.getAscent());
    int font_descent = static_cast<int>(display.getDescent());
    int font_height = font_ascent - font_descent;
    int16_t row_height = static_cast<int16_t>(h / static_cast<int16_t>(row_count_));
    if (row_height < font_height) {
        row_height = static_cast<int16_t>(font_height);
    }

    // Step 4: Render rows and cells within bounds
    for (size_t r = 0; r < row_count_; ++r) {
        int16_t row_top = static_cast<int16_t>(y + static_cast<int16_t>(r * row_height));
        if (row_top >= y + h) {
            break;
        }

        // Vertical centering within row
        int16_t y_offset = (row_height > font_height) ? static_cast<int16_t>((row_height - font_height) / 2) : 0;
        int16_t cell_y = static_cast<int16_t>(row_top + y_offset);

        int16_t col_x = x;
        for (size_t c = 0; c < column_count_; ++c) {
            int16_t col_w = columns_[c].width;
            if (col_w <= 0) {
                continue; // Skip zero-width columns
            }

            const char* text = rows_.get_string(r, 0, static_cast<uint32_t>(c));
            if (text[0] != '\0') {
                int16_t text_w = static_cast<int16_t>(display.getUTF8Width(text));
                int16_t cell_x = col_x;
                if (columns_[c].align == U8G2GL_ALIGN_CENTER) {
                    cell_x = static_cast<int16_t>(col_x + (col_w - text_w) / 2);
                } else if (columns_[c].align == U8G2GL_ALIGN_RIGHT) {
                    cell_x = static_cast<int16_t>(col_x + col_w - text_w);
                }

                display.drawUTF8(
                    static_cast<u8g2_uint_t>(cell_x),
                    static_cast<u8g2_uint_t>(cell_y),
                    text
                );
            }

            col_x = static_cast<int16_t>(col_x + col_w);
        }
    }
}
