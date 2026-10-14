/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_clock.cpp
 *
 * Purpose: Verification suite for u8g2gl_clock widget. Validates default
 *          configuration, raw epoch seconds assignment and time decomposition,
 *          colon blink 1Hz animation state machine, blink disable behavior,
 *          HH_MM vs HH_MM_SS formats, dual-font baseline alignment, right-aligned
 *          digit columns, partial refresh hooks, polymorphism, and memory budget;
 *          the unknown-time display, the blink locked to time changes and
 *          scheduled drift-free; and, end to end, a clock bound to a
 *          u8g2gl_wall_clock and driven only by ui_handler() (§11.1).
 *
 * Description: GoogleTest test cases covering the complete specification of
 *              u8g2gl_clock.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_wall_clock.h"
#include "U8g2lib.h"
#include <cstdlib>
#include <iostream>
#include <string>

static const uint8_t s_primary_font[4] = { 0x01, 0x02, 0x03, 0x04 };
static const uint8_t s_secondary_font[4] = { 0x05, 0x06, 0x07, 0x08 };

TEST(Clock, DefaultConstruction) {
    u8g2gl_clock clock;

    EXPECT_TRUE(clock.is_blink_enabled());
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM);
    EXPECT_EQ(clock.get_time(), 0u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.get_secondary_font(), nullptr);
    EXPECT_FALSE(clock.is_dirty());
}

TEST(Clock, SetTime) {
    u8g2gl_clock clock;
    // 3661 seconds = 1 hour, 1 minute, 1 second -> 01:01:01
    clock.set_time(3661);
    EXPECT_EQ(clock.get_time(), 3661u);
    EXPECT_TRUE(clock.is_dirty());

    U8G2 display;
    clock.render(display);

    // In HH_MM mode: draws hour "01", colon ":", minute "01" (3 drawUTF8 calls)
    EXPECT_EQ(display.draw_utf8_count, 3);
    EXPECT_STREQ(display.last_draw_utf8_buf, "01");

    // In HH_MM_SS mode: draws hour "01", colon ":", minute "01", colon ":", second "01"
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    display.draw_utf8_count = 0;
    clock.render(display);
    EXPECT_EQ(display.draw_utf8_count, 5);
    EXPECT_STREQ(display.last_draw_utf8_buf, "01");
}

TEST(Clock, BlinkToggle) {
    u8g2gl_clock clock;

    // t=0: initial tick returns ~500ms deadline, colon remains visible
    uint32_t d0 = clock.tick(0);
    EXPECT_EQ(d0, 500u);
    EXPECT_TRUE(clock.is_colon_visible());

    // t=200: 200ms elapsed, 300ms remaining
    uint32_t d1 = clock.tick(200);
    EXPECT_EQ(d1, 300u);
    EXPECT_TRUE(clock.is_colon_visible());

    // t=500: 500ms elapsed, colon toggles off, returns 500ms
    uint32_t d2 = clock.tick(500);
    EXPECT_EQ(d2, 500u);
    EXPECT_FALSE(clock.is_colon_visible());
    EXPECT_TRUE(clock.is_dirty());

    // t=1000: 500ms elapsed since last toggle, colon toggles on again
    clock.clear_dirty();
    uint32_t d3 = clock.tick(1000);
    EXPECT_EQ(d3, 500u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_TRUE(clock.is_dirty());
}

TEST(Clock, BlinkDisabled) {
    u8g2gl_clock clock;
    clock.set_blink(false);

    EXPECT_FALSE(clock.is_blink_enabled());
    EXPECT_TRUE(clock.is_colon_visible());

    // With blink disabled, tick always returns U8G2GL_IDLE
    EXPECT_EQ(clock.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(clock.tick(500), U8G2GL_IDLE);
    EXPECT_EQ(clock.tick(1000), U8G2GL_IDLE);
    EXPECT_TRUE(clock.is_colon_visible());
}

TEST(Clock, SetFormat) {
    u8g2gl_clock clock;
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM);

    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM_SS);
    EXPECT_TRUE(clock.is_dirty());

    clock.clear_dirty();
    clock.set_format(U8G2GL_CLOCK_HH_MM);
    EXPECT_EQ(clock.get_format(), U8G2GL_CLOCK_HH_MM);
    EXPECT_TRUE(clock.is_dirty());
}

