#include <gtest/gtest.h>
#include <cstring>
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
    u8g2gl_subject_string s;
    s.init(8);
    EXPECT_EQ(s.get_max_len(), 8);

    s.set("longstring123");
    // max_len = 8 means 7 chars + null terminator
    EXPECT_EQ(std::strlen(s.get()), 7u);
    EXPECT_STREQ(s.get(), "longstr");
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

// --- Observer Pool Tests ---

TEST(ObserverPool, FullPoolReturnsFalse) {
    u8g2gl_subject_int subject;
    int counter = 0;

    for (size_t i = 0; i < U8G2GL_MAX_OBSERVERS; ++i) {
        EXPECT_TRUE(subject.add_observer(&counter, count_observer_cb));
    }

    // Next add_observer should fail (pool full)
    EXPECT_FALSE(subject.add_observer(&counter, count_observer_cb));
}

TEST(ObserverPool, NullCallbackRejected) {
    u8g2gl_subject_int subject;
    EXPECT_FALSE(subject.add_observer(nullptr, nullptr));
}
