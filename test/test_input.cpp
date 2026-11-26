/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_input.cpp
 *
 * Purpose: Proves the §12 input model in real U8G2 pixels: what each event does
 *          to focus, what a press reaches, how the screen stack returns, and
 *          that a focus style comes and goes without leaving a trace. Focus is
 *          visible state on a device with no other feedback, so a defect here
 *          is a screen that looks focused when it is not, or one that never
 *          recovers its look.
 *
 * Description: Compiles the runtime against real U8G2's headers and links its C
 *              sources and fonts, as test_style_border.cpp does, and drives
 *              hand-built screen descriptors — the tables the generator emits —
 *              through u8g2gl_dispatch(). Covers:
 *              - focus movement: forward and back, skipping hidden (by itself
 *                or an ancestor) and disabled members, wrap on and off, a ring
 *                with no focusable member, and a screen with no ring;
 *              - press and long press reaching the right action, and a
 *                callback receiving its target and trigger;
 *              - the switch: a press toggles it and writes its bound subject,
 *                and value_changed fires for input, never for a setter;
 *              - the screen stack: load, back, back on an empty stack, and a
 *                full stack dropping the oldest entry, with focus restored;
 *              - focus_style applied on focus and undone pixel for pixel on
 *                losing it, with a property the element set itself surviving
 *                both; the §10 precedence fix for apply_style();
 *              - the button: inverted while focused, and an `invert`-styled
 *                button drawing what it drew before focus existed.
 */
#include <gtest/gtest.h>

#include <U8g2lib.h>

#include <array>
#include <cstring>

#include "u8g2gl/u8g2gl_button.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_input.h"
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_style.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_switch.h"

namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;
constexpr size_t kBufferBytes = kDisplayWidth * kDisplayHeight / 8;

using frame_t = std::array<uint8_t, kBufferBytes>;

// A real U8G2 C++ object over a full frame buffer, with no hardware behind it.
class real_display {
public:
    real_display() {
        // --- Step 1: The body of u8g2_Setup_ssd1306_128x64_noname_f() ---
        // Copied from u8g2_d_setup.c rather than linked, for the reason
        // test_rbox_bound.cpp gives: that file pulls in every display driver.
        u8g2_t* u8g2 = display_.getU8g2();
        uint8_t tile_buf_height = 0;
        u8g2_SetupDisplay(u8g2, u8x8_d_ssd1306_128x64_noname, u8x8_cad_001,
                          u8x8_byte_empty, u8x8_dummy_cb);
        uint8_t* buf = u8g2_m_16_8_f(&tile_buf_height);
        u8g2_SetupBuffer(u8g2, buf, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);

        // --- Step 2: Initialise and clear, as a frame does ---
        u8g2_InitDisplay(u8g2);
        display_.clearBuffer();
    }

    // Renders a screen's objects the way a generated render function does, and
    // copies the frame out: u8g2_m_16_8_f() returns one shared static buffer.
    frame_t render(const u8g2gl_screen& screen) {
        display_.clearBuffer();
        for (uint8_t i = 0; i < screen.obj_count; ++i) {
            u8g2gl_render_object(display_, screen.objs, screen.parents, i);
        }
        frame_t out{};
        std::memcpy(out.data(), display_.getBufferPtr(), kBufferBytes);
        return out;
    }

private:
    U8G2 display_;
};

// lit_pixels
// Every set pixel in a frame, so a test can say a frame is not blank.
size_t lit_pixels(const frame_t& f) {
    size_t count = 0;
    for (uint8_t byte : f) {
        for (int bit = 0; bit < 8; ++bit) {
            count += (byte >> bit) & 1;
        }
    }
    return count;
}

// A screen descriptor over a fixed object array, as generated code emits one.
// Objects are top-level unless a test sets a parent.
template <size_t N>
struct test_screen {
    std::array<u8g2gl_obj*, N> objs{};
    std::array<uint8_t, N> parents{};
    u8g2gl_screen screen{};

    test_screen() {
        parents.fill(U8G2GL_NO_PARENT);
        screen.objs = objs.data();
        screen.parents = parents.data();
        screen.obj_count = static_cast<uint8_t>(N);
    }

