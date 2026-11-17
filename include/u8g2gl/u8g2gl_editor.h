/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_editor.h
 * Purpose: The editor target's side of the runtime ([UD-4], design_spec §13.1).
 *          The designer must render arbitrary XML without a C++ compiler in the
 *          browser, so its Wasm build constructs objects by name, sets their
 *          properties by name, adds their static children by name, fills
 *          their `<data>` rows by name and draws class-less elements by name
 *          from a scene description (ui_spec §4.1 steps 6-7). This header declares the
 *          shapes of that registry and the lookups over it; the registry itself
 *          is generated from the same `<api>` manifests the firmware setters are
 *          (`ui_editor_registry.cpp`, PR-04 WO11), so both targets reach the
 *          same setters and the same `u8g2gl_draw_*` free functions ([D-9]).
 *
 *          Everything here is compiled only under `U8G2GL_EDITOR`. A firmware
 *          build sees an empty header and pays nothing — no table, no thunk, no
 *          symbol — and the C++ suite checks the firmware test binary for that.
 *
 *          Still runtime code, so still heap-free (§9.2): objects are
 *          placement-constructed into storage the editor host provides, and
 *          every table is `const` data.
 *
 * Description: A value type the host fills from the scene description; the
 *              class, property, binding, static child, fill, drawing, directive
 *              and flag entry types the generated registry is made of; and the
 *              by-name operations — construct, set, bind, add a static child,
 *              fill `<data>` rows, draw — that check what the host hands them
 *              before calling a generated thunk.
 *
 * Exported Classes:
 * - u8g2gl_editor_value:     One property or argument value, tagged with its §13.2 type
 * - u8g2gl_editor_property:  Set-by-name thunk for one manifest `<prop>`
 * - u8g2gl_editor_binding:   Bind-by-name thunk for one `<bind>`, per subject type
 * - u8g2gl_editor_class:     Construct-by-name entry for one classed element
 * - u8g2gl_editor_element:   Add-by-name entry for one static child kind (`<column>`, §6.5)
 * - u8g2gl_editor_count:     A `capacity`, `repeat` or `max_len`: a literal, or an instance prop
 * - u8g2gl_editor_field:     One `<field>` of a `<data>` row, with its declared rules
 * - u8g2gl_editor_cell:      One field's value(s) in one row, as the host parsed it
 * - u8g2gl_editor_data:      Fill-by-name entry for one `<data>` (§9.2)
 * - u8g2gl_editor_element_fn, u8g2gl_editor_fill_fn: The add and fill thunk types
 * - u8g2gl_editor_param:     One argument of a draw-by-name entry
 * - u8g2gl_editor_drawing:   Draw-by-name entry for one drawing element
 * - u8g2gl_editor_directive: A `bind_flag_if_*` directive, per subject type (§8.4)
 * - u8g2gl_editor_flag:      A flag name and its U8G2GL_FLAG_* bit
 * - u8g2gl_editor_registry:  The generated tables together
 *
 *     Values:
 *     - u8g2gl_editor_int() / _bool() / _text() / _pointer(): Make a value
 *     - u8g2gl_editor_is():            Whether a text value is exactly a word
 *     - u8g2gl_editor_read_subject():  A subject's current value, as a value
 *
 *     Lookup:
 *     - u8g2gl_editor_find_class() / _find_drawing() / _find_property()
 *     - u8g2gl_editor_find_element() / _find_element_arg()
 *     - u8g2gl_editor_find_data() / _find_field()
 *     - u8g2gl_editor_find_binding():  Dispatches on the subject's type
 *     - u8g2gl_editor_find_directive() / _find_flag()
 *
 *     By name:
 *     - u8g2gl_editor_construct() / _destroy(): Placement into host storage
 *     - u8g2gl_editor_set_rect():      The rectangle setter
 *     - u8g2gl_editor_set_property():  Set-by-name, type-checked
 *     - u8g2gl_editor_add_element():   A static child by name, type-checked
 *     - u8g2gl_editor_fill():          A `<data>` block's rows by name, type-checked
 *     - u8g2gl_editor_bind():          Bind-by-name, dispatched on subject type
 *     - u8g2gl_editor_bind_flag():     A flag directive by name
 *     - u8g2gl_editor_flag_clear():    A draw call's guard term, by name
 *     - u8g2gl_editor_draw():          Draw-by-name
 *
 *     For generated code:
 *     - u8g2gl_editor_bind_call():     Pass a format only where the runtime takes one
 *     - u8g2gl_editor_row_call():      Call a data access method, reading a bool return
 *     - ui_editor_registry():          Defined by the generated registry unit
 */
