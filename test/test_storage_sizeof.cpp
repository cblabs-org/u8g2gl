/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_storage_sizeof.cpp
 *
 * Purpose: §18's collection-storage figure, checked against the buffer the
 *          compiler actually allocates (design_spec §9.2, §1.3). The report is
 *          only honest if the bytes it states are the bytes the generated unit
 *          declares, so this compiles the static-children fixture's generated
 *          screen unit into this translation unit, where its `static` buffer is
 *          in scope, and compares sizeof with the figure.
 *
 * Description: The figure, 400 bytes for the board's `rows` (4 rows × 100
 *              bytes: 4 cells of max_cell_chars 24 + 1), is the one
 *              cli/test/generator/static-children-fixture.test.ts asserts the
 *              report states for the same committed fixture, so the two tests
 *              hold the report and the buffer to one number. The screen unit is
 *              compiled here and nowhere else in this binary, so its symbols
 *              are defined once.
 */
#include <gtest/gtest.h>

#include <cstddef>

// The generated unit itself, so its static storage is visible to sizeof.
#include "ui_screen_board.cpp"

namespace {

/** The bytes §18 reports for board.board.rows. */
constexpr size_t kReportedBoardRowsBytes = 400;

static_assert(sizeof(ui_rows_board_rows) == kReportedBoardRowsBytes,
              "the generated buffer is not the size the report states");

}  // namespace

TEST(StorageSizeof, TheGeneratedBufferIsTheSizeTheReportStates) {
    EXPECT_EQ(sizeof(ui_rows_board_rows), kReportedBoardRowsBytes);
    EXPECT_EQ(ui_rows_board_rows_layout.row_bytes * 4u, kReportedBoardRowsBytes);
}

TEST(StorageSizeof, TheGeneratedBufferIsAlignedForItsRows) {
    EXPECT_EQ(reinterpret_cast<uintptr_t>(ui_rows_board_rows) % alignof(int32_t), 0u);
}
