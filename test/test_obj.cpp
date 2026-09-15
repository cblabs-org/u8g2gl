/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_obj.cpp
 * Description: Implementation of test_obj.cpp
 */
#include <gtest/gtest.h>
#include <iostream>
#include <string>

#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_config.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl/u8g2gl_state_saver.h"
#include "u8g2gl/u8g2gl_helpers.h"
#include "U8G2lib.h"

TEST(Obj, DefaultConstruction) {
    u8g2gl_obj obj;
    EXPECT_EQ(obj.get_x(), 0);
    EXPECT_EQ(obj.get_y(), 0);
    EXPECT_EQ(obj.get_w(), 0);
    EXPECT_EQ(obj.get_h(), 0);
    EXPECT_FALSE(obj.is_hidden());
    EXPECT_FALSE(obj.is_dirty());
    EXPECT_FALSE(obj.is_disabled());
    EXPECT_EQ(obj.get_parent_index(), U8G2GL_NO_PARENT);
}

TEST(Obj, SetCoords) {
    u8g2gl_obj obj;
    obj.set_coords(10, 20, 100, 50);
    EXPECT_EQ(obj.get_x(), 10);
    EXPECT_EQ(obj.get_y(), 20);
    EXPECT_EQ(obj.get_w(), 100);
    EXPECT_EQ(obj.get_h(), 50);
}

TEST(Obj, Flags) {
    u8g2gl_obj obj;
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    obj.set_flag(U8G2GL_FLAG_HIDDEN);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    obj.clear_flag(U8G2GL_FLAG_HIDDEN);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    // set_hidden(true) / is_hidden() equivalence
    obj.set_hidden(true);
    EXPECT_TRUE(obj.is_hidden());
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
    obj.set_hidden(false);
    EXPECT_FALSE(obj.is_hidden());
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    // set_disabled(true) / is_disabled() equivalence
    obj.set_disabled(true);
    EXPECT_TRUE(obj.is_disabled());
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_DISABLED));
    obj.set_disabled(false);
    EXPECT_FALSE(obj.is_disabled());
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DISABLED));

    // PR-3R WO1: set_hidden()/set_disabled() above now mark the frame dirty on
    // every actual change (see Obj.SetHiddenMarksDirty / SetDisabledMarksDirty),
    // so DIRTY is left set from those calls. Clear it here — this block is
    // testing that the raw set_flag()/clear_flag() primitives below leave
    // unrelated flags alone, which is a separate question from dirty tracking.
    obj.clear_dirty();

    // Multiple flags independent
    obj.set_flag(U8G2GL_FLAG_HIDDEN);
    obj.set_flag(U8G2GL_FLAG_DISABLED);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_DISABLED));
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DIRTY));

    obj.clear_flag(U8G2GL_FLAG_HIDDEN);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_DISABLED));
}

TEST(Obj, DirtyTracking) {
    u8g2gl_obj obj;
    EXPECT_FALSE(obj.is_dirty());

    obj.mark_dirty();
    EXPECT_TRUE(obj.is_dirty());
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_DIRTY));

    obj.clear_dirty();
    EXPECT_FALSE(obj.is_dirty());
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DIRTY));
}

// --- PR-3R WO1: every mutator that changes what is drawn marks the frame
// dirty. These are the tests whose absence let set_hidden()/set_disabled()
// ship without the call (see docs/decisions and WORKORDER.md for wo1).

