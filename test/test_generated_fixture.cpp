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
 *            once, and a static screen then idles ([D-15], §11.2);
 *          - a label the generator bound with bind_text draws its subject's
 *            text, and a new value (PR-04 WO10b; before it, a bound label drew
 *            nothing at all).
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
#include "fixture_u8g2_fonts.h"
#include "U8g2lib.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace {

// The fixture's own counts, from test/generated_fixture/ (capacity_probe.cpp
// counts the bindings line by line). Held here as the test's expectation of the
// generator, so a change to what is counted fails a test that names it.
constexpr uint32_t kFixtureTotalBindings = 7;
constexpr uint32_t kFixtureBindingsPerObject = 1;
constexpr uint32_t kFixtureObjectsOnBusiestScreen = 9;  // bounds: a slider, the <convert> image, a box and six labels, two of them on <bdf> fonts (home has 5)

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

// drawn_texts
// Every drawUTF8 text the stub's ordered call log recorded, in call order. The
// log copies the text, so a value formatted on a widget's stack is still there.
std::vector<std::string> drawn_texts(const U8G2& display) {
    std::vector<std::string> texts;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        if (std::strcmp(display.call_log[i].op, "drawUTF8") == 0) {
            texts.emplace_back(display.call_log[i].text);
        }
    }
    return texts;
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
    EXPECT_FALSE(probe.bind_x(&spare, 0));
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

// --- Bound text (PR-04 WO10b): the Chief Architect's acceptance test (2) ---

TEST(GeneratedFixture, BoundLabelsDrawTheirSubjectsText) {
    // The generated fixture binds two labels with bind_text: msg to
    // service_message directly, and the status bar's location to station_name
    // through the composite's $title_subject. Both must draw the subject's
    // value; the clock draws its time between them, so the texts are matched
    // by value, in document order.
    ensure_ui_initialised();
    ui_set_station_name("Euston");
    ui_set_service_message("On time");
    U8G2 display;
    show(ui_screen_home, display);

    const std::vector<std::string> drawn = drawn_texts(display);
    ASSERT_GE(drawn.size(), 2u);
    EXPECT_EQ(drawn.front(), "Euston");   // bar_location, first object with text
    EXPECT_EQ(drawn.back(), "On time");   // msg, the last object drawn

    // A new value is drawn on the next frame, and only then: the binding marks
    // the frame dirty.
    ui_set_service_message("Delayed");
    U8G2 next;
    ui_handler(next);
    EXPECT_EQ(next.send_count, 1);
    const std::vector<std::string> redrawn = drawn_texts(next);
    ASSERT_FALSE(redrawn.empty());
    EXPECT_EQ(redrawn.back(), "Delayed");
    ui_set_service_message("On time");
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

// --- The Chief Architect's emission rulings of 2026-09-19 (PR-04 WO10b) ---

namespace {

// logged
// Every call to `op` the stub logged, in order.
std::vector<u8g2_stub_call> logged(const U8G2& display, const char* op) {
    std::vector<u8g2_stub_call> calls;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        if (std::strcmp(display.call_log[i].op, op) == 0) {
            calls.push_back(display.call_log[i]);
        }
    }
    return calls;
}

// drawn_with
// The drawUTF8 call that drew `text`, and the font and font mode last set
// before it — what that label rendered with. Fails the test if it never drew.
struct drawn_label {
    int32_t x = -1;
    const void* font = nullptr;
    int32_t font_mode = -1;
};
drawn_label drawn_with(const U8G2& display, const char* text) {
    drawn_label found;
    const void* font = nullptr;
    int32_t font_mode = -1;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        const u8g2_stub_call& call = display.call_log[i];
        if (std::strcmp(call.op, "setFont") == 0) {
            font = call.pointer;
        } else if (std::strcmp(call.op, "setFontMode") == 0) {
            font_mode = call.args[0];
        } else if (std::strcmp(call.op, "drawUTF8") == 0 && std::strcmp(call.text, text) == 0) {
            found.x = call.args[0];
            found.font = font;
            found.font_mode = font_mode;
            return found;
        }
    }
    ADD_FAILURE() << "nothing drew \"" << text << "\"";
    return found;
}

}  // namespace