    // Deactivates the screen if it is still active, while its objects (declared
    // before it) are alive: the runtime reads the outgoing screen on a switch.
    ~test_screen() {
        if (u8g2gl_get_active_screen() == &screen) {
            u8g2gl_set_active_screen(nullptr);
        }
    }

    test_screen(const test_screen&) = delete;
    test_screen& operator=(const test_screen&) = delete;

    void set_ring(const u8g2gl_focus_stop* ring, uint8_t count, bool wrap) {
        screen.ring = ring;
        screen.ring_count = count;
        screen.ring_wrap = wrap;
    }

    void set_events(const u8g2gl_obj_event* events, uint8_t count) {
        screen.events = events;
        screen.event_count = count;
    }
};

// What the test callbacks saw, in order.
struct callback_record {
    u8g2gl_obj* target;
    u8g2gl_trigger_t trigger;
};
std::array<callback_record, 16> s_calls{};
size_t s_call_count = 0;
bool s_value_seen_by_press = false;
u8g2gl_switch* s_watched_switch = nullptr;

void record_callback(u8g2gl_obj& target, u8g2gl_trigger_t trigger) {
    if (s_call_count < s_calls.size()) {
        s_calls[s_call_count] = {&target, trigger};
    }
    ++s_call_count;
    if (s_watched_switch != nullptr && trigger == U8G2GL_TRIGGER_PRESS) {
        s_value_seen_by_press = s_watched_switch->get_value();
    }
}

// Each test starts with no active screen, an empty stack and no calls, and
// leaves the same, so no test sees another's state.
class Input : public ::testing::Test {
protected:
    void SetUp() override { reset(); }
    void TearDown() override { reset(); }

    static void reset() {
        u8g2gl_set_active_screen(nullptr);
        u8g2gl_screen_stack_clear();
        s_call_count = 0;
        s_value_seen_by_press = false;
        s_watched_switch = nullptr;
    }
};

// Three buttons in a column, ringed in order: the screen most tests use.
struct three_buttons {
    u8g2gl_button a, b, c;
    test_screen<3> t;
    std::array<u8g2gl_focus_stop, 3> ring{{{nullptr, 0}, {nullptr, 1}, {nullptr, 2}}};

    explicit three_buttons(bool wrap) {
        a.set_coords(0, 0, 40, 12);
        b.set_coords(0, 14, 40, 12);
        c.set_coords(0, 28, 40, 12);
        a.set_border_width(1);
        b.set_border_width(1);
        c.set_border_width(1);
        t.objs = {&a, &b, &c};
        t.set_ring(ring.data(), 3, wrap);
    }
};

}  // namespace

// --- Focus movement ---

TEST_F(Input, ActivateFocusesTheFirstFocusableMemberAndMovesBothWays) {
    three_buttons s(false);
    u8g2gl_set_active_screen(&s.t.screen);
    EXPECT_EQ(u8g2gl_get_focused(), &s.a);
    EXPECT_TRUE(s.a.is_focused());

    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.b);
    EXPECT_FALSE(s.a.is_focused());
    EXPECT_TRUE(s.b.is_focused());

    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_NEXT));
    EXPECT_EQ(u8g2gl_get_focused(), &s.c);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CCW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.b);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PREV));
    EXPECT_EQ(u8g2gl_get_focused(), &s.a);
}

TEST_F(Input, UnwrappedRingDoesNothingPastEitherEnd) {
    three_buttons s(false);
    u8g2gl_set_active_screen(&s.t.screen);
    EXPECT_FALSE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CCW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.a);

    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    EXPECT_FALSE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.c);
}

TEST_F(Input, WrappedRingWrapsAtBothEnds) {
    three_buttons s(true);
    u8g2gl_set_active_screen(&s.t.screen);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CCW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.c);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.a);
}

TEST_F(Input, MovingSkipsHiddenAndDisabledMembers) {
    three_buttons s(true);
    u8g2gl_set_active_screen(&s.t.screen);

    s.b.set_hidden(true);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.c);

    s.b.set_hidden(false);
    s.b.set_disabled(true);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CCW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.a);
    EXPECT_FALSE(s.b.is_focused());
}

