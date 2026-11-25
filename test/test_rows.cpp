/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_rows.cpp
 *
 * Purpose: u8g2gl_rows, the view a collection widget reads and writes its
 *          generated storage through (design_spec §9.2). The layouts here are
 *          the ones the generator emits for the departures widgets, so the
 *          test holds the runtime to the encoding the CLI lays out: an int
 *          aligned to four, byte-wide fields packed after it, the row padded
 *          to four, a string stored in place and truncated at max_len.
 *
 * Description: Each case builds a layout and a buffer as generated code does
 *              and drives the view through its accessors, then reads the raw
 *              bytes to check where each value landed. Out-of-range rows,
 *              fields, repeats and types read a default and write nothing.
 */
#include <gtest/gtest.h>

#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_rows.h"

#include <cstdint>
#include <cstring>
#include <string>

namespace {

// The train formation's carriages, as the generator lays them out: number
// (int) at 0, class_type (enum) at 4, wheelchair and bike (bool) at 5 and 6,
// loading_pct (int) aligned up to 8; twelve bytes, already a multiple of four.
constexpr u8g2gl_rows_field kCarriageFields[] = {
    {0, 4, 1, U8G2GL_FIELD_INT},
    {4, 1, 1, U8G2GL_FIELD_ENUM},
    {5, 1, 1, U8G2GL_FIELD_BOOL},
    {6, 1, 1, U8G2GL_FIELD_BOOL},
    {8, 4, 1, U8G2GL_FIELD_INT},
};
constexpr u8g2gl_rows_layout kCarriages = {kCarriageFields, 12, 5};

// A service list's row with max_cols 4 and max_cell_chars 10: one string field
// repeated four times, eleven bytes each; 44 bytes, already aligned.
constexpr u8g2gl_rows_field kCellFields[] = {
    {0, 11, 4, U8G2GL_FIELD_STRING},
};
constexpr u8g2gl_rows_layout kCells = {kCellFields, 44, 1};

// A row whose int follows a byte, so it is padded to four, and which ends on a
// byte, so the row is padded to eight: bool at 0, int at 4, bool at 8.
constexpr u8g2gl_rows_field kPaddedFields[] = {
    {0, 1, 1, U8G2GL_FIELD_BOOL},
    {4, 4, 1, U8G2GL_FIELD_INT},
    {8, 1, 1, U8G2GL_FIELD_BOOL},
};
constexpr u8g2gl_rows_layout kPadded = {kPaddedFields, 12, 3};

}  // namespace

// --- An empty view: what a widget has before attach_rows() ---

TEST(Rows, ADefaultViewHasNoCapacityAndRefusesEveryAccess) {
    u8g2gl_rows rows;
    EXPECT_EQ(rows.capacity(), 0u);
    EXPECT_FALSE(rows.set_int(0, 0, 7));
    EXPECT_EQ(rows.get_int(0, 0), 0);
    EXPECT_STREQ(rows.get_string(0, 0), "");
    EXPECT_EQ(rows.repeat(0), 0u);
}

TEST(Rows, ANullBufferOrLayoutMakesAnEmptyView) {
    alignas(4) uint8_t buffer[12] = {};
    EXPECT_EQ(u8g2gl_rows(nullptr, 1, &kCarriages).capacity(), 0u);
    EXPECT_EQ(u8g2gl_rows(buffer, 1, nullptr).capacity(), 0u);
}

// --- The layout: alignment and padding ---

TEST(Rows, EachFieldLandsAtItsOffsetAndEachRowAtItsStride) {
    alignas(4) uint8_t buffer[2 * 12] = {};
    u8g2gl_rows rows(buffer, 2, &kCarriages);
    ASSERT_TRUE(rows.set_int(1, 0, 42));
    ASSERT_TRUE(rows.set_enum(1, 1, 1));
    ASSERT_TRUE(rows.set_bool(1, 2, true));
    ASSERT_TRUE(rows.set_bool(1, 3, false));
    ASSERT_TRUE(rows.set_int(1, 4, 75));

    // Row 0 is untouched: row 1 starts at the layout's stride, twelve bytes in.
    for (size_t i = 0; i < 12; ++i) {
        EXPECT_EQ(buffer[i], 0u) << "byte " << i;
    }
    int32_t number = 0;
    int32_t loading = 0;
    std::memcpy(&number, buffer + 12 + 0, sizeof(number));
    std::memcpy(&loading, buffer + 12 + 8, sizeof(loading));
    EXPECT_EQ(number, 42);
    EXPECT_EQ(buffer[12 + 4], 1u);
    EXPECT_EQ(buffer[12 + 5], 1u);
    EXPECT_EQ(buffer[12 + 6], 0u);
    EXPECT_EQ(loading, 75);
    // The padding byte between the last bool and the aligned int stays clear.
    EXPECT_EQ(buffer[12 + 7], 0u);
}

