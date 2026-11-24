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
 * Description: Declarations for the wd_service_list widget class: column
 *              configuration, the begin/add_row/commit data ingestion API, and
 *              U8G2 multi-column rendering. Its rows live in storage the
 *              generator allocates for each instance from its `<data>` (§9.2):
 *              max_rows rows of max_cols cells, each max_cell_chars + 1 bytes.
 *              The widget is handed a view over it through attach_rows() and
 *              owns no row array of its own, so an instance costs what its XML
 *              declares.
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
#include "u8g2gl/u8g2gl_rows.h"
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
    /** Columns the static `<column>` children can define: the column table's own size. */
    static constexpr size_t DEFAULT_MAX_COLS = 6;

    wd_service_list() = default;
    ~wd_service_list() override = default;

    // --- Configuration setters (emitted from <prop> in manifest) ---

    void set_font(const uint8_t* font);

    // max_rows, max_cols and max_cell_chars size this instance's generated row
    // storage (§9.2): the generator allocates from them, and the widget reads
    // the result from the view attach_rows() hands it. These setters exist
    // because every prop has one, and change nothing at run time.
    /** @brief Row capacity: sizes the generated storage; no effect at run time. */
    void set_max_rows(int16_t rows);
    /** @brief Cells per row: sizes the generated storage; no effect at run time. */
    void set_max_cols(int16_t cols);
    /**
     * @brief Usable characters per cell, terminator not included: sizes the
     *        generated storage, which truncates a longer cell to this many;
     *        no effect at run time.
     */
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
     *
     * Each cell is copied into the row storage, up to max_cell_chars
     * characters; a longer one is truncated to that many. Cells past max_cols
     * are dropped, and missing ones stored empty.
     *
     * @param cells Array of cell string pointers (or nullptr for missing cell).
     * @param n Number of cells provided.
     * @return true if accepted; false if the storage is full, or none is attached.
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
     * @brief Return row capacity: the attached storage's rows, 0 with none.
     */
    size_t capacity() const;

    /**
     * @brief Return number of committed rows currently stored.
     */
    size_t row_count() const;

    // --- Lifecycle overrides ---

    /**
     * @brief Keep the view over this instance's `rows` storage (§9.2).
     * @param data_index 0, the manifest's one `<data>`; any other is ignored.
     * @param rows       The generated storage; one string field, repeated per cell.
     */
    void attach_rows(uint8_t data_index, const u8g2gl_rows& rows) override;

    /**
     * @brief Render committed table rows to display buffer.
     * @param display The U8G2 display driver instance.
     */
    void render(U8G2& display) override;

private:
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

    // The rows, in the generator's storage: field 0 is `cells`, one string per
    // column. A batch writes in place and commit() publishes the count (§9.2).
    u8g2gl_rows rows_{};
};

#endif // WD_SERVICE_LIST_HPP
