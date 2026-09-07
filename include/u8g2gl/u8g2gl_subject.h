#ifndef U8G2GL_SUBJECT_H
#define U8G2GL_SUBJECT_H

#include <cstdint>
#include <cstddef>
#include "u8g2gl_config.h"

// Subject type tag (§8.1)
enum u8g2gl_subject_type_t {
    U8G2GL_SUBJECT_INT = 0,
    U8G2GL_SUBJECT_STRING,
    U8G2GL_SUBJECT_BOOL,
    U8G2GL_SUBJECT_TIME,
};

// Binding comparison operators (§8.4)
enum u8g2gl_binding_op_t : uint8_t {
    U8G2GL_BIND_OP_EQ = 0,
    U8G2GL_BIND_OP_NOT_EQ,
    U8G2GL_BIND_OP_GT,
    U8G2GL_BIND_OP_LT,
};

// Observer callback signature
// Called when a subject's value changes.
using u8g2gl_observer_cb = void(*)(void* user_data);

// Observer registration entry (stored in a static pool)
struct u8g2gl_observer {
    void* user_data = nullptr;
    u8g2gl_observer_cb cb = nullptr;
    bool active = false;
};

// Int subject (32-bit signed)
class u8g2gl_subject_int {
public:
    u8g2gl_subject_int() = default;
    explicit u8g2gl_subject_int(int32_t initial);

    int32_t get() const;
    void set(int32_t value);     // notifies observers if value changed

    // Observer management
    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

private:
    int32_t value_ = 0;
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

// String subject — fixed buffer, copy-on-set (§8.2)
class u8g2gl_subject_string {
public:
    u8g2gl_subject_string() = default;
    explicit u8g2gl_subject_string(uint16_t max_len);

    // max_len is set once at init time (from XML declaration)
    void init(uint16_t max_len);

    const char* get() const;
    void set(const char* value);   // copies into internal buffer, truncates at max_len

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

    uint16_t get_max_len() const;

private:
    static constexpr uint16_t BUFFER_SIZE = U8G2GL_MAX_STRING_LEN;
    char buffer_[BUFFER_SIZE] = {};
    uint16_t max_len_ = 32;   // default per §8, overridden by init()
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

// Bool subject
class u8g2gl_subject_bool {
public:
    u8g2gl_subject_bool() = default;
    explicit u8g2gl_subject_bool(bool initial);

    bool get() const;
    void set(bool value);

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

private:
    bool value_ = false;
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

// Time subject (Unix epoch seconds)
class u8g2gl_subject_time {
public:
    u8g2gl_subject_time() = default;
    explicit u8g2gl_subject_time(uint32_t initial);

    uint32_t get() const;
    void set(uint32_t epoch_secs);

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

private:
    uint32_t value_ = 0;
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

#endif // U8G2GL_SUBJECT_H