TEST(Rows, AnIntAfterAByteIsAlignedAndTheRowIsPadded) {
    alignas(4) uint8_t buffer[2 * 12] = {};
    u8g2gl_rows rows(buffer, 2, &kPadded);
    ASSERT_TRUE(rows.set_int(1, 1, -5));
    // Row 1 begins at 12 and its int at 4 within it: a four-aligned address
    // in a four-aligned buffer.
    EXPECT_EQ(reinterpret_cast<uintptr_t>(buffer + 12 + 4) % 4u, 0u);
    int32_t value = 0;
    std::memcpy(&value, buffer + 16, sizeof(value));
    EXPECT_EQ(value, -5);
    EXPECT_EQ(rows.get_int(1, 1), -5);
}

// --- Each field type round-trips ---

TEST(Rows, EveryFieldTypeReadsBackWhatWasWritten) {
    alignas(4) uint8_t carriages[3 * 12] = {};
    u8g2gl_rows rows(carriages, 3, &kCarriages);
    ASSERT_TRUE(rows.set_int(2, 0, 2147483647));
    ASSERT_TRUE(rows.set_enum(2, 1, 1));
    ASSERT_TRUE(rows.set_bool(2, 2, true));
    EXPECT_EQ(rows.get_int(2, 0), 2147483647);
    EXPECT_EQ(rows.get_enum(2, 1), 1u);
    EXPECT_TRUE(rows.get_bool(2, 2));
    EXPECT_FALSE(rows.get_bool(2, 3));

    alignas(4) uint8_t cells[2 * 44] = {};
    u8g2gl_rows strings(cells, 2, &kCells);
    ASSERT_TRUE(strings.set_string(1, 0, "Reading", 2));
    EXPECT_STREQ(strings.get_string(1, 0, 2), "Reading");
    EXPECT_STREQ(strings.get_string(1, 0, 1), "");
    EXPECT_EQ(strings.repeat(0), 4u);
    EXPECT_EQ(strings.max_len(0), 10u);
    // Repeat 2 of row 1: 44 + 2 * 11 bytes in.
    EXPECT_STREQ(reinterpret_cast<const char*>(cells + 44 + 22), "Reading");
}

// --- A string is truncated at max_len, never overflowed ---

TEST(Rows, AStringOfExactlyMaxLenSurvivesAndALongerOneIsTruncated) {
    alignas(4) uint8_t cells[44] = {};
    u8g2gl_rows rows(cells, 1, &kCells);
    ASSERT_TRUE(rows.set_string(0, 0, "0123456789", 0));
    ASSERT_TRUE(rows.set_string(0, 0, "0123456789ABC", 1));
    EXPECT_STREQ(rows.get_string(0, 0, 0), "0123456789");
    EXPECT_STREQ(rows.get_string(0, 0, 1), "0123456789");
    // The truncation stayed inside its own repeat: repeat 2 is still empty.
    EXPECT_STREQ(rows.get_string(0, 0, 2), "");
}

TEST(Rows, ANullStringStoresEmpty) {
    alignas(4) uint8_t cells[44] = {};
    u8g2gl_rows rows(cells, 1, &kCells);
    ASSERT_TRUE(rows.set_string(0, 0, "x", 3));
    ASSERT_TRUE(rows.set_string(0, 0, nullptr, 3));
    EXPECT_STREQ(rows.get_string(0, 0, 3), "");
}

// --- Out of range: a default read, no write ---

TEST(Rows, AnAccessOutsideTheLayoutReadsADefaultAndWritesNothing) {
    alignas(4) uint8_t buffer[12] = {};
    u8g2gl_rows rows(buffer, 1, &kCarriages);
    // A row past capacity, a field past the layout, a repeat past the field's.
    EXPECT_FALSE(rows.set_int(1, 0, 9));
    EXPECT_FALSE(rows.set_int(0, 5, 9));
    EXPECT_FALSE(rows.set_int(0, 0, 9, 1));
    // The wrong type for the field.
    EXPECT_FALSE(rows.set_bool(0, 0, true));
    EXPECT_FALSE(rows.set_string(0, 4, "x"));
    for (uint8_t byte : buffer) {
        EXPECT_EQ(byte, 0u);
    }
    EXPECT_EQ(rows.get_int(1, 0), 0);
    EXPECT_EQ(rows.get_enum(0, 0), 0u);
    EXPECT_STREQ(rows.get_string(0, 0), "");
    EXPECT_EQ(rows.max_len(0), 0u);
    EXPECT_EQ(rows.repeat(9), 0u);
}

// --- The hook: the base class ignores a view ---

TEST(Rows, TheBaseObjectIgnoresAttachedRows) {
    alignas(4) uint8_t buffer[12] = {};
    u8g2gl_obj obj;
    obj.attach_rows(0, u8g2gl_rows(buffer, 1, &kCarriages));
    for (uint8_t byte : buffer) {
        EXPECT_EQ(byte, 0u);
    }
}
