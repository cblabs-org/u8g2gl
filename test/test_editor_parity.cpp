/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_editor_parity.cpp
 * Purpose: The test that makes the two generation targets one ([UD-4], PR-04
 *          WO11; PROJECT.md, "Sharing is enforced by a test, not by intent").
 *          The committed compile fixture is rendered twice in one program: once
 *          by its generated firmware screen functions, and once by a host that
 *          builds the same screen from the generated scene description through
 *          the generated registry, knowing no element by name. The U8G2 stub's
 *          ordered call log must be identical. A thunk that spells a setter, an
 *          enumerator, an argument order or a default differently from firmware
 *          — or a scene that describes a property, style, parent or guard
 *          differently — makes the logs differ, and the failure names the first
 *          call that does.
 *
 *          Bound **text** is deliberately not asserted anywhere: a label never
 *          draws a bound subject's value in either target (PR-04 WO10
 *          stop-and-report 1, scheduled as WO10b). The logs are still compared
 *          whole, so when WO10b lands both targets must draw it identically.
 *
 * Description: Firmware state comes from the generated `ui_init()` and setters;
 *              the editor host owns its own subjects and is given the same
 *              values, because a scene describes subjects but supplies no values
 *              (ui_spec §4.1). One fresh host per case, since the runtime cannot
 *              remove a subject observer (see editor_host::build()).
 *
 *              Linked against u8g2gl_editor_runtime — the runtime compiled with
 *              U8G2GL_EDITOR and default capacities, because an editor builds
 *              scenes the document's counted pool was never sized for. The
 *              firmware units run on the same library in the same process, so
 *              both paths share one stub and one runtime; only the capacity
 *              macros differ between translation units, and those are read in
 *              exactly one runtime file (src/u8g2gl_obj.cpp, the pool), which the
 *              generated units never compile.
 */
#include <gtest/gtest.h>

#include <cstring>
#include <memory>

#include "ui.hpp"

#include "U8G2lib.h"
#include "call_log.h"
#include "editor_host.h"
#include "fixture_u8g2_fonts.h"
#include "u8g2gl/u8g2gl_editor.h"

namespace {

// ensure_firmware_initialised
// The generated ui_init(), once per program: it registers every firmware
// binding, and a second call would bind every static object again.
void ensure_firmware_initialised() {
    static bool initialised = false;
    if (!initialised) {
        ui_init();
        initialised = true;
    }
}

// The fixture's subject values for one case, applied to both targets.
struct fixture_values {
    const char* station = "Euston";
    const char* message = "On time";
    bool wifi = true;
    uint32_t time = 0;
    int32_t level = 10;
    bool show_panel = false;
};

// set_firmware
// Through the generated setters, as an application would.
void set_firmware(const fixture_values& v) {
    ensure_firmware_initialised();
    ui_set_station_name(v.station);
    ui_set_service_message(v.message);
    ui_set_wifi_connected(v.wifi);
    ui_set_system_time(v.time);
    ui_set_level(v.level);
    ui_set_show_panel(v.show_panel);
}

// editor_for
// A fresh host, loaded from the generated scene, given what a host supplies:
// the font and image data by the names the scene uses, and subject values.
// The image bytes are the fixture's compiled ones — the host may supply assets
// however it likes, and sharing them makes the bitmap pointer comparable.
std::unique_ptr<editor_host> editor_for(const fixture_values& v) {
    auto host = std::make_unique<editor_host>(ui_editor_registry());
    EXPECT_TRUE(host->load(U8G2GL_EDITOR_SCENE_PATH)) << host->error();
    host->provide_font("u8g2_font_6x10_mr", u8g2_font_6x10_mr);
    host->provide_font("u8g2_font_5x7_mr", u8g2_font_5x7_mr);
    host->provide_image("icon_wifi", ui_image_icon_wifi);
    EXPECT_TRUE(host->set_string("station_name", v.station));
    EXPECT_TRUE(host->set_string("service_message", v.message));
    EXPECT_TRUE(host->set_bool("wifi_connected", v.wifi));
    EXPECT_TRUE(host->set_time("system_time", v.time));
    EXPECT_TRUE(host->set_int("level", v.level));
    EXPECT_TRUE(host->set_bool("show_panel", v.show_panel));
    return host;
}

// same_screen
// Renders one screen both ways from the same values and compares the logs.
//   render_firmware — the generated ui_screen_<name>_render
//   screen          — its name in the scene
//   v               — the values both targets get
::testing::AssertionResult same_screen(void (*render_firmware)(U8G2&), const char* screen, const fixture_values& v,
                                       U8G2* firmware_out = nullptr) {
    set_firmware(v);
    U8G2 firmware;
    render_firmware(firmware);

    std::unique_ptr<editor_host> host = editor_for(v);
    if (!host->build(screen)) {
        return ::testing::AssertionFailure() << "the editor could not build '" << screen << "': " << host->error();
    }
    U8G2 editor;
    if (!host->render(editor)) {
        return ::testing::AssertionFailure() << "the editor could not render '" << screen << "': " << host->error();
    }
    if (firmware_out != nullptr) {
        *firmware_out = firmware;
    }
    return same_call_log(firmware, editor);
}

// count_op
// How many calls to `op` a stub logged.
int count_op(const U8G2& display, const char* op) {
    int n = 0;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        n += std::strcmp(display.call_log[i].op, op) == 0 ? 1 : 0;
    }
    return n;
}

}  // namespace

