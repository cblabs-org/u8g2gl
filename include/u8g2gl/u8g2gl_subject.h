/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_subject.h
 * Description: Declarations for u8g2gl_subject.h
 *
 * Exported Classes:
 * - u8g2gl_subject_int_base / u8g2gl_subject_int: int subject
 * - u8g2gl_subject_string_base / u8g2gl_subject_string: string subject
 * - u8g2gl_subject_bool_base / u8g2gl_subject_bool: bool subject
 * - u8g2gl_subject_time_base / u8g2gl_subject_time: time subject
 *
 *     Subject API:
 *     - get(): Get current value
 *     - set(): Set value and notify observers
 *     - add_observer(): Register an observer callback
 */
#ifndef U8G2GL_SUBJECT_H
#define U8G2GL_SUBJECT_H

#include <cstdint>
#include <cstddef>
#include "u8g2gl_config.h"

// Subject type tag (§8.1)
enum u8g2gl_subject_type_t : uint8_t {
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

// Observer registration entry (stored in a static pool).
// WO6 Finding D: liveness is `cb != nullptr` — the separate `active` flag
// this struct used to carry was redundant (and forced pointer-alignment
// padding, costing 8 extra bytes/slot on a 64-bit host).
struct u8g2gl_observer {
    void* user_data = nullptr;
    u8g2gl_observer_cb cb = nullptr;
};

// ---------------------------------------------------------------------------
// WO6 Finding B/A pattern: non-template base + templated storage.
//
// Each subject type splits into a `_base` class that holds ALL logic (get/
// set/notify/add_observer) and operates on storage passed to it by pointer
// and capacity, plus a `_n<...>` template that owns the storage array(s) as
// members and does nothing else. This means distinct capacities (and, for
// strings, distinct declared lengths) do not duplicate any logic — only the
// storage layout differs per instantiation. `u8g2gl_subject_<type>` remains a
// type alias to the default-capacity instantiation for source compatibility.
//
// `add_observer()` returns `false` on overflow (release-safe), but an
// overflow also asserts in debug builds: per §13 the generator knows exactly
// how many objects bind to a given subject at build time, so a real overflow
// indicates a sizing bug that should be caught immediately, not silently
// tolerated.
// ---------------------------------------------------------------------------

// --- Int subject (32-bit signed) ---

class u8g2gl_subject_int_base {
public:
    int32_t get() const;
    void set(int32_t value);     // notifies observers if value changed

    // Observer management
    /**
     * @brief Register an observer callback for this subject.
     *
     * @param user_data Context pointer passed back to the callback.
     * @param cb        The callback function to invoke on change.
     * @return false on overflow (release-safe). Overflow also asserts in debug
     *         builds, as capacity is declared and statically known.
     */
    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

protected:
    u8g2gl_subject_int_base(u8g2gl_observer* slots, uint8_t capacity, int32_t initial = 0);

private:
    // Pointer first, then the value, then the byte-sized fields: minimizes
    // padding vs. declaring in logical order (same packing rationale as
    // WO6 Finding C).
    u8g2gl_observer* observers_;
    int32_t value_;
    uint8_t capacity_;
    uint8_t observer_count_ = 0;
};

template<uint8_t N = U8G2GL_DEFAULT_OBSERVERS>
class u8g2gl_subject_int_n : public u8g2gl_subject_int_base {
public:
    u8g2gl_subject_int_n() : u8g2gl_subject_int_base(slots_, N) {}
    explicit u8g2gl_subject_int_n(int32_t initial) : u8g2gl_subject_int_base(slots_, N, initial) {}

private:
    u8g2gl_observer slots_[N] = {};
};

using u8g2gl_subject_int = u8g2gl_subject_int_n<>;   // source compatibility

// --- String subject — fixed buffer, copy-on-set (§8.2) ---

class u8g2gl_subject_string_base {
public:
    // max_len is the declared usable-character capacity (from the XML
    // declaration); it may be lowered at runtime but never raised past the
    // compile-time buffer capacity. WO6 Finding A: the buffer itself is now
    // sized by the template's MaxLen, not a fixed 128 B constant.
    void init(uint16_t max_len);