TEST(Obj, SetCoordsMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_coords(10, 20, 100, 50);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetCoordsUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_coords(10, 20, 100, 50);
    obj.clear_dirty();
    obj.set_coords(10, 20, 100, 50);  // same values — no visible change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetHiddenMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_hidden(true);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    obj.set_hidden(false);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetHiddenUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    EXPECT_FALSE(obj.is_hidden());
    obj.clear_dirty();
    obj.set_hidden(false);  // already not hidden — no visible change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetDisabledMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_disabled(true);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    obj.set_disabled(false);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetDisabledUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    EXPECT_FALSE(obj.is_disabled());
    obj.clear_dirty();
    obj.set_disabled(false);  // already not disabled — no visible change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, PerAxisSettersMarkDirty) {
    u8g2gl_obj obj;

    obj.clear_dirty();
    obj.set_x(5);
    EXPECT_EQ(obj.get_x(), 5);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    obj.set_y(6);
    EXPECT_EQ(obj.get_y(), 6);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    obj.set_w(7);
    EXPECT_EQ(obj.get_w(), 7);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    obj.set_h(8);
    EXPECT_EQ(obj.get_h(), 8);
    EXPECT_TRUE(obj.is_dirty());
}

// --- PR-04 WO3: geometry bindings ([D-20]) ---
// A bound axis must reach the display on a static screen: nothing animates to
// force a frame, so the binding itself has to gate it via the frame dirty flag
// (§11.2). This is the failure mode set_coords() had before PR-3R WO1.
TEST(Obj, BindWidthUpdatesGeometryAndGatesStaticFrame) {
    u8g2gl_screen screen{};
    u8g2gl_set_active_screen(&screen);

    u8g2gl_subject_int level;
    level.set(10);
    u8g2gl_obj obj;
    ASSERT_TRUE(obj.bind_width(&level));
    EXPECT_EQ(obj.get_w(), 10);   // current value applied immediately

    screen.dirty = false;
    obj.clear_dirty();
    level.set(42);
    EXPECT_EQ(obj.get_w(), 42);
    EXPECT_TRUE(obj.is_dirty());
    EXPECT_TRUE(screen.dirty);

    // Same value again: no change, no frame.
    screen.dirty = false;
    obj.clear_dirty();
    level.set(42);
    EXPECT_FALSE(screen.dirty);

    u8g2gl_set_active_screen(nullptr);
}

TEST(Obj, BindEachAxisDrivesItsSetter) {
    u8g2gl_subject_int sx, sy, sh;
    u8g2gl_obj obj;
    ASSERT_TRUE(obj.bind_x(&sx));
    ASSERT_TRUE(obj.bind_y(&sy));
    ASSERT_TRUE(obj.bind_height(&sh));
    sx.set(3);
    sy.set(-4);
    sh.set(70000);   // outside int16_t: clamped, not wrapped
    EXPECT_EQ(obj.get_x(), 3);
    EXPECT_EQ(obj.get_y(), -4);
    EXPECT_EQ(obj.get_h(), INT16_MAX);
    EXPECT_FALSE(obj.bind_x(nullptr));
}

TEST(Obj, PerAxisSettersUnchangedDoNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_coords(1, 2, 3, 4);
    obj.clear_dirty();

    obj.set_x(1);
    obj.set_y(2);
    obj.set_w(3);
    obj.set_h(4);
    EXPECT_FALSE(obj.is_dirty());
}

// --- PR-3R WO2: the style delegations, apply_style() and set_parent_index()
// had the identical mark_dirty() omission WO1 fixed for geometry and flags —
// surfaced by the Chief Architect after WO1 (see PROJECT.md) and folded into
// WO2 because it already edits this delegation block to delete set_truncate().
// Same change-guard pattern as above: mark dirty only on an actual change.

static const uint8_t s_font_a[] = { 0x01, 0x02 };
static const uint8_t s_font_b[] = { 0x03, 0x04 };

