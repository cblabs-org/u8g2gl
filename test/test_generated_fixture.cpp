/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_generated_fixture.cpp
 *
 * Purpose: The compile layer (design_spec §17.1, PR-04 WO10). Everything else in
 *          the C++ suite tests the runtime against hand-written code; this runs
 *          code the generator wrote. The fixture under test/generated_fixture/
 *          is §13.12's worked example plus a static screen, and its generated/
 *          directory is committed output, so a defect in emission surfaces here
 *          as a failing test rather than in the first real firmware build.
 *
 *          Three claims are checked from the running program:
 *          - the generated capacities reached the **runtime library's own**
 *            compilation, not just the generated units ([D-21], WO4 F5);
 *          - objects render through u8g2gl_render_object(), so a hidden object
 *            or a hidden container's children never draw (§11.3, WO4 F7), and a
 *            draw call under a hidden container obeys its build-time guard
 *            (§13.5);
 *          - the dirty gate works on generated screens: a subject change redraws
 *            once, and a static screen then idles ([D-15], §11.2).
 *
 * Description: GoogleTest cases driving the generated ui_init(), subject setters
 *              and screen descriptors through ui_handler(), asserting on the
 *              U8G2 stub's draw-call counters and last-argument fields. Linked
 *              against u8g2gl_fixture_runtime — the runtime compiled with the
 *              generated config forced in — never against `u8g2gl`.
 */
#include <gtest/gtest.h>

#include "ui.hpp"

#include "capacity_probe.h"
#include "U8G2lib.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"

#include <cstdint>
#include <string>

namespace {

// The fixture's own counts, from test/generated_fixture/ (capacity_probe.cpp
// counts the bindings line by line). Held here as the test's expectation of the
// generator, so a change to what is counted fails a test that names it.
constexpr uint32_t kFixtureTotalBindings = 5;
constexpr uint32_t kFixtureBindingsPerObject = 1;
constexpr uint32_t kFixtureObjectsOnBusiestScreen = 5;  // home: bar and its three children, msg

// What u8g2gl_config.h would have given a library built without the generated
// header: 32 objects x 8 bindings. The capacity tests assert the library is not
// on it, so a dropped forced include cannot pass them by coincidence.
constexpr uint32_t kDefaultTotalBindings = 32u * 8u;

// A clock the tests control, so tick deadlines are reproducible.
uint32_t s_now_ms = 1000;
uint32_t fixture_now() {
    return s_now_ms;
}

// ensure_ui_initialised
// Runs the generated ui_init() exactly once for the whole test program. It
// registers every binding in the shared pool; a second call would try to bind
// every object again and, the pool being exact, fail — which is correct runtime
// behaviour but not what these tests are about.
void ensure_ui_initialised() {
    static bool initialised = false;
    if (!initialised) {
        u8g2gl_set_tick_cb(fixture_now);
        ui_init();
        initialised = true;
    }
}

// show
// Makes a screen active and settles it: one frame is drawn, so a test starts
// from a clean dirty flag. Returns the display the frame went to.
void show(u8g2gl_screen& screen, U8G2& display) {
    ensure_ui_initialised();
    u8g2gl_set_active_screen(&screen);
    ui_handler(display);
}

}  // namespace

// --- [D-21]: the generated capacities reach the library build ---

TEST(GeneratedFixture, CapacitiesReachTheRuntimeLibrarysOwnCompilation) {
    // Read from a translation unit compiled into the library target beside
    // src/u8g2gl_obj.cpp, where s_binding_pool is sized — not from this file,
    // which would see the generated header whether or not the library did.
    EXPECT_EQ(u8g2gl_fixture_library_total_bindings(), kFixtureTotalBindings);
    EXPECT_EQ(u8g2gl_fixture_library_bindings_per_obj(), kFixtureBindingsPerObject);
    EXPECT_EQ(u8g2gl_fixture_library_objects_per_screen(), kFixtureObjectsOnBusiestScreen);
    EXPECT_NE(u8g2gl_fixture_library_total_bindings(), kDefaultTotalBindings);
}