// --- §13.12's worked example ---

TEST(EditorParity, HomeScreenDrawsIdenticallyThroughTheRegistry) {
    fixture_values v;
    U8G2 firmware;
    EXPECT_TRUE(same_screen(ui_screen_home_render, "home", v, &firmware));
    // Not vacuous: the composite's three objects, the icon, the rule and msg all
    // reached the stub — five clipped objects and the full-width rule.
    EXPECT_EQ(count_op(firmware, "setClipWindow"), 5);
    EXPECT_EQ(count_op(firmware, "drawXBMP"), 1);
    EXPECT_EQ(count_op(firmware, "drawHLine"), 1);
}

TEST(EditorParity, HomeScreenWithTheIconHiddenByItsFlagBinding) {
    fixture_values v;
    v.wifi = false;
    U8G2 firmware;
    EXPECT_TRUE(same_screen(ui_screen_home_render, "home", v, &firmware));
    EXPECT_EQ(count_op(firmware, "drawXBMP"), 0);
    EXPECT_EQ(count_op(firmware, "setClipWindow"), 4);
}

// --- The static screen: bound width, segment, hidden container, guards ---

TEST(EditorParity, GaugesScreenWithThePanelHidden) {
    fixture_values v;
    U8G2 firmware;
    EXPECT_TRUE(same_screen(ui_screen_gauges_render, "gauges", v, &firmware));
    // The bound-width box, the upper-left dial and the pixel are drawn; the
    // hidden panel's line and label are not, and the hidden ghost never is.
    EXPECT_EQ(count_op(firmware, "drawBox"), 1);
    EXPECT_EQ(count_op(firmware, "drawCircle"), 1);
    EXPECT_EQ(count_op(firmware, "drawPixel"), 1);
    EXPECT_EQ(count_op(firmware, "drawHLine"), 0);
    EXPECT_EQ(count_op(firmware, "drawUTF8"), 0);
}

TEST(EditorParity, GaugesScreenWithThePanelShownAndTheBlipGuardedOff) {
    fixture_values v;
    v.show_panel = true;
    v.wifi = false;
    v.level = 30;
    U8G2 firmware;
    EXPECT_TRUE(same_screen(ui_screen_gauges_render, "gauges", v, &firmware));
    // Panel shown: its line and its right-aligned "Note" (a named style) draw;
    // the pixel's own guard now hides it; the box reads the new level.
    EXPECT_EQ(count_op(firmware, "drawHLine"), 1);
    EXPECT_EQ(count_op(firmware, "drawUTF8"), 1);
    EXPECT_EQ(count_op(firmware, "drawPixel"), 0);
    EXPECT_EQ(firmware.last_draw_box_w, 30);
}

TEST(EditorParity, TheSceneSuppliesNoSubjectValues) {
    // The host starts from zero values and must be given them (ui_spec §4.1):
    // editor_host::load() refuses a scene whose subjects carry a value, so a
    // successful load is the assertion.
    editor_host host(ui_editor_registry());
    EXPECT_TRUE(host.load(U8G2GL_EDITOR_SCENE_PATH)) << host.error();
}