TEST(Clock, SecondaryFont) {
    u8g2gl_clock clock;
    clock.set_font(s_primary_font);
    clock.set_secondary_font(s_secondary_font);
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    clock.set_time(3661);

    EXPECT_EQ(clock.get_secondary_font(), s_secondary_font);

    U8G2 display;
    clock.render(display);

    // Rendered seconds use secondary font
    EXPECT_EQ(display.last_font, s_secondary_font);
}

TEST(Clock, ColonHiddenDoesNotDrawColon) {
    u8g2gl_clock clock;
    clock.set_time(3661);
    clock.set_format(U8G2GL_CLOCK_HH_MM);

    // Toggle colon off. The time change restarts the blink, so the cycle begins
    // at the first tick, and the colon goes off half a period later.
    clock.tick(0);
    clock.tick(500);
    EXPECT_FALSE(clock.is_colon_visible());

    U8G2 display;
    clock.render(display);

    // Only hours and minutes drawn when colon is hidden (2 drawUTF8 calls)
    EXPECT_EQ(display.draw_utf8_count, 2);
}

TEST(Clock, RenderAnimationUpdate) {
    u8g2gl_clock clock;
    clock.set_coords(0, 0, 64, 16);
    clock.set_time(3661);

    U8G2 display;
    // Initial call at t=0 does not toggle blink (elapsed = 0 < 500)
    clock.render_animation_update(display, 0);
    EXPECT_EQ(display.update_display_area_count, 0);

    // At t=500, colon toggles and triggers partial refresh
    clock.render_animation_update(display, 500);
    EXPECT_GT(display.update_display_area_count, 0);
}

TEST(Clock, InheritsFromObj) {
    u8g2gl_clock clock;
    clock.set_coords(10, 10, 60, 14);
    clock.set_time(7200); // 02:00:00

    u8g2gl_obj* obj = &clock;
    EXPECT_EQ(obj->get_x(), 10);
    EXPECT_EQ(obj->get_y(), 10);
    EXPECT_EQ(obj->get_w(), 60);
    EXPECT_EQ(obj->get_h(), 14);

    EXPECT_EQ(obj->tick(0), 500u);

    U8G2 display;
    obj->render(display);
    EXPECT_GT(display.draw_utf8_count, 0);
}

// PR-04 WO2: bind_time is the clock's primary binding (§6.3) and the call
// §13.12's generated code makes; it did not exist before this work order.
TEST(Clock, BindTimeRendersBoundSubject) {
    u8g2gl_subject_time subject(3661);   // 01:01:01
    u8g2gl_clock clock;
    ASSERT_TRUE(clock.bind_time(&subject));

    // The current value is applied at bind time, not on the first change.
    EXPECT_EQ(clock.get_time(), 3661u);
    EXPECT_TRUE(clock.is_dirty());

    U8G2 display;
    clock.render(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "01");

    // A change reaches the clock, marks it dirty, and is what renders.
    clock.clear_dirty();
    subject.set(7322);                   // 02:02:02
    EXPECT_EQ(clock.get_time(), 7322u);
    EXPECT_TRUE(clock.is_dirty());
    display.draw_utf8_count = 0;
    clock.render(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "02");

    // A re-notification of an unchanged value is not a repaint (§11.2).
    clock.clear_dirty();
    subject.notify();
    EXPECT_FALSE(clock.is_dirty());
}

TEST(Clock, BindTimeNotificationAfterDestructionIsSafe) {
    u8g2gl_subject_time subject(0);
    {
        u8g2gl_clock clock;
        ASSERT_TRUE(clock.bind_time(&subject));
    }
    // The destroyed clock's pool slot is inactive, so this must be a no-op
    // rather than a write through a dangling pointer.
    subject.set(60);
    SUCCEED();
}

// --- Unknown time ---

namespace {
/// The texts drawUTF8 received, in order, from the stub's call log.
std::string drawn_texts(const U8G2& display) {
    std::string out;
    for (int i = 0; i < display.call_log_count && i < U8G2::kCallLogCapacity; ++i) {
        const u8g2_stub_call& call = display.call_log[i];
        if (std::string(call.op) == "drawUTF8") {
            if (!out.empty()) {
                out += ' ';
            }
            out += call.text;
        }
    }
    return out;
}
}  // namespace

TEST(Clock, UnknownTimeRendersDashes) {
    u8g2gl_clock clock;
    clock.set_font(s_primary_font);
    clock.set_time(U8G2GL_TIME_UNKNOWN);

    U8G2 display;
    clock.render(display);
    EXPECT_EQ(drawn_texts(display), "-- : --");

    // HH:MM:SS dashes the seconds too, in the secondary font.
    clock.set_secondary_font(s_secondary_font);
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    U8G2 display_ss;
    clock.render(display_ss);
    EXPECT_EQ(drawn_texts(display_ss), "-- : -- : --");
    EXPECT_EQ(display_ss.last_font, s_secondary_font);
}