#ifndef U8G2GL_EDITOR_H
#define U8G2GL_EDITOR_H

#ifdef U8G2GL_EDITOR

#include <cstddef>
#include <cstdint>
#include <type_traits>

#include "u8g2gl_obj.h"
#include "u8g2gl_style.h"
#include "u8g2gl_subject.h"
#include "u8g2gl_types.h"

class U8G2;

/**
 * @brief The §13.2 type of an editor value — one per manifest `type`, plus
 *        "absent".
 *
 * Mirrors the manifest vocabulary rather than C++ types, because the host reads
 * the type from the registry entry it is filling, not from the setter.
 */
enum u8g2gl_editor_type_t : uint8_t {
    U8G2GL_EDITOR_NONE = 0,  ///< Absent: a draw argument falls back to its manifest default
    U8G2GL_EDITOR_INT,       ///< `integer`
    U8G2GL_EDITOR_BOOL,      ///< `boolean`
    U8G2GL_EDITOR_STRING,    ///< `text`; must outlive the object — setters keep the pointer
    U8G2GL_EDITOR_ENUM,      ///< `text`: the value as the XML spells it, e.g. "center"
    U8G2GL_EDITOR_FONT,      ///< `pointer`: a U8G2 font table
    U8G2GL_EDITOR_IMAGE,     ///< `pointer`: XBM bytes
    U8G2GL_EDITOR_SUBJECT,   ///< `pointer`: a subject; not settable as a property today
    U8G2GL_EDITOR_STYLE,     ///< `pointer`: a u8g2gl_style
    U8G2GL_EDITOR_COLOR,     ///< `text`: "0", "1" or "xor" (§10)
};

/**
 * @brief One value the host hands a thunk, tagged with its type.
 *
 * The one legitimate difference between the two targets is where values come
 * from: firmware spells a literal into the generated call, the editor passes
 * this at run time (PROJECT.md, "Firmware / editor sharing"). An enum or colour
 * travels as the text the XML uses, and the generated thunk maps it to the same
 * enumerator the firmware spells, so no enumerator value crosses the boundary.
 *
 * Nothing here owns memory: `text` and `pointer` belong to the host and must
 * outlive whatever is set from them.
 */
struct u8g2gl_editor_value {
    const char* text = nullptr;      ///< STRING, ENUM, COLOR
    const void* pointer = nullptr;   ///< FONT, IMAGE, SUBJECT, STYLE
    int32_t integer = 0;             ///< INT
    u8g2gl_editor_type_t type = U8G2GL_EDITOR_NONE;
    bool boolean = false;            ///< BOOL
};

/** @brief An INT value. */
u8g2gl_editor_value u8g2gl_editor_int(int32_t v);
/** @brief A BOOL value. */
u8g2gl_editor_value u8g2gl_editor_bool(bool v);
/**
 * @brief A STRING, ENUM or COLOR value.
 * @param type One of U8G2GL_EDITOR_STRING, _ENUM, _COLOR.
 * @param text Borrowed; must outlive any object it is set on.
 */
u8g2gl_editor_value u8g2gl_editor_text(u8g2gl_editor_type_t type, const char* text);
/**
 * @brief A FONT, IMAGE, SUBJECT or STYLE value.
 * @param type    One of U8G2GL_EDITOR_FONT, _IMAGE, _SUBJECT, _STYLE.
 * @param pointer Borrowed; must outlive any object it is set on.
 */
