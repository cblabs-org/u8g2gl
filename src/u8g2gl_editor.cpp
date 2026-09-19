/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_editor.cpp
 * Purpose: The checks between an editor host and the generated registry
 *          ([UD-4], PR-04 WO11). A generated thunk trusts its arguments, exactly
 *          as a generated firmware statement trusts the literal it was spelled
 *          with; the host, which builds values from a scene description at run
 *          time, gets no such guarantee. So every by-name operation lands here
 *          first: the entry is found, the value's type and the storage are
 *          checked, and only then is the thunk called. A mistake in the host
 *          becomes `false`, never a wild cast.
 *
 * Description: Value constructors, linear lookups over the generated tables
 *              (a scene has tens of elements, so a search beats any index), and
 *              the construct / set / bind / draw operations. The whole file is
 *              under `U8G2GL_EDITOR`: a firmware build compiles it to nothing,
 *              which is how firmware pays nothing for the editor.
 */
#include "u8g2gl/u8g2gl_editor.h"

#ifdef U8G2GL_EDITOR

#include <cstring>

// --- Values ---

u8g2gl_editor_value u8g2gl_editor_int(int32_t v) {
    u8g2gl_editor_value value;
    value.type = U8G2GL_EDITOR_INT;
    value.integer = v;
    return value;
}

u8g2gl_editor_value u8g2gl_editor_bool(bool v) {
    u8g2gl_editor_value value;
    value.type = U8G2GL_EDITOR_BOOL;
    value.boolean = v;
    return value;
}

u8g2gl_editor_value u8g2gl_editor_text(u8g2gl_editor_type_t type, const char* text) {
    u8g2gl_editor_value value;
    value.type = type;
    value.text = text;
    return value;
}

u8g2gl_editor_value u8g2gl_editor_pointer(u8g2gl_editor_type_t type, const void* pointer) {
    u8g2gl_editor_value value;
    value.type = type;
    value.pointer = pointer;
    return value;
}

bool u8g2gl_editor_is(const u8g2gl_editor_value& value, const char* word) {
    return value.text != nullptr && word != nullptr && std::strcmp(value.text, word) == 0;
}

// u8g2gl_editor_read_subject
// The value a draw call reads at draw time, as firmware's `ui_subject_x.get()`
// does. A time subject is read as INT because every draw argument a subject can
// drive is an `int` prop ([D-20]); uint32_t epoch seconds narrow exactly as the
// firmware's implicit conversion does.
//   subject — a u8g2gl_subject_<type>_base, or nullptr
//   type    — which base it is
u8g2gl_editor_value u8g2gl_editor_read_subject(const void* subject, u8g2gl_subject_type_t type) {
    if (subject == nullptr) {
        return u8g2gl_editor_value{};
    }
    switch (type) {
        case U8G2GL_SUBJECT_INT:
            return u8g2gl_editor_int(static_cast<const u8g2gl_subject_int_base*>(subject)->get());
        case U8G2GL_SUBJECT_BOOL:
            return u8g2gl_editor_bool(static_cast<const u8g2gl_subject_bool_base*>(subject)->get());
        case U8G2GL_SUBJECT_STRING:
            return u8g2gl_editor_text(U8G2GL_EDITOR_STRING,
                                      static_cast<const u8g2gl_subject_string_base*>(subject)->get());
        case U8G2GL_SUBJECT_TIME:
            return u8g2gl_editor_int(
                static_cast<int32_t>(static_cast<const u8g2gl_subject_time_base*>(subject)->get()));
    }
    return u8g2gl_editor_value{};
}

// --- Lookup ---
// Linear, by strcmp: the tables are a few dozen entries and a scene is built
// once per edit, so an index would cost flash for no measurable gain.

const u8g2gl_editor_class* u8g2gl_editor_find_class(const u8g2gl_editor_registry& registry, const char* tag) {
    for (uint8_t i = 0; i < registry.class_count; ++i) {
        if (tag != nullptr && std::strcmp(registry.classes[i].tag, tag) == 0) {
            return &registry.classes[i];
        }
    }
    return nullptr;
}

const u8g2gl_editor_drawing* u8g2gl_editor_find_drawing(const u8g2gl_editor_registry& registry, const char* tag) {
    for (uint8_t i = 0; i < registry.drawing_count; ++i) {
        if (tag != nullptr && std::strcmp(registry.drawings[i].tag, tag) == 0) {
            return &registry.drawings[i];
        }
    }
    return nullptr;
}

const u8g2gl_editor_property* u8g2gl_editor_find_property(const u8g2gl_editor_class& cls, const char* name) {
    for (uint8_t i = 0; i < cls.property_count; ++i) {
        if (name != nullptr && std::strcmp(cls.properties[i].name, name) == 0) {
            return &cls.properties[i];
        }
    }
    return nullptr;
}

const u8g2gl_editor_binding* u8g2gl_editor_find_binding(const u8g2gl_editor_class& cls, const char* name,
                                                        u8g2gl_subject_type_t subject_type) {
    for (uint8_t i = 0; i < cls.binding_count; ++i) {
        const u8g2gl_editor_binding& binding = cls.bindings[i];
        if (name != nullptr && binding.subject_type == subject_type && std::strcmp(binding.name, name) == 0) {
            return &binding;
        }
    }
    return nullptr;
}

int u8g2gl_editor_find_param(const u8g2gl_editor_drawing& drawing, const char* name) {
    for (uint8_t i = 0; i < drawing.param_count; ++i) {
        if (name != nullptr && std::strcmp(drawing.params[i].name, name) == 0) {
            return i;
        }
    }
    return -1;
}

