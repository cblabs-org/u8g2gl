/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_static_children.cpp
 * Purpose: Static children made real (design_spec §6.5). A service list's
 *          columns are written in the screen XML as `<column>` children, and
 *          both targets must configure the widget exactly as a hand-written
 *          `add_column()` sequence would: the firmware's generated init calls the
 *          method, and the editor host calls it through the registry's
 *          add-by-name entry. Equal draw logs, row for row, are the proof.
 *          It also holds the departures widget to `max_cell_chars` meaning
 *          usable characters, as a string subject's `max_len` does, and to
 *          keeping its rows only in the storage it is handed (§9.2).
 *
 * Description: Compiles test/static_children/'s committed generated units (both
 *              targets) with the departures fixture's own wd_service_list C++.
 *              Each case fills a list through its §9.2 API — begin(), add_row(),
 *              commit() — renders it through u8g2gl_render_object() into the
 *              U8G2 stub, and compares the stub's ordered call logs. A list
 *              configured by hand is handed storage by hand, with the layout
 *              the generator emits for the fixture.
 */
#include <gtest/gtest.h>

#include "ui.hpp"

#include "U8g2lib.h"
#include "editor_host.h"
#include "fixture_u8g2_fonts.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_editor.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_rows.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "wd_service_list.hpp"

#include <cstring>
#include <string>
#include <vector>

namespace {

// The rows every case renders: three departures of four cells.
const char* const kRows[][4] = {
    {"10:02", "Reading", "4", "On time"},
    {"10:15", "London Paddington", "1", "Exp 10:19"},
    {"10:31", "Oxford", "11", "Cancelled"},
};

// fill
// Fills a list through its own ingestion API (§9.2), as a controller would.
void fill(wd_service_list& list) {
    list.begin();
    for (const auto& row : kRows) {
        ASSERT_TRUE(list.add_row(row, 4));
    }
    list.commit();
}

// rendered
// The stub's ordered call log for one object rendered alone, as the screen's
// render function draws it: through u8g2gl_render_object().
std::vector<std::string> rendered(u8g2gl_obj* obj) {
    U8G2 display;
    u8g2gl_obj* const objs[] = {obj};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};
    u8g2gl_render_object(display, objs, parents, 0);
    EXPECT_FALSE(display.call_log_overflowed());
    std::vector<std::string> log;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        const u8g2_stub_call& call = display.call_log[i];
        std::string entry = call.op;
        for (int32_t arg : call.args) {
            entry += " " + std::to_string(arg);
        }
        entry += std::string(" '") + call.text + "'";
        log.push_back(entry);
    }
    return log;
}

// drawn_cells
// The texts a log draws, in order.
std::vector<std::string> drawn_cells(const std::vector<std::string>& log) {
    std::vector<std::string> cells;
    for (const std::string& entry : log) {
        if (entry.rfind("drawUTF8", 0) == 0) {
            const size_t open = entry.find('\'');
            cells.push_back(entry.substr(open + 1, entry.size() - open - 2));
        }
    }
    return cells;
}

// The board's rows as the generator lays them out for screen_board.xml:
// max_cols 4 cells of max_cell_chars 24 + 1 bytes, a 100-byte row, max_rows 4.
constexpr u8g2gl_rows_field kCellFields[] = {{0, 25, 4, U8G2GL_FIELD_STRING}};
constexpr u8g2gl_rows_layout kBoardRows = {kCellFields, 100, 1};

// The same row with max_cell_chars 10: 4 cells of 11 bytes.
constexpr u8g2gl_rows_field kShortCellFields[] = {{0, 11, 4, U8G2GL_FIELD_STRING}};
constexpr u8g2gl_rows_layout kShortRows = {kShortCellFields, 44, 1};

// One list's storage, as a generated unit declares it for an instance.
struct hand_storage {
    alignas(4) uint8_t bytes[4 * 100] = {};
};