TEST(GeneratedFixture, ConvertedImageIsDrawnLikeAnXbm) {
    // logo_mark is a <convert>, converted from a PNG at generate
    // time, and reaches the display through the same set_src() / drawXBMP path
    // an <xbm> does — one bitmap, at the position and size the screen gave it.
    U8G2 display;
    show(ui_screen_bounds, display);

    const std::vector<u8g2_stub_call> bitmaps = logged(display, "drawXBMP");
    ASSERT_EQ(bitmaps.size(), 1u);
    EXPECT_EQ(bitmaps[0].args[0], 8);   // logo: x
    EXPECT_EQ(bitmaps[0].args[1], 4);   // y
    EXPECT_EQ(bitmaps[0].args[2], 16);  // width
    EXPECT_EQ(bitmaps[0].args[3], 16);  // height
}

TEST(GeneratedFixture, BoundPositionsAreContainerRelative) {
    // Ruling 1 (§7.2, [D-20] amendment): track sits at x=40. Its knob (a draw
    // call) and readout (an object) are bound to knob_x = 5, so both are at 45;
    // dot, directly on the screen and bound to the same subject, is at 5.
    ui_set_knob_x(5);
    U8G2 display;
    show(ui_screen_bounds, display);

    const std::vector<u8g2_stub_call> boxes = logged(display, "drawBox");
    ASSERT_EQ(boxes.size(), 2u);
    EXPECT_EQ(boxes[0].args[0], 45);   // track_knob: 40 + 5
    EXPECT_EQ(boxes[0].args[1], 10);
    EXPECT_EQ(boxes[1].args[0], 5);    // dot: 0 + 5
    EXPECT_EQ(boxes[1].args[1], 40);
    EXPECT_EQ(drawn_with(display, "K").x, 45);   // track_readout: bind_x(&knob_x, 40)

    // The origin stays with the binding: a new value moves all three.
    ui_set_knob_x(12);
    U8G2 moved;
    ui_handler(moved);
    EXPECT_EQ(moved.send_count, 1);
    const std::vector<u8g2_stub_call> moved_boxes = logged(moved, "drawBox");
    ASSERT_EQ(moved_boxes.size(), 2u);
    EXPECT_EQ(moved_boxes[0].args[0], 52);
    EXPECT_EQ(moved_boxes[1].args[0], 12);
    EXPECT_EQ(drawn_with(moved, "K").x, 52);
    ui_set_knob_x(5);
}

TEST(GeneratedFixture, ABoundPositionClampsTheSameWhicheverWayItIsRealised) {
    // PR-4R WO4, design_spec §13.5 (final paragraph) and [D-18]: realisation is
    // a generator outcome, so it must not be observable. track's knob and
    // readout carry the same binding, bind_x="$position" (knob_x), inside the
    // same container (track, x=40), and are realised differently: knob is a
    // draw call, readout an object. They cannot be one class today — a drawing
    // element has no class to be an object of, and the §13.5 conditions that
    // would force one (<event_cb>, <focus_ring>) are refused until PR-09 — so
    // the comparison is of the position each realisation resolves the binding
    // to: the object's clamped x, and the x the draw call hands U8G2.
    //
    // Out of range, the object path clamps the **sum** into int16_t (Chief
    // Architect, 2026-09-19). Before WO4 the draw call passed 40 + 40000 to an
    // int16_t parameter and it wrapped: U8G2 was given 40040 where the object
    // stood at 32767, and for 40 - 40000 it was given 25576 — on screen —
    // where the object stood at -32768. dot, on the screen itself (origin 0),
    // wrapped the same way, to 40000 and 25536.
    //
    // At the extremes the object is clipped out by its container and draws
    // nothing; the draw call is off-screen in the same direction and U8G2 draws
    // nothing of it. In range both draw, at the same x (the control).
    struct bound_case {
        int32_t value;
        int16_t knob_x;   // origin 40, clamped
        int16_t dot_x;    // origin 0, clamped
    };
    const bound_case cases[] = {
        {5, 45, 5},                      // in range: agrees before and after WO4
        {40000, INT16_MAX, INT16_MAX},   // 40 + 40000 = 40040, beyond int16_t
        {-40000, INT16_MIN, INT16_MIN},  // 40 - 40000 = -39960, beyond int16_t
    };
    const u8g2gl_obj* readout = ui_screen_bounds.objs[1];  // ui_obj_track_readout
    for (const bound_case& c : cases) {
        SCOPED_TRACE(c.value);
        ui_set_knob_x(c.value);
        U8G2 display;
        show(ui_screen_bounds, display);

        // The object path: bind_x(&knob_x, 40), clamped by the runtime.
        EXPECT_EQ(readout->get_x(), c.knob_x);

        // The draw-call path reaches U8G2 at the same x, through the position
        // conversion u8g2gl_draw_box() applies to any x.
        const std::vector<u8g2_stub_call> boxes = logged(display, "drawBox");
        ASSERT_EQ(boxes.size(), 2u);
        EXPECT_EQ(boxes[0].args[0], u8g2gl_coord_pos(readout->get_x()));  // track_knob
        EXPECT_EQ(boxes[0].args[0], u8g2gl_coord_pos(c.knob_x));
        EXPECT_EQ(boxes[1].args[0], u8g2gl_coord_pos(c.dot_x));  // dot
    }

    // The control, drawn by both: the object's recorded text is at the knob's x.
    ui_set_knob_x(5);
    U8G2 display;
    show(ui_screen_bounds, display);
    EXPECT_EQ(drawn_with(display, "K").x, logged(display, "drawBox")[0].args[0]);
}

