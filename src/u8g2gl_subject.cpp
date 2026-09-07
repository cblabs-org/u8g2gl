#include "u8g2gl/u8g2gl_subject.h"
#include <cstring>

static bool u8g2gl_add_observer_internal(u8g2gl_observer* pool, uint8_t& count, void* user_data, u8g2gl_observer_cb cb) {
    if (!cb) {
        return false;
    }
    for (size_t i = 0; i < U8G2GL_MAX_OBSERVERS; ++i) {
        if (!pool[i].active) {
            pool[i].user_data = user_data;
            pool[i].cb = cb;
            pool[i].active = true;
            if (i >= count) {
                count = static_cast<uint8_t>(i + 1);
            }
            return true;
        }
    }
    return false;
}

static void u8g2gl_notify_observers_internal(const u8g2gl_observer* pool, uint8_t count) {
    for (size_t i = 0; i < count; ++i) {
        if (pool[i].active && pool[i].cb) {
            pool[i].cb(pool[i].user_data);
        }
    }
}

// --- Int Subject ---

u8g2gl_subject_int::u8g2gl_subject_int(int32_t initial)
    : value_(initial) {}

int32_t u8g2gl_subject_int::get() const {
    return value_;
}

void u8g2gl_subject_int::set(int32_t value) {
    if (value_ != value) {
        value_ = value;
        notify();
    }
}

bool u8g2gl_subject_int::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_int::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}

// --- String Subject ---

u8g2gl_subject_string::u8g2gl_subject_string(uint16_t max_len) {
    init(max_len);
}

void u8g2gl_subject_string::init(uint16_t max_len) {
    if (max_len > BUFFER_SIZE) {
        max_len = BUFFER_SIZE;
    }
    if (max_len == 0) {
        max_len = 1;
    }
    max_len_ = max_len;
    buffer_[max_len_ - 1] = '\0';
}

const char* u8g2gl_subject_string::get() const {
    return buffer_;
}

void u8g2gl_subject_string::set(const char* value) {
    if (!value) {
        value = "";
    }
    if (max_len_ == 0) {
        return;
    }
    uint16_t max_chars = max_len_ - 1;
    if (strncmp(buffer_, value, max_chars) == 0 &&
        (strlen(buffer_) == max_chars || value[strlen(buffer_)] == '\0')) {
        return;
    }
    strncpy(buffer_, value, max_chars);
    buffer_[max_chars] = '\0';
    notify();
}

bool u8g2gl_subject_string::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_string::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}

uint16_t u8g2gl_subject_string::get_max_len() const {
    return max_len_;
}

// --- Bool Subject ---

u8g2gl_subject_bool::u8g2gl_subject_bool(bool initial)
    : value_(initial) {}

bool u8g2gl_subject_bool::get() const {
    return value_;
}

void u8g2gl_subject_bool::set(bool value) {
    if (value_ != value) {
        value_ = value;
        notify();
    }
}

bool u8g2gl_subject_bool::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_bool::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}

// --- Time Subject ---

u8g2gl_subject_time::u8g2gl_subject_time(uint32_t initial)
    : value_(initial) {}

uint32_t u8g2gl_subject_time::get() const {
    return value_;
}

void u8g2gl_subject_time::set(uint32_t epoch_secs) {
    if (value_ != epoch_secs) {
        value_ = epoch_secs;
        notify();
    }
}

bool u8g2gl_subject_time::add_observer(void* user_data, u8g2gl_observer_cb cb) {
    return u8g2gl_add_observer_internal(observers_, observer_count_, user_data, cb);
}

void u8g2gl_subject_time::notify() {
    u8g2gl_notify_observers_internal(observers_, observer_count_);
}
