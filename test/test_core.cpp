/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_core.cpp
 *
 * Purpose: Verifies the frame: tick-source registration, screen activation,
 *          the dirty gate around sendBuffer(), deadline aggregation, and the
 *          two calls generated code makes into the frame — the per-object
 *          render wrapper (§11.3) and the frame-dirty subject observer (§13.5).
 *
 * Description: GoogleTest cases against the U8G2 stub, which records draw
 *              state, clip calls and buffer operations.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_progress_bar.h"
#include "u8g2gl/u8g2gl_style.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "U8g2lib.h"
#include <iostream>
#include <string>

// --- Mock widget subclass for testing ---
class mock_widget : public u8g2gl_obj {
public:
    uint32_t next_deadline = U8G2GL_IDLE;
    int tick_count = 0;
    int render_count = 0;
    uint32_t last_tick_time = 0;

    uint32_t tick(uint32_t now_ms) override {
        tick_count++;
        last_tick_time = now_ms;
        return next_deadline;
    }

    void render(U8G2& /*display*/) override {
        render_count++;
    }
};

// Mock tick source
static uint32_t s_mock_time = 0;
static uint32_t mock_millis() {
    return s_mock_time;
}

// Global counters for function pointer callbacks
static int s_activate_count = 0;
static int s_deactivate_count = 0;
static int s_activate_b_count = 0;
static int s_render_count = 0;
static mock_widget s_widget1;
static mock_widget s_widget2;

static void cb_activate() {
    s_activate_count++;
}

static void cb_deactivate() {
    s_deactivate_count++;
}

static void cb_activate_b() {
    s_activate_b_count++;
}

static void cb_render(U8G2& /*display*/) {
    s_render_count++;
}

static uint32_t cb_tick_single(uint32_t now_ms) {
    return s_widget1.tick(now_ms);
}

static uint32_t cb_tick_two(uint32_t now_ms) {
    uint32_t d1 = s_widget1.tick(now_ms);
    uint32_t d2 = s_widget2.tick(now_ms);
    return u8g2gl_min(d1, d2);
}

// Test Fixture: resets global state between tests
class Core : public ::testing::Test {
protected:
    void SetUp() override {
        u8g2gl_set_tick_cb(nullptr);
        u8g2gl_set_active_screen(nullptr);
        s_mock_time = 0;
        s_activate_count = 0;
        s_deactivate_count = 0;
        s_activate_b_count = 0;
        s_render_count = 0;
        s_widget1 = mock_widget{};
        s_widget2 = mock_widget{};
    }

    void TearDown() override {
        u8g2gl_set_tick_cb(nullptr);
        u8g2gl_set_active_screen(nullptr);
        s_mock_time = 0;
    }
};

// --- Tick Callback Tests ---

TEST_F(Core, TickCallbackDefault) {
    // Before setting callback, u8g2gl_tick_now() returns 0
    EXPECT_EQ(u8g2gl_tick_now(), 0u);
}

TEST_F(Core, TickCallbackRegistered) {
    // Set mock callback, set s_mock_time = 1000
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 1000;
    EXPECT_EQ(u8g2gl_tick_now(), 1000u);
}

// --- Screen Management Tests ---

TEST_F(Core, NoActiveScreen) {
    // ui_handler() with no active screen returns U8G2GL_IDLE without crashing
    U8G2 display;
    EXPECT_EQ(ui_handler(display), U8G2GL_IDLE);
    EXPECT_EQ(display.clear_count, 0);
    EXPECT_EQ(display.send_count, 0);
}

TEST_F(Core, SetActiveScreen) {
    u8g2gl_screen screen{};
    u8g2gl_set_active_screen(&screen);
    EXPECT_EQ(u8g2gl_get_active_screen(), &screen);
}

TEST_F(Core, ScreenActivateCalledOnSet) {
    u8g2gl_screen screen{};
    screen.activate_fn = cb_activate;
    EXPECT_EQ(s_activate_count, 0);

    u8g2gl_set_active_screen(&screen);
    EXPECT_EQ(s_activate_count, 1);
    EXPECT_TRUE(screen.dirty); // Activation forces first frame
}