TEST_F(Input, MovingSkipsAMemberWhoseAncestorIsHidden) {
    // The ring's second member sits inside `box`; hiding the box hides it.
    u8g2gl_label box;
    u8g2gl_button a, b, inner;
    box.set_coords(0, 14, 60, 24);
    a.set_coords(0, 0, 40, 12);
    b.set_coords(0, 40, 40, 12);
    inner.set_coords(2, 16, 20, 10);
    test_screen<4> nested;
    nested.objs = {&a, &box, &inner, &b};
    nested.parents = {U8G2GL_NO_PARENT, U8G2GL_NO_PARENT, 1, U8G2GL_NO_PARENT};
    const u8g2gl_focus_stop ring[] = {{nullptr, 0}, {nullptr, 2}, {nullptr, 3}};
    nested.set_ring(ring, 3, false);
    box.set_hidden(true);

    u8g2gl_set_active_screen(&nested.screen);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_EQ(u8g2gl_get_focused(), &b);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, RingWithNoFocusableMemberFocusesNothing) {
    three_buttons s(true);
    s.a.set_disabled(true);
    s.b.set_hidden(true);
    s.c.set_disabled(true);
    u8g2gl_set_active_screen(&s.t.screen);
    EXPECT_EQ(u8g2gl_get_focused(), nullptr);
    EXPECT_FALSE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_FALSE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CCW));
    EXPECT_FALSE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS));
    EXPECT_EQ(u8g2gl_get_focused(), nullptr);

    // A member that becomes focusable is reached by the next move.
    s.b.set_hidden(false);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW));
    EXPECT_EQ(u8g2gl_get_focused(), &s.b);
}

TEST_F(Input, ScreenWithNoRingIgnoresEveryEvent) {
    u8g2gl_button a;
    a.set_coords(0, 0, 40, 12);
    test_screen<1> t;
    t.objs = {&a};
    // An event table without a ring: nothing can be focused, so nothing fires.
    const u8g2gl_obj_event events[] = {
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
    };
    t.set_events(events, 1);
    u8g2gl_set_active_screen(&t.screen);

    real_display real;
    const frame_t before = real.render(t.screen);
    t.screen.dirty = false;
    for (uint8_t e = U8G2GL_EVENT_NONE; e <= U8G2GL_EVENT_BUTTON_PREV; ++e) {
        EXPECT_FALSE(u8g2gl_dispatch(static_cast<u8g2gl_event_t>(e)));
    }
    EXPECT_EQ(s_call_count, 0u);
    EXPECT_FALSE(a.is_focused());
    EXPECT_FALSE(t.screen.dirty);
    EXPECT_EQ(real.render(t.screen), before);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, AFocusChangeMarksBothObjectsDirty) {
    three_buttons s(false);
    u8g2gl_set_active_screen(&s.t.screen);
    s.a.clear_dirty();
    s.b.clear_dirty();
    s.c.clear_dirty();
    s.t.screen.dirty = false;

    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    EXPECT_TRUE(s.a.is_dirty());
    EXPECT_TRUE(s.b.is_dirty());
    EXPECT_FALSE(s.c.is_dirty());
    EXPECT_TRUE(s.t.screen.dirty);
}

// --- Press and long press ---

TEST_F(Input, PressAndLongPressReachTheirOwnEventsOnTheFocusedElement) {
    three_buttons s(false);
    const u8g2gl_obj_event events[] = {
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
        {nullptr, record_callback, 1, U8G2GL_TRIGGER_LONG_PRESS, U8G2GL_ACTION_CALLBACK},
    };
    s.t.set_events(events, 2);
    u8g2gl_set_active_screen(&s.t.screen);

    // --- a has only a press event: a long press reaches it and runs nothing ---
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_LONG_PRESS));
    EXPECT_EQ(s_call_count, 0u);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CLICK));
    ASSERT_EQ(s_call_count, 1u);
    EXPECT_EQ(s_calls[0].target, &s.a);
    EXPECT_EQ(s_calls[0].trigger, U8G2GL_TRIGGER_PRESS);

    // --- b has only a long press ---
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    EXPECT_EQ(s_call_count, 1u);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_LONG_CLICK);
    ASSERT_EQ(s_call_count, 2u);
    EXPECT_EQ(s_calls[1].target, &s.b);
    EXPECT_EQ(s_calls[1].trigger, U8G2GL_TRIGGER_LONG_PRESS);
}