TEST(Obj, SetFontMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_font(s_font_a);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetFontUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_font(s_font_a);
    obj.clear_dirty();
    obj.set_font(s_font_a);  // same pointer — no visible change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetDrawColorMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_draw_color(U8G2GL_COLOR_0);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetDrawColorUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    // A fresh object's draw_color equals the default (U8G2GL_COLOR_1) without
    // ever being explicitly set, so the first call is a real change to the
    // mask even though the value matches — establish it, then repeat.
    obj.set_draw_color(U8G2GL_COLOR_1);
    obj.clear_dirty();
    obj.set_draw_color(U8G2GL_COLOR_1);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetInvertMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_invert(true);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetInvertUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_invert(false);  // establish explicit state before guarding
    obj.clear_dirty();
    obj.set_invert(false);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetPaddingMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_padding(4);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetPaddingUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_padding(0);  // establish explicit state before guarding
    obj.clear_dirty();
    obj.set_padding(0);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetBorderMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_border(true);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetBorderUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_border(false);  // establish explicit state before guarding
    obj.clear_dirty();
    obj.set_border(false);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetRadiusMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_radius(3);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetRadiusUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_radius(0);  // establish explicit state before guarding
    obj.clear_dirty();
    obj.set_radius(0);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetAlignMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_align(U8G2GL_ALIGN_CENTER);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetAlignUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_align(U8G2GL_ALIGN_LEFT);  // establish explicit state before guarding
    obj.clear_dirty();
    obj.set_align(U8G2GL_ALIGN_LEFT);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

// The value alone equalling the default is NOT enough to skip the guard: a
// fresh object's align equals U8G2GL_ALIGN_LEFT without ever being set, and
// u8g2gl_button's render() (and the label's moved scroll-render path) branch
// on style_.has(U8G2GL_STYLE_ALIGN) to tell "explicitly LEFT" apart from
// "unset" — see u8g2gl_obj.cpp's set_align() for the defect this test guards
// against (Button.RenderAlignmentOverride caught it during WO2).
TEST(Obj, SetAlignFirstCallMarksDirtyEvenAtDefaultValue) {
    u8g2gl_obj obj;
    EXPECT_FALSE(obj.get_resolved_style().has(U8G2GL_STYLE_ALIGN));
    obj.clear_dirty();
    obj.set_align(U8G2GL_ALIGN_LEFT);  // matches the default value, but is new
    EXPECT_TRUE(obj.is_dirty());
    EXPECT_TRUE(obj.get_resolved_style().has(U8G2GL_STYLE_ALIGN));
}

TEST(Obj, SetFontModeMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_font_mode(U8G2GL_FONT_MODE_TRANSPARENT);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetFontModeUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_font_mode(U8G2GL_FONT_MODE_SOLID);  // establish explicit state first
    obj.clear_dirty();
    obj.set_font_mode(U8G2GL_FONT_MODE_SOLID);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, SetBitmapModeMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_bitmap_mode(U8G2GL_BITMAP_MODE_TRANSPARENT);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetBitmapModeUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_bitmap_mode(U8G2GL_BITMAP_MODE_SOLID);  // establish explicit state first
    obj.clear_dirty();
    obj.set_bitmap_mode(U8G2GL_BITMAP_MODE_SOLID);  // already explicitly set — no change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, ApplyStyleMarksDirty) {
    u8g2gl_obj obj;
    u8g2gl_style s;
    s.set_font(s_font_a);
    s.set_align(U8G2GL_ALIGN_CENTER);

    obj.clear_dirty();
    obj.apply_style(s);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, ApplyStyleUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    u8g2gl_style s;
    s.set_font(s_font_a);
    obj.apply_style(s);
    obj.clear_dirty();

    // Applying the identical style again changes nothing the resolved style
    // reports — merge_from() re-copies the same values, so no repaint is due.
    obj.apply_style(s);
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, ApplyStyleSecondDifferentStyleMarksDirty) {
    u8g2gl_obj obj;
    u8g2gl_style base;
    base.set_font(s_font_a);
    obj.apply_style(base);
    obj.clear_dirty();

    u8g2gl_style overlay;
    overlay.set_font(s_font_b);
    obj.apply_style(overlay);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetParentIndexMarksDirty) {
    u8g2gl_obj obj;
    obj.clear_dirty();
    obj.set_parent_index(3);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Obj, SetParentIndexUnchangedDoesNotMarkDirty) {
    u8g2gl_obj obj;
    obj.set_parent_index(3);
    obj.clear_dirty();
    obj.set_parent_index(3);  // same index — no visible change
    EXPECT_FALSE(obj.is_dirty());
}

TEST(Obj, TickReturnsIdle) {
    u8g2gl_obj obj;
    EXPECT_EQ(obj.tick(0), U8G2GL_IDLE);
    EXPECT_EQ(obj.tick(12345), U8G2GL_IDLE);
}

TEST(Obj, SizeOf) {
    std::cout << "[          ] sizeof(u8g2gl_obj) = " << sizeof(u8g2gl_obj) << " bytes" << std::endl;
    RecordProperty("sizeof_u8g2gl_obj", std::to_string(sizeof(u8g2gl_obj)));
    // Size increased from 24B base due to embedded u8g2gl_style member (WO4)
    EXPECT_LE(sizeof(u8g2gl_obj), 64u);
}

TEST(Obj, ParentIndex) {
    u8g2gl_obj obj;
    EXPECT_EQ(obj.get_parent_index(), U8G2GL_NO_PARENT);
    obj.set_parent_index(3);
    EXPECT_EQ(obj.get_parent_index(), 3);
}

TEST(Obj, DefaultRenderAndAnimationUpdate) {
    u8g2gl_obj obj;
    U8G2 display;
    // Default render and animation update should execute cleanly without error
    obj.render(display);
    obj.render_animation_update(display, 100);
}

TEST(Tree, EffectiveVisibility) {
    u8g2gl_obj a;
    u8g2gl_obj b;
    u8g2gl_obj c;
    a.set_parent_index(U8G2GL_NO_PARENT);
    b.set_parent_index(0);
    c.set_parent_index(1);

    const u8g2gl_obj* const objs[] = { &a, &b, &c };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0, 1 };

    // All visible -> C is effectively visible
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, parents, 2));
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, parents, 1));
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, parents, 0));

    // Hide A -> C becomes effectively invisible
    a.set_hidden(true);
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, parents, 2));
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, parents, 1));
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, parents, 0));

    // Hide B -> C invisible, A still visible
    a.set_hidden(false);
    b.set_hidden(true);
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, parents, 2));
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, parents, 1));
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, parents, 0));

    // Hide C only -> C invisible, B and A visible
    b.set_hidden(false);
    c.set_hidden(true);
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, parents, 2));
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, parents, 1));
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, parents, 0));

    // Parents nullptr fallback uses obj's internal parent_index
    c.set_hidden(false);
    EXPECT_TRUE(u8g2gl_is_effectively_visible(objs, nullptr, 2));
    a.set_hidden(true);
    EXPECT_FALSE(u8g2gl_is_effectively_visible(objs, nullptr, 2));
}