TEST_F(Core, ScreenDeactivateOnSwitch) {
    u8g2gl_screen screen_a{};
    screen_a.deactivate_fn = cb_deactivate;

    u8g2gl_screen screen_b{};
    screen_b.activate_fn = cb_activate_b;

    u8g2gl_set_active_screen(&screen_a);
    EXPECT_EQ(s_deactivate_count, 0);

    u8g2gl_set_active_screen(&screen_b);
    EXPECT_EQ(s_deactivate_count, 1);
    EXPECT_EQ(s_activate_b_count, 1);
    EXPECT_EQ(u8g2gl_get_active_screen(), &screen_b);
}

// --- Frame Gate Tests ---

TEST_F(Core, DirtyRendersAndClears) {
    U8G2 display;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;

    u8g2gl_set_active_screen(&screen);
    EXPECT_TRUE(screen.dirty);

    uint32_t idle = ui_handler(display);
    EXPECT_EQ(idle, U8G2GL_IDLE);
    EXPECT_EQ(s_render_count, 1);
    EXPECT_EQ(display.clear_count, 1);
    EXPECT_EQ(display.send_count, 1);
    EXPECT_FALSE(screen.dirty);
}

TEST_F(Core, NotDirtyDoesNotRender) {
    U8G2 display;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;

    u8g2gl_set_active_screen(&screen);
    ui_handler(display); // Clears dirty from activation
    EXPECT_EQ(s_render_count, 1);
    EXPECT_EQ(display.clear_count, 1);
    EXPECT_EQ(display.send_count, 1);
    EXPECT_FALSE(screen.dirty);

    // Second call: not dirty, so no render or buffer operations
    uint32_t idle = ui_handler(display);
    EXPECT_EQ(idle, U8G2GL_IDLE);
    EXPECT_EQ(s_render_count, 1);
    EXPECT_EQ(display.clear_count, 1);
    EXPECT_EQ(display.send_count, 1);
}

TEST_F(Core, MarkDirtyCausesRender) {
    U8G2 display;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;

    u8g2gl_set_active_screen(&screen);
    ui_handler(display); // Clears dirty
    EXPECT_FALSE(screen.dirty);
    EXPECT_EQ(s_render_count, 1);

    u8g2gl_mark_dirty();
    EXPECT_TRUE(screen.dirty);

    ui_handler(display); // Renders again
    EXPECT_EQ(s_render_count, 2);
    EXPECT_EQ(display.clear_count, 2);
    EXPECT_EQ(display.send_count, 2);
    EXPECT_FALSE(screen.dirty);
}

// --- Deadline Aggregation Tests ---

TEST_F(Core, SingleWidgetDeadline) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 0;
    s_widget1.next_deadline = 500;

    u8g2gl_screen screen{};
    screen.tick_fn = cb_tick_single;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    uint32_t sleep_ms = ui_handler(display);
    EXPECT_EQ(s_widget1.tick_count, 1);
    EXPECT_EQ(s_widget1.last_tick_time, 0u);
    EXPECT_EQ(sleep_ms, 500u);
}

TEST_F(Core, TwoWidgetMinimumDeadline) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 0;
    s_widget1.next_deadline = 1000;
    s_widget2.next_deadline = 300;

    u8g2gl_screen screen{};
    screen.tick_fn = cb_tick_two;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    uint32_t sleep_ms = ui_handler(display);
    EXPECT_EQ(sleep_ms, 300u);
}

TEST_F(Core, AllIdleReturnsIdle) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 0;
    s_widget1.next_deadline = U8G2GL_IDLE;
    s_widget2.next_deadline = U8G2GL_IDLE;

    u8g2gl_screen screen{};
    screen.tick_fn = cb_tick_two;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    uint32_t sleep_ms = ui_handler(display);
    EXPECT_EQ(sleep_ms, U8G2GL_IDLE);
}