TEST_F(Input, OneCallbackServesSeveralElementsAndTriggers) {
    three_buttons s(false);
    const u8g2gl_obj_event events[] = {
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_LONG_PRESS, U8G2GL_ACTION_CALLBACK},
        {nullptr, record_callback, 2, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
    };
    s.t.set_events(events, 3);
    u8g2gl_set_active_screen(&s.t.screen);

    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_LONG_PRESS);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    ASSERT_EQ(s_call_count, 3u);
    EXPECT_EQ(s_calls[0].target, &s.a);
    EXPECT_EQ(s_calls[0].trigger, U8G2GL_TRIGGER_PRESS);
    EXPECT_EQ(s_calls[1].target, &s.a);
    EXPECT_EQ(s_calls[1].trigger, U8G2GL_TRIGGER_LONG_PRESS);
    EXPECT_EQ(s_calls[2].target, &s.c);
    EXPECT_EQ(s_calls[2].trigger, U8G2GL_TRIGGER_PRESS);
}

TEST_F(Input, AMemberDisabledWhileFocusedTakesNoPress) {
    three_buttons s(false);
    const u8g2gl_obj_event events[] = {
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
    };
    s.t.set_events(events, 1);
    u8g2gl_set_active_screen(&s.t.screen);
    s.a.set_disabled(true);
    EXPECT_FALSE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS));
    EXPECT_EQ(s_call_count, 0u);
}

// --- The switch (§12.3, Q2a) ---

TEST_F(Input, PressTogglesABoundSwitchThroughItsSubject) {
    u8g2gl_subject_bool enabled;
    enabled.set(false);
    u8g2gl_switch sw, mirror;
    sw.set_coords(0, 0, 24, 12);
    mirror.set_coords(30, 0, 24, 12);
    ASSERT_TRUE(sw.bind_value(&enabled));
    ASSERT_TRUE(mirror.bind_value(&enabled));
    test_screen<2> t;
    t.objs = {&sw, &mirror};
    const u8g2gl_focus_stop ring[] = {{nullptr, 0}};
    t.set_ring(ring, 1, false);
    u8g2gl_set_active_screen(&t.screen);

    real_display real;
    const frame_t off = real.render(t.screen);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS));
    EXPECT_TRUE(enabled.get());
    EXPECT_TRUE(sw.get_value());
    EXPECT_TRUE(mirror.get_value());  // every other binding of the subject follows
    const frame_t on = real.render(t.screen);
    EXPECT_NE(on, off);

    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CLICK));
    EXPECT_FALSE(enabled.get());
    EXPECT_EQ(real.render(t.screen), off);

    // A long press is not a toggle.
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_LONG_PRESS);
    EXPECT_FALSE(enabled.get());
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, PressTogglesAnUnboundSwitch) {
    u8g2gl_switch sw;
    sw.set_coords(0, 0, 24, 12);
    test_screen<1> t;
    t.objs = {&sw};
    const u8g2gl_focus_stop ring[] = {{nullptr, 0}};
    t.set_ring(ring, 1, false);
    u8g2gl_set_active_screen(&t.screen);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    EXPECT_TRUE(sw.get_value());
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, ValueChangedFiresForInputButNeverForASetter) {
    u8g2gl_subject_bool enabled;
    u8g2gl_switch sw;
    sw.set_coords(0, 0, 24, 12);
    ASSERT_TRUE(sw.bind_value(&enabled));
    test_screen<1> t;
    t.objs = {&sw};
    const u8g2gl_focus_stop ring[] = {{nullptr, 0}};
    t.set_ring(ring, 1, false);
    const u8g2gl_obj_event events[] = {
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_VALUE_CHANGED, U8G2GL_ACTION_CALLBACK},
    };
    t.set_events(events, 2);
    s_watched_switch = &sw;
    u8g2gl_set_active_screen(&t.screen);

    // --- Input: the toggle, then press, then value_changed ---
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    ASSERT_EQ(s_call_count, 2u);
    EXPECT_EQ(s_calls[0].trigger, U8G2GL_TRIGGER_PRESS);
    EXPECT_TRUE(s_value_seen_by_press);  // the toggle ran before the press callback
    EXPECT_EQ(s_calls[1].trigger, U8G2GL_TRIGGER_VALUE_CHANGED);
    EXPECT_EQ(s_calls[1].target, &sw);

    // --- The application's own writes (ui_set_…) change the value silently ---
    enabled.set(false);
    sw.set_value(true);
    EXPECT_EQ(s_call_count, 2u);
    u8g2gl_set_active_screen(nullptr);
}