u8g2gl_editor_value u8g2gl_editor_pointer(u8g2gl_editor_type_t type, const void* pointer);

/**
 * @brief Whether a text value is exactly `word`. Generated enum thunks match the
 *        manifest's `values` with it.
 * @return false for a null text.
 */
bool u8g2gl_editor_is(const u8g2gl_editor_value& value, const char* word);

/**
 * @brief A subject's current value, as a draw call reads it at draw time (§13.5).
 *
 * @param subject A `u8g2gl_subject_<type>_base` of the given type.
 * @param type    Its type. A time subject reads as INT (its epoch seconds).
 * @return The value, or a NONE value for a null subject.
 */
u8g2gl_editor_value u8g2gl_editor_read_subject(const void* subject, u8g2gl_subject_type_t type);

// --- Registry entry types ---
// Each thunk is generated from one manifest line and does exactly what the
// firmware's generated statement for that line does. Members are ordered
// pointers first, then bytes, so the tables pack without padding holes.

/** @brief Set one property from a value; false for an enum text no value matches. */
using u8g2gl_editor_set_fn = bool (*)(u8g2gl_obj* obj, const u8g2gl_editor_value& value);
/** @brief The rectangle setter every classed manifest shares (§7.2). */
using u8g2gl_editor_rect_fn = void (*)(u8g2gl_obj* obj, int16_t x, int16_t y, int16_t w, int16_t h);
/**
 * @brief Register one binding.
 * @param subject A `u8g2gl_subject_<type>_base` of the entry's type.
 * @param fmt     The author's format, or nullptr. False if the runtime's overload
 *                takes no format and one was given — never silently dropped.
 * @param origin  For a position binding (`bind_x`, `bind_y`), the container's
 *                absolute origin, passed on exactly as firmware passes its
 *                literal (§7.2). Any other binding refuses a non-zero origin.
 */
using u8g2gl_editor_bind_fn = bool (*)(u8g2gl_obj* obj, void* subject, const char* fmt, int16_t origin);
/** @brief Placement-construct the class into `storage`. */
using u8g2gl_editor_construct_fn = u8g2gl_obj* (*)(void* storage);
/**
 * @brief Call a static child's access method (`add_column(width, align)`).
 * @param args One value per argument, in declaration order; every one present.
 * @return false, calling nothing, if an enum text matches no value.
 */
using u8g2gl_editor_element_fn = bool (*)(u8g2gl_obj* obj, const u8g2gl_editor_value* args);
/**
 * @brief Call a drawing element's free function.
 * @param args One value per param, in parameter order; NONE takes the default.
 * @return false, drawing nothing, if a required argument is absent or an enum
 *         text matches no value.
 */
using u8g2gl_editor_draw_fn = bool (*)(U8G2& display, const u8g2gl_editor_value* args);
/** @brief Register a flag directive (`bind_flag_if_*`). */
using u8g2gl_editor_flag_bind_fn = bool (*)(u8g2gl_obj* obj, void* subject, const u8g2gl_editor_value& ref,
                                            uint8_t flag);
/** @brief Whether a directive's flag is currently clear — a draw call's guard term (§13.5). */
using u8g2gl_editor_flag_clear_fn = bool (*)(const void* subject, const u8g2gl_editor_value& ref);

/** @brief Set-by-name for one manifest `<prop>` with a `setter=`. */
struct u8g2gl_editor_property {
    const char* name;           ///< The attribute, e.g. "font"
    u8g2gl_editor_set_fn set;
    u8g2gl_editor_type_t type;  ///< What the value must be
};

/**
 * @brief Bind-by-name for one `<bind>`. A binding name appears once per subject
 *        type it accepts — `bind_text` for string and again for int — and the
 *        two are separate entries, never collapsed (PR-04 WO5a finding 4).
 */
struct u8g2gl_editor_binding {
    const char* name;                    ///< The attribute, e.g. "bind_text"
    u8g2gl_editor_bind_fn bind;
    u8g2gl_subject_type_t subject_type;  ///< The overload's subject type
};