TEST(GeneratedFixture, GeneratedUnitsSeeTheSameCapacitiesAsTheLibrary) {
    // The generated header is also what ui.hpp includes first; a mismatch
    // between the two views would be an ODR hazard in the pools' users.
    static_assert(U8G2GL_MAX_TOTAL_BINDINGS == kFixtureTotalBindings,
                  "the fixture's pool is not the counted total");
    EXPECT_EQ(static_cast<uint32_t>(U8G2GL_MAX_TOTAL_BINDINGS), u8g2gl_fixture_library_total_bindings());
}

TEST(GeneratedFixture, UiInitFillsTheBindingPoolExactly) {
    // Behavioural proof, through the library's own pool: after ui_init() every
    // slot the document counted is taken, so one more binding — on a fresh
    // object, with a subject that has room — is refused. On a library built
    // with the default pool of 256 this bind would succeed.
    ensure_ui_initialised();
    u8g2gl_subject_int_n<1> spare(0);
    u8g2gl_obj probe;
    EXPECT_FALSE(probe.bind_x(&spare));
}

// --- §13.12: the worked example generates, compiles and renders ---

TEST(GeneratedFixture, WorkedExampleRendersEveryObjectThroughTheWrapper) {
    ensure_ui_initialised();
    ui_set_wifi_connected(true);
    ui_set_service_message("On time");
    U8G2 display;
    u8g2gl_set_active_screen(&ui_screen_home);

    ui_handler(display);

    EXPECT_EQ(display.clear_count, 1);
    EXPECT_EQ(display.send_count, 1);
    // One clip window per visible object — bar, bar_location, bar_wifi_icon,
    // bar_clock, msg — and each reset afterwards. A direct obj.render() call
    // would set none (u8g2gl_render_object, §11.3).
    EXPECT_EQ(display.set_clip_window_count, 5);
    EXPECT_EQ(display.max_clip_window_count, 5);
    // "rule" is a bare draw call at the display's full width (§13.12).
    EXPECT_EQ(display.draw_hline_count, 1);
    EXPECT_EQ(display.last_draw_hline_x, 0);
    EXPECT_EQ(display.last_draw_hline_y, 11);
    EXPECT_EQ(display.last_draw_hline_w, 128);
    // The wifi icon is shown while connected.
    EXPECT_EQ(display.draw_xbmp_count, 1);
    // msg's text is not asserted: u8g2gl_label::render() draws only set_text()
    // text and never reads a bound string subject, so a bind_text label draws
    // nothing whatever the generator emits. That is a runtime gap, recorded in
    // the PR-04 WO10 Completion Report rather than worked round here.
    //
    // msg is the last object drawn, in document order: the last clip set is its
    // own bounds (0, 16, 128 x 12), far corner exclusive.
    EXPECT_EQ(display.last_clip_x0, 0);
    EXPECT_EQ(display.last_clip_y0, 16);
    EXPECT_EQ(display.last_clip_x1, 128);
    EXPECT_EQ(display.last_clip_y1, 28);
}

TEST(GeneratedFixture, FlagBindingHidesAnObjectThroughTheWrapper) {
    U8G2 first;
    ui_set_wifi_connected(true);
    show(ui_screen_home, first);
    ASSERT_EQ(first.draw_xbmp_count, 1);

    // bind_flag_if_eq(wifi_connected, 0, hidden): disconnecting hides the icon,
    // and the binding marks the frame dirty.
    ui_set_wifi_connected(false);
    U8G2 second;
    ui_handler(second);

    EXPECT_EQ(second.send_count, 1);
    EXPECT_EQ(second.draw_xbmp_count, 0);
    EXPECT_EQ(second.set_clip_window_count, 4);  // bar_wifi_icon skipped
    ui_set_wifi_connected(true);
}

// --- A static screen: a subject change redraws once, then idles ---