// --- Navigation (§12.3) ---

namespace {

// A screen of two ringed buttons whose second, when pressed, loads `next` (or
// goes back when `next` is null); its first, when long-pressed, goes back.
struct nav_screen {
    u8g2gl_button first, second;
    test_screen<2> t;
    std::array<u8g2gl_focus_stop, 2> ring{{{nullptr, 0}, {nullptr, 1}}};
    std::array<u8g2gl_obj_event, 2> events{};

    nav_screen() {
        first.set_coords(0, 0, 40, 12);
        second.set_coords(0, 14, 40, 12);
        t.objs = {&first, &second};
        t.set_ring(ring.data(), 2, false);
    }

    void loads(u8g2gl_screen* next) {
        events[0] = {nullptr, nullptr, 0, U8G2GL_TRIGGER_LONG_PRESS, U8G2GL_ACTION_SCREEN_BACK};
        events[1] = {next, nullptr, 1, U8G2GL_TRIGGER_PRESS,
                     next != nullptr ? U8G2GL_ACTION_SCREEN_LOAD : U8G2GL_ACTION_SCREEN_BACK};
        t.set_events(events.data(), 2);
    }
};

}  // namespace

TEST_F(Input, LoadPushesAndBackRestoresTheScreenAndItsFocus) {
    nav_screen home, detail;
    home.loads(&detail.t.screen);
    detail.loads(nullptr);
    u8g2gl_set_active_screen(&home.t.screen);

    // --- Load from home's second member ---
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS));
    EXPECT_EQ(u8g2gl_get_active_screen(), &detail.t.screen);
    EXPECT_EQ(u8g2gl_screen_stack_depth(), 1u);
    EXPECT_EQ(u8g2gl_get_focused(), &detail.first);  // the target's first member
    EXPECT_FALSE(home.second.is_focused());          // focus left the old screen

    // --- Back from detail's first member (a long press) ---
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_LONG_PRESS);
    EXPECT_EQ(u8g2gl_get_active_screen(), &home.t.screen);
    EXPECT_EQ(u8g2gl_screen_stack_depth(), 0u);
    EXPECT_EQ(u8g2gl_get_focused(), &home.second);   // restored, not the first
    EXPECT_FALSE(detail.first.is_focused());
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, BackOnAnEmptyStackDoesNothing) {
    nav_screen home;
    home.loads(nullptr);
    u8g2gl_set_active_screen(&home.t.screen);
    EXPECT_FALSE(u8g2gl_screen_back());
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    EXPECT_TRUE(u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS));  // the press reached it
    EXPECT_EQ(u8g2gl_get_active_screen(), &home.t.screen);
    EXPECT_EQ(u8g2gl_get_focused(), &home.second);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, BackFallsToTheFirstMemberWhenTheRememberedOneIsGone) {
    nav_screen home, detail;
    home.loads(&detail.t.screen);
    detail.loads(nullptr);
    u8g2gl_set_active_screen(&home.t.screen);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);

    home.second.set_hidden(true);  // while home is off screen
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_LONG_PRESS);
    EXPECT_EQ(u8g2gl_get_active_screen(), &home.t.screen);
    EXPECT_EQ(u8g2gl_get_focused(), &home.first);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, AFullStackDropsTheOldestEntry) {
    static_assert(U8G2GL_SCREEN_STACK_DEPTH == 4, "this test walks the default depth");
    std::array<nav_screen, 6> screens;
    for (size_t i = 0; i + 1 < screens.size(); ++i) {
        screens[i].loads(&screens[i + 1].t.screen);
    }
    screens[5].loads(nullptr);
    u8g2gl_set_active_screen(&screens[0].t.screen);

    // --- Five loads, each from the second member: 0 is dropped ---
    for (size_t i = 0; i < 5; ++i) {
        u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
        u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    }
    EXPECT_EQ(u8g2gl_get_active_screen(), &screens[5].t.screen);
    EXPECT_EQ(u8g2gl_screen_stack_depth(), 4u);

    // --- Four backs return through 4, 3, 2 and 1, each focus restored ---
    for (size_t i = 4; i >= 1; --i) {
        EXPECT_TRUE(u8g2gl_screen_back());
        EXPECT_EQ(u8g2gl_get_active_screen(), &screens[i].t.screen);
        EXPECT_EQ(u8g2gl_get_focused(), &screens[i].second);
    }
    EXPECT_FALSE(u8g2gl_screen_back());
    EXPECT_EQ(u8g2gl_get_active_screen(), &screens[1].t.screen);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, EventsAfterAScreenChangeDoNotRun) {
    nav_screen home, detail;
    const u8g2gl_obj_event events[] = {
        {&detail.t.screen, nullptr, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_SCREEN_LOAD},
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
    };
    home.t.set_events(events, 2);
    u8g2gl_set_active_screen(&home.t.screen);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    EXPECT_EQ(u8g2gl_get_active_screen(), &detail.t.screen);
    EXPECT_EQ(s_call_count, 0u);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, CallbackBeforeALoadRunsWithItsTarget) {
    nav_screen home, detail;
    const u8g2gl_obj_event events[] = {
        {nullptr, record_callback, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK},
        {&detail.t.screen, nullptr, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_SCREEN_LOAD},
    };
    home.t.set_events(events, 2);
    u8g2gl_set_active_screen(&home.t.screen);
    u8g2gl_dispatch(U8G2GL_EVENT_BUTTON_PRESS);
    ASSERT_EQ(s_call_count, 1u);
    EXPECT_EQ(s_calls[0].target, &home.first);
    EXPECT_EQ(u8g2gl_get_active_screen(), &detail.t.screen);
    u8g2gl_set_active_screen(nullptr);
}

