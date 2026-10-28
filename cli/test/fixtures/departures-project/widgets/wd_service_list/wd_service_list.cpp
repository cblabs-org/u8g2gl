/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_service_list/wd_service_list.cpp
 * Purpose: Implements wd_service_list tabular rendering and collection API.
 *          Provides bounded static memory storage with atomic commit bracketing.
 *
 * Description: Implementation of add_column, begin, add_row, commit, capacity,
 *              and multi-column U8G2 draw dispatch.
 */
#include "wd_service_list.hpp"

#include <cstring>

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

void wd_service_list::set_max_rows(int16_t rows) {
    if (rows <= 0) {
        return;
    }
    size_t clamped = static_cast<size_t>(rows);
    if (clamped > DEFAULT_MAX_ROWS) {
        clamped = DEFAULT_MAX_ROWS;
    }
    if (max_rows_ != clamped) {
        max_rows_ = clamped;
        mark_dirty();
    }
}

void wd_service_list::set_max_cols(int16_t cols) {
    if (cols <= 0) {
        return;
    }
    size_t clamped = static_cast<size_t>(cols);
    if (clamped > DEFAULT_MAX_COLS) {
        clamped = DEFAULT_MAX_COLS;
    }
    if (max_cols_ != clamped) {
        max_cols_ = clamped;
        mark_dirty();
    }
}

void wd_service_list::set_max_cell_chars(int16_t chars) {
    if (chars <= 0) {
        return;
    }
    size_t clamped = static_cast<size_t>(chars);
    if (clamped > DEFAULT_MAX_CELL_CHARS) {
        clamped = DEFAULT_MAX_CELL_CHARS;
    }
    if (max_cell_chars_ != clamped) {
        max_cell_chars_ = clamped;
        mark_dirty();
    }
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

bool wd_service_list::add_row(const char* const* cells, size_t n) {
    // Check row capacity
    if (current_row_index_ >= max_rows_) {
        return false;
    }

    // Copy each cell into bounded static storage
    for (size_t c = 0; c < max_cols_; ++c) {
        if (c < n && cells[c] != nullptr) {
            std::strncpy(cells_[current_row_index_][c], cells[c], max_cell_chars_ - 1);
            cells_[current_row_index_][c][max_cell_chars_ - 1] = '\0';
        } else {
            // Null or missing cell: store empty string
            cells_[current_row_index_][c][0] = '\0';
        }
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
    return max_rows_;
}

size_t wd_service_list::row_count() const {
    return row_count_;
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

            const char* text = cells_[r][c];
            if (text != nullptr && text[0] != '\0') {
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
