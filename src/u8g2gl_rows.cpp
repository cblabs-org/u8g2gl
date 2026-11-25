/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_rows.cpp
 *
 * Purpose: The checked accessors behind u8g2gl_rows (design_spec §9.2): every
 *          read and write of a collection's generated storage goes through one
 *          bounds check, so a widget can never index past the buffer the
 *          generator sized for its instance, whatever its own arithmetic.
 *
 * Description: slot() resolves a row, field, repeat index and expected type to
 *              the bytes they name, or to nullptr. Ints are copied with memcpy,
 *              so a buffer need not be aligned for the read to be defined;
 *              generated buffers are aligned to four anyway, as the layout's
 *              padding assumes. Strings are copied in place and always
 *              terminated.
 */
#include "u8g2gl/u8g2gl_rows.h"

#include <cstring>

u8g2gl_rows::u8g2gl_rows(uint8_t* buffer, size_t capacity, const u8g2gl_rows_layout* layout) {
    // An incomplete view is an empty one: capacity 0 makes every access fail,
    // which is the contract a widget with no storage already relies on.
    if (buffer == nullptr || layout == nullptr) {
        return;
    }
    buffer_ = buffer;
    layout_ = layout;
    capacity_ = capacity;
}

uint32_t u8g2gl_rows::repeat(uint8_t field) const {
    if (layout_ == nullptr || field >= layout_->field_count) {
        return 0;
    }
    return layout_->fields[field].repeat;
}

uint32_t u8g2gl_rows::max_len(uint8_t field) const {
    if (layout_ == nullptr || field >= layout_->field_count || layout_->fields[field].type != U8G2GL_FIELD_STRING) {
        return 0;
    }
    // A string's slot holds its characters and the terminator.
    return layout_->fields[field].size - 1u;
}

// u8g2gl_rows::slot
// The one bounds check every accessor goes through.
//   row   — the row, below capacity()
//   field — the field's declaration index
//   index — the repeat, below the field's repeat count
//   type  — the type the caller reads or writes it as
uint8_t* u8g2gl_rows::slot(size_t row, uint8_t field, uint32_t index, u8g2gl_field_type_t type) const {
    if (buffer_ == nullptr || layout_ == nullptr || row >= capacity_ || field >= layout_->field_count) {
        return nullptr;
    }
    const u8g2gl_rows_field& entry = layout_->fields[field];
    if (entry.type != type || index >= entry.repeat || entry.size == 0) {
        return nullptr;
    }
    return buffer_ + row * layout_->row_bytes + entry.offset + index * entry.size;
}

int32_t u8g2gl_rows::get_int(size_t row, uint8_t field, uint32_t index) const {
    const uint8_t* at = slot(row, field, index, U8G2GL_FIELD_INT);
    int32_t value = 0;
    if (at != nullptr) {
        std::memcpy(&value, at, sizeof(value));
    }
    return value;
}

bool u8g2gl_rows::get_bool(size_t row, uint8_t field, uint32_t index) const {
    const uint8_t* at = slot(row, field, index, U8G2GL_FIELD_BOOL);
    return at != nullptr && *at != 0;
}

uint8_t u8g2gl_rows::get_enum(size_t row, uint8_t field, uint32_t index) const {
    const uint8_t* at = slot(row, field, index, U8G2GL_FIELD_ENUM);
    return at == nullptr ? 0 : *at;
}

const char* u8g2gl_rows::get_string(size_t row, uint8_t field, uint32_t index) const {
    const uint8_t* at = slot(row, field, index, U8G2GL_FIELD_STRING);
    return at == nullptr ? "" : reinterpret_cast<const char*>(at);
}

bool u8g2gl_rows::set_int(size_t row, uint8_t field, int32_t value, uint32_t index) {
    uint8_t* at = slot(row, field, index, U8G2GL_FIELD_INT);
    if (at == nullptr) {
        return false;
    }
    std::memcpy(at, &value, sizeof(value));
    return true;
}

bool u8g2gl_rows::set_bool(size_t row, uint8_t field, bool value, uint32_t index) {
    uint8_t* at = slot(row, field, index, U8G2GL_FIELD_BOOL);
    if (at == nullptr) {
        return false;
    }
    *at = value ? 1u : 0u;
    return true;
}

bool u8g2gl_rows::set_enum(size_t row, uint8_t field, uint8_t value, uint32_t index) {
    uint8_t* at = slot(row, field, index, U8G2GL_FIELD_ENUM);
    if (at == nullptr) {
        return false;
    }
    *at = value;
    return true;
}

// u8g2gl_rows::set_string
// Copies at most max_len bytes and terminates, so the slot always holds a
// valid string, and a text of exactly max_len characters survives whole.
//   text — the text, or nullptr for ""
bool u8g2gl_rows::set_string(size_t row, uint8_t field, const char* text, uint32_t index) {
    uint8_t* at = slot(row, field, index, U8G2GL_FIELD_STRING);
    if (at == nullptr) {
        return false;
    }
    const size_t max = layout_->fields[field].size - 1u;
    char* out = reinterpret_cast<char*>(at);
    size_t n = 0;
    if (text != nullptr) {
        while (n < max && text[n] != '\0') {
            out[n] = text[n];
            ++n;
        }
    }
    out[n] = '\0';
    return true;
}