// hand_written
// The board as screen_board.xml describes it, configured by hand: the same
// setters, the same add_column() calls in the same order, then its storage.
//   list    — the list
//   storage — its buffer, outliving it
//   layout  — its row layout; the board's own by default
void hand_written(wd_service_list& list, hand_storage& storage, const u8g2gl_rows_layout& layout = kBoardRows) {
    list.set_coords(0, 0, 128, 40);
    list.set_font(ui_font_u8g2_font_6x10_mr);
    list.set_max_rows(4);
    list.set_max_cols(4);
    list.add_column(30, U8G2GL_ALIGN_LEFT);
    list.add_column(50, U8G2GL_ALIGN_LEFT);
    list.add_column(16, U8G2GL_ALIGN_CENTER);
    list.add_column(32, U8G2GL_ALIGN_RIGHT);
    list.attach_rows(0, u8g2gl_rows(storage.bytes, 4, &layout));
}

}  // namespace

// --- Firmware: the generated init's add_column() calls ---

TEST(StaticChildren, GeneratedFirmwareLaysOutAsTheHandWrittenCalls) {
    ui_init();
    ASSERT_EQ(ui_screen_board.obj_count, 1);
    auto* generated = static_cast<wd_service_list*>(ui_screen_board.objs[0]);
    fill(*generated);

    wd_service_list by_hand;
    hand_storage storage;
    hand_written(by_hand, storage);
    fill(by_hand);

    const std::vector<std::string> expected = rendered(&by_hand);
    // Every cell of every row draws, so the columns really were configured:
    // with none, render() draws nothing at all.
    EXPECT_EQ(drawn_cells(expected).size(), 12u);
    EXPECT_EQ(rendered(generated), expected);
}

// --- Editor: the registry's add-by-name entry ---

TEST(StaticChildren, EditorHostLaysOutAsTheHandWrittenCalls) {
    editor_host host(ui_editor_registry());
    ASSERT_TRUE(host.load(U8G2GL_STATIC_CHILDREN_SCENE_PATH)) << host.error();
    host.provide_font("u8g2_font_6x10_mr", u8g2_font_6x10_mr);
    ASSERT_TRUE(host.build("board")) << host.error();
    ASSERT_EQ(host.object_count(), 1u);
    auto* built = static_cast<wd_service_list*>(host.object(0));
    fill(*built);

    wd_service_list by_hand;
    hand_storage storage;
    hand_written(by_hand, storage);
    fill(by_hand);

    EXPECT_EQ(drawn_cells(rendered(&by_hand)).size(), 12u);
    EXPECT_EQ(rendered(built), rendered(&by_hand));
}

// --- max_cell_chars counts usable characters ---

TEST(StaticChildren, ACellOfExactlyMaxCellCharsSurvivesWhole) {
    // max_cell_chars="10" sizes the storage: the generator lays each cell out
    // as 10 + 1 bytes, and the widget truncates to what it is handed.
    wd_service_list list;
    hand_storage storage;
    hand_written(list, storage, kShortRows);
    const char* const row[] = {"0123456789", "0123456789A", "", ""};
    list.begin();
    ASSERT_TRUE(list.add_row(row, 4));
    list.commit();
    const std::vector<std::string> cells = drawn_cells(rendered(&list));
    // Exactly max_cell_chars characters survive; one more is truncated to it.
    ASSERT_EQ(cells.size(), 2u);
    EXPECT_EQ(cells[0], "0123456789");
    EXPECT_EQ(cells[1], "0123456789");
}

TEST(StaticChildren, TheDefaultCellHoldsTwentyFourCharacters) {
    wd_service_list list;
    hand_storage storage;
    hand_written(list, storage);
    const char* const row[] = {"ABCDEFGHIJKLMNOPQRSTUVWX", "", "", ""};
    list.begin();
    ASSERT_TRUE(list.add_row(row, 4));
    list.commit();
    const std::vector<std::string> cells = drawn_cells(rendered(&list));
    ASSERT_EQ(cells.size(), 1u);
    EXPECT_EQ(cells[0], "ABCDEFGHIJKLMNOPQRSTUVWX");
}

// --- Storage (§9.2): the rows live only in the buffer the widget is handed ---

