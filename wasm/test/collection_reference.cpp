/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/collection_reference.cpp
 * Purpose: The hand-written side of the collection-data parity test
 *          (wasm/test/collection-data.test.mjs). It builds the departures
 *          fixture's train formation and service list exactly as
 *          test/collection_data/screens/screen_board.xml describes them,
 *          fills them through their own §9.2 API with the rows the test hands
 *          applyCollectionData(), and draws them as the bridge's renderFrame()
 *          does. Equal buffers mean the editor's fill path — the scene, the
 *          generated fill thunks and the bridge — puts rows into a widget
 *          exactly as a controller calling its methods does on the device.
 *
 * Description: Compiled only into the collection-data test Wasm
 *              (wasm/CMakeLists.txt), never into the framework or a project
 *              editor build. Test code, so it keeps its widgets, their row
 *              storage and the display as statics: one call renders one frame.
 *              The storage is declared as the generator declares it for
 *              screen_board.xml (§9.2), so both sides size their rows alike.
 *
 * Exported Functions (extern "C"):
 *     - renderReference():  Build, fill and draw the board; the frame buffer
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <cstdint>
#include <string>

#include "U8g2lib.h"
#include "memory_display.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_rows.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "wd_service_list.hpp"
#include "wd_train_formation.hpp"

namespace {

memory_display s_reference_display;

// The rows' storage, laid out as the generated unit lays it out for
// screen_board.xml: eight carriages of twelve bytes, and three service rows of
// four 24-character cells.
constexpr u8g2gl_rows_field kCarriageFields[] = {
    {0, 4, 1, U8G2GL_FIELD_INT},  {4, 1, 1, U8G2GL_FIELD_ENUM}, {5, 1, 1, U8G2GL_FIELD_BOOL},
    {6, 1, 1, U8G2GL_FIELD_BOOL}, {8, 4, 1, U8G2GL_FIELD_INT},
};
constexpr u8g2gl_rows_layout kCarriages = {kCarriageFields, 12, 5};
constexpr u8g2gl_rows_field kCellFields[] = {{0, 25, 4, U8G2GL_FIELD_STRING}};
constexpr u8g2gl_rows_layout kCells = {kCellFields, 100, 1};
alignas(4) uint8_t s_carriages[8 * 12];
alignas(4) uint8_t s_cells[3 * 100];

}  // namespace

extern "C" {

/**
 * @brief Build the board by hand, fill it with the test's rows, and draw it.
 *
 * The rows here are the ones collection-data.test.mjs passes to
 * applyCollectionData(); a change to one must be made to the other.
 *
 * @return The 128 × 64 frame buffer, valid until the next call; nullptr if the
 *         display could not be set up.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* renderReference() {
    // --- Step 1: The display, as the scene sizes it ---
    std::string error;
    if (!s_reference_display.setup(128, 64, &error)) {
        return nullptr;
    }

    // --- Step 2: The widgets, configured as screen_board.xml configures them ---
    static wd_train_formation formation;
    static wd_service_list services;
    formation.set_coords(0, 0, 128, 30);
    formation.set_font(u8g2_font_6x10_mr);
    formation.set_max_carriages(8);
    services.set_coords(0, 32, 128, 32);
    services.set_font(u8g2_font_6x10_mr);
    services.set_max_rows(3);
    services.set_max_cols(4);
    services.clear_columns();
    services.add_column(30, U8G2GL_ALIGN_LEFT);
    services.add_column(58, U8G2GL_ALIGN_LEFT);
    services.add_column(12, U8G2GL_ALIGN_CENTER);
    services.add_column(28, U8G2GL_ALIGN_RIGHT);
    formation.attach_rows(0, u8g2gl_rows(s_carriages, 8, &kCarriages));
    services.attach_rows(0, u8g2gl_rows(s_cells, 3, &kCells));

    // --- Step 3: The rows, through each widget's own ingestion API (§9.2) ---
    formation.begin();
    formation.add_carriage(1, "first", true, false, 40);
    formation.add_carriage(2, "standard", false, true, 85);
    formation.add_carriage(3, "standard", false, false, 10);
    formation.commit();
    const char* const rows[][4] = {
        {"10:02", "Reading", "4", "On time"},
        {"10:15", "Oxford", "1", "Exp 10:19"},
        {"10:31", "Didcot", "11", "Cancelled"},
    };
    services.begin();
    for (const auto& row : rows) {
        services.add_row(row, 4);
    }
    services.commit();

    // --- Step 4: Draw as renderFrame(0) does: tick, clear, each object in order ---
    u8g2gl_obj* const objs[] = {&formation, &services};
    const uint8_t parents[] = {U8G2GL_NO_PARENT, U8G2GL_NO_PARENT};
    for (u8g2gl_obj* obj : objs) {
        obj->tick(0);
    }
    U8G2& display = s_reference_display.u8g2();
    display.clearBuffer();
    for (uint8_t i = 0; i < 2; ++i) {
        u8g2gl_render_object(display, objs, parents, i);
    }
    return s_reference_display.buffer();
}

}  // extern "C"