/** @brief One argument of a draw-by-name entry, or of a static child. */
struct u8g2gl_editor_param {
    const char* name;           ///< The attribute, e.g. "width"
    u8g2gl_editor_type_t type;
};

/**
 * @brief Add-by-name for one static child kind: a manifest `<element>` (§6.5).
 *
 * The thunk calls the element's declared access method on the object, as the
 * firmware's init does once per child, so a `<column>` the canvas shows is
 * configured through the same method the device runs.
 */
struct u8g2gl_editor_element {
    const char* name;                    ///< The child's tag, e.g. "column"
    u8g2gl_editor_element_fn add;
    const u8g2gl_editor_param* args;     ///< In declaration order
    uint8_t arg_count;
};

/**
 * @brief A `capacity`, `repeat` or `max_len` as the manifest declares it: an int
 *        literal, or an int `<prop>` of the widget whose instance value it takes.
 *
 * Per instance, so a host resolves it against the element it fills: `prop`'s
 * written value when the element sets it, else `value`.
 */
struct u8g2gl_editor_count {
    const char* prop;  ///< The prop it names, e.g. "max_rows"; nullptr for a literal
    int32_t value;     ///< The literal, or the prop's default; -1 when there is none
};

/** @brief One `<field>` of a `<data>` row (schema 0.7), with its declared rules. */
struct u8g2gl_editor_field {
    const char* name;                 ///< e.g. "loading_pct"
    const char* const* values;        ///< ENUM: its values; nullptr otherwise
    u8g2gl_editor_count repeat;       ///< How many times it repeats; `{nullptr, 0}` when it does not
    u8g2gl_editor_count max_len;      ///< STRING: usable characters; `{nullptr, -1}` when undeclared
    int32_t min;                      ///< INT: least value (INT32_MIN when undeclared)
    int32_t max;                      ///< INT: greatest value (INT32_MAX when undeclared)
    u8g2gl_editor_type_t type;        ///< INT, BOOL, STRING or ENUM
    uint8_t value_count;              ///< ENUM: how many `values`
    bool repeated;                    ///< Passed as an array and its count (a STRING field)
};

/**
 * @brief One field's value in one row, as the host parsed it.
 *
 * A single field reads `value`. A repeated string field reads `texts` and
 * `count`, passed to the access method as the array and count it takes
 * (`add_row(const char* const* cells, size_t n)`). Nothing is owned: every
 * pointer is the host's, valid for the duration of the fill call.
 */
struct u8g2gl_editor_cell {
    const char* const* texts;     ///< A repeated field's texts; nullptr otherwise
    u8g2gl_editor_value value;    ///< A single field's value
    uint16_t count;               ///< How many `texts`
};

/**
 * @brief Fill one `<data>` block: `begin()`, the access method once per row
 *        with its fields in declared order, then `commit()` (§9.2).
 *
 * @param rows      `row_count` rows, each `field_count` cells in field order,
 *                  already checked against the fields (u8g2gl_editor_fill()).
 * @param accepted  Receives how many rows the widget took.
 * @return false when the access method returns false for a row — the device's
 *         own refusal, at its own capacity — after committing the rows it took,
 *         as the device would have.
 */
using u8g2gl_editor_fill_fn = bool (*)(u8g2gl_obj* obj, const u8g2gl_editor_cell* const* rows, size_t row_count,
                                       size_t* accepted);

/**
 * @brief Fill-by-name for one `<data>` block of a class (schema 0.7, §9.2).
 *
 * The editor's only way to put rows into a collection widget: generated from
 * the manifest's `<data>`, it calls the widget's own hand-written ingestion
 * API, so the canvas fills a widget exactly as a controller does on the
 * device. Editor target only: firmware never sees this table ([UD-4]).
 */