TEST_F(Core, MixedIdleAndDeadline) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 0;
    s_widget1.next_deadline = U8G2GL_IDLE;
    s_widget2.next_deadline = 200;

    u8g2gl_screen screen{};
    screen.tick_fn = cb_tick_two;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    uint32_t sleep_ms = ui_handler(display);
    EXPECT_EQ(sleep_ms, 200u);
}

// --- Visibility Tests ---

static void cb_render_with_visibility(U8G2& display) {
    u8g2gl_screen* scr = u8g2gl_get_active_screen();
    if (!scr) return;
    for (uint8_t i = 0; i < scr->obj_count; ++i) {
        if (u8g2gl_is_effectively_visible(scr->objs, scr->parents, i)) {
            scr->objs[i]->render(display);
        }
    }
}

TEST_F(Core, HiddenWidgetNotRendered) {
    s_widget1 = mock_widget{};
    s_widget2 = mock_widget{};
    s_widget2.set_hidden(true);

    u8g2gl_obj* const objs[] = { &s_widget1, &s_widget2 };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, U8G2GL_NO_PARENT };

    u8g2gl_screen screen{};
    screen.objs = objs;
    screen.parents = parents;
    screen.obj_count = 2;
    screen.render_fn = cb_render_with_visibility;

    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    ui_handler(display);

    EXPECT_EQ(s_widget1.render_count, 1);
    EXPECT_EQ(s_widget2.render_count, 0);
}

// --- Object mark_dirty triggers screen dirty ---

TEST_F(Core, ObjMarkDirtyGatesFrame) {
    U8G2 display;
    mock_widget w;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;
    u8g2gl_set_active_screen(&screen);

    ui_handler(display); // Clears dirty from activation
    EXPECT_FALSE(screen.dirty);
    EXPECT_EQ(s_render_count, 1);

    // Call mark_dirty() on an individual widget
    w.mark_dirty();
    EXPECT_TRUE(w.is_dirty());
    EXPECT_TRUE(screen.dirty); // Widget mark_dirty() gated the screen!

    ui_handler(display);
    EXPECT_EQ(s_render_count, 2);
    EXPECT_FALSE(screen.dirty);
}

// --- PR-3R WO1: imperative set_hidden() must gate the frame same as
// mark_dirty() does above — this is the defect itself. Before the fix, calling
// set_hidden() on a static object left screen.dirty false and §11.2's gate
// skipped sendBuffer(), so the display never updated.
TEST_F(Core, ObjSetHiddenGatesFrame) {
    U8G2 display;
    mock_widget w;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;
    u8g2gl_set_active_screen(&screen);

    ui_handler(display); // Clears dirty from activation
    EXPECT_FALSE(screen.dirty);
    EXPECT_EQ(s_render_count, 1);

    // Imperative call, not a binding — nothing else marks the frame dirty.
    w.set_hidden(true);
    EXPECT_TRUE(screen.dirty); // set_hidden() must gate the screen, like mark_dirty()

    ui_handler(display);
    EXPECT_EQ(s_render_count, 2);
    EXPECT_FALSE(screen.dirty);
}

// --- Per-object render wrapper: u8g2gl_render_object() (§11.3) ---

// Captures, while render() runs, the display state the framework set up. Then
// it deliberately changes font and draw colour, so the tests can prove the
// wrapper restores them.
class state_probe_widget : public u8g2gl_obj {
public:
    int render_count = 0;
    int clip_x0 = -1;
    int clip_y0 = -1;
    int clip_x1 = -1;
    int clip_y1 = -1;
    int set_clip_count_during_render = 0;
    int max_clip_count_during_render = 0;
    const uint8_t* font_to_leave = nullptr;

    void render(U8G2& display) override {
        render_count++;
        clip_x0 = display.last_clip_x0;
        clip_y0 = display.last_clip_y0;
        clip_x1 = display.last_clip_x1;
        clip_y1 = display.last_clip_y1;
        set_clip_count_during_render = display.set_clip_window_count;
        max_clip_count_during_render = display.max_clip_window_count;
        display.setFont(font_to_leave);
        display.setDrawColor(0);
    }
};

