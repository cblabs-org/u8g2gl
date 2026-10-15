/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_subject.cpp
 * Purpose: Implements the subject types' shared logic. All of it lives in the
 *          non-template _base classes so that sizing a subject differently does
 *          not duplicate code — a u8g2gl_subject_int_n<2> and an <8> share every
 *          instruction here and differ only in the storage they own.
 *
 *          Setting a value notifies observers only when it actually changed.
 *          That check is what stops a controller writing the same value every
 *          loop from marking the frame dirty and defeating the render gate.
 *
 * Description: Value storage and comparison, observer registration with capacity
 *              checking, and change notification for the int, string, bool and
 *              time subjects
 */
#include "u8g2gl/u8g2gl_subject.h"
#include <cassert>
#include <cstring>

// Shared observer-pool logic used by all subject `_base` classes. Operates on
// caller-owned storage (pointer + capacity) so no logic is duplicated across
// the differently-sized template instantiations (WO6 Finding B).

// u8g2gl_add_observer_internal
// Registration shared by all four subject types. Lives here rather than in each
// _base class so the logic exists once — the whole point of the base/template
// split is that sizing a subject differently must not duplicate code.
//   pool      — the subject's observer slots, owned by its _n<> wrapper
//   capacity  — how many slots that wrapper actually allocated
//   count     — high-water mark, updated in place; see the note below
//   user_data — context handed back to the callback, opaque here
//   cb        — the callback; a null cb marks a slot free, so it may not be null
static bool u8g2gl_add_observer_internal(u8g2gl_observer* pool, uint8_t capacity, uint8_t& count,
                                          void* user_data, u8g2gl_observer_cb cb) {
    if (!cb) {
        return false;
    }
    // Take the first free slot. A null cb is the free marker — there is no
    // separate 'active' flag, because one would cost a byte per slot and force
    // padding to pointer alignment in a struct instantiated per binding.
    for (uint8_t i = 0; i < capacity; ++i) {
        if (pool[i].cb == nullptr) {
            pool[i].user_data = user_data;
            pool[i].cb = cb;

            // `count` is a high-water mark bounding the notify loop, not a
            // population count. It only ever grows, so a slot freed below the
            // mark is skipped by the null check rather than by shrinking this —
            // which keeps registration O(1) after the scan and avoids having to
            // compact the pool.
            if (i >= count) {
                count = static_cast<uint8_t>(i + 1);
            }
            return true;
        }
    }
    // §13: the generator sizes each subject's observer pool to the exact
    // number of objects that bind to it, so reaching capacity here means a
    // sizing bug, not a load spike to tolerate silently. Fail loudly in
    // debug; still degrade gracefully (return false) in release.
    assert(false && "u8g2gl: observer pool overflow (increase subject's observer capacity)");
    return false;
}

// u8g2gl_remove_observer_internal
// Unregisters an observer by matching both user_data and cb. Lives here so the
// logic exists once across all four subject types.
//   pool      — the subject's observer slots, owned by its _n<> wrapper
//   count     — high-water mark bounding the scan
//   user_data — context pointer registered with the callback
//   cb        — callback pointer registered
//
// Matches by (user_data, cb) pair, not user_data alone, because an object with
// multiple bindings on one subject passes itself (or its binding desc) as
// user_data for all of them, and removing by user_data alone would silently
// take all of them.
// Does not compact the pool or decrement count ([D-1]); nulls out the slot,
// leaving existing observers at their indices and maintaining their notify order.
static bool u8g2gl_remove_observer_internal(u8g2gl_observer* pool, uint8_t count,
                                            void* user_data, u8g2gl_observer_cb cb) {
    if (!cb) {
        return false;
    }
    for (uint8_t i = 0; i < count; ++i) {
        if (pool[i].cb == cb && pool[i].user_data == user_data) {
            pool[i].cb = nullptr;
            pool[i].user_data = nullptr;
            return true;
        }
    }
    return false;
}

// u8g2gl_notify_observers_internal
// Fires every registered observer. Callers reach here only when a value actually
// changed, so this does no comparison of its own.
//   pool  — the subject's observer slots
//   count — high-water mark; slots below it may still be free, hence the check
static void u8g2gl_notify_observers_internal(const u8g2gl_observer* pool, uint8_t count) {
    for (uint8_t i = 0; i < count; ++i) {
        if (pool[i].cb != nullptr) {
            pool[i].cb(pool[i].user_data);
        }
    }
}

// --- Int Subject ---

