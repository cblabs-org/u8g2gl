/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_service_list/wd_service_list.hpp
 * Purpose: Custom collection widget implementing the §9.2 declared-capacity,
 *          atomic-commit table display model for departures data.
 *
 * Description: Declarations for the wd_service_list widget class. Provides
 *              static non-heap storage, column configuration, begin/add_row/commit
 *              data ingestion API, and U8G2 multi-column rendering.
 *
 * Exported Classes:
 * - wd_service_list: Table widget extending u8g2gl_obj.
 */
#ifndef WD_SERVICE_LIST_HPP
#define WD_SERVICE_LIST_HPP

#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_style.h"

class U8G2;

/**
 * @brief Column configuration for tabular layout within wd_service_list.
 */
struct u8g2gl_column_def {
    int16_t width{0};
    u8g2gl_align_t align{U8G2GL_ALIGN_LEFT};
};

/**
 * @brief Custom service list widget providing declared static capacity for
 *        tabular records (design_spec §9.2).
 */
class wd_service_list : public u8g2gl_obj {
public:
    static constexpr size_t DEFAULT_MAX_ROWS = 16;
    static constexpr size_t DEFAULT_MAX_COLS = 6;
    static constexpr size_t DEFAULT_MAX_CELL_CHARS = 24;

    wd_service_list() = default;
    ~wd_service_list() override = default;

    // --- Configuration setters (emitted from <prop> in manifest) ---

    void set_font(const uint8_t* font);
    void set_max_rows(int16_t rows);
    void set_max_cols(int16_t cols);
    void set_max_cell_chars(int16_t chars);
    void set_scroll_dwell_ms(int32_t dwell_ms);
    void set_scroll_duration_ms(int32_t duration_ms);

    // --- Column definition API ---

    /**
     * @brief Define a column's width and text alignment.
     * @param width Column width in pixels (0 for omitted/zero-width).
     * @param align Alignment within column (left, center, right).
     */
    void add_column(int16_t width, u8g2gl_align_t align);

    /**
     * @brief Clear all column definitions.
     */
    void clear_columns();

    // --- Data ingestion API (§9.2) ---

    /**
     * @brief Start a data batch, resetting the write pointer to row 0.
     */
    void begin();

    /**
     * @brief Add a row of cell strings to the collection.
     * @param cells Array of cell string pointers (or nullptr for missing cell).
     * @param n Number of cells provided.
     * @return true if accepted, false if capacity exceeded.
     */
    bool add_row(const char* const* cells, size_t n);

    /**
     * @brief Add a row using initializer list.
     * @param cells List of cell string literals or pointers.
     * @return true if accepted, false if capacity exceeded.
     */
    bool add_row(std::initializer_list<const char*> cells);

    /**
     * @brief Commit the ingested rows, publishing to the display and marking dirty.
     */
    void commit();

    /**
     * @brief Return row capacity.
     */
    size_t capacity() const;

    /**
     * @brief Return number of committed rows currently stored.
     */
    size_t row_count() const;

    // --- Lifecycle override ---

    /**
     * @brief Render committed table rows to display buffer.
     * @param display The U8G2 display driver instance.
     */
    void render(U8G2& display) override;

private:
    // Capacity limits (clamped to static array bounds)
    size_t max_rows_{DEFAULT_MAX_ROWS};
    size_t max_cols_{DEFAULT_MAX_COLS};
    size_t max_cell_chars_{DEFAULT_MAX_CELL_CHARS};

    // Scroll timing
    int32_t scroll_dwell_ms_{5000};
    int32_t scroll_duration_ms_{1000};

    // Font
    const uint8_t* font_{nullptr};

    // Column definitions
    u8g2gl_column_def columns_[DEFAULT_MAX_COLS]{};
    size_t column_count_{0};

    // Row staging state
    size_t current_row_index_{0};
    size_t row_count_{0};

    // Static collection buffer: [row][col][char] — zero heap allocation
    char cells_[DEFAULT_MAX_ROWS][DEFAULT_MAX_COLS][DEFAULT_MAX_CELL_CHARS]{};
};

#endif // WD_SERVICE_LIST_HPP