static const uint8_t s_font_before[1] = {0xA0};
static const uint8_t s_font_widget[1] = {0xB0};

// A render_fn the way a generated screen will write it: one wrapper call per
// object, in document order, fed straight from the u8g2gl_screen arrays.
static void cb_render_via_wrapper(U8G2& display) {
    u8g2gl_screen* scr = u8g2gl_get_active_screen();
    for (uint8_t i = 0; i < scr->obj_count; ++i) {
        u8g2gl_render_object(display, scr->objs, scr->parents, i);
    }
}

TEST_F(Core, RenderObjectHiddenAncestorSuppressesChild) {
    state_probe_widget container;
    state_probe_widget child;
    container.set_coords(0, 0, 64, 32);
    child.set_coords(4, 4, 10, 10);
    container.set_hidden(true);   // the child itself is not hidden

    u8g2gl_obj* const objs[] = { &container, &child };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    u8g2gl_screen screen{};
    screen.objs = objs;
    screen.parents = parents;
    screen.obj_count = 2;
    screen.render_fn = cb_render_via_wrapper;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    ui_handler(display);
    EXPECT_EQ(container.render_count, 0);
    EXPECT_EQ(child.render_count, 0);
    EXPECT_EQ(display.set_clip_window_count, 0);  // nothing was set up for it

    // Control: un-hiding the ancestor alone makes the child draw.
    container.set_hidden(false);
    ui_handler(display);
    EXPECT_EQ(container.render_count, 1);
    EXPECT_EQ(child.render_count, 1);
}

TEST_F(Core, RenderObjectClipsChildToAncestorBounds) {
    state_probe_widget container;
    state_probe_widget child;
    container.set_coords(0, 0, 20, 10);
    child.set_coords(15, 5, 20, 20);   // overhangs the container right and below

    u8g2gl_obj* const objs[] = { &container, &child };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    U8G2 display;
    u8g2gl_render_object(display, objs, parents, 1);

    // Intersection is x 15..19, y 5..9. Passed through u8g2gl_apply_clip(), the
    // far corner is exclusive — (15, 5, 20, 10) — and it was in force during
    // render(). The convention itself is pinned by ApplyClipPinsExclusive...
    EXPECT_EQ(child.render_count, 1);
    EXPECT_EQ(child.set_clip_count_during_render, 1);
    EXPECT_EQ(child.clip_x0, 15);
    EXPECT_EQ(child.clip_y0, 5);
    EXPECT_EQ(child.clip_x1, 20);
    EXPECT_EQ(child.clip_y1, 10);
}

TEST_F(Core, RenderObjectWhollyClippedChildIsNotRendered) {
    state_probe_widget container;
    state_probe_widget child;
    container.set_coords(0, 0, 10, 10);
    child.set_coords(20, 20, 5, 5);

    u8g2gl_obj* const objs[] = { &container, &child };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    U8G2 display;
    u8g2gl_render_object(display, objs, parents, 1);
    EXPECT_EQ(child.render_count, 0);
    EXPECT_EQ(display.set_clip_window_count, 0);
}

TEST_F(Core, RenderObjectRestoresDisplayStateAfterRender) {
    state_probe_widget widget;
    widget.set_coords(2, 3, 10, 8);
    widget.font_to_leave = s_font_widget;

    u8g2gl_obj* const objs[] = { &widget };
    const uint8_t parents[] = { U8G2GL_NO_PARENT };

    U8G2 display;
    display.setFont(s_font_before);
    display.setDrawColor(1);

    u8g2gl_render_object(display, objs, parents, 0);

    // The widget really did change both during its render...
    EXPECT_EQ(widget.render_count, 1);
    // ...and both are back afterwards.
    EXPECT_EQ(display.last_font, s_font_before);
    EXPECT_EQ(display.last_draw_color, 1);

    // The clip was reset to the full display after render(), not before: the
    // widget saw zero resets, and the wrapper made exactly one on the way out.
    EXPECT_EQ(widget.max_clip_count_during_render, 0);
    EXPECT_EQ(display.max_clip_window_count, 1);
}

