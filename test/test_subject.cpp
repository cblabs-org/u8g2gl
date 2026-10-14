/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_subject.cpp
 *
 * Purpose: Verifies the four scalar subject types (§8.1) and the object
 *          bindings built on them: set/get, notify-only-on-change, per-subject
 *          observer capacity ([D-21]), string truncation at the declared length
 *          (§8.2), and that conditional-flag, text and geometry bindings
 *          propagate a subject's value into an object and mark it dirty.
 *
 * Description: GoogleTest cases for u8g2gl_subject_* and the u8g2gl_obj bind_*
 *              entry points, including observer-pool exhaustion.
 */
#include <gtest/gtest.h>
#include <cstring>
#include <type_traits>
#include <utility>
#include "u8g2gl/u8g2gl_config.h"
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_obj.h"

// --- Helper Observer Callbacks ---

static void count_observer_cb(void* user_data) {
    if (user_data) {
        auto* counter = static_cast<int*>(user_data);
        (*counter)++;
    }
}

// --- Int Subject Tests ---

TEST(SubjectInt, DefaultValue) {
    u8g2gl_subject_int s;
    EXPECT_EQ(s.get(), 0);
}

TEST(SubjectInt, SetAndGet) {
    u8g2gl_subject_int s;
    s.set(42);
    EXPECT_EQ(s.get(), 42);

    u8g2gl_subject_int s_init(100);
    EXPECT_EQ(s_init.get(), 100);
}

TEST(SubjectInt, NotifiesOnChange) {
    u8g2gl_subject_int s;
    int counter = 0;
    EXPECT_TRUE(s.add_observer(&counter, count_observer_cb));

    s.set(1);
    EXPECT_EQ(counter, 1);

    s.set(1);
    EXPECT_EQ(counter, 1); // No change, no notify

    s.set(2);
    EXPECT_EQ(counter, 2);
}

TEST(SubjectInt, MultipleObservers) {
    u8g2gl_subject_int s;
    int counter1 = 0;
    int counter2 = 0;
    EXPECT_TRUE(s.add_observer(&counter1, count_observer_cb));
    EXPECT_TRUE(s.add_observer(&counter2, count_observer_cb));

    s.set(5);
    EXPECT_EQ(counter1, 1);
    EXPECT_EQ(counter2, 1);

    s.set(10);
    EXPECT_EQ(counter1, 2);
    EXPECT_EQ(counter2, 2);
}

// --- String Subject Tests ---

TEST(SubjectString, DefaultEmpty) {
    u8g2gl_subject_string s;
    EXPECT_STREQ(s.get(), "");
    EXPECT_EQ(s.get_max_len(), 32);
}

TEST(SubjectString, SetAndGet) {
    u8g2gl_subject_string s;
    s.set("hello");
    EXPECT_STREQ(s.get(), "hello");
}

TEST(SubjectString, CopySemantics) {
    u8g2gl_subject_string s;
    char local_buf[32] = "original";
    s.set(local_buf);

    // Modify local buffer
    std::strcpy(local_buf, "modified");

    // s should retain "original"
    EXPECT_STREQ(s.get(), "original");
}

TEST(SubjectString, Truncation) {
    // WO6 Finding A: max_len is the declared *usable character* capacity
    // (matching design_spec.md §8.2's "sized by max_len" wording); the
    // buffer allocated is max_len+1 bytes for the terminator. Previously
    // this runtime accepted max_len as "total buffer bytes including the
    // terminator" (an undocumented off-by-one baked into the same spec
    // violation Finding A fixes), so 8 gave 7 usable chars. That was never
    // a declared contract, only the old buffer's incidental behaviour, so
    // this assertion is updated rather than preserved: 8 now means 8 usable
    // characters.
    u8g2gl_subject_string s;
    s.init(8);
    EXPECT_EQ(s.get_max_len(), 8);

    s.set("longstring123");
    EXPECT_EQ(std::strlen(s.get()), 8u);
    EXPECT_STREQ(s.get(), "longstri");
}

