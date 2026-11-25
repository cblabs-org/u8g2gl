/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_rows.h
 *
 * Purpose: A collection widget's rows, in storage the generator owns ([Q-19],
 *          design_spec §9.2). A widget used to declare its own row arrays at
 *          its manifest's default capacity, so every instance cost the same
 *          bytes whatever its XML declared, and §18 could not report them.
 *          Now the generator allocates one buffer per instance per `<data>`,
 *          sized capacity × row bytes from that instance's own props, and
 *          hands the widget this view over it through
 *          u8g2gl_obj::attach_rows(). The widget reads and writes its rows
 *          through typed accessors and never sees, or sizes, the bytes.
 *
 *          The row layout is not the runtime's to decide: the generator
 *          derives it from the `<data>`'s fields (its one layout module) and
 *          emits it as a `constexpr` u8g2gl_rows_layout, and the editor host
 *          builds the same one from the scene. So both targets read one layout,
 *          and the C++ never assumes it.
 *
 * Description: A field is one of four types: an `int32_t`, a one-byte bool, a
 *              one-byte enum (its value's index in `values`), or a string of
 *              `max_len + 1` bytes stored in place, NUL-terminated. A field may
 *              repeat; its repeats are contiguous. Every accessor checks the
 *              row, the field, its type and the repeat index, so an access
 *              outside the layout reads a default and writes nothing — a
 *              widget with no view attached simply has capacity 0. No heap,
 *              and the view owns nothing.
 *
 * Exported Classes:
 *     Layout:
 *     - u8g2gl_field_type_t: A field's type
 *     - u8g2gl_rows_field:   One field's place in a row
 *     - u8g2gl_rows_layout:  A row's fields and its size
 *
 * - u8g2gl_rows:         A non-owning view over a buffer of rows
 *
 *     Shape:
 *     - capacity():          Rows the buffer holds; 0 with no buffer
 *     - repeat(), max_len(): A field's repeat count, a string's usable characters
 *
 *     Read (a default outside the layout):
 *     - get_int() / get_bool() / get_enum() / get_string()
 *
 *     Write (false, writing nothing, outside the layout):
 *     - set_int() / set_bool() / set_enum()
 *     - set_string():        Copied in place, truncated at max_len
 *
 * Functions:
 * - u8g2gl_row_added():  (template) Whether an access call took its row, for the
 *                        generated collection facade
 */
#ifndef U8G2GL_ROWS_H
#define U8G2GL_ROWS_H

#include <cstddef>
#include <cstdint>
#include <type_traits>

/** @brief A row field's type (§9.2's encoding). */
enum u8g2gl_field_type_t : uint8_t {
    U8G2GL_FIELD_INT = 0,  ///< An int32_t, four bytes, aligned to four
    U8G2GL_FIELD_BOOL,     ///< One byte: 0 or 1
    U8G2GL_FIELD_STRING,   ///< max_len + 1 bytes, NUL-terminated
    U8G2GL_FIELD_ENUM,     ///< One byte: the value's index in the manifest's `values`
};

/**
 * @brief One field's place in a row, as the generator laid it out.
 *
 * Its repeat `i` starts at `offset + i * size` bytes from the row's start.
 */
struct u8g2gl_rows_field {
    uint32_t offset;           ///< The first repeat's offset in the row
    uint32_t size;             ///< One repeat's bytes; a string's is max_len + 1
    uint32_t repeat;           ///< How many times it repeats; 1 for a plain field
    u8g2gl_field_type_t type;
};

/** @brief A row's layout: its fields, in declaration order, and its padded size. */
struct u8g2gl_rows_layout {
    const u8g2gl_rows_field* fields;  ///< `field_count` fields; nullptr when there are none
    uint32_t row_bytes;               ///< The row's size, padding included
    uint8_t field_count;
};

/**
 * @brief A non-owning view over a collection's rows.
 *
 * Default-constructed, it is empty: capacity 0, and every access fails. A
 * widget holds one per `<data>` and is handed the real one by
 * u8g2gl_obj::attach_rows() at init. Copying a view copies the pointers, never
 * the rows.
 */
class u8g2gl_rows {
public:
    u8g2gl_rows() = default;

    /**
     * @brief A view over `capacity` rows of `layout` at `buffer`.
     *
     * @param buffer   At least `capacity * layout->row_bytes` bytes, outliving
     *                 the view. Generated code passes a `static` buffer it sized
     *                 itself; the editor host passes its arena's.
     * @param capacity Rows the buffer holds.
     * @param layout   The row's layout; must outlive the view. A null buffer or
     *                 layout makes an empty view.
     */
    u8g2gl_rows(uint8_t* buffer, size_t capacity, const u8g2gl_rows_layout* layout);

    /** @brief Rows the buffer holds: 0 for an empty view. */
    size_t capacity() const { return capacity_; }

    /** @brief How many times field `field` repeats; 0 for no such field. */
    uint32_t repeat(uint8_t field) const;

    /** @brief A string field's usable characters, terminator excluded; 0 for any other field. */
    uint32_t max_len(uint8_t field) const;

    /** @brief An int field's value; 0 outside the layout or for another type. */
    int32_t get_int(size_t row, uint8_t field, uint32_t index = 0) const;
    /** @brief A bool field's value; false outside the layout or for another type. */
    bool get_bool(size_t row, uint8_t field, uint32_t index = 0) const;
    /** @brief An enum field's value index; 0 outside the layout or for another type. */
    uint8_t get_enum(size_t row, uint8_t field, uint32_t index = 0) const;
    /**
     * @brief A string field's text, in place.
     * @return The stored text, valid until the row is written again; "" outside
     *         the layout or for another type, never nullptr.
     */
    const char* get_string(size_t row, uint8_t field, uint32_t index = 0) const;

    /** @brief Store an int; false, storing nothing, outside the layout or for another type. */
    bool set_int(size_t row, uint8_t field, int32_t value, uint32_t index = 0);
    /** @brief Store a bool; false, storing nothing, outside the layout or for another type. */
    bool set_bool(size_t row, uint8_t field, bool value, uint32_t index = 0);
    /** @brief Store an enum's value index; false, storing nothing, outside the layout or for another type. */
    bool set_enum(size_t row, uint8_t field, uint8_t value, uint32_t index = 0);
    /**
     * @brief Copy a string into its field, truncated to the field's max_len
     *        characters and NUL-terminated.
     *
     * Truncation is by byte, as a string subject's is (§8.2), so a multi-byte
     * UTF-8 character straddling max_len is cut.
     *
     * @param text The text; nullptr stores "".
     * @return false, storing nothing, outside the layout or for another type.
     */
    bool set_string(size_t row, uint8_t field, const char* text, uint32_t index = 0);

private:
    // slot
    // The bytes of one repeat of one field of one row, or nullptr when any of
    // the four is outside the layout or the field is not of `type`.
    uint8_t* slot(size_t row, uint8_t field, uint32_t index, u8g2gl_field_type_t type) const;

    uint8_t* buffer_ = nullptr;
    const u8g2gl_rows_layout* layout_ = nullptr;
    size_t capacity_ = 0;
};

/**
 * @brief Whether a `<data>` access call took its row: its `bool` result, or
 *        true for an access method that returns nothing.
 *
 * The generated collection facade (§9.2) forwards add_row() to the widget's
 * declared access method, whose return type is the widget's own choice; this
 * reads it one way for both, as the editor's fill thunk does. Past capacity a
 * widget refuses with false, and the facade returns that refusal.
 *
 * @param call Callable `()` making the access call.
 */
template <typename Call>
bool u8g2gl_row_added(Call call) {
    if constexpr (std::is_void_v<std::invoke_result_t<Call>>) {
        call();
        return true;
    } else {
        return static_cast<bool>(call());
    }
}

#endif  // U8G2GL_ROWS_H
