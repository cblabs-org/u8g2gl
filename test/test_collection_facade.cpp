/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_collection_facade.cpp
 *
 * Purpose: §9.2's generated collection API, from an application's side. The
 *          collection-data fixture's generated firmware is compiled with the
 *          departures widgets and real U8G2, and both widgets are filled only
 *          through the facades ui.hpp declares — `ui_board_formation_carriages`
 *          and `ui_board_services_rows` — exactly as firmware would fill them
 *          from live data. No widget header is included: the facade is the
 *          whole API an application needs.
 *
 * Description: The screen is drawn by its generated render function, which
 *              renders every object through u8g2gl_render_object(), into a
 *              memory display (the one the Wasm hosts draw on), and its lit
 *              pixels counted. Each
 *              case checks a capacity, a refusal past it, or the pixels: none
 *              before a fill, some after, and the same frame whichever of the
 *              facade's two add_row() overloads staged the rows.
 */
#include <gtest/gtest.h>

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "U8g2lib.h"
#include "memory_display.h"
#include "ui.hpp"
#include "u8g2gl/u8g2gl_core.h"

namespace {

memory_display s_display;
uint32_t s_now_ms = 0;
uint32_t fixture_now() {
    return s_now_ms;
}

// boot
// ui_init() once, the board active, and the display sized for the target.
void boot() {
    static bool booted = false;
    if (!booted) {
        std::string error;
        ASSERT_TRUE(s_display.setup(U8G2GL_TARGET_WIDTH, U8G2GL_TARGET_HEIGHT, &error)) << error;
        u8g2gl_set_tick_cb(fixture_now);
        ui_init();
        booted = true;
    }
    u8g2gl_set_active_screen(&ui_screen_board);
}

// frame
// Draws the board through its generated render function and returns its pixels.
std::vector<uint8_t> frame() {
    U8G2& display = s_display.u8g2();
    ui_screen_board.render_fn(display);
    return std::vector<uint8_t>(s_display.buffer(), s_display.buffer() + s_display.buffer_size());
}

// lit
// How many pixels a frame sets.
size_t lit(const std::vector<uint8_t>& pixels) {
    size_t count = 0;
    for (uint8_t byte : pixels) {
        for (; byte != 0; byte &= static_cast<uint8_t>(byte - 1)) {
            ++count;
        }
    }
    return count;
}

// clear_and_frame
// A frame from a cleared buffer, so only what the board draws is lit.
std::vector<uint8_t> clear_and_frame() {
    s_display.u8g2().clearBuffer();
    return frame();
}

// fill_services
// The service list's rows, through the facade's pointer-and-count overload.
void fill_services() {
    const char* const rows[][4] = {
        {"10:02", "Reading", "4", "On time"},
        {"10:15", "Oxford", "1", "Exp 10:19"},
    };
    ui_board_services_rows.begin();
    for (const auto& row : rows) {
        ASSERT_TRUE(ui_board_services_rows.add_row(row, 4));
    }
    ui_board_services_rows.commit();
}

}  // namespace

TEST(CollectionFacade, EachFacadesCapacityIsItsInstancesDeclaredOne) {
    EXPECT_EQ(ui_board_formation_carriages.capacity(), 8u);
    EXPECT_EQ(ui_board_services_rows.capacity(), 3u);
}

TEST(CollectionFacade, NothingIsDrawnBeforeAFillAndTheFillIsDrawnAfter) {
    boot();
    ui_board_formation_carriages.begin();
    ui_board_formation_carriages.commit();
    ui_board_services_rows.begin();
    ui_board_services_rows.commit();
    EXPECT_EQ(lit(clear_and_frame()), 0u);

    ui_board_formation_carriages.begin();
    ASSERT_TRUE(ui_board_formation_carriages.add_row(1, "first", true, false, 40));
    ASSERT_TRUE(ui_board_formation_carriages.add_row(2, "standard", false, true, 85));
    ui_board_formation_carriages.commit();
    fill_services();
    EXPECT_GT(lit(clear_and_frame()), 0u);
}

TEST(CollectionFacade, AddRowPastCapacityReturnsFalseAndKeepsTheRowsTaken) {
    boot();
    ui_board_services_rows.begin();
    for (size_t i = 0; i < ui_board_services_rows.capacity(); ++i) {
        EXPECT_TRUE(ui_board_services_rows.add_row({"10:00", "Swindon", "2", "On time"}));
    }
    EXPECT_FALSE(ui_board_services_rows.add_row({"11:00", "Bath", "3", "Late"}));
    ui_board_services_rows.commit();

    ui_board_formation_carriages.begin();
    for (size_t i = 0; i < ui_board_formation_carriages.capacity(); ++i) {
        EXPECT_TRUE(ui_board_formation_carriages.add_row(static_cast<int32_t>(i + 1), "standard", false, false, 10));
    }
    EXPECT_FALSE(ui_board_formation_carriages.add_row(9, "first", false, false, 10));
    ui_board_formation_carriages.commit();
    EXPECT_GT(lit(clear_and_frame()), 0u);
}

TEST(CollectionFacade, BothAddRowOverloadsStageTheSameRow) {
    boot();
    ui_board_formation_carriages.begin();
    ui_board_formation_carriages.commit();
    fill_services();
    const std::vector<uint8_t> from_pointers = clear_and_frame();

    ui_board_services_rows.begin();
    ASSERT_TRUE(ui_board_services_rows.add_row({"10:02", "Reading", "4", "On time"}));
    ASSERT_TRUE(ui_board_services_rows.add_row({"10:15", "Oxford", "1", "Exp 10:19"}));
    ui_board_services_rows.commit();
    const std::vector<uint8_t> from_lists = clear_and_frame();

    EXPECT_GT(lit(from_lists), 0u);
    EXPECT_EQ(from_lists, from_pointers);
}