TEST(SubjectString, TemplatedCapacityTruncates) {
    // A string subject declared with a smaller compile-time MaxLen (WO6
    // Finding A) truncates and null-terminates at that capacity without
    // needing init() at all.
    u8g2gl_subject_string_n<16> s;
    EXPECT_EQ(s.get_max_len(), 16u);
    EXPECT_EQ(s.get_capacity(), 17u);   // MaxLen + 1 for the terminator

    s.set("this string is definitely longer than sixteen characters");
    EXPECT_EQ(std::strlen(s.get()), 16u);
    EXPECT_STREQ(s.get(), "this string is d");
}

TEST(SubjectString, DistinctCapacitiesCoexist) {
    // Distinct MaxLen/N instantiations in the same translation unit must
    // not collide or share storage/logic incorrectly (WO6 Finding A/B: no
    // logic lives in the template, only storage).
    u8g2gl_subject_string_n<4> small;
    u8g2gl_subject_string_n<32> big;

    small.set("hello world");
    big.set("hello world");

    EXPECT_STREQ(small.get(), "hell");
    EXPECT_STREQ(big.get(), "hello world");
    EXPECT_EQ(small.get_capacity(), 5u);
    EXPECT_EQ(big.get_capacity(), 33u);
}

TEST(SubjectString, NotifiesOnChange) {
    u8g2gl_subject_string s;
    int counter = 0;
    EXPECT_TRUE(s.add_observer(&counter, count_observer_cb));

    s.set("a");
    EXPECT_EQ(counter, 1);

    s.set("a");
    EXPECT_EQ(counter, 1); // same value, not notified

    s.set("b");
    EXPECT_EQ(counter, 2);
}

TEST(SubjectString, NullptrSafety) {
    u8g2gl_subject_string s;
    s.set("foo");
    EXPECT_STREQ(s.get(), "foo");

    s.set(nullptr);
    EXPECT_STREQ(s.get(), "");
}

// --- Bool Subject Tests ---

TEST(SubjectBool, DefaultFalse) {
    u8g2gl_subject_bool s;
    EXPECT_FALSE(s.get());

    u8g2gl_subject_bool s_init(true);
    EXPECT_TRUE(s_init.get());
}

TEST(SubjectBool, SetAndGet) {
    u8g2gl_subject_bool s;
    s.set(true);
    EXPECT_TRUE(s.get());

    s.set(false);
    EXPECT_FALSE(s.get());
}

TEST(SubjectBool, NotifiesOnChange) {
    u8g2gl_subject_bool s;
    int counter = 0;
    EXPECT_TRUE(s.add_observer(&counter, count_observer_cb));

    s.set(true);
    EXPECT_EQ(counter, 1);

    s.set(true);
    EXPECT_EQ(counter, 1); // same value, not notified

    s.set(false);
    EXPECT_EQ(counter, 2);
}

// --- Time Subject Tests ---

TEST(SubjectTime, DefaultZero) {
    u8g2gl_subject_time s;
    EXPECT_EQ(s.get(), 0u);

    u8g2gl_subject_time s_init(1000u);
    EXPECT_EQ(s_init.get(), 1000u);
}

TEST(SubjectTime, SetAndGet) {
    u8g2gl_subject_time s;
    s.set(1693000000u);
    EXPECT_EQ(s.get(), 1693000000u);
}

TEST(SubjectTime, NotifiesOnChange) {
    u8g2gl_subject_time s;
    int counter = 0;
    EXPECT_TRUE(s.add_observer(&counter, count_observer_cb));

    s.set(100u);
    EXPECT_EQ(counter, 1);

    s.set(100u);
    EXPECT_EQ(counter, 1); // same, not notified

    s.set(200u);
    EXPECT_EQ(counter, 2);
}

// --- Conditional Flag Bindings ---

TEST(Binding, FlagIfEqSetsHidden) {
    u8g2gl_subject_int subject(1);
    u8g2gl_obj obj;
    obj.bind_flag_if_eq(&subject, 0, U8G2GL_FLAG_HIDDEN);

    // Initially subject=1 != 0 -> not hidden
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(0);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(1);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
}

TEST(Binding, FlagIfNotEq) {
    u8g2gl_subject_int subject(0);
    u8g2gl_obj obj;
    obj.bind_flag_if_not_eq(&subject, 0, U8G2GL_FLAG_DISABLED);

    // Initially subject=0 == 0 -> not disabled
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DISABLED));

    subject.set(5);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_DISABLED));

    subject.set(0);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DISABLED));
}