TEST(Tree, EffectiveClip) {
    u8g2gl_obj parent;
    u8g2gl_obj child;
    parent.set_coords(10, 10, 100, 50);
    parent.set_parent_index(U8G2GL_NO_PARENT);
    child.set_coords(20, 20, 80, 30);
    child.set_parent_index(0);

    const u8g2gl_obj* const objs[] = { &parent, &child };
    const uint8_t parents[] = { U8G2GL_NO_PARENT, 0 };

    // Parent at (10,10,100,50), child at (20,20,80,30)
    // Effective clip of child = intersection = (20,20,80,30)
    u8g2gl_rect clip1 = u8g2gl_effective_clip(objs, parents, 1);
    EXPECT_EQ(clip1.x, 20);
    EXPECT_EQ(clip1.y, 20);
    EXPECT_EQ(clip1.w, 80);
    EXPECT_EQ(clip1.h, 30);

    // Parent at (10,10,50,30), child at (40,20,80,30)
    // Effective clip width shrinks to fit parent's right edge
    parent.set_coords(10, 10, 50, 30);
    child.set_coords(40, 20, 80, 30);
    u8g2gl_rect clip2 = u8g2gl_effective_clip(objs, parents, 1);
    EXPECT_EQ(clip2.x, 40);
    EXPECT_EQ(clip2.y, 20);
    EXPECT_EQ(clip2.w, 20);
    EXPECT_EQ(clip2.h, 20);
}