TEST(Clock, UnknownTimeKeepsTheDigitColumns) {
    // Proportional stub widths: "--" narrower than "00", as in most fonts.
    auto width = [](const char* text) -> int {
        const std::string t(text);
        if (t == "--") return 6;
        if (t == ":") return 2;
        return 10;   // "00" and every digit pair
    };
    u8g2gl_clock clock;
    clock.set_coords(0, 0, 64, 16);

    U8G2 known;
    known.custom_utf8_width = width;
    clock.set_time(3661);
    clock.render(known);

    U8G2 unknown;
    unknown.custom_utf8_width = width;
    clock.set_time(U8G2GL_TIME_UNKNOWN);
    clock.render(unknown);

    // Same colon position, and each "--" right-aligned in its "00" slot, so the
    // layout does not jump when the time arrives.
    ASSERT_EQ(known.call_log_count, unknown.call_log_count);
    for (int i = 0; i < known.call_log_count; ++i) {
        if (std::string(known.call_log[i].op) != "drawUTF8") {
            continue;
        }
        const bool is_colon = std::string(known.call_log[i].text) == ":";
        const int32_t expected_shift = is_colon ? 0 : 4;   // 10 - 6
        EXPECT_EQ(unknown.call_log[i].args[0] - known.call_log[i].args[0], expected_shift)
            << "call " << i << " '" << unknown.call_log[i].text << "'";
        EXPECT_EQ(unknown.call_log[i].args[1], known.call_log[i].args[1]);
    }
}

TEST(Clock, UnknownTimeHoldsTheColonSteady) {
    u8g2gl_clock clock;
    clock.tick(0);
    clock.tick(500);
    ASSERT_FALSE(clock.is_colon_visible());

    clock.set_time(U8G2GL_TIME_UNKNOWN);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(600), U8G2GL_IDLE);
    EXPECT_EQ(clock.tick(1100), U8G2GL_IDLE);
    EXPECT_TRUE(clock.is_colon_visible());

    // The time arriving starts the blink, colon first.
    clock.set_time(60);
    EXPECT_EQ(clock.tick(1200), 500u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(1700), 500u);
    EXPECT_FALSE(clock.is_colon_visible());
}

// --- Blink locked to the value, scheduled drift-free ---

TEST(Clock, BlinkRestartsOnValueChange) {
    u8g2gl_clock clock;
    clock.tick(0);
    clock.tick(500);
    ASSERT_FALSE(clock.is_colon_visible());

    clock.clear_dirty();
    clock.set_time(1);                 // a new second arrives mid-cycle
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_TRUE(clock.is_dirty());
    EXPECT_EQ(clock.tick(700), 500u);  // the cycle restarts from this tick
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(1199), 1u);
    EXPECT_EQ(clock.tick(1200), 500u);
    EXPECT_FALSE(clock.is_colon_visible());

    // An unchanged value is not a change: the cycle carries on.
    clock.set_time(1);
    EXPECT_EQ(clock.tick(1300), 400u);
    EXPECT_FALSE(clock.is_colon_visible());
}

TEST(Clock, BindingUpdateRestartsBlink) {
    u8g2gl_subject_time subject(10);
    u8g2gl_clock clock;
    ASSERT_TRUE(clock.bind_time(&subject));
    clock.tick(0);
    clock.tick(500);
    ASSERT_FALSE(clock.is_colon_visible());

    subject.set(11);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(510), 500u);
}

TEST(Clock, BlinkIsDriftFree) {
    u8g2gl_clock clock;
    uint32_t now = 0;
    uint32_t sleep_ms = clock.tick(now);
    int toggles = 0;
    bool colon = clock.is_colon_visible();
    uint32_t lcg = 99;
    while (toggles < 1000) {
        lcg = lcg * 1103515245u + 12345u;
        now += sleep_ms + (lcg >> 16) % 4;   // wake 0..3 ms late
        sleep_ms = clock.tick(now);
        ASSERT_NE(sleep_ms, 0u);
        if (clock.is_colon_visible() != colon) {
            colon = clock.is_colon_visible();
            ++toggles;
            // Toggle k is due at 500 k; lateness never accumulates.
            const uint32_t ideal = 500u * static_cast<uint32_t>(toggles);
            ASSERT_GE(now, ideal);
            ASSERT_LE(now - ideal, 3u) << "toggle " << toggles;
        }
    }
}