struct u8g2gl_editor_data {
    const char* name;                     ///< e.g. "rows"
    const char* access;                   ///< The method, e.g. "add_row", for messages
    u8g2gl_editor_fill_fn fill;
    const u8g2gl_editor_field* fields;    ///< In declared order: the method's parameter order
    u8g2gl_editor_count capacity;         ///< `{nullptr, -1}` when undeclared
    uint8_t field_count;
};

/** @brief Construct-by-name for one classed element (tag == class, [D-12]). */
struct u8g2gl_editor_class {
    const char* tag;
    u8g2gl_editor_construct_fn construct;
    u8g2gl_editor_rect_fn set_rect;              ///< nullptr when the axes share no setter
    const u8g2gl_editor_property* properties;    ///< Every setter prop but the rectangle
    const u8g2gl_editor_binding* bindings;
    const u8g2gl_editor_element* elements;       ///< Its static child kinds; nullptr when none
    const u8g2gl_editor_data* data;              ///< Its fill entries; nullptr when it declares no `<data>`
    size_t size;                                 ///< sizeof the class: the storage the host provides
    size_t align;                                ///< alignof the class
    uint8_t property_count;
    uint8_t binding_count;
    uint8_t element_count;
    uint8_t data_count;
};

/** @brief Draw-by-name for one drawing element — a `draw=`-only manifest ([D-18]). */
struct u8g2gl_editor_drawing {
    const char* tag;
    u8g2gl_editor_draw_fn draw;
    const u8g2gl_editor_param* params;  ///< In parameter order
    uint8_t param_count;
};

/** @brief One `bind_flag_if_*` method for one subject type (§8.4). */
struct u8g2gl_editor_directive {
    const char* name;                    ///< e.g. "bind_flag_if_eq"
    u8g2gl_editor_flag_bind_fn bind;     ///< On an object
    u8g2gl_editor_flag_clear_fn clear;   ///< As a draw call's guard
    u8g2gl_subject_type_t subject_type;
};

/** @brief A flag a directive may set, and its bit. */
struct u8g2gl_editor_flag {
    const char* name;  ///< e.g. "hidden"
    uint8_t bit;       ///< e.g. U8G2GL_FLAG_HIDDEN
};

/** @brief The generated tables together. */
struct u8g2gl_editor_registry {
    const u8g2gl_editor_class* classes;
    const u8g2gl_editor_drawing* drawings;
    const u8g2gl_editor_directive* directives;
    const u8g2gl_editor_flag* flags;
    uint8_t class_count;
    uint8_t drawing_count;
    uint8_t directive_count;
    uint8_t flag_count;
};

// --- Lookup ---

/** @brief The class entry for a tag, or nullptr. */
const u8g2gl_editor_class* u8g2gl_editor_find_class(const u8g2gl_editor_registry& registry, const char* tag);
/** @brief The drawing entry for a tag, or nullptr. */
const u8g2gl_editor_drawing* u8g2gl_editor_find_drawing(const u8g2gl_editor_registry& registry, const char* tag);
/** @brief A class's property entry by attribute name, or nullptr. */
const u8g2gl_editor_property* u8g2gl_editor_find_property(const u8g2gl_editor_class& cls, const char* name);
/**
 * @brief A class's binding entry by name **and subject type**, or nullptr.
 *
 * The name alone is ambiguous by design — `bind_text` is declared for string and
 * for int subjects — so the subject's type selects the overload, as realisation
 * does for firmware (PR-04 WO5a finding 4).
 */
const u8g2gl_editor_binding* u8g2gl_editor_find_binding(const u8g2gl_editor_class& cls, const char* name,
                                                        u8g2gl_subject_type_t subject_type);