TEST(Tree, RectIntersect) {
    // Two overlapping rects -> correct intersection
    u8g2gl_rect r1{10, 10, 30, 40};
    u8g2gl_rect r2{20, 15, 40, 20};
    u8g2gl_rect res = u8g2gl_rect_intersect(r1, r2);
    EXPECT_EQ(res.x, 20);
    EXPECT_EQ(res.y, 15);
    EXPECT_EQ(res.w, 20);
    EXPECT_EQ(res.h, 20);

    // Non-overlapping rects -> w or h <= 0
    u8g2gl_rect r3{0, 0, 10, 10};
    u8g2gl_rect r4{20, 20, 10, 10};
    u8g2gl_rect non_overlap = u8g2gl_rect_intersect(r3, r4);
    EXPECT_TRUE(non_overlap.w <= 0 || non_overlap.h <= 0);

    // Completely zero/negative initial rectangle
    u8g2gl_rect r_empty{0, 0, 0, 0};
    u8g2gl_rect res_empty = u8g2gl_rect_intersect(r1, r_empty);
    EXPECT_TRUE(res_empty.w <= 0 || res_empty.h <= 0);
}

TEST(StateSaver, SavesAndRestores) {
    U8G2 display;
    const uint8_t font1 = 1;
    const uint8_t font2 = 2;
    display.setDrawColor(1);
    display.setFont(&font1);

    {
        u8g2gl_state_saver saver(display);
        display.setDrawColor(2);
        display.setFont(&font2);
        EXPECT_EQ(display.getDrawColor(), 2);
        EXPECT_EQ(display.getU8g2()->font, &font2);
    }

    EXPECT_EQ(display.getDrawColor(), 1);
    EXPECT_EQ(display.getU8g2()->font, &font1);
}

TEST(PartialRefresh, TileAligned) {
    U8G2 display;
    u8g2gl_partial_refresh(display, 0, 0, 16, 16);
    EXPECT_EQ(display.update_display_area_count, 1);
    EXPECT_EQ(display.last_tx, 0);
    EXPECT_EQ(display.last_ty, 0);
    EXPECT_EQ(display.last_tw, 2);
    EXPECT_EQ(display.last_th, 2);
}

TEST(PartialRefresh, NegativeOriginRefreshesOnlyVisiblePart) {
    U8G2 display;
    // Pixels -12..7 by -10..5: only 0..7 by 0..5 is on the display, one tile.
    // Tile arithmetic on the raw origin would give tx = -1, which U8G2's
    // uint8_t tile argument receives as 255 (WO4c).
    u8g2gl_partial_refresh(display, -12, -10, 20, 16);
    EXPECT_EQ(display.update_display_area_count, 1);
    EXPECT_EQ(display.last_tx, 0);
    EXPECT_EQ(display.last_ty, 0);
    EXPECT_EQ(display.last_tw, 1);
    EXPECT_EQ(display.last_th, 1);
}

TEST(PartialRefresh, WhollyOffDisplayRefreshesNothing) {
    U8G2 display;
    u8g2gl_partial_refresh(display, -16, 0, 16, 8);
    EXPECT_EQ(display.update_display_area_count, 0);
}

TEST(PartialRefresh, NonAligned) {
    U8G2 display;
    // x=6, y=0, w=12, h=8 -> tx=0, tw=((6%8)+12+7)/8 = 3 (covers tiles 0,1,2)
    // This is the case the naive formula gets wrong (spec §11.4)
    u8g2gl_partial_refresh(display, 6, 0, 12, 8);
    EXPECT_EQ(display.update_display_area_count, 1);
    EXPECT_EQ(display.last_tx, 0);
    EXPECT_EQ(display.last_ty, 0);
    EXPECT_EQ(display.last_tw, 3);
    EXPECT_EQ(display.last_th, 1);
}