TEST(GeneratedFixture, IntBoundLabelDrawsItsFormattedValue) {
    // temp: bind_text="temperature" bind_text_fmt="%d°C".
    ui_set_temperature(21);
    U8G2 display;
    show(ui_screen_bounds, display);
    EXPECT_EQ(drawn_with(display, "21°C").font, static_cast<const void*>(ui_font_u8g2_font_6x10_mr));

    ui_set_temperature(-3);
    U8G2 colder;
    ui_handler(colder);
    EXPECT_EQ(colder.send_count, 1);
    drawn_with(colder, "-3°C");
    ui_set_temperature(21);
}

TEST(GeneratedFixture, AFontWhoseU8G2NameCarriesCapitalsIsUsable) {
    // PR-04 WO14, the owner's ruling of 2026-09-28: every U8G2 font must be
    // usable, including the 522 whose names carry capitals. `caps` names
    // u8g2_font_helvR08_tr, which §13.4's lowercase identifier rule would have
    // refused before UNKNOWN_FONT ever saw it.
    //
    // That this file compiles and links is half the proof: the alias is declared
    // in ui.hpp, defined in ui_fonts.cpp against U8G2's own spelling, and passed
    // to set_font() in ui_screen_bounds.cpp, so any disagreement between the
    // three -- a case-folded alias, most obviously -- is a build failure rather
    // than a wrong pixel. This assertion is the other half: the label really is
    // drawn with that font's table and not with another.
    U8G2 display;
    show(ui_screen_bounds, display);
    const drawn_label caps = drawn_with(display, "Caps");
    EXPECT_EQ(caps.font, static_cast<const void*>(ui_font_u8g2_font_helvR08_tr));
    EXPECT_NE(caps.font, static_cast<const void*>(ui_font_u8g2_font_6x10_mr));
    EXPECT_EQ(static_cast<const void*>(ui_font_u8g2_font_helvR08_tr),
              static_cast<const void*>(u8g2_font_helvR08_tr));
}

TEST(GeneratedFixture, ElementsOwnAttributesWinOverANamedStyle) {
    // Ruling 3 (§10): style "loud" sets font 5x7, align center and font_mode
    // transparent. own_font writes font 6x10 itself, and ends with 6x10; the
    // style's align and font_mode, which own_font does not set, still apply.
    U8G2 display;
    show(ui_screen_bounds, display);
    const drawn_label own = drawn_with(display, "Own");
    EXPECT_EQ(own.font, static_cast<const void*>(ui_font_u8g2_font_6x10_mr));
    EXPECT_NE(own.font, static_cast<const void*>(ui_font_u8g2_font_5x7_mr));
    EXPECT_EQ(own.x, 64 + 60 / 2);   // centred by the style; the stub measures text as 0 wide
    EXPECT_EQ(own.font_mode, U8G2GL_FONT_MODE_TRANSPARENT);

    // override's inline style_align="right" wins over the style's center.
    const drawn_label overridden = drawn_with(display, "Ovr");
    EXPECT_EQ(overridden.x, 64 + 60);
    EXPECT_EQ(overridden.font, static_cast<const void*>(ui_font_u8g2_font_6x10_mr));
}