TEST(Binding, FlagIfGt) {
    u8g2gl_subject_int subject(5);
    u8g2gl_obj obj;
    obj.bind_flag_if_gt(&subject, 10, U8G2GL_FLAG_HIDDEN);

    // Initially subject=5 <= 10 -> not hidden
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(15);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(5);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
}

TEST(Binding, FlagIfLt) {
    u8g2gl_subject_int subject(15);
    u8g2gl_obj obj;
    obj.bind_flag_if_lt(&subject, 10, U8G2GL_FLAG_HIDDEN);

    // Initially subject=15 >= 10 -> not hidden
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(5);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(15);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
}

// A hand-written integer reference on a bool subject: 0 converts to false.
TEST(Binding, BoolFlagIfEq) {
    u8g2gl_subject_bool subject(true);
    u8g2gl_obj obj;
    obj.bind_flag_if_eq(&subject, 0, U8G2GL_FLAG_HIDDEN);

    // subject=true (1 != 0) -> not hidden
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(false);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_HIDDEN));

    subject.set(true);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_HIDDEN));
}

// A bool subject's comparison resolves to exactly one overload whatever integer
// type the reference has. With an int32_t overload beside the bool one, a
// reference of a type other than int32_t converted to both at the same rank:
// on xtensa (ESP32) int32_t is long, so a literal 0 was ambiguous there while
// the host, where int32_t is int, compiled it. `0L` and `0LL` reproduce that
// ambiguity on any host, since one of them always differs from int32_t.
template <typename Ref, typename = void>
struct bool_eq_resolves : std::false_type {};
template <typename Ref>
struct bool_eq_resolves<Ref, decltype(void(std::declval<u8g2gl_obj&>().bind_flag_if_eq(
                                 std::declval<u8g2gl_subject_bool_base*>(), std::declval<Ref>(),
                                 uint8_t{0})))> : std::true_type {};
template <typename Ref, typename = void>
struct bool_not_eq_resolves : std::false_type {};
template <typename Ref>
struct bool_not_eq_resolves<Ref, decltype(void(std::declval<u8g2gl_obj&>().bind_flag_if_not_eq(
                                     std::declval<u8g2gl_subject_bool_base*>(), std::declval<Ref>(),
                                     uint8_t{0})))> : std::true_type {};

TEST(Binding, BoolComparisonResolvesForEveryIntegerType) {
    static_assert(bool_eq_resolves<bool>::value, "bool");
    static_assert(bool_eq_resolves<int>::value, "int");
    static_assert(bool_eq_resolves<long>::value, "long");
    static_assert(bool_eq_resolves<long long>::value, "long long");
    static_assert(bool_not_eq_resolves<int>::value, "int");
    static_assert(bool_not_eq_resolves<long>::value, "long");
    static_assert(bool_not_eq_resolves<long long>::value, "long long");

    // And each integer form means what the bool form means.
    u8g2gl_subject_bool subject(false);
    u8g2gl_obj by_long;
    u8g2gl_obj by_bool;
    by_long.bind_flag_if_eq(&subject, 0L, U8G2GL_FLAG_HIDDEN);
    by_bool.bind_flag_if_eq(&subject, false, U8G2GL_FLAG_HIDDEN);
    EXPECT_TRUE(by_long.has_flag(U8G2GL_FLAG_HIDDEN));
    EXPECT_EQ(by_long.has_flag(U8G2GL_FLAG_HIDDEN), by_bool.has_flag(U8G2GL_FLAG_HIDDEN));
    subject.set(true);
    EXPECT_FALSE(by_long.has_flag(U8G2GL_FLAG_HIDDEN));
    EXPECT_EQ(by_long.has_flag(U8G2GL_FLAG_HIDDEN), by_bool.has_flag(U8G2GL_FLAG_HIDDEN));
}

TEST(Binding, BoolFlagIfNotEq) {
    u8g2gl_subject_bool subject(false);
    u8g2gl_obj obj;
    obj.bind_flag_if_not_eq(&subject, false, U8G2GL_FLAG_DISABLED);

    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DISABLED));

    subject.set(true);
    EXPECT_TRUE(obj.has_flag(U8G2GL_FLAG_DISABLED));

    subject.set(false);
    EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DISABLED));
}