    const char* get() const;
    void set(const char* value);   // copies into internal buffer, truncates at max_len

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

    uint16_t get_max_len() const;      // current runtime truncation limit (usable chars)
    uint16_t get_capacity() const;     // fixed compile-time buffer size in bytes (MaxLen+1),
                                        // i.e. the real RAM allocation for §18's budget report

protected:
    u8g2gl_subject_string_base(char* buffer, uint16_t buffer_capacity,
                                u8g2gl_observer* slots, uint8_t observer_capacity);

private:
    // Both pointers first, then the 16-bit fields, then the byte-sized
    // fields: minimizes padding (same packing rationale as WO6 Finding C).
    char* buffer_;
    u8g2gl_observer* observers_;
    uint16_t buffer_capacity_;   // fixed: MaxLen + 1 (room for the terminator)
    uint16_t max_len_;           // runtime usable-character limit, <= buffer_capacity_ - 1
    uint8_t observer_capacity_;
    uint8_t observer_count_ = 0;
};

template<uint16_t MaxLen = U8G2GL_MAX_STRING_LEN, uint8_t N = U8G2GL_DEFAULT_OBSERVERS>
class u8g2gl_subject_string_n : public u8g2gl_subject_string_base {
public:
    u8g2gl_subject_string_n()
        : u8g2gl_subject_string_base(buffer_, MaxLen + 1, slots_, N) {}
    explicit u8g2gl_subject_string_n(uint16_t max_len)
        : u8g2gl_subject_string_base(buffer_, MaxLen + 1, slots_, N) {
        init(max_len);
    }

private:
    char buffer_[MaxLen + 1] = {};   // +1 for the null terminator (§8.2)
    u8g2gl_observer slots_[N] = {};
};

using u8g2gl_subject_string = u8g2gl_subject_string_n<>;   // source compatibility

// --- Bool subject ---

class u8g2gl_subject_bool_base {
public:
    bool get() const;
    void set(bool value);

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

protected:
    u8g2gl_subject_bool_base(u8g2gl_observer* slots, uint8_t capacity, bool initial = false);

private:
    u8g2gl_observer* observers_;
    bool value_;
    uint8_t capacity_;
    uint8_t observer_count_ = 0;
};

template<uint8_t N = U8G2GL_DEFAULT_OBSERVERS>
class u8g2gl_subject_bool_n : public u8g2gl_subject_bool_base {
public:
    u8g2gl_subject_bool_n() : u8g2gl_subject_bool_base(slots_, N) {}
    explicit u8g2gl_subject_bool_n(bool initial) : u8g2gl_subject_bool_base(slots_, N, initial) {}

private:
    u8g2gl_observer slots_[N] = {};
};

using u8g2gl_subject_bool = u8g2gl_subject_bool_n<>;   // source compatibility

// --- Time subject (Unix epoch seconds) ---

class u8g2gl_subject_time_base {
public:
    uint32_t get() const;
    void set(uint32_t epoch_secs);

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

protected:
    u8g2gl_subject_time_base(u8g2gl_observer* slots, uint8_t capacity, uint32_t initial = 0);

private:
    u8g2gl_observer* observers_;
    uint32_t value_;
    uint8_t capacity_;
    uint8_t observer_count_ = 0;
};

template<uint8_t N = U8G2GL_DEFAULT_OBSERVERS>
class u8g2gl_subject_time_n : public u8g2gl_subject_time_base {
public:
    u8g2gl_subject_time_n() : u8g2gl_subject_time_base(slots_, N) {}
    explicit u8g2gl_subject_time_n(uint32_t initial) : u8g2gl_subject_time_base(slots_, N, initial) {}

private:
    u8g2gl_observer slots_[N] = {};
};

using u8g2gl_subject_time = u8g2gl_subject_time_n<>;   // source compatibility

#endif // U8G2GL_SUBJECT_H
