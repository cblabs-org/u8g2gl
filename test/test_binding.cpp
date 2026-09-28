/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_binding.cpp
 *
 * Purpose: Pins the binding capacity invariant the generator counts against
 *          ([D-21], PR-04 WO2): every object binding method, on a successful
 *          first call, consumes exactly one slot of the shared binding pool and
 *          exactly one observer slot on its subject — and when either is
 *          exhausted it fails having consumed neither. If a method consumed
 *          two of either, generated capacities would be silently too small;
 *          if a failure leaked one, capacity would drain without a trace.
 *
 * Description: One templated check, run once per binding method (base object
 *              text and flag bindings, clock bind_time, progress bar and switch
 *              bind_value). Capacity is measured from outside, by counting how
 *              many further registrations succeed, so the test needs no access
 *              to the pool's internals.
 *
 *              Subject observer overflow is a debug-build assert (WO6 Finding B:
 *              an overflow means a generator sizing bug), so every deliberate
 *              overflow here is a death test in debug builds and a plain
 *              return-value check under NDEBUG — the same split
 *              ObserverPool.FullPoolReturnsFalse uses. Exhausting the per-object
 *              pool allowance does not assert; it is checked directly.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_config.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_progress_bar.h"
#include "u8g2gl/u8g2gl_switch.h"

namespace {

// Observer capacity of every subject under test. Two, not one: with a capacity
// of one, "consumed one" and "consumed two" both leave no free slot and cannot
// be told apart.
constexpr uint8_t kSubjectCapacity = 2;

void noop_cb(void* /*user_data*/) {}

// expect_free_observers
// Asserts a subject has exactly `expected` free observer slots: that many
// registrations succeed and the next one overflows. Destructive: the subject is
// full afterwards.
//   subject  — any u8g2gl subject type
//   expected — free slots the subject should have
template <typename Subject>
void expect_free_observers(Subject& subject, int expected) {
    for (int i = 0; i < expected; ++i) {
        ASSERT_TRUE(subject.add_observer(nullptr, noop_cb)) << "free observer " << i;
    }
#ifdef NDEBUG
    EXPECT_FALSE(subject.add_observer(nullptr, noop_cb));
#else
    EXPECT_DEATH(subject.add_observer(nullptr, noop_cb), "observer pool overflow");
#endif
}

// remaining_slots
// Counts how many more bindings the pool will grant this object, by filling it
// with flag bindings. Destructive: the object is at its binding cap afterwards.
//   obj — the object whose pool allowance is measured
int remaining_slots(u8g2gl_obj& obj) {
    // One more observer than the cap, so the per-object cap — not the filler's
    // observer capacity — is always what stops the loop. A local is safe: it is
    // never set, so it never notifies, and the object's destructor releases
    // the pool slots regardless of the filler's lifetime.
    u8g2gl_subject_int_n<U8G2GL_MAX_BINDINGS_PER_OBJ + 1> filler;
    int count = 0;
    while (count <= U8G2GL_MAX_BINDINGS_PER_OBJ &&
           obj.bind_flag_if_eq(&filler, 0, U8G2GL_FLAG_HIDDEN)) {
        ++count;
    }
    return count;
}

// expect_one_slot_one_observer
// Runs the three halves of the invariant for one binding method.
//   Obj     — the object type the method lives on
//   Subject — a subject type of capacity kSubjectCapacity the method accepts
//   bind    — callable (Obj&, Subject&) -> bool performing the binding
template <typename Obj, typename Subject, typename Bind>
void expect_one_slot_one_observer(Bind bind) {
    // --- Step 1: Success consumes exactly one slot and one observer ---
    {
        Subject subject;
        Obj obj;
        ASSERT_TRUE(bind(obj, subject));
        expect_free_observers(subject, kSubjectCapacity - 1);
        EXPECT_EQ(remaining_slots(obj), U8G2GL_MAX_BINDINGS_PER_OBJ - 1);
    }

    // --- Step 2: A full subject fails without leaking a pool slot ---
    // In a debug build the subject's overflow assert fires first, by design;
    // the rollback this checks is the release-build behaviour.
    {
        Subject subject;
        Obj obj;
        for (int i = 0; i < kSubjectCapacity; ++i) {
            ASSERT_TRUE(subject.add_observer(nullptr, noop_cb));
        }
#ifdef NDEBUG
        EXPECT_FALSE(bind(obj, subject));
        EXPECT_EQ(remaining_slots(obj), U8G2GL_MAX_BINDINGS_PER_OBJ);
#else
        EXPECT_DEATH(bind(obj, subject), "observer pool overflow");
#endif
    }

    // --- Step 3: An exhausted pool allowance fails without taking an observer ---
    {
        Subject subject;
        Obj obj;
        ASSERT_EQ(remaining_slots(obj), U8G2GL_MAX_BINDINGS_PER_OBJ);   // fills it
        EXPECT_FALSE(bind(obj, subject));
        expect_free_observers(subject, kSubjectCapacity);
    }
}

using int_subject = u8g2gl_subject_int_n<kSubjectCapacity>;
using bool_subject = u8g2gl_subject_bool_n<kSubjectCapacity>;
using time_subject = u8g2gl_subject_time_n<kSubjectCapacity>;
using string_subject = u8g2gl_subject_string_n<8, kSubjectCapacity>;

}  // namespace

