/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_editor.cpp
 * Purpose: The editor target's registry, one entry at a time ([UD-4], PR-04
 *          WO11). Each firmware-equivalence test pairs a statement the firmware
 *          generator emits with the same operation done by name through the
 *          generated registry, and asserts the U8G2 stub received identical
 *          calls — so a thunk that spells a setter, an enumerator or an argument
 *          order differently from firmware fails here, by name.
 *
 *          Also pinned: binding overloads stay separate and dispatch on the
 *          subject's type (WO5a finding 4), construction is placement into the
 *          caller's storage and refuses storage that cannot hold the class, and
 *          every by-name operation refuses a mistake rather than guessing.
 *
 * Description: GoogleTest cases against `ui_editor_registry()` from the committed
 *              `test/generated_fixture/generated_editor/ui_editor_registry.cpp`,
 *              compiled with U8G2GL_EDITOR. The firmware side of each comparison
 *              is written exactly as the generator writes it (compare
 *              `generated/ui_screen_*.cpp`).
 */
#include <gtest/gtest.h>

#include <cstdint>
#include <cstring>

#include "U8G2lib.h"
#include "call_log.h"
#include "fixture_u8g2_fonts.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_draw.h"
#include "u8g2gl/u8g2gl_editor.h"
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_subject.h"