TEST_F(Core, RenderObjectClampsNegativeClipOrigin) {
    state_probe_widget widget;
    widget.set_coords(-4, -2, 10, 8);   // partly off the top-left of the display

    u8g2gl_obj* const objs[] = { &widget };

    U8G2 display;
    u8g2gl_render_object(display, objs, nullptr, 0);

    // U8G2 takes unsigned coordinates; a negative origin would wrap, not clip.
    // Far corner exclusive: -4 + 10 = 6, -2 + 8 = 6.
    EXPECT_EQ(widget.render_count, 1);
    EXPECT_EQ(widget.clip_x0, 0);
    EXPECT_EQ(widget.clip_y0, 0);
    EXPECT_EQ(widget.clip_x1, 6);
    EXPECT_EQ(widget.clip_y1, 6);
}

TEST_F(Core, RenderObjectNullArrayRendersNothing) {
    U8G2 display;
    u8g2gl_render_object(display, nullptr, nullptr, 0);
    EXPECT_EQ(display.set_clip_window_count, 0);
    EXPECT_EQ(display.max_clip_window_count, 0);
}

// --- u8g2gl_clip_scope: the one set-and-reset of an effective clip (§13.5) ---
// The guard u8g2gl_render_object() uses around render(), and a generated draw
// call inside a bound container uses around the call.

TEST_F(Core, ClipScopeSetsTheEffectiveClipAndResetsItOnExit) {
    u8g2gl_obj container;
    u8g2gl_obj child;
    container.set_coords(0, 0, 20, 10);
    child.set_coords(15, 5, 20, 20);   // overhangs the container right and below

    u8g2gl_obj* const objs[] = { &container, &child };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    U8G2 display;
    {
        const u8g2gl_clip_scope clip(display, objs, parents, 1);
        EXPECT_TRUE(clip.drawable());
        // The intersection, x 15..19 and y 5..9, far corner exclusive.
        EXPECT_EQ(display.set_clip_window_count, 1);
        EXPECT_EQ(display.last_clip_x0, 15);
        EXPECT_EQ(display.last_clip_y0, 5);
        EXPECT_EQ(display.last_clip_x1, 20);
        EXPECT_EQ(display.last_clip_y1, 10);
        EXPECT_EQ(display.max_clip_window_count, 0);   // not reset while in scope
    }
    EXPECT_EQ(display.max_clip_window_count, 1);       // reset exactly once on exit
}

TEST_F(Core, ClipScopeWithAnEmptyClipTouchesNothing) {
    u8g2gl_obj container;
    u8g2gl_obj child;
    container.set_coords(0, 0, 10, 10);
    child.set_coords(20, 20, 5, 5);   // wholly outside its container

    u8g2gl_obj* const objs[] = { &container, &child };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    U8G2 display;
    {
        const u8g2gl_clip_scope clip(display, objs, parents, 1);
        EXPECT_FALSE(clip.drawable());
    }
    EXPECT_EQ(display.set_clip_window_count, 0);
    EXPECT_EQ(display.max_clip_window_count, 0);   // nothing set, so nothing reset
}

TEST_F(Core, ClipScopeWhollyOffTheDisplayTouchesNothing) {
    u8g2gl_obj widget;
    widget.set_coords(-20, -20, 10, 10);   // a non-empty rect with no pixel on the display

    u8g2gl_obj* const objs[] = { &widget };

    U8G2 display;
    {
        const u8g2gl_clip_scope clip(display, objs, nullptr, 0);
        EXPECT_FALSE(clip.drawable());
    }
    EXPECT_EQ(display.set_clip_window_count, 0);
    EXPECT_EQ(display.max_clip_window_count, 0);
}