// Self-check: every assertion below rests on the two measuring helpers, so
// prove they report real capacity rather than passing vacuously.
TEST(BindingInvariant, HelpersMeasureCapacity) {
    int_subject subject;
    expect_free_observers(subject, kSubjectCapacity);

    u8g2gl_obj obj;
    EXPECT_EQ(remaining_slots(obj), U8G2GL_MAX_BINDINGS_PER_OBJ);
    EXPECT_EQ(remaining_slots(obj), 0);
}

TEST(BindingInvariant, BindTextInt) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_text(&s, "%d"); });
}

TEST(BindingInvariant, BindTextString) {
    expect_one_slot_one_observer<u8g2gl_obj, string_subject>(
        [](u8g2gl_obj& o, string_subject& s) { return o.bind_text(&s); });
}

TEST(BindingInvariant, BindFlagIfEqInt) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_flag_if_eq(&s, 0, U8G2GL_FLAG_HIDDEN); });
}

TEST(BindingInvariant, BindFlagIfNotEqInt) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_flag_if_not_eq(&s, 0, U8G2GL_FLAG_HIDDEN); });
}

TEST(BindingInvariant, BindFlagIfGt) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_flag_if_gt(&s, 0, U8G2GL_FLAG_HIDDEN); });
}

TEST(BindingInvariant, BindFlagIfLt) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_flag_if_lt(&s, 0, U8G2GL_FLAG_HIDDEN); });
}

TEST(BindingInvariant, BindFlagIfEqBoolIntRef) {
    expect_one_slot_one_observer<u8g2gl_obj, bool_subject>(
        [](u8g2gl_obj& o, bool_subject& s) {
            return o.bind_flag_if_eq(&s, static_cast<int32_t>(0), U8G2GL_FLAG_HIDDEN);
        });
}

TEST(BindingInvariant, BindFlagIfEqBoolBoolRef) {
    expect_one_slot_one_observer<u8g2gl_obj, bool_subject>(
        [](u8g2gl_obj& o, bool_subject& s) { return o.bind_flag_if_eq(&s, false, U8G2GL_FLAG_HIDDEN); });
}

TEST(BindingInvariant, BindFlagIfNotEqBoolIntRef) {
    expect_one_slot_one_observer<u8g2gl_obj, bool_subject>(
        [](u8g2gl_obj& o, bool_subject& s) {
            return o.bind_flag_if_not_eq(&s, static_cast<int32_t>(0), U8G2GL_FLAG_HIDDEN);
        });
}

TEST(BindingInvariant, BindFlagIfNotEqBoolBoolRef) {
    expect_one_slot_one_observer<u8g2gl_obj, bool_subject>(
        [](u8g2gl_obj& o, bool_subject& s) { return o.bind_flag_if_not_eq(&s, false, U8G2GL_FLAG_HIDDEN); });
}

// [D-20] geometry bindings (PR-04 WO3).
TEST(BindingInvariant, BindX) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_x(&s, 0); });
}

TEST(BindingInvariant, BindY) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_y(&s, 0); });
}

TEST(BindingInvariant, BindWidth) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_width(&s); });
}

TEST(BindingInvariant, BindHeight) {
    expect_one_slot_one_observer<u8g2gl_obj, int_subject>(
        [](u8g2gl_obj& o, int_subject& s) { return o.bind_height(&s); });
}

TEST(BindingInvariant, ClockBindTime) {
    expect_one_slot_one_observer<u8g2gl_clock, time_subject>(
        [](u8g2gl_clock& o, time_subject& s) { return o.bind_time(&s); });
}

TEST(BindingInvariant, ProgressBarBindValue) {
    expect_one_slot_one_observer<u8g2gl_progress_bar, int_subject>(
        [](u8g2gl_progress_bar& o, int_subject& s) { return o.bind_value(&s); });
}

TEST(BindingInvariant, SwitchBindValue) {
    expect_one_slot_one_observer<u8g2gl_switch, bool_subject>(
        [](u8g2gl_switch& o, bool_subject& s) { return o.bind_value(&s); });
}

TEST(BindingInvariant, NullSubjectConsumesNothing) {
    u8g2gl_clock clock;
    u8g2gl_progress_bar bar;
    u8g2gl_switch sw;
    EXPECT_FALSE(clock.bind_time(nullptr));
    EXPECT_FALSE(bar.bind_value(nullptr));
    EXPECT_FALSE(sw.bind_value(nullptr));
    EXPECT_FALSE(clock.bind_text(static_cast<u8g2gl_subject_int_base*>(nullptr)));
    EXPECT_EQ(remaining_slots(clock), U8G2GL_MAX_BINDINGS_PER_OBJ);
}