const u8g2gl_editor_directive* u8g2gl_editor_find_directive(const u8g2gl_editor_registry& registry,
                                                            const char* name,
                                                            u8g2gl_subject_type_t subject_type) {
    for (uint8_t i = 0; i < registry.directive_count; ++i) {
        const u8g2gl_editor_directive& directive = registry.directives[i];
        if (name != nullptr && directive.subject_type == subject_type && std::strcmp(directive.name, name) == 0) {
            return &directive;
        }
    }
    return nullptr;
}

bool u8g2gl_editor_find_flag(const u8g2gl_editor_registry& registry, const char* name, uint8_t* bit) {
    for (uint8_t i = 0; i < registry.flag_count; ++i) {
        if (name != nullptr && std::strcmp(registry.flags[i].name, name) == 0) {
            if (bit != nullptr) {
                *bit = registry.flags[i].bit;
            }
            return true;
        }
    }
    return false;
}

// --- By name ---

// u8g2gl_editor_construct
// Placement construction into the host's storage, after checking it can hold the
// class: a misaligned or short buffer is undefined behaviour the moment the
// constructor runs, so it is refused before rather than debugged after.
//   storage  — the host's buffer
//   capacity — its size in bytes
u8g2gl_obj* u8g2gl_editor_construct(const u8g2gl_editor_class& cls, void* storage, size_t capacity) {
    if (storage == nullptr || cls.construct == nullptr || capacity < cls.size || cls.align == 0 ||
        reinterpret_cast<uintptr_t>(storage) % cls.align != 0) {
        return nullptr;
    }
    return cls.construct(storage);
}

// u8g2gl_editor_destroy
// The destructor is virtual, so the base pointer destroys the whole object and
// its binding slots are released (u8g2gl_obj::~u8g2gl_obj unbinds). Nothing is
// freed: the storage was never allocated here.
void u8g2gl_editor_destroy(u8g2gl_obj* obj) {
    if (obj != nullptr) {
        obj->~u8g2gl_obj();
    }
}

bool u8g2gl_editor_set_rect(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, int16_t x, int16_t y, int16_t w,
                            int16_t h) {
    if (obj == nullptr || cls.set_rect == nullptr) {
        return false;
    }
    cls.set_rect(obj, x, y, w, h);
    return true;
}

bool u8g2gl_editor_set_property(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const char* name,
                                const u8g2gl_editor_value& value) {
    const u8g2gl_editor_property* property = u8g2gl_editor_find_property(cls, name);
    if (obj == nullptr || property == nullptr || property->type != value.type) {
        return false;
    }
    return property->set(obj, value);
}

bool u8g2gl_editor_bind(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const char* name, void* subject,
                        u8g2gl_subject_type_t subject_type, const char* fmt) {
    const u8g2gl_editor_binding* binding = u8g2gl_editor_find_binding(cls, name, subject_type);
    if (obj == nullptr || subject == nullptr || binding == nullptr) {
        return false;
    }
    return binding->bind(obj, subject, fmt);
}

// u8g2gl_editor_bind_flag
// A directive on an object: the method and subject type select the entry, the
// flag name its bit, and the ref must be a type the runtime's overloads take —
// INT always, BOOL for a bool subject only (u8g2gl_obj.h).
bool u8g2gl_editor_bind_flag(const u8g2gl_editor_registry& registry, u8g2gl_obj* obj, const char* method,
                             void* subject, u8g2gl_subject_type_t subject_type, const u8g2gl_editor_value& ref,
                             const char* flag) {
    const u8g2gl_editor_directive* directive = u8g2gl_editor_find_directive(registry, method, subject_type);
    uint8_t bit = 0;
    if (obj == nullptr || subject == nullptr || directive == nullptr ||
        !u8g2gl_editor_find_flag(registry, flag, &bit)) {
        return false;
    }
    const bool ref_ok = ref.type == U8G2GL_EDITOR_INT ||
                        (ref.type == U8G2GL_EDITOR_BOOL && subject_type == U8G2GL_SUBJECT_BOOL);
    if (!ref_ok) {
        return false;
    }
    return directive->bind(obj, subject, ref, bit);
}

bool u8g2gl_editor_flag_clear(const u8g2gl_editor_registry& registry, const char* method, const void* subject,
                              u8g2gl_subject_type_t subject_type, const u8g2gl_editor_value& ref, bool* clear) {
    const u8g2gl_editor_directive* directive = u8g2gl_editor_find_directive(registry, method, subject_type);
    if (subject == nullptr || directive == nullptr || clear == nullptr) {
        return false;
    }
    *clear = directive->clear(subject, ref);
    return true;
}

// u8g2gl_editor_draw
// Checks every supplied argument against its param's type before the thunk
// runs; the thunk itself refuses a missing required argument or an unknown enum
// text, because only it knows which params have defaults.
//   args  — one value per param, NONE for "use the default"
//   count — must equal the entry's param count
bool u8g2gl_editor_draw(const u8g2gl_editor_drawing& drawing, U8G2& display, const u8g2gl_editor_value* args,
                        uint8_t count) {
    if (count != drawing.param_count || (count > 0 && args == nullptr)) {
        return false;
    }
    for (uint8_t i = 0; i < count; ++i) {
        if (args[i].type != U8G2GL_EDITOR_NONE && args[i].type != drawing.params[i].type) {
            return false;
        }
    }
    return drawing.draw(display, args);
}

#endif  // U8G2GL_EDITOR