TEST_F(Core, ClipScopeOverANullArrayTouchesNothing) {
    U8G2 display;
    {
        const u8g2gl_clip_scope clip(display, nullptr, nullptr, 0);
        EXPECT_FALSE(clip.drawable());
    }
    EXPECT_EQ(display.set_clip_window_count, 0);
    EXPECT_EQ(display.max_clip_window_count, 0);
}

// --- Clip-corner convention: u8g2gl_apply_clip() ---

// PINS THE CLIP-CORNER CONVENTION. The exclusive far corner is read from U8G2
// 2.36.18 source, not verified by a pixel test (see u8g2gl_apply_clip() in
// u8g2gl_core.h for the evidence). If PR-06's real-U8G2 pixel test at a
// container edge disagrees, u8g2gl_apply_clip() is the one function to change —
// then update the expected corners here, and nothing else.
TEST_F(Core, ApplyClipPinsExclusiveCornerConvention) {
    U8G2 display;
    const u8g2gl_rect rect = { 12, 7, 30, 9 };

    EXPECT_TRUE(u8g2gl_apply_clip(display, rect));
    EXPECT_EQ(display.set_clip_window_count, 1);
    EXPECT_EQ(display.last_clip_x0, 12);
    EXPECT_EQ(display.last_clip_y0, 7);
    EXPECT_EQ(display.last_clip_x1, 42);   // x + w, not x + w - 1
    EXPECT_EQ(display.last_clip_y1, 16);   // y + h, not y + h - 1
}

TEST_F(Core, ApplyClipClampsNegativeOrigin) {
    U8G2 display;
    const u8g2gl_rect rect = { -3, -5, 10, 8 };

    EXPECT_TRUE(u8g2gl_apply_clip(display, rect));
    EXPECT_EQ(display.last_clip_x0, 0);
    EXPECT_EQ(display.last_clip_y0, 0);
    EXPECT_EQ(display.last_clip_x1, 7);
    EXPECT_EQ(display.last_clip_y1, 3);
}

TEST_F(Core, ApplyClipRejectsEmptyAndOffDisplayRects) {
    U8G2 display;
    const u8g2gl_rect empty = { 4, 4, 0, 6 };
    const u8g2gl_rect left_of_display = { -10, 0, 10, 5 };   // last column is x = -1
    const u8g2gl_rect above_display = { 0, -6, 5, 6 };        // last row is y = -1

    EXPECT_FALSE(u8g2gl_apply_clip(display, empty));
    EXPECT_FALSE(u8g2gl_apply_clip(display, left_of_display));
    EXPECT_FALSE(u8g2gl_apply_clip(display, above_display));
    EXPECT_EQ(display.set_clip_window_count, 0);

    // Control: one pixel onto the display is accepted.
    const u8g2gl_rect one_column_on = { -10, 0, 11, 5 };
    EXPECT_TRUE(u8g2gl_apply_clip(display, one_column_on));
    EXPECT_EQ(display.last_clip_x0, 0);
    EXPECT_EQ(display.last_clip_x1, 1);
}

// WO4c: the far corner is clamped to the display as well as the near corner at
// 0, so the window never names a column or row past the display.
TEST_F(Core, ApplyClipClampsFarCornerToDisplay) {
    U8G2 display;   // the stub reports 128 x 64
    const u8g2gl_rect overhanging = { 100, 50, 60, 30 };

    EXPECT_TRUE(u8g2gl_apply_clip(display, overhanging));
    EXPECT_EQ(display.last_clip_x0, 100);
    EXPECT_EQ(display.last_clip_y0, 50);
    EXPECT_EQ(display.last_clip_x1, 128);
    EXPECT_EQ(display.last_clip_y1, 64);

    // Both corners at once: a rect larger than the display in every direction.
    const u8g2gl_rect covering = { -10, -10, 200, 100 };
    EXPECT_TRUE(u8g2gl_apply_clip(display, covering));
    EXPECT_EQ(display.last_clip_x0, 0);
    EXPECT_EQ(display.last_clip_y0, 0);
    EXPECT_EQ(display.last_clip_x1, 128);
    EXPECT_EQ(display.last_clip_y1, 64);
}