u8g2gl_subject_int_base::u8g2gl_subject_int_base(u8g2gl_observer* slots, uint8_t capacity, int32_t initial)
    : observers_(slots), value_(initial), capacity_(capacity) {}

int32_t u8g2gl_subject_int_base::get() const {
    return value_;
}

// u8g2gl_subject_int_base::set
// Stores a new value and notifies observers, but only when the value actually
// changed. That guard is what stops a controller writing the same value every
// loop from marking the frame dirty on every pass and defeating the render gate
// ([D-4]) — with it, an idle screen costs a tick and nothing else.
//   value — the new value
void u8g2gl_subject_int_base::set(int32_t value) {
    if (value_ != value) {
        value_ = value;
        notify();
    }
}

bool u8g2gl_subject_int_base::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, capacity_, observer_count_, user_data, cb);
}

bool u8g2gl_subject_int_base::remove_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_remove_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_int_base::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}

// --- String Subject ---

u8g2gl_subject_string_base::u8g2gl_subject_string_base(char* buffer, uint16_t buffer_capacity,
                                                         u8g2gl_observer* slots, uint8_t observer_capacity)
    : buffer_(buffer),
      observers_(slots),
      buffer_capacity_(buffer_capacity),
      max_len_(buffer_capacity > 0 ? static_cast<uint16_t>(buffer_capacity - 1) : 0),
      observer_capacity_(observer_capacity) {
    buffer_[0] = '\0';
}

void u8g2gl_subject_string_base::init(uint16_t max_len) {
    uint16_t max_capacity = buffer_capacity_ > 0 ? static_cast<uint16_t>(buffer_capacity_ - 1) : 0;
    if (max_len > max_capacity) {
        max_len = max_capacity;
    }
    max_len_ = max_len;
    buffer_[max_len_] = '\0';
}

const char* u8g2gl_subject_string_base::get() const {
    return buffer_;
}

// u8g2gl_subject_string_base::set
// Copies a string into the subject's own buffer, truncating at max_len, and
// notifies only if the stored text actually changed.
//
// The copy is what makes the caller's buffer irrelevant afterwards — the
// alternative, storing the pointer, was rejected because it creates a lifetime
// contract a caller cannot reasonably honour for transient data (§8.2, [D-8]).
//   value — source string; nullptr is treated as empty rather than rejected,
//           since a null here is far more often an unset field than a bug
void u8g2gl_subject_string_base::set(const char* value) {
    if (!value) {
        value = "";
    }

    // Compare against what is actually stored, which is the truncated form.
    // Comparing against the full input would report a change every time a
    // too-long string was written, even though the stored text is identical.
    uint16_t max_chars = max_len_;
    if (strncmp(buffer_, value, max_chars) == 0 &&
        (strlen(buffer_) == max_chars || value[strlen(buffer_)] == '\0')) {
        return;
    }
    strncpy(buffer_, value, max_chars);
    buffer_[max_chars] = '\0';
    notify();
}

bool u8g2gl_subject_string_base::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, observer_capacity_, observer_count_, user_data, cb);
}

bool u8g2gl_subject_string_base::remove_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_remove_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_string_base::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}

uint16_t u8g2gl_subject_string_base::get_max_len() const {
    return max_len_;
}

uint16_t u8g2gl_subject_string_base::get_capacity() const {
    return buffer_capacity_;
}

// --- Bool Subject ---

u8g2gl_subject_bool_base::u8g2gl_subject_bool_base(u8g2gl_observer* slots, uint8_t capacity, bool initial)
    : observers_(slots), value_(initial), capacity_(capacity) {}

bool u8g2gl_subject_bool_base::get() const {
    return value_;
}

void u8g2gl_subject_bool_base::set(bool value) {
    if (value_ != value) {
        value_ = value;
        notify();
    }
}

bool u8g2gl_subject_bool_base::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, capacity_, observer_count_, user_data, cb);
}

bool u8g2gl_subject_bool_base::remove_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_remove_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_bool_base::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}

// --- Time Subject ---

u8g2gl_subject_time_base::u8g2gl_subject_time_base(u8g2gl_observer* slots, uint8_t capacity, uint32_t initial)
    : observers_(slots), value_(initial), capacity_(capacity) {}

uint32_t u8g2gl_subject_time_base::get() const {
    return value_;
}

void u8g2gl_subject_time_base::set(uint32_t epoch_secs) {
    if (value_ != epoch_secs) {
        value_ = epoch_secs;
        notify();
    }
}

bool u8g2gl_subject_time_base::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, capacity_, observer_count_, user_data, cb);
}

bool u8g2gl_subject_time_base::remove_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_remove_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_time_base::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}