TEST(GeneratedFixture, StaticScreenRedrawsOnceOnASubjectChangeThenIdles) {
    ui_set_level(10);
    U8G2 display;
    show(ui_screen_gauges, display);
    ASSERT_EQ(display.send_count, 1);
    // level_bar is §8.4's bound-width box: a draw call reading the subject.
    EXPECT_EQ(display.last_draw_box_x, 4);
    EXPECT_EQ(display.last_draw_box_y, 20);
    EXPECT_EQ(display.last_draw_box_w, 10);
    EXPECT_EQ(display.last_draw_box_h, 6);

    // Nothing on this screen animates, and nothing changed: no frame, and the
    // loop may sleep until something external happens.
    EXPECT_EQ(ui_handler(display), U8G2GL_IDLE);
    EXPECT_EQ(display.send_count, 1);

    // level is read only by a draw call, so the frame-dirty observer ui_init()
    // registered is the only thing that can schedule this frame (§13.5).
    ui_set_level(30);
    EXPECT_EQ(ui_handler(display), U8G2GL_IDLE);
    EXPECT_EQ(display.send_count, 2);
    EXPECT_EQ(display.last_draw_box_w, 30);

    // And then idles again.
    EXPECT_EQ(ui_handler(display), U8G2GL_IDLE);
    EXPECT_EQ(display.send_count, 2);

    // Setting the value it already has is not a change.
    ui_set_level(30);
    ui_handler(display);
    EXPECT_EQ(display.send_count, 2);
}

// --- Hidden things do not draw ---

TEST(GeneratedFixture, HiddenContainerHidesItsDrawCallAndItsObject) {
    ui_set_show_panel(false);
    U8G2 hidden;
    show(ui_screen_gauges, hidden);

    // panel is hidden, so its draw-call child "edge" fails its build-time guard
    // and its object child "note" fails the wrapper's ancestor walk. The only
    // other label, ghost, is hidden outright. So no line and no text at all.
    EXPECT_EQ(hidden.draw_hline_count, 0);
    EXPECT_EQ(hidden.draw_utf8_count, 0);

    // The control: showing the panel draws both children, at the container's
    // absolute position (panel at 0,30; edge at its 0,0; note at its 0,2).
    ui_set_show_panel(true);
    U8G2 shown;
    ui_handler(shown);
    EXPECT_EQ(shown.send_count, 1);
    EXPECT_EQ(shown.draw_hline_count, 1);
    EXPECT_EQ(shown.last_draw_hline_x, 0);
    EXPECT_EQ(shown.last_draw_hline_y, 30);
    EXPECT_EQ(shown.last_draw_hline_w, 60);
    EXPECT_EQ(shown.draw_utf8_count, 1);
    EXPECT_EQ(std::string(shown.last_draw_utf8_buf), "Note");
    ui_set_show_panel(false);
}

TEST(GeneratedFixture, HiddenObjectIsNeverDrawn) {
    // ghost carries hidden="true" and nothing unhides it. Were its render()
    // called directly rather than through u8g2gl_render_object(), "Ghost" would
    // be drawn here. The panel is shown so that a label *is* drawn, which makes
    // "Ghost" being absent a statement about ghost rather than about text.
    ui_set_show_panel(true);
    U8G2 display;
    show(ui_screen_gauges, display);
    EXPECT_EQ(display.draw_utf8_count, 1);
    EXPECT_EQ(std::string(display.last_draw_utf8_buf), "Note");
    ui_set_show_panel(false);
}

TEST(GeneratedFixture, DrawCallWithABoundHiddenFlagObeysItsGuard) {
    // blip: <bind_flag_if_eq subject="wifi_connected" ref_value="false" flag="hidden"/>
    ui_set_wifi_connected(true);
    U8G2 connected;
    show(ui_screen_gauges, connected);
    EXPECT_EQ(connected.draw_pixel_count, 1);
    EXPECT_EQ(connected.last_draw_pixel_x, 120);
    EXPECT_EQ(connected.last_draw_pixel_y, 2);

    ui_set_wifi_connected(false);
    U8G2 disconnected;
    ui_handler(disconnected);
    EXPECT_EQ(disconnected.send_count, 1);
    EXPECT_EQ(disconnected.draw_pixel_count, 0);
    ui_set_wifi_connected(true);
}

TEST(GeneratedFixture, CircleDrawsTheSegmentTheDocumentNamed) {
    // segments="upper_left" reaches the runtime as its enumerator, which mirrors
    // U8G2's own option bit (u8g2gl_draw.h), through the manifest's emit=.
    U8G2 display;
    show(ui_screen_gauges, display);
    EXPECT_EQ(display.draw_circle_count, 1);
    EXPECT_EQ(display.last_draw_circle_x, 100);
    EXPECT_EQ(display.last_draw_circle_y, 40);
    EXPECT_EQ(display.last_draw_circle_r, 10);
    EXPECT_EQ(display.last_draw_circle_option, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);
}