TEST(Binding, BindTextInt) {
    u8g2gl_subject_int subject(22);
    u8g2gl_obj obj;
    obj.bind_text(&subject, "%d°C");

    EXPECT_EQ(obj.get_bound_text_subject(), &subject);
    EXPECT_STREQ(obj.get_bound_text_fmt(), "%d°C");
    EXPECT_EQ(obj.get_bound_text_type(), U8G2GL_SUBJECT_INT);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    EXPECT_FALSE(obj.is_dirty());

    subject.set(23);
    EXPECT_TRUE(obj.is_dirty());
}

TEST(Binding, BindTextString) {
    u8g2gl_subject_string subject;
    subject.set("London");
    u8g2gl_obj obj;
    obj.bind_text(&subject);

    EXPECT_EQ(obj.get_bound_text_subject(), &subject);
    EXPECT_EQ(obj.get_bound_text_fmt(), nullptr);
    EXPECT_EQ(obj.get_bound_text_type(), U8G2GL_SUBJECT_STRING);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    EXPECT_FALSE(obj.is_dirty());

    subject.set("Paris");
    EXPECT_TRUE(obj.is_dirty());
}

// WO6 Round 2: prove Findings A and B are actually reachable through the
// *public* binding API — a right-sized subject (non-default capacity, and
// for strings a non-default declared length) must bind, fire its observer,
// and propagate its value, exactly like a default-capacity subject does.
TEST(Binding, RightSizedIntSubjectBindsAndPropagates) {
    u8g2gl_subject_int_n<2> subject(5);   // capacity 2, not the default 4
    u8g2gl_obj obj;
    obj.bind_text(&subject, "%d");

    EXPECT_EQ(obj.get_bound_text_subject(), &subject);
    EXPECT_EQ(obj.get_bound_text_type(), U8G2GL_SUBJECT_INT);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    EXPECT_FALSE(obj.is_dirty());

    subject.set(6);
    EXPECT_TRUE(obj.is_dirty());   // observer fired -> obj marked dirty
    EXPECT_EQ(subject.get(), 6);   // value actually propagated

    // A second binding style (conditional flag) must also work at this
    // non-default capacity.
    u8g2gl_obj obj2;
    obj2.bind_flag_if_eq(&subject, 6, U8G2GL_FLAG_HIDDEN);
    EXPECT_TRUE(obj2.has_flag(U8G2GL_FLAG_HIDDEN));
    subject.set(7);
    EXPECT_FALSE(obj2.has_flag(U8G2GL_FLAG_HIDDEN));
}

TEST(Binding, RightSizedStringSubjectBindsAndPropagates) {
    u8g2gl_subject_string_n<16> subject;   // declared length 16, not default 32
    subject.set("London");
    u8g2gl_obj obj;
    obj.bind_text(&subject);

    EXPECT_EQ(obj.get_bound_text_subject(), &subject);
    EXPECT_EQ(obj.get_bound_text_type(), U8G2GL_SUBJECT_STRING);
    EXPECT_TRUE(obj.is_dirty());

    obj.clear_dirty();
    EXPECT_FALSE(obj.is_dirty());

    subject.set("Paris");
    EXPECT_TRUE(obj.is_dirty());          // observer fired -> obj marked dirty
    EXPECT_STREQ(subject.get(), "Paris"); // value actually propagated
}

// --- PR-3R WO7: U8G2GL_MAX_BINDINGS_PER_OBJ raised 4 -> 8 ([D-20], [D-21]) ---