TEST_F(Core, ApplyClipRejectsRectsRightOfOrBelowDisplay) {
    U8G2 display;
    const u8g2gl_rect right_of_display = { 128, 0, 10, 10 };   // first column is x = 128
    const u8g2gl_rect below_display = { 0, 64, 10, 10 };

    EXPECT_FALSE(u8g2gl_apply_clip(display, right_of_display));
    EXPECT_FALSE(u8g2gl_apply_clip(display, below_display));
    EXPECT_EQ(display.set_clip_window_count, 0);
}

// WO4c degenerate input: an element partly off the left (x = -5) and top edges,
// rendered through the framework wrapper. Per the PA ruling, draw origins wrap
// explicitly and are drawn (U8G2 clips them to the visible part), while the
// clip window is clamped at both corners and never wraps.
TEST_F(Core, RenderObjectPartlyOffLeftAndTopWrapsOriginsAndClampsClip) {
    u8g2gl_progress_bar bar;
    bar.set_coords(-5, -3, 42, 12);   // inner area 40 x 10 starting at (-4, -2)
    bar.set_fill_style(U8G2GL_FILL_SOLID);
    bar.set_value(50);                // fill width 20

    u8g2gl_obj* const objs[] = { &bar };
    U8G2 display;
    u8g2gl_render_object(display, objs, nullptr, 0);

    // Clip: both near corners clamped, far corners exclusive.
    EXPECT_EQ(display.set_clip_window_count, 1);
    EXPECT_EQ(display.last_clip_x0, 0);
    EXPECT_EQ(display.last_clip_y0, 0);
    EXPECT_EQ(display.last_clip_x1, 37);
    EXPECT_EQ(display.last_clip_y1, 9);

    // The track frame is drawn from its explicitly wrapped origin (-5, -3).
    ASSERT_EQ(display.draw_frame_count, 1);
    EXPECT_EQ(display.last_draw_frame_x, 65531);
    EXPECT_EQ(display.last_draw_frame_y, 65533);
    EXPECT_EQ(display.last_draw_frame_w, 42);
    EXPECT_EQ(display.last_draw_frame_h, 12);

    // The fill is drawn from (-4, -2), wrapped, at its full size.
    ASSERT_EQ(display.draw_box_count, 1);
    EXPECT_EQ(display.last_draw_box_x, 65532);
    EXPECT_EQ(display.last_draw_box_y, 65534);
    EXPECT_EQ(display.last_draw_box_w, 20);
    EXPECT_EQ(display.last_draw_box_h, 10);
}

// --- Frame-dirty observer: u8g2gl_frame_dirty_observer() (§13.5) ---

TEST_F(Core, FrameDirtyObserverMarksActiveScreenDirty) {
    U8G2 display;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;
    u8g2gl_set_active_screen(&screen);

    // Registered exactly as generated code will: no user data, one per subject.
    u8g2gl_subject_int level(0);
    ASSERT_TRUE(level.add_observer(nullptr, u8g2gl_frame_dirty_observer));

    ui_handler(display);   // clears the activation frame
    EXPECT_FALSE(screen.dirty);

    level.set(7);
    EXPECT_TRUE(screen.dirty);
    ui_handler(display);
    EXPECT_EQ(s_render_count, 2);
    EXPECT_FALSE(screen.dirty);

    // The subject does not notify for an unchanged value, so no frame is due.
    level.set(7);
    EXPECT_FALSE(screen.dirty);

    // With no active screen there is nothing to mark, and it must not fault.
    u8g2gl_set_active_screen(nullptr);
    level.set(8);
    EXPECT_FALSE(screen.dirty);
}

// --- Elapsed Time and Period Wrapper Tests ---