/** @brief A class's static child entry by tag (`column`), or nullptr. */
const u8g2gl_editor_element* u8g2gl_editor_find_element(const u8g2gl_editor_class& cls, const char* name);
/** @brief A static child entry's argument index by name, or -1. */
int u8g2gl_editor_find_element_arg(const u8g2gl_editor_element& element, const char* name);
/** @brief A class's fill entry by data name (`rows`), or nullptr. */
const u8g2gl_editor_data* u8g2gl_editor_find_data(const u8g2gl_editor_class& cls, const char* name);
/** @brief A fill entry's field index by name, or -1. */
int u8g2gl_editor_find_field(const u8g2gl_editor_data& data, const char* name);
/** @brief A draw entry's parameter index by name, or -1. */
int u8g2gl_editor_find_param(const u8g2gl_editor_drawing& drawing, const char* name);
/** @brief A directive entry by method name and subject type, or nullptr. */
const u8g2gl_editor_directive* u8g2gl_editor_find_directive(const u8g2gl_editor_registry& registry,
                                                            const char* name,
                                                            u8g2gl_subject_type_t subject_type);
/**
 * @brief A flag's bit by name.
 * @param bit Receives the bit; untouched when the name is unknown.
 * @return false when no flag has that name.
 */
bool u8g2gl_editor_find_flag(const u8g2gl_editor_registry& registry, const char* name, uint8_t* bit);

// --- By name ---

/**
 * @brief Placement-construct a class into storage the host owns.
 *
 * No heap: the host provides `storage`, sized and aligned from the entry.
 *
 * @param storage  At least `cls.size` bytes, aligned to `cls.align`, and outliving
 *                 the object. Released only by u8g2gl_editor_destroy().
 * @param capacity Bytes available at `storage`.
 * @return The object, or nullptr — constructing nothing — if the storage is null,
 *         too small or misaligned.
 */
u8g2gl_obj* u8g2gl_editor_construct(const u8g2gl_editor_class& cls, void* storage, size_t capacity);

/**
 * @brief Destroy an object made by u8g2gl_editor_construct(), releasing its
 *        binding slots (the destructor unbinds). The storage is the host's again.
 */
void u8g2gl_editor_destroy(u8g2gl_obj* obj);

/**
 * @brief Set the rectangle, through the class's own setter.
 * @return false if the class has no shared rectangle setter.
 */
bool u8g2gl_editor_set_rect(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, int16_t x, int16_t y, int16_t w,
                            int16_t h);

/**
 * @brief Set-by-name.
 * @return false if the class declares no such property, the value's type is not
 *         the property's, or an enum text matches none of its values. Nothing is
 *         set in any of those cases.
 */
bool u8g2gl_editor_set_property(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const char* name,
                                const u8g2gl_editor_value& value);

/**
 * @brief Add one static child by name: its access method, with its arguments.
 *
 * @param args  One value per argument, in declaration order
 *              (u8g2gl_editor_find_element_arg() maps names).
 * @param count How many values `args` holds; must equal the entry's arg count.
 * @return false, calling nothing, if the class declares no such element, the
 *         count differs, an argument is absent or of the wrong type, or an
 *         enum text matches none of its values.
 */
bool u8g2gl_editor_add_element(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const char* name,
                               const u8g2gl_editor_value* args, uint8_t count);

/**
 * @brief Fill one `<data>` block by name: its rows, through the widget's own
 *        `begin()`, access method and `commit()` (§9.2).
 *
 * Every cell is checked against its field before any call — its type, an
 * int's bounds, an enum's values, a repeated field's array — so a refused fill
 * changes nothing. The capacity is the caller's to check, because it is the
 * instance's (u8g2gl_editor_count); the access method's own `false` is the
 * device's capacity, and stops the fill there with the rows taken committed.
 *
 * @param rows      `row_count` rows of `data.field_count` cells each.
 * @param accepted  Receives how many rows the widget took; may be nullptr.
 * @return false if the class declares no such data, a cell does not fit its
 *         field (nothing is called), or the access method refused a row.
 */
bool u8g2gl_editor_fill(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const char* name,
                        const u8g2gl_editor_cell* const* rows, size_t row_count, size_t* accepted);