TEST(StaticChildren, WithNoStorageAttachedAListHasNoCapacityAndRefusesARow) {
    wd_service_list list;
    const char* const row[] = {"a"};
    EXPECT_EQ(list.capacity(), 0u);
    list.begin();
    EXPECT_FALSE(list.add_row(row, 1));
    list.commit();
    EXPECT_EQ(list.row_count(), 0u);
}

TEST(StaticChildren, AListsCapacityIsItsStoragesAndItsRowsAreWrittenThere) {
    wd_service_list list;
    hand_storage storage;
    hand_written(list, storage);
    EXPECT_EQ(list.capacity(), 4u);
    fill(list);
    // The second row's second cell, in place: 100 bytes per row, 25 per cell.
    EXPECT_STREQ(reinterpret_cast<const char*>(storage.bytes + 100 + 25), "London Paddington");
}

TEST(StaticChildren, TheGeneratedInitHandsTheListStorageOfItsDeclaredCapacity) {
    // max_rows="4" in screen_board.xml: the generated buffer holds four rows,
    // and the handle names the same object the screen's table does.
    ui_init();
    auto* generated = static_cast<wd_service_list*>(ui_screen_board.objs[0]);
    EXPECT_EQ(generated->capacity(), 4u);
    EXPECT_EQ(&ui_board_board, generated);
}

// --- The fill entry: the widget's own refusal stops the fill (Q-19) ---

TEST(StaticChildren, FillStopsWhereTheWidgetRefusesARowAndKeepsTheRowsItTook) {
    editor_host host(ui_editor_registry());
    ASSERT_TRUE(host.load(U8G2GL_STATIC_CHILDREN_SCENE_PATH)) << host.error();
    host.provide_font("u8g2_font_6x10_mr", u8g2_font_6x10_mr);
    ASSERT_TRUE(host.build("board")) << host.error();
    const u8g2gl_editor_class* cls = u8g2gl_editor_find_class(ui_editor_registry(), "wd_service_list");
    ASSERT_NE(cls, nullptr);
    auto* list = static_cast<wd_service_list*>(host.object(0));

    // Five rows, one more than the board's max_rows of 4. The bridge refuses
    // that before calling anything; called directly, the fill reaches
    // add_row()'s own false at the fifth, as a device controller would.
    const char* const texts[] = {"a"};
    u8g2gl_editor_cell cell{};
    cell.texts = texts;
    cell.count = 1;
    const u8g2gl_editor_cell* const rows[] = {&cell, &cell, &cell, &cell, &cell};
    size_t accepted = 0;
    EXPECT_FALSE(u8g2gl_editor_fill(*cls, list, "rows", rows, 5, &accepted));
    EXPECT_EQ(accepted, 4u);
    EXPECT_EQ(list->row_count(), 4u);
}

TEST(StaticChildren, FillRefusesACellThatIsNotItsFieldAndCallsNothing) {
    editor_host host(ui_editor_registry());
    ASSERT_TRUE(host.load(U8G2GL_STATIC_CHILDREN_SCENE_PATH)) << host.error();
    host.provide_font("u8g2_font_6x10_mr", u8g2_font_6x10_mr);
    ASSERT_TRUE(host.build("board")) << host.error();
    const u8g2gl_editor_class* cls = u8g2gl_editor_find_class(ui_editor_registry(), "wd_service_list");
    ASSERT_NE(cls, nullptr);
    auto* list = static_cast<wd_service_list*>(host.object(0));
    fill(*list);

    // A repeated field with a null text in its array: refused before begin().
    const char* const texts[] = {"a", nullptr};
    u8g2gl_editor_cell cell{};
    cell.texts = texts;
    cell.count = 2;
    const u8g2gl_editor_cell* const rows[] = {&cell};
    EXPECT_FALSE(u8g2gl_editor_fill(*cls, list, "rows", rows, 1, nullptr));
    EXPECT_EQ(list->row_count(), 3u);
    EXPECT_FALSE(u8g2gl_editor_fill(*cls, list, "carriages", rows, 1, nullptr));
}