// --- focus_style and the §10 precedence fix ---

TEST_F(Input, ApplyStyleDoesNotOverwriteAPropertyTheElementSetItself) {
    u8g2gl_style style;
    style.set_radius(5);
    style.set_padding(3);
    u8g2gl_label label;
    label.set_radius(1);
    label.apply_style(style);
    EXPECT_EQ(label.get_resolved_style().radius, 1);
    EXPECT_EQ(label.get_resolved_style().padding, 3);

    // At init styles come first (§13.7), so the element's setter wins anyway.
    u8g2gl_label at_init;
    at_init.apply_style(style);
    at_init.set_radius(1);
    EXPECT_EQ(at_init.get_resolved_style().radius, 1);
    EXPECT_EQ(at_init.get_resolved_style().padding, 3);
}

TEST_F(Input, FocusStyleIsAppliedOnFocusAndUndonePixelForPixel) {
    // --- Arrange: two labels, the first with a base style and a focus style ---
    u8g2gl_style base;
    base.set_font(u8g2_font_6x10_tf);
    base.set_padding(2);
    u8g2gl_style selected;
    selected.set_border(true);
    selected.set_radius(4);
    selected.set_padding(6);

    u8g2gl_label item, other;
    item.set_coords(4, 4, 60, 14);
    other.set_coords(4, 24, 60, 14);
    item.apply_style(base);   // init order: styles, then properties (§13.7)
    other.apply_style(base);
    item.set_text("Wi-Fi");
    other.set_text("Display");
    item.set_radius(1);       // the element's own: the focus style must not move it

    test_screen<2> t;
    t.objs = {&other, &item};
    const u8g2gl_focus_stop ring[] = {{nullptr, 0}, {&selected, 1}};
    t.set_ring(ring, 2, false);

    real_display real;
    const frame_t never_focused = real.render(t.screen);
    const u8g2gl_style style_before = item.get_resolved_style();
    ASSERT_GT(lit_pixels(never_focused), 0u);

    // --- Act and assert: focus applies the style, the own radius survives ---
    u8g2gl_set_active_screen(&t.screen);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    ASSERT_EQ(u8g2gl_get_focused(), &item);
    EXPECT_TRUE(item.get_resolved_style().border);
    EXPECT_EQ(item.get_resolved_style().padding, 6);
    EXPECT_EQ(item.get_resolved_style().radius, 1);
    const frame_t focused = real.render(t.screen);
    EXPECT_NE(focused, never_focused);

    // The focused look is exactly the label configured that way by hand.
    u8g2gl_label reference;
    reference.set_coords(4, 4, 60, 14);
    reference.set_font(u8g2_font_6x10_tf);
    reference.set_padding(6);
    reference.set_border(true);
    reference.set_radius(1);
    reference.set_text("Wi-Fi");
    test_screen<2> by_hand;
    by_hand.objs = {&other, &reference};
    u8g2gl_set_active_screen(nullptr);  // render with nothing else focused
    EXPECT_EQ(real.render(by_hand.screen), focused);

    // --- Losing focus restores the style and the pixels exactly ---
    u8g2gl_set_active_screen(&t.screen);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CW);
    ASSERT_EQ(u8g2gl_get_focused(), &item);
    u8g2gl_dispatch(U8G2GL_EVENT_ENCODER_CCW);
    ASSERT_EQ(u8g2gl_get_focused(), &other);
    const u8g2gl_style& after = item.get_resolved_style();
    EXPECT_EQ(after.set_mask, style_before.set_mask);
    EXPECT_EQ(after.font, style_before.font);
    EXPECT_EQ(after.padding, 2);
    EXPECT_EQ(after.radius, 1);
    EXPECT_FALSE(after.border);
    EXPECT_EQ(real.render(t.screen), never_focused);
    u8g2gl_set_active_screen(nullptr);
}