TEST(Clock, BlinkResyncsAfterStallWithOneToggle) {
    u8g2gl_clock clock;
    clock.tick(0);                            // next toggle due at 500
    EXPECT_EQ(clock.tick(1750), 500u);        // 1250 ms late: one toggle, resync
    EXPECT_FALSE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(2000), 250u);
    EXPECT_FALSE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(2250), 500u);
    EXPECT_TRUE(clock.is_colon_visible());
}

TEST(Clock, BlinkSurvivesTickWraparound) {
    u8g2gl_clock clock;
    clock.tick(UINT32_MAX - 199u);             // next toggle due at 300 after the wrap
    EXPECT_EQ(clock.tick(UINT32_MAX), 301u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(300), 500u);
    EXPECT_FALSE(clock.is_colon_visible());
}

TEST(Clock, TickNeverReturnsZero) {
    u8g2gl_clock clock;
    uint32_t now = 0;
    uint32_t lcg = 4242;
    for (int i = 0; i < 20000; ++i) {
        lcg = lcg * 1103515245u + 12345u;
        now += (lcg >> 16) % 700;             // anything from on time to stalled
        if (i % 97 == 0) {
            clock.set_time(static_cast<uint32_t>(i));
        }
        ASSERT_NE(clock.tick(now), 0u) << "at " << now;
    }
}

TEST(Clock, ReenablingBlinkRestartsTheCycle) {
    u8g2gl_clock clock;
    clock.set_blink(false);
    EXPECT_EQ(clock.tick(0), U8G2GL_IDLE);
    clock.set_blink(true);
    EXPECT_EQ(clock.tick(1234), 500u);
    EXPECT_TRUE(clock.is_colon_visible());
    EXPECT_EQ(clock.tick(1734), 500u);
    EXPECT_FALSE(clock.is_colon_visible());
}

// --- End to end: a clock bound to a wall clock, driven only by ui_handler() ---
//
// The failure this guards: a clock whose seconds were drawn 260 ms after the
// second changed with blink on, and never drawn at all with blink off once the
// application honoured U8G2GL_IDLE. Here the "application" does nothing but
// call ui_handler() and sleep for exactly what it returns (plus 0..1 ms of
// wake-up lateness). Every new second must be drawn within 1 ms of its
// boundary on the host's clock, none skipped, none repeated — with the blink
// on and with it off.