namespace {

// Storage a host provides: aligned for any class, larger than any.
struct host_storage {
    alignas(std::max_align_t) unsigned char bytes[512];
};

const u8g2gl_editor_class& label_class() {
    const u8g2gl_editor_class* cls = u8g2gl_editor_find_class(ui_editor_registry(), "u8g2gl_label");
    EXPECT_NE(cls, nullptr);
    return *cls;
}

// render_alone
// Renders one object through the render wrapper, as a generated render function
// renders objects[0] of a one-object screen.
void render_alone(U8G2& display, u8g2gl_obj* obj) {
    u8g2gl_obj* const objs[] = {obj};
    const uint8_t parents[] = {U8G2GL_NO_PARENT};
    u8g2gl_render_object(display, objs, parents, 0);
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

// --- Construct-by-name and set-by-name against the firmware setter path ---

TEST(EditorRegistry, LabelByNameDrawsWhatTheFirmwareSetterPathDraws) {
    // Firmware, as generated: set_coords, then written props in manifest order.
    u8g2gl_label firmware;
    firmware.set_coords(0, 16, 128, 12);
    firmware.set_font(u8g2_font_6x10_mr);
    firmware.set_align(U8G2GL_ALIGN_CENTER);
    firmware.set_text("Hello");
    U8G2 expected;
    render_alone(expected, &firmware);

    // Editor: constructed by name into host storage, every property set by name.
    host_storage storage;
    const u8g2gl_editor_class& cls = label_class();
    u8g2gl_obj* editor = u8g2gl_editor_construct(cls, storage.bytes, sizeof(storage.bytes));
    ASSERT_NE(editor, nullptr);
    EXPECT_EQ(static_cast<void*>(editor), static_cast<void*>(storage.bytes));  // placement, no heap
    ASSERT_TRUE(u8g2gl_editor_set_rect(cls, editor, 0, 16, 128, 12));
    ASSERT_TRUE(u8g2gl_editor_set_property(cls, editor, "font",
                                           u8g2gl_editor_pointer(U8G2GL_EDITOR_FONT, u8g2_font_6x10_mr)));
    ASSERT_TRUE(u8g2gl_editor_set_property(cls, editor, "align", u8g2gl_editor_text(U8G2GL_EDITOR_ENUM, "center")));
    ASSERT_TRUE(u8g2gl_editor_set_property(cls, editor, "text", u8g2gl_editor_text(U8G2GL_EDITOR_STRING, "Hello")));
    U8G2 actual;
    render_alone(actual, editor);

    EXPECT_TRUE(same_call_log(expected, actual));
    // Not vacuous: the literal text was drawn, in the label's font.
    EXPECT_EQ(count_op(actual, "drawUTF8"), 1);
    EXPECT_STREQ(actual.last_draw_utf8_buf, "Hello");
    // The label set its font for the draw (the wrapper restores the previous
    // font afterwards, so the log, not last_font, is where it shows).
    bool font_set = false;
    for (int i = 0; i < actual.call_log_count; ++i) {
        font_set = font_set || (std::strcmp(actual.call_log[i].op, "setFont") == 0 &&
                                actual.call_log[i].pointer == u8g2_font_6x10_mr);
    }
    EXPECT_TRUE(font_set);
    u8g2gl_editor_destroy(editor);
}

TEST(EditorRegistry, EveryAlignValueMatchesItsFirmwareEnumerator) {
    // One branch per manifest value, each spelled by the generator's value
    // helper; a swapped or misspelled enumerator shows as a different x.
    const struct {
        const char* text;
        u8g2gl_align_t enumerator;
    } cases[] = {{"left", U8G2GL_ALIGN_LEFT}, {"center", U8G2GL_ALIGN_CENTER}, {"right", U8G2GL_ALIGN_RIGHT}};
    for (const auto& c : cases) {
        u8g2gl_label firmware;
        firmware.set_coords(0, 0, 100, 10);
        firmware.set_font(u8g2_font_6x10_mr);
        firmware.set_text("ab");
        firmware.set_align(c.enumerator);
        U8G2 expected;
        expected.utf8_width_val = 12;
        render_alone(expected, &firmware);

        host_storage storage;
        const u8g2gl_editor_class& cls = label_class();
        u8g2gl_obj* editor = u8g2gl_editor_construct(cls, storage.bytes, sizeof(storage.bytes));
        ASSERT_NE(editor, nullptr);
        u8g2gl_editor_set_rect(cls, editor, 0, 0, 100, 10);
        u8g2gl_editor_set_property(cls, editor, "font", u8g2gl_editor_pointer(U8G2GL_EDITOR_FONT, u8g2_font_6x10_mr));
        u8g2gl_editor_set_property(cls, editor, "text", u8g2gl_editor_text(U8G2GL_EDITOR_STRING, "ab"));
        ASSERT_TRUE(u8g2gl_editor_set_property(cls, editor, "align", u8g2gl_editor_text(U8G2GL_EDITOR_ENUM, c.text)));
        U8G2 actual;
        actual.utf8_width_val = 12;
        render_alone(actual, editor);
        EXPECT_TRUE(same_call_log(expected, actual)) << "align=" << c.text;
        u8g2gl_editor_destroy(editor);
    }
}

// --- Draw-by-name against the firmware draw call ---

TEST(EditorRegistry, BoxByNameDrawsWhatTheFirmwareDrawCallDraws) {
    // Firmware, as generated for <u8g2gl_box x="4" y="20" width="10" height="6">:
    // the declared defaults filled=true, radius=0 spelled into the call.
    U8G2 expected;
    u8g2gl_draw_box(expected, 4, 20, 10, 6, true, 0);

    const u8g2gl_editor_drawing* box = u8g2gl_editor_find_drawing(ui_editor_registry(), "u8g2gl_box");
    ASSERT_NE(box, nullptr);
    u8g2gl_editor_value args[6];
    args[u8g2gl_editor_find_param(*box, "x")] = u8g2gl_editor_int(4);
    args[u8g2gl_editor_find_param(*box, "y")] = u8g2gl_editor_int(20);
    args[u8g2gl_editor_find_param(*box, "width")] = u8g2gl_editor_int(10);
    args[u8g2gl_editor_find_param(*box, "height")] = u8g2gl_editor_int(6);
    ASSERT_EQ(box->param_count, 6);
    U8G2 actual;
    ASSERT_TRUE(u8g2gl_editor_draw(*box, actual, args, box->param_count));

    EXPECT_TRUE(same_call_log(expected, actual));
    EXPECT_EQ(count_op(actual, "drawBox"), 1);
}

TEST(EditorRegistry, BoxByNameTakesWrittenValuesOverDefaults) {
    // filled=false radius=3 selects U8G2's rounded frame in both paths.
    U8G2 expected;
    u8g2gl_draw_box(expected, 1, 2, 30, 20, false, 3);

    const u8g2gl_editor_drawing* box = u8g2gl_editor_find_drawing(ui_editor_registry(), "u8g2gl_box");
    ASSERT_NE(box, nullptr);
    u8g2gl_editor_value args[6] = {u8g2gl_editor_int(1),  u8g2gl_editor_int(2),     u8g2gl_editor_int(30),
                                   u8g2gl_editor_int(20), u8g2gl_editor_bool(false), u8g2gl_editor_int(3)};
    U8G2 actual;
    ASSERT_TRUE(u8g2gl_editor_draw(*box, actual, args, 6));
    EXPECT_TRUE(same_call_log(expected, actual));
    EXPECT_EQ(count_op(actual, "drawRFrame"), 1);
}

TEST(EditorRegistry, CircleSegmentTextSelectsTheFirmwareEnumerator) {
    U8G2 expected;
    u8g2gl_draw_circle(expected, 100, 40, 10, false, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);

    const u8g2gl_editor_drawing* circle = u8g2gl_editor_find_drawing(ui_editor_registry(), "u8g2gl_circle");
    ASSERT_NE(circle, nullptr);
    u8g2gl_editor_value args[5] = {u8g2gl_editor_int(100), u8g2gl_editor_int(40), u8g2gl_editor_int(10),
                                   u8g2gl_editor_value{}, u8g2gl_editor_text(U8G2GL_EDITOR_ENUM, "upper_left")};
    U8G2 actual;
    ASSERT_TRUE(u8g2gl_editor_draw(*circle, actual, args, 5));
    EXPECT_TRUE(same_call_log(expected, actual));
    EXPECT_EQ(actual.last_draw_circle_option, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);
}

// --- Binding overloads: separate entries, dispatched on the subject's type ---

TEST(EditorRegistry, BindTextKeepsItsStringAndIntOverloadsApart) {
    const u8g2gl_editor_class& cls = label_class();
    const u8g2gl_editor_binding* as_string = u8g2gl_editor_find_binding(cls, "bind_text", U8G2GL_SUBJECT_STRING);
    const u8g2gl_editor_binding* as_int = u8g2gl_editor_find_binding(cls, "bind_text", U8G2GL_SUBJECT_INT);
    ASSERT_NE(as_string, nullptr);
    ASSERT_NE(as_int, nullptr);
    EXPECT_NE(as_string, as_int);
    EXPECT_NE(as_string->bind, as_int->bind);
    // A label's text binds only string and int subjects.
    EXPECT_EQ(u8g2gl_editor_find_binding(cls, "bind_text", U8G2GL_SUBJECT_BOOL), nullptr);
    int bind_text_entries = 0;
    for (uint8_t i = 0; i < cls.binding_count; ++i) {
        bind_text_entries += std::strcmp(cls.bindings[i].name, "bind_text") == 0 ? 1 : 0;
    }
    EXPECT_EQ(bind_text_entries, 2);
}

TEST(EditorRegistry, BindByNameDispatchesOnTheSubjectType) {
    const u8g2gl_editor_class& cls = label_class();
    u8g2gl_subject_int_n<2> count(7);
    u8g2gl_subject_string_n<16, 2> station;

    host_storage int_storage;
    u8g2gl_obj* counted = u8g2gl_editor_construct(cls, int_storage.bytes, sizeof(int_storage.bytes));
    ASSERT_NE(counted, nullptr);
    ASSERT_TRUE(u8g2gl_editor_bind(cls, counted, "bind_text", &count, U8G2GL_SUBJECT_INT, "%d trains"));
    EXPECT_EQ(counted->get_bound_text_type(), U8G2GL_SUBJECT_INT);
    EXPECT_EQ(counted->get_bound_text_subject(), static_cast<void*>(&count));
    EXPECT_STREQ(counted->get_bound_text_fmt(), "%d trains");

    host_storage string_storage;
    u8g2gl_obj* named = u8g2gl_editor_construct(cls, string_storage.bytes, sizeof(string_storage.bytes));
    ASSERT_NE(named, nullptr);
    ASSERT_TRUE(u8g2gl_editor_bind(cls, named, "bind_text", &station, U8G2GL_SUBJECT_STRING, nullptr));
    EXPECT_EQ(named->get_bound_text_type(), U8G2GL_SUBJECT_STRING);
    EXPECT_EQ(named->get_bound_text_subject(), static_cast<void*>(&station));

    u8g2gl_editor_destroy(counted);
    u8g2gl_editor_destroy(named);
}

TEST(EditorRegistry, AFormatOnAnOverloadThatTakesNoneIsRefusedNotDropped) {
    // The manifest declares fmt= on the string bind_text, but the runtime's
    // string overload takes no format (PR-04 WO10 finding 10). Dropping it would
    // draw something the author did not write; the registry refuses instead.
    const u8g2gl_editor_class& cls = label_class();
    u8g2gl_subject_string_n<16, 2> station;
    host_storage storage;
    u8g2gl_obj* obj = u8g2gl_editor_construct(cls, storage.bytes, sizeof(storage.bytes));
    ASSERT_NE(obj, nullptr);
    EXPECT_FALSE(u8g2gl_editor_bind(cls, obj, "bind_text", &station, U8G2GL_SUBJECT_STRING, "%s"));
    EXPECT_EQ(obj->get_bound_text_subject(), nullptr);
    u8g2gl_editor_destroy(obj);
}

// --- What the registry covers ---

TEST(EditorRegistry, CoversEveryClassedAndDrawingManifestAndNoComposite) {
    const u8g2gl_editor_registry& registry = ui_editor_registry();
    for (const char* tag : {"u8g2gl_obj", "u8g2gl_label", "u8g2gl_xbm", "u8g2gl_glyph", "u8g2gl_progress_bar",
                            "u8g2gl_clock", "u8g2gl_switch", "u8g2gl_button"}) {
        EXPECT_NE(u8g2gl_editor_find_class(registry, tag), nullptr) << tag;
        EXPECT_EQ(u8g2gl_editor_find_drawing(registry, tag), nullptr) << tag;
    }
    for (const char* tag : {"u8g2gl_box", "u8g2gl_circle", "u8g2gl_ellipse", "u8g2gl_hline", "u8g2gl_line",
                            "u8g2gl_pixel", "u8g2gl_triangle", "u8g2gl_vline"}) {
        EXPECT_NE(u8g2gl_editor_find_drawing(registry, tag), nullptr) << tag;
        EXPECT_EQ(u8g2gl_editor_find_class(registry, tag), nullptr) << tag;
    }
    // The fixture's composites are expanded before the editor sees them.
    EXPECT_EQ(u8g2gl_editor_find_class(registry, "status_bar"), nullptr);
    EXPECT_EQ(u8g2gl_editor_find_class(registry, "panel"), nullptr);
    EXPECT_EQ(registry.class_count, 8);
    EXPECT_EQ(registry.drawing_count, 8);
    // Every class's storage needs are the class's own.
    EXPECT_EQ(u8g2gl_editor_find_class(registry, "u8g2gl_label")->size, sizeof(u8g2gl_label));
    EXPECT_EQ(u8g2gl_editor_find_class(registry, "u8g2gl_label")->align, alignof(u8g2gl_label));
}

// --- Refusals: a host mistake is false, never a wild cast ---

TEST(EditorRegistry, ConstructionRefusesStorageThatCannotHoldTheClass) {
    const u8g2gl_editor_class& cls = label_class();
    host_storage storage;
    EXPECT_EQ(u8g2gl_editor_construct(cls, nullptr, sizeof(storage.bytes)), nullptr);
    EXPECT_EQ(u8g2gl_editor_construct(cls, storage.bytes, cls.size - 1), nullptr);
    if (cls.align > 1) {
        EXPECT_EQ(u8g2gl_editor_construct(cls, storage.bytes + 1, sizeof(storage.bytes) - 1), nullptr);
    }
}

TEST(EditorRegistry, SetByNameRefusesAWrongTypeAnUnknownNameAndAnUnknownValue) {
    const u8g2gl_editor_class& cls = label_class();
    host_storage storage;
    u8g2gl_obj* obj = u8g2gl_editor_construct(cls, storage.bytes, sizeof(storage.bytes));
    ASSERT_NE(obj, nullptr);
    EXPECT_FALSE(u8g2gl_editor_set_property(cls, obj, "text", u8g2gl_editor_int(3)));
    EXPECT_FALSE(u8g2gl_editor_set_property(cls, obj, "colour", u8g2gl_editor_text(U8G2GL_EDITOR_COLOR, "1")));
    EXPECT_FALSE(u8g2gl_editor_set_property(cls, obj, "align", u8g2gl_editor_text(U8G2GL_EDITOR_ENUM, "middle")));
    EXPECT_EQ(obj->get_resolved_style().align, U8G2GL_ALIGN_LEFT);
    // The rectangle is one thunk, never four properties.
    EXPECT_EQ(u8g2gl_editor_find_property(cls, "x"), nullptr);
    u8g2gl_editor_destroy(obj);
}

TEST(EditorRegistry, DrawByNameRefusesAMissingRequiredArgumentAndDrawsNothing) {
    const u8g2gl_editor_drawing* box = u8g2gl_editor_find_drawing(ui_editor_registry(), "u8g2gl_box");
    ASSERT_NE(box, nullptr);
    u8g2gl_editor_value args[6] = {u8g2gl_editor_int(1), u8g2gl_editor_int(2), u8g2gl_editor_value{},
                                   u8g2gl_editor_int(4)};
    U8G2 display;
    EXPECT_FALSE(u8g2gl_editor_draw(*box, display, args, 6));
    EXPECT_FALSE(u8g2gl_editor_draw(*box, display, args, 5));  // wrong count
    EXPECT_EQ(display.call_log_count, 0);
}

TEST(EditorRegistry, FlagDirectivesByNameMatchTheRuntimeOverloads) {
    const u8g2gl_editor_registry& registry = ui_editor_registry();
    // eq and not_eq for int and bool; gt and lt for int only (u8g2gl_obj.h).
    EXPECT_NE(u8g2gl_editor_find_directive(registry, "bind_flag_if_eq", U8G2GL_SUBJECT_BOOL), nullptr);
    EXPECT_NE(u8g2gl_editor_find_directive(registry, "bind_flag_if_gt", U8G2GL_SUBJECT_INT), nullptr);
    EXPECT_EQ(u8g2gl_editor_find_directive(registry, "bind_flag_if_gt", U8G2GL_SUBJECT_BOOL), nullptr);
    EXPECT_EQ(u8g2gl_editor_find_directive(registry, "bind_flag_if_eq", U8G2GL_SUBJECT_STRING), nullptr);

    u8g2gl_subject_bool_n<2> connected(false);
    host_storage storage;
    u8g2gl_obj* obj = u8g2gl_editor_construct(*u8g2gl_editor_find_class(registry, "u8g2gl_obj"), storage.bytes,
                                              sizeof(storage.bytes));
    ASSERT_NE(obj, nullptr);
    ASSERT_TRUE(u8g2gl_editor_bind_flag(registry, obj, "bind_flag_if_eq", &connected, U8G2GL_SUBJECT_BOOL,
                                        u8g2gl_editor_bool(false), "hidden"));
    EXPECT_TRUE(obj->is_hidden());
    connected.set(true);
    EXPECT_FALSE(obj->is_hidden());
    EXPECT_FALSE(u8g2gl_editor_bind_flag(registry, obj, "bind_flag_if_eq", &connected, U8G2GL_SUBJECT_BOOL,
                                         u8g2gl_editor_bool(false), "invisible"));

    // The guard form: the firmware's `get() != false` for a draw call.
    bool clear = false;
    ASSERT_TRUE(u8g2gl_editor_flag_clear(registry, "bind_flag_if_eq", &connected, U8G2GL_SUBJECT_BOOL,
                                         u8g2gl_editor_bool(false), &clear));
    EXPECT_TRUE(clear);
    connected.set(false);
    ASSERT_TRUE(u8g2gl_editor_flag_clear(registry, "bind_flag_if_eq", &connected, U8G2GL_SUBJECT_BOOL,
                                         u8g2gl_editor_bool(false), &clear));
    EXPECT_FALSE(clear);
    u8g2gl_editor_destroy(obj);
}