/**
 * @brief Bind-by-name, dispatched on the subject's type.
 *
 * @param subject      A `u8g2gl_subject_<type>_base`; must outlive the object.
 * @param subject_type Its type — selects the overload.
 * @param fmt          The author's format (`bind_text_fmt`), or nullptr.
 * @param origin       The container origin a position binding adds (the scene's
 *                     `origin`); 0 for every other binding.
 * @return false if no binding of that name accepts that type, a format or a
 *         non-zero origin was given to an overload that takes none, or the
 *         runtime refused the binding (a pool is full).
 */
bool u8g2gl_editor_bind(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const char* name, void* subject,
                        u8g2gl_subject_type_t subject_type, const char* fmt, int16_t origin);

/**
 * @brief A `<bind_flag_if_*>` directive by name, on any object.
 * @return false for an unknown method, subject type or flag, or a full pool.
 */
bool u8g2gl_editor_bind_flag(const u8g2gl_editor_registry& registry, u8g2gl_obj* obj, const char* method,
                             void* subject, u8g2gl_subject_type_t subject_type, const u8g2gl_editor_value& ref,
                             const char* flag);

/**
 * @brief Whether a draw call's guard term holds: the directive's flag is clear.
 *
 * A drawing element has no object, so its directive is evaluated at draw time
 * with the firmware guard's own comparison (§13.5).
 *
 * @param clear Receives the answer; untouched on failure.
 * @return false for an unknown method or subject type.
 */
bool u8g2gl_editor_flag_clear(const u8g2gl_editor_registry& registry, const char* method, const void* subject,
                              u8g2gl_subject_type_t subject_type, const u8g2gl_editor_value& ref, bool* clear);

/**
 * @brief Draw-by-name.
 *
 * @param args  One value per param, in parameter order (u8g2gl_editor_find_param()
 *              maps names); NONE takes the manifest default.
 * @param count How many values `args` holds; must equal the entry's param count.
 * @return false, drawing nothing, on a count mismatch, a type mismatch, a missing
 *         required argument or an enum text matching no value.
 */
bool u8g2gl_editor_draw(const u8g2gl_editor_drawing& drawing, U8G2& display, const u8g2gl_editor_value* args,
                        uint8_t count);

// --- For generated code ---

/**
 * @brief Register a binding, passing the format only to an overload that takes
 *        one.
 *
 * A manifest may declare `fmt=` on a binding whose runtime method has no format
 * parameter — `bind_text` on a string subject is the shipped case (PR-04 WO10
 * finding 10). Firmware emission passes the format only when the author wrote
 * one; the editor thunk cannot know in advance, so it asks the compiler. With a
 * format and an overload that cannot take it, the binding is refused rather than
 * the format silently dropped.
 *
 * @param with_fmt    Generic callable `(self, subject, fmt)`, SFINAE-friendly.
 * @param without_fmt Generic callable `(self, subject)`.
 */
template <typename Self, typename Subject, typename WithFmt, typename WithoutFmt>
bool u8g2gl_editor_bind_call(Self* self, Subject* subject, const char* fmt, WithFmt with_fmt,
                             WithoutFmt without_fmt) {
    if constexpr (std::is_invocable_v<WithFmt, Self*, Subject*, const char*>) {
        (void)without_fmt;
        return with_fmt(self, subject, fmt);
    } else {
        (void)with_fmt;
        if (fmt != nullptr) {
            return false;
        }
        return without_fmt(self, subject);
    }
}

/**
 * @brief Call a `<data>` access method and report whether the widget took the
 *        row: its `bool` return where it has one, as `add_row` does, and true
 *        for a method that returns nothing.
 *
 * @param call Callable `(self)` making the access call.
 */
template <typename Self, typename Call>
bool u8g2gl_editor_row_call(Self* self, Call call) {
    if constexpr (std::is_same_v<std::invoke_result_t<Call, Self*>, bool>) {
        return call(self);
    } else {
        call(self);
        return true;
    }
}

/**
 * @brief The registry for this build, defined by the generated
 *        `ui_editor_registry.cpp` (`u8g2gl generate --target-kind editor`).
 */
const u8g2gl_editor_registry& ui_editor_registry();

#endif  // U8G2GL_EDITOR

#endif  // U8G2GL_EDITOR_H
