/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_subject.cpp
 * Description: Implementation of u8g2gl_subject.cpp
 */
#include "u8g2gl/u8g2gl_subject.h"
#include <cassert>
#include <cstring>

// Shared observer-pool logic used by all subject `_base` classes. Operates on
// caller-owned storage (pointer + capacity) so no logic is duplicated across
// the differently-sized template instantiations (WO6 Finding B).

static bool u8g2gl_add_observer_internal(u8g2gl_observer* pool, uint8_t capacity, uint8_t& count,
                                          void* user_data, u8g2gl_observer_cb cb) {
    if (!cb) {
        return false;
    }
    for (uint8_t i = 0; i < capacity; ++i) {
        if (pool[i].cb == nullptr) {
            pool[i].user_data = user_data;
            pool[i].cb = cb;
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

void u8g2gl_subject_int_base::set(int32_t value) {
    if (value_ != value) {
        value_ = value;
        notify();
    }
}

bool u8g2gl_subject_int_base::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, capacity_, observer_count_, user_data, cb);
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

void u8g2gl_subject_string_base::set(const char* value) {
    if (!value) {
        value = "";
    }
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

void u8g2gl_subject_time_base::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}