TEST_F(Input, ASetterCalledWhileFocusedSurvivesTheRestore) {
    u8g2gl_style selected;
    selected.set_border(true);
    u8g2gl_label item;
    item.set_coords(0, 0, 40, 12);
    test_screen<1> t;
    t.objs = {&item};
    const u8g2gl_focus_stop ring[] = {{&selected, 0}};
    t.set_ring(ring, 1, false);
    u8g2gl_set_active_screen(&t.screen);
    item.set_padding(5);
    u8g2gl_set_active_screen(nullptr);
    EXPECT_FALSE(item.get_resolved_style().border);
    EXPECT_EQ(item.get_resolved_style().padding, 5);
}

// --- The button (Q3a) ---

TEST_F(Input, AFocusedButtonDrawsInverted) {
    u8g2gl_button plain, styled;
    plain.set_coords(10, 10, 50, 14);
    styled.set_coords(10, 10, 50, 14);
    plain.set_border_width(1);
    styled.set_border_width(1);
    u8g2gl_style invert;
    invert.set_invert(true);
    styled.apply_style(invert);

    test_screen<1> plain_screen, styled_screen;
    plain_screen.objs = {&plain};
    styled_screen.objs = {&styled};
    real_display real;
    const frame_t unfocused = real.render(plain_screen.screen);
    const frame_t inverted = real.render(styled_screen.screen);
    ASSERT_NE(unfocused, inverted);

    const u8g2gl_focus_stop ring[] = {{nullptr, 0}};
    plain_screen.set_ring(ring, 1, false);
    u8g2gl_set_active_screen(&plain_screen.screen);
    ASSERT_TRUE(plain.is_focused());
    EXPECT_EQ(real.render(plain_screen.screen), inverted);

    u8g2gl_set_active_screen(nullptr);
    EXPECT_EQ(real.render(plain_screen.screen), unfocused);
}

TEST_F(Input, AnInvertStyledButtonIsUnchangedByFocus) {
    u8g2gl_button styled;
    styled.set_coords(10, 10, 50, 14);
    styled.set_border_width(1);
    u8g2gl_style invert;
    invert.set_invert(true);
    styled.apply_style(invert);
    test_screen<1> t;
    t.objs = {&styled};
    real_display real;
    const frame_t before = real.render(t.screen);

    const u8g2gl_focus_stop ring[] = {{nullptr, 0}};
    t.set_ring(ring, 1, false);
    u8g2gl_set_active_screen(&t.screen);
    EXPECT_EQ(real.render(t.screen), before);
    u8g2gl_set_active_screen(nullptr);
    EXPECT_EQ(real.render(t.screen), before);
}

TEST_F(Input, ADisabledButtonIsNeverDrawnFocused) {
    u8g2gl_button b;
    b.set_coords(10, 10, 50, 14);
    b.set_border_width(1);
    test_screen<1> t;
    t.objs = {&b};
    real_display real;
    const frame_t unfocused = real.render(t.screen);
    const u8g2gl_focus_stop ring[] = {{nullptr, 0}};
    t.set_ring(ring, 1, false);
    u8g2gl_set_active_screen(&t.screen);
    b.set_disabled(true);  // disabled while focused
    EXPECT_EQ(real.render(t.screen), unfocused);
    u8g2gl_set_active_screen(nullptr);
}