namespace {

uint32_t s_e2e_now = 0;
uint64_t s_e2e_host_offset_ms = 0;
uint32_t s_e2e_known_from = 0;   // host time unknown before this tick
u8g2gl_clock* s_e2e_clock = nullptr;

uint32_t e2e_tick() {
    return s_e2e_now;
}

uint64_t e2e_host_ms() {
    return s_e2e_host_offset_ms + s_e2e_now;
}

bool e2e_host_time(uint32_t* epoch_seconds, uint16_t* millis_into_second) {
    if (s_e2e_now < s_e2e_known_from) {
        return false;   // NTP not synced yet
    }
    *epoch_seconds = static_cast<uint32_t>(e2e_host_ms() / 1000u);
    *millis_into_second = static_cast<uint16_t>(e2e_host_ms() % 1000u);
    return true;
}

uint32_t e2e_screen_tick(uint32_t now_ms) {
    return s_e2e_clock->tick(now_ms);
}

void e2e_screen_render(U8G2& display) {
    s_e2e_clock->render(display);
}

void run_clock_end_to_end(bool blink) {
    // --- Arrange: tick, host clock (370 ms into a second), wall clock, clock ---
    s_e2e_now = 0;
    s_e2e_host_offset_ms = 1700000000ull * 1000u + 370u;
    s_e2e_known_from = 2500;                  // time unknown for the first 2.5 s
    u8g2gl_set_tick_cb(e2e_tick);

    u8g2gl_subject_time_n<2> subject(0);
    u8g2gl_clock clock;
    clock.set_coords(0, 0, 128, 16);
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    clock.set_blink(blink);
    ASSERT_TRUE(clock.bind_time(&subject));
    s_e2e_clock = &clock;

    u8g2gl_wall_clock wall_clock;
    u8g2gl_wall_clock_init(&wall_clock, &subject, e2e_host_time);

    u8g2gl_screen screen{};
    screen.tick_fn = e2e_screen_tick;
    screen.render_fn = e2e_screen_render;
    u8g2gl_set_active_screen(&screen);

    // --- Act and assert: the loop is ui_handler() and a sleep, nothing else ---
    U8G2 display;
    std::string shown;                         // seconds text on the display
    int seconds_drawn = 0;
    int last_second = -1;
    int frames = 0;
    uint32_t lcg = blink ? 11u : 22u;
    while (s_e2e_now < 125000u) {
        const int sends_before = display.send_count;
        const uint32_t sleep_ms = ui_handler(display);
        ASSERT_NE(sleep_ms, U8G2GL_IDLE) << "the loop would sleep forever at " << s_e2e_now;
        ASSERT_NE(sleep_ms, 0u) << "the loop would spin at " << s_e2e_now;

        if (display.send_count != sends_before) {
            ++frames;
            const std::string now_shown(display.last_draw_utf8_buf);
            if (now_shown != shown) {
                shown = now_shown;
                if (shown != "--") {
                    const int second = std::atoi(shown.c_str());
                    if (last_second >= 0) {
                        ASSERT_EQ(second, (last_second + 1) % 60)
                            << "skipped or repeated at tick " << s_e2e_now;
                    }
                    last_second = second;
                    ++seconds_drawn;
                    // Drawn within 1 ms of the boundary of the second it shows.
                    const uint32_t late_ms = static_cast<uint32_t>(e2e_host_ms() % 1000u);
                    if (seconds_drawn > 1) {   // the first is the sync instant
                        ASSERT_LE(late_ms, 1u) << "second " << second << " drawn late";
                    }
                }
            }
        }
        lcg = lcg * 1103515245u + 12345u;
        s_e2e_now += sleep_ms + (lcg >> 16) % 2;
    }

    // Unknown first, then every second from the sync to the end of the run.
    EXPECT_GE(seconds_drawn, 121);
    EXPECT_LE(seconds_drawn, 124);
    // Blink on redraws twice a second; off, once — the wall clock alone keeps
    // the off case drawing.
    if (blink) {
        EXPECT_GE(frames, 2 * 121);
    } else {
        EXPECT_LE(frames, 126);
    }

    u8g2gl_set_active_screen(nullptr);
    u8g2gl_set_tick_cb(nullptr);
    s_e2e_clock = nullptr;
}

}  // namespace

TEST(ClockEndToEnd, WallClockDrivesSecondsWithBlinkOn) {
    run_clock_end_to_end(true);
}

TEST(ClockEndToEnd, WallClockDrivesSecondsWithBlinkOff) {
    run_clock_end_to_end(false);
}

TEST(ClockEndToEnd, UnknownTimeIsDrawnAsDashesUntilSynced) {
    s_e2e_now = 0;
    s_e2e_host_offset_ms = 1700000000ull * 1000u;
    s_e2e_known_from = 2500;
    u8g2gl_set_tick_cb(e2e_tick);

    u8g2gl_subject_time_n<2> subject(0);
    u8g2gl_clock clock;
    clock.set_format(U8G2GL_CLOCK_HH_MM_SS);
    ASSERT_TRUE(clock.bind_time(&subject));
    s_e2e_clock = &clock;
    u8g2gl_wall_clock wall_clock;
    u8g2gl_wall_clock_init(&wall_clock, &subject, e2e_host_time);
    u8g2gl_screen screen{};
    screen.tick_fn = e2e_screen_tick;
    screen.render_fn = e2e_screen_render;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    EXPECT_EQ(ui_handler(display), 1000u);    // unknown: retry in a second
    EXPECT_STREQ(display.last_draw_utf8_buf, "--");
    s_e2e_now = 2000;
    ui_handler(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "--");
    s_e2e_now = 3000;                          // synced since 2500
    ui_handler(display);
    EXPECT_STREQ(display.last_draw_utf8_buf, "23");   // 1700000003 s: hh:mm:23

    u8g2gl_set_active_screen(nullptr);
    u8g2gl_set_tick_cb(nullptr);
    s_e2e_clock = nullptr;
}

TEST(Clock, SizeOf) {
    std::cout << "\n================ u8g2gl_clock SIZEOF REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):   " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_clock): " << sizeof(u8g2gl_clock) << " bytes" << std::endl;
    std::cout << "===========================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_clock", std::to_string(sizeof(u8g2gl_clock)));

    EXPECT_LE(sizeof(u8g2gl_clock), 88u);
}