TEST_F(Core, ElapsedSubtractedFromDeadline) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 100;
    s_widget1.next_deadline = 500;

    auto tick_advances = [](uint32_t now_ms) -> uint32_t {
        s_mock_time += 50; // simulates 50ms work during tick/render
        return s_widget1.tick(now_ms);
    };

    u8g2gl_screen screen{};
    screen.tick_fn = tick_advances;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    uint32_t sleep_ms = ui_handler(display);
    EXPECT_EQ(sleep_ms, 450u); // 500 - 50 = 450
}

TEST_F(Core, ElapsedExceedsDeadlineReturnsZero) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 100;
    s_widget1.next_deadline = 100;

    auto tick_advances = [](uint32_t now_ms) -> uint32_t {
        s_mock_time += 150; // exceeds deadline of 100
        return s_widget1.tick(now_ms);
    };

    u8g2gl_screen screen{};
    screen.tick_fn = tick_advances;
    u8g2gl_set_active_screen(&screen);

    U8G2 display;
    uint32_t sleep_ms = ui_handler(display);
    EXPECT_EQ(sleep_ms, 0u);
}

TEST_F(Core, RunInPeriod) {
    u8g2gl_set_tick_cb(mock_millis);
    s_mock_time = 0;
    U8G2 display;
    u8g2gl_screen screen{};
    screen.render_fn = cb_render;
    u8g2gl_set_active_screen(&screen);

    // Initial run
    uint32_t res1 = ui_handler_run_in_period(display, 50);
    EXPECT_EQ(res1, U8G2GL_IDLE);
    EXPECT_EQ(s_render_count, 1);

    // Advance 20ms (< 50ms period)
    s_mock_time = 20;
    u8g2gl_mark_dirty();
    uint32_t res2 = ui_handler_run_in_period(display, 50);
    EXPECT_EQ(res2, 0u);
    EXPECT_EQ(s_render_count, 1); // Not executed yet

    // Advance to 50ms (>= 50ms period)
    s_mock_time = 50;
    uint32_t res3 = ui_handler_run_in_period(display, 50);
    EXPECT_EQ(res3, U8G2GL_IDLE);
    EXPECT_EQ(s_render_count, 2); // Executed!
}

// --- Final sizeof Report (§18/Q-4) ---

TEST_F(Core, SizeOfReport) {
    std::cout << "\n================ U8G2GL MEMORY REPORT ================" << std::endl;
    std::cout << "sizeof(u8g2gl_obj):            " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_style):          " << sizeof(u8g2gl_style) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_screen):         " << sizeof(u8g2gl_screen) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_observer):       " << sizeof(u8g2gl_observer) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_subject_int):    " << sizeof(u8g2gl_subject_int) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_subject_string): " << sizeof(u8g2gl_subject_string) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_subject_bool):   " << sizeof(u8g2gl_subject_bool) << " bytes" << std::endl;
    std::cout << "sizeof(u8g2gl_subject_time):   " << sizeof(u8g2gl_subject_time) << " bytes" << std::endl;
    std::cout << "======================================================\n" << std::endl;

    RecordProperty("sizeof_u8g2gl_obj", std::to_string(sizeof(u8g2gl_obj)));
    RecordProperty("sizeof_u8g2gl_style", std::to_string(sizeof(u8g2gl_style)));
    RecordProperty("sizeof_u8g2gl_screen", std::to_string(sizeof(u8g2gl_screen)));
    RecordProperty("sizeof_u8g2gl_observer", std::to_string(sizeof(u8g2gl_observer)));
    RecordProperty("sizeof_u8g2gl_subject_int", std::to_string(sizeof(u8g2gl_subject_int)));
    RecordProperty("sizeof_u8g2gl_subject_string", std::to_string(sizeof(u8g2gl_subject_string)));
    RecordProperty("sizeof_u8g2gl_subject_bool", std::to_string(sizeof(u8g2gl_subject_bool)));
    RecordProperty("sizeof_u8g2gl_subject_time", std::to_string(sizeof(u8g2gl_subject_time)));

    EXPECT_GT(sizeof(u8g2gl_obj), 0u);
    EXPECT_GT(sizeof(u8g2gl_screen), 0u);
}