// [D-20] made x, y, width and height bindable; an element binding all four
// geometry properties plus its text needs 5 concurrent binding slots on one
// object. At the old default of 4 the 5th binding here failed, and at the time
// nothing could tell: the bind_* wrappers discarded the pool's result. Since
// PR-04 WO2 every object binding returns bool, and since WO3 the real geometry
// bindings (bind_x/y/width/height) exist, so this test binds those directly and
// checks every return rather than inferring success from side effects.
TEST(Binding, FourGeometryBindingsPlusTextFitTheDefaultBudget) {
    u8g2gl_obj obj;
    u8g2gl_subject_int geom_x(5), geom_y(6), geom_w(7), geom_h(8);
    u8g2gl_subject_int text_subject(42);

    EXPECT_TRUE(obj.bind_x(&geom_x, 0));
    EXPECT_TRUE(obj.bind_y(&geom_y, 0));
    EXPECT_TRUE(obj.bind_width(&geom_w));
    EXPECT_TRUE(obj.bind_height(&geom_h));
    EXPECT_TRUE(obj.bind_text(&text_subject, "%d"));

    // Each binding applies the subject's current value at once, so all five
    // slots are live, not merely registered.
    EXPECT_EQ(obj.get_x(), 5);
    EXPECT_EQ(obj.get_y(), 6);
    EXPECT_EQ(obj.get_w(), 7);
    EXPECT_EQ(obj.get_h(), 8);
    EXPECT_EQ(obj.get_bound_text_subject(), &text_subject);
}

// --- Observer Pool Tests ---

TEST(ObserverPool, FullPoolReturnsFalse) {
    u8g2gl_subject_int subject;
    int counter = 0;

    for (size_t i = 0; i < U8G2GL_DEFAULT_OBSERVERS; ++i) {
        EXPECT_TRUE(subject.add_observer(&counter, count_observer_cb));
    }

    // Next add_observer should fail (pool full). WO6 Finding B: overflow
    // past capacity is also a debug-build assert (a real overflow means a
    // generator sizing bug, per §13) — this deliberately-triggered overflow
    // must therefore go through a death test in debug builds, and a plain
    // return-value check in release (NDEBUG) builds where assert() is a
    // no-op.
#ifdef NDEBUG
    EXPECT_FALSE(subject.add_observer(&counter, count_observer_cb));
#else
    EXPECT_DEATH(subject.add_observer(&counter, count_observer_cb), "");
#endif
}

TEST(ObserverPool, NullCallbackRejected) {
    u8g2gl_subject_int subject;
    EXPECT_FALSE(subject.add_observer(nullptr, nullptr));
}

TEST(ObserverPool, DistinctCapacitiesOverflowIndependently) {
    // WO6 Finding B: per-subject observer capacity — a subject declared
    // with a smaller capacity overflows (and coexists correctly) independent
    // of one declared with a larger capacity.
    u8g2gl_subject_int_n<2> small;
    u8g2gl_subject_int_n<6> big;
    int counter = 0;

    EXPECT_TRUE(small.add_observer(&counter, count_observer_cb));
    EXPECT_TRUE(small.add_observer(&counter, count_observer_cb));
#ifdef NDEBUG
    EXPECT_FALSE(small.add_observer(&counter, count_observer_cb));
#else
    EXPECT_DEATH(small.add_observer(&counter, count_observer_cb), "");
#endif

    for (int i = 0; i < 6; ++i) {
        EXPECT_TRUE(big.add_observer(&counter, count_observer_cb));
    }
#ifdef NDEBUG
    EXPECT_FALSE(big.add_observer(&counter, count_observer_cb));
#else
    EXPECT_DEATH(big.add_observer(&counter, count_observer_cb), "");
#endif
}

// --- PR-05R2 WO6: subjects are not copyable or movable ---
// observers_ points into the subject's own storage, so a copy or move would
// alias the source's array. These fail to compile if a deletion is dropped.

template <typename T>
static constexpr bool is_pinned_v =
    !std::is_copy_constructible_v<T> && !std::is_copy_assignable_v<T> &&
    !std::is_move_constructible_v<T> && !std::is_move_assignable_v<T>;

static_assert(is_pinned_v<u8g2gl_subject_int>, "int subject must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_string>, "string subject must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_bool>, "bool subject must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_time>, "time subject must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_int_n<2>>, "sized int subject must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_string_n<8, 2>>, "sized string subject must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_int_base>, "int base must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_string_base>, "string base must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_bool_base>, "bool base must be pinned");
static_assert(is_pinned_v<u8g2gl_subject_time_base>, "time base must be pinned");

TEST(SubjectCopy, TypesAreNonCopyableAndNonMovable) {
    SUCCEED();   // the assertions above are the test
}
