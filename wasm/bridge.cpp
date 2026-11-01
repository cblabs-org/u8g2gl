/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/bridge.cpp
 * Purpose: WebAssembly bridge exporting the C++ editor engine to JavaScript
 *          via Emscripten ([UD-4]). Adapts the editor host's by-name
 *          operations to flat C functions that can be called from JS. It is
 *          compiled into whichever editor Wasm is being built — the framework
 *          fixture's, or a project's with its own widgets — so it fixes no
 *          capacity of its own: every size comes from the scene it is handed
 *          or from the project configuration it is compiled against ([D-21]).
 *
 * Description: Implements the two-mode architecture's prebuilt Wasm host:
 *              `applyScene()` receives flat `ui_scene.json` text, sets up the
 *              virtual display and subjects, and constructs the active screen.
 *              `applySampleData()` applies key-value pairs to active subjects.
 *              `renderFrame()` ticks animating objects, renders into a virtual
 *              U8G2 display buffer, and returns a pointer to the raw buffer.
 *
 *              Sizes are the scene's, not constants: the display buffer is
 *              allocated for the scene's display, the object arena for the
 *              classes the active screen constructs, each string subject for
 *              its declared `max_len` (the runtime default when it declares
 *              none), and each subject's observer slots for the bindings that
 *              name it. The binding pool is the runtime's, sized by the
 *              project's generated configuration.
 *
 *              An element whose class the registry does not know (a widget the
 *              loaded Wasm was not built with) does not fail the scene: it is
 *              built as a placeholder object at its rectangle, drawn in draw
 *              order like any object, and listed by `getPlaceholders()`.
 *
 *              Memory: this is editor-host code, compiled only into the
 *              editor's Wasm (and the native parity test), never into
 *              firmware, so it uses the heap — std::vector, std::string,
 *              std::unique_ptr — for its own bookkeeping. The no-heap rule
 *              binds the runtime (`include/`, `src/`), which this file only
 *              calls. The runtime's objects are still placement-constructed
 *              into an arena sized for them, so their layout is firmware's.
 *
 *              Every entry point that can fail clears the last error first,
 *              so getLastError() always describes the call that just failed.
 *
 * Exported Functions (extern "C"):
 *     Scene lifecycle:
 *     - applyScene():       Parse scene JSON and build the default screen
 *     - selectScreen():     Switch active screen and rebuild objects
 *     - applySampleData():  Set subject values from a JSON object
 *     - teardown():         Destroy objects, clear subjects, reset arena
 *     Frame:
 *     - renderFrame():      Tick objects and render to the virtual U8G2 buffer
 *     Buffer:
 *     - getDisplayWidth():  Width of the virtual display in pixels
 *     - getDisplayHeight(): Height of the virtual display in pixels
 *     - getBufferPtr():     Pointer to the raw U8G2 frame buffer
 *     - getBufferSize():    Byte length of the raw U8G2 frame buffer
 *     Diagnostics:
 *     - getLastError():     The last error message
 *     - getPlaceholders():  JSON list of the active screen's placeholder elements
 *
 *     A project editor Wasm also exports getBuildHash(). It is not defined
 *     here: the design server's build compiles it from a generated unit and
 *     adds it to the export list at link time.
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <string>
#include <utility>
#include <vector>

#include "U8g2lib.h"
#include "memory_display.h"
#include "scene_json.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_editor.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_types.h"

// The generated editor registry, and its font and image lookup: every font or
// image a scene names is resolved through the project's own generated table,
// so this bridge names none and links into any project's editor Wasm.
extern const u8g2gl_editor_registry& ui_editor_registry();
extern const void* ui_editor_asset(u8g2gl_editor_type_t type, const char* name);

namespace {

// --- Host-sized subjects ---
// The runtime's subject templates fix their observer and string capacity at
// compile time, which only generated code can know. The editor host learns
// both from the scene at load, so it derives from the same bases the templates
// do, passing storage it allocated for this scene. The storage is a base
// listed first, so it is constructed before the subject base that points into
// it (base-from-member).

/** Observer slots for one subject, sized when the scene is applied. */
struct observer_storage {
    explicit observer_storage(uint8_t count) : slots(count) {}
    std::vector<u8g2gl_observer> slots;
};

/** Observer slots plus a character buffer of max_len + 1 for a string subject. */
struct string_storage : observer_storage {
    string_storage(uint16_t max_len, uint8_t count) : observer_storage(count), buffer(max_len + 1u, '\0') {}
    std::vector<char> buffer;
};

class host_int_subject : private observer_storage, public u8g2gl_subject_int_base {
public:
    explicit host_int_subject(uint8_t observers)
        : observer_storage(observers), u8g2gl_subject_int_base(slots.data(), observers) {}
};

class host_bool_subject : private observer_storage, public u8g2gl_subject_bool_base {
public:
    explicit host_bool_subject(uint8_t observers)
        : observer_storage(observers), u8g2gl_subject_bool_base(slots.data(), observers) {}
};

class host_time_subject : private observer_storage, public u8g2gl_subject_time_base {
public:
    explicit host_time_subject(uint8_t observers)
        : observer_storage(observers), u8g2gl_subject_time_base(slots.data(), observers) {}
};

class host_string_subject : private string_storage, public u8g2gl_subject_string_base {
public:
    host_string_subject(uint16_t max_len, uint8_t observers)
        : string_storage(max_len, observers),
          u8g2gl_subject_string_base(buffer.data(), static_cast<uint16_t>(max_len + 1u), slots.data(), observers) {
        init(max_len);
    }
};

// --- Placeholder: an element whose class the loaded Wasm does not have ---
// A plain object at the element's rectangle, so its children, clip and flag
// directives behave exactly as they would around the real widget, and so it is
// drawn by u8g2gl_render_object() in draw order: overlap and clipping stay true
// in every view of the canvas. It draws a 1-pixel border, a 45° hatch at 25% density,
// the tag in the smallest built-in font where it fits, and an information
// badge.
class editor_placeholder : public u8g2gl_obj {
public:
    // `tag` points into s_scene's strings and is not copied, so a placeholder
    // must not outlive the scene: teardown() destroys objects before it resets
    // s_scene, which is what makes this safe.
    explicit editor_placeholder(const char* tag) : tag_(tag) {}

    void render(U8G2& display) override {
        const int16_t x = get_x();
        const int16_t y = get_y();
        const int16_t w = get_w();
        const int16_t h = get_h();
        if (w <= 0 || h <= 0) {
            return;
        }
        display.setDrawColor(1);

        // --- Step 1: Border ---
        display.drawFrame(x, y, w, h);

        // --- Step 2: Hatch, every fourth diagonal of the interior ---
        // Measured from the rectangle's origin, so the hatch moves with the
        // element instead of crawling under it.
        for (int16_t dy = 1; dy < h - 1; ++dy) {
            for (int16_t dx = 1; dx < w - 1; ++dx) {
                if ((dx + dy) % kHatchPeriod == 0) {
                    display.drawPixel(x + dx, y + dy);
                }
            }
        }

        // --- Step 3: The tag, on a cleared strip, where it fits ---
        display.setFont(u8g2_font_4x6_tr);
        const int16_t text_w = static_cast<int16_t>(display.getStrWidth(tag_));
        const int16_t text_h = static_cast<int16_t>(display.getMaxCharHeight());
        if (text_w + 4 <= w && text_h + 4 <= h) {
            display.setDrawColor(0);
            display.drawBox(x + 1, y + 1, text_w + 2, text_h + 2);
            display.setDrawColor(1);
            display.drawStr(x + 2, y + 2, tag_);
        }

        // --- Step 4: The badge, top right: a filled cell with an 'i' cut out ---
        if (w >= kBadgeW + 4 + (text_w + 4 <= w ? text_w + 2 : 0) && h >= kBadgeH + 2) {
            const int16_t bx = x + w - 1 - kBadgeW;
            const int16_t by = y + 1;
            display.drawBox(bx, by, kBadgeW, kBadgeH);
            display.setDrawColor(0);
            display.drawPixel(bx + 2, by + 1);
            display.drawVLine(bx + 2, by + 3, kBadgeH - 4);
            display.setDrawColor(1);
        }
    }

private:
    static constexpr int16_t kHatchPeriod = 4;  // one diagonal in four: 25% density
    static constexpr int16_t kBadgeW = 5;
    static constexpr int16_t kBadgeH = 7;
    const char* tag_;
};

// The scene description version this bridge reads: `version` in ui_scene.json,
// written by the CLI's scene emitter (emit/scene.ts). Bump both together.
constexpr int32_t kSceneVersion = 3;

// Virtual display, sized for each scene (memory_display.h, shared with the
// test-run harness so both hosts hold their frames the same way)
memory_display s_display;

// The active screen's objects live here, sized for the classes it constructs
std::vector<std::max_align_t> s_arena;
size_t s_arena_used = 0;

// Host-owned subject slot
struct subject_slot {
    std::string name;
    u8g2gl_subject_type_t type = U8G2GL_SUBJECT_INT;
    // The u8g2gl_subject_*_base subobject, which the registry's thunks cast
    // back to. It must be converted to the base before erasing the type: the
    // host subjects put their storage first, so the base is not at offset 0.
    void* base = nullptr;
    std::unique_ptr<host_int_subject> int_subject;
    std::unique_ptr<host_bool_subject> bool_subject;
    std::unique_ptr<host_string_subject> string_subject;
    std::unique_ptr<host_time_subject> time_subject;
};

/** One element built as a placeholder, for getPlaceholders(). */
struct placeholder_record {
    const scene_json* element;
};

// Scene state
scene_json s_scene;
std::string s_last_error;
std::vector<std::unique_ptr<subject_slot>> s_subjects;

const scene_json* s_active_screen = nullptr;
std::vector<u8g2gl_obj*> s_objects;
std::vector<const u8g2gl_editor_class*> s_classes;  // nullptr for a placeholder
std::vector<uint8_t> s_parents;
std::vector<placeholder_record> s_placeholders;
std::string s_placeholders_json;

// fail
// Records an error and returns false. Only the first is kept, because the
// first refusal is the cause and later ones are its consequences; each entry
// point clears the error first, so it is always this call's.
bool fail(const std::string& message) {
    if (s_last_error.empty()) {
        s_last_error = message;
    }
    return false;
}

// arena_bytes
// Bytes one object of this size and alignment takes in the arena, padding
// included, so the arena can be sized before anything is constructed in it.
size_t arena_bytes(size_t size, size_t align) {
    return size + align - 1;
}

// arena_allocate
// Bumps the next aligned block out of s_arena, or nullptr when it does not fit.
//   size  — the object's sizeof
//   align — its alignof; above max_align_t the arena cannot honour it (an
//           over-aligned class), which callers report as an allocation failure
void* arena_allocate(size_t size, size_t align) {
    const size_t capacity = s_arena.size() * sizeof(std::max_align_t);
    if (align == 0 || align > alignof(std::max_align_t)) {
        return nullptr;
    }
    const size_t start = (s_arena_used + align - 1) / align * align;
    if (start + size > capacity) {
        return nullptr;
    }
    s_arena_used = start + size;
    return reinterpret_cast<unsigned char*>(s_arena.data()) + start;
}

subject_slot* find_subject(const std::string& name) {
    for (auto& slot : s_subjects) {
        if (slot->name == name) {
            return slot.get();
        }
    }
    return nullptr;
}

const scene_json* find_screen_json(const std::string& name) {
    for (const scene_json& screen : s_scene.get("screens").items()) {
        if (screen.get("name").as_string() == name) {
            return &screen;
        }
    }
    return nullptr;
}

bool subject_type_of(const scene_json& json, u8g2gl_subject_type_t* out) {
    const std::string& type = json.get("subject_type").as_string();
    if (type == "int") {
        *out = U8G2GL_SUBJECT_INT;
    } else if (type == "bool") {
        *out = U8G2GL_SUBJECT_BOOL;
    } else if (type == "string") {
        *out = U8G2GL_SUBJECT_STRING;
    } else if (type == "time") {
        *out = U8G2GL_SUBJECT_TIME;
    } else {
        return false;
    }
    return true;
}

bool value_for(u8g2gl_editor_type_t type, const scene_json& json, const std::string& what,
               u8g2gl_editor_value* out) {
    switch (type) {
        case U8G2GL_EDITOR_INT:
            if (!json.is_number()) break;
            *out = u8g2gl_editor_int(json.as_int());
            return true;
        case U8G2GL_EDITOR_BOOL:
            if (!json.is_bool()) break;
            *out = u8g2gl_editor_bool(json.as_bool());
            return true;
        case U8G2GL_EDITOR_STRING:
        case U8G2GL_EDITOR_ENUM:
        case U8G2GL_EDITOR_COLOR:
            if (!json.is_string()) break;
            *out = u8g2gl_editor_text(type, json.as_string().c_str());
            return true;
        case U8G2GL_EDITOR_FONT:
        case U8G2GL_EDITOR_IMAGE: {
            if (!json.is_string()) break;
            const void* data = ui_editor_asset(type, json.as_string().c_str());
            if (data == nullptr) {
                return fail(what + ": the project declares no " + (type == U8G2GL_EDITOR_FONT ? "font" : "image") +
                            " '" + json.as_string() + "'");
            }
            *out = u8g2gl_editor_pointer(type, data);
            return true;
        }
        default:
            break;
    }
    return fail(what + ": scene value does not fit registry type");
}

// destroy_objects
// Destroys the active screen's objects and empties the arena. In reverse
// construction order, so children (always after their parent in the flat
// array) go before the parents they may refer to.
void destroy_objects() {
    for (size_t i = s_objects.size(); i > 0; --i) {
        u8g2gl_editor_destroy(s_objects[i - 1]);
    }
    s_objects.clear();
    s_classes.clear();
    s_parents.clear();
    s_placeholders.clear();
    s_arena.clear();
    s_arena_used = 0;
    s_active_screen = nullptr;
}

// build_object
// Constructs one object element into the arena: through the registry when its
// class is known, or as a placeholder when it is not.
//   element — the scene element, realisation "object"
//   cls     — its registry class, or nullptr to build a placeholder
bool build_object(const scene_json& element, const u8g2gl_editor_class* cls) {
    const std::string& name = element.get("name").as_string();
    u8g2gl_obj* obj = nullptr;
    if (cls != nullptr) {
        void* storage = arena_allocate(cls->size, cls->align);
        if (storage == nullptr) {
            return fail(name + ": arena allocation failed for " + std::to_string(cls->size) + " bytes");
        }
        obj = u8g2gl_editor_construct(*cls, storage, cls->size);
        if (obj == nullptr) {
            return fail(name + ": construction refused");
        }
    } else {
        void* storage = arena_allocate(sizeof(editor_placeholder), alignof(editor_placeholder));
        if (storage == nullptr) {
            return fail(name + ": arena allocation failed for a placeholder");
        }
        obj = ::new (storage) editor_placeholder(element.get("tag").as_string().c_str());
        s_placeholders.push_back({&element});
    }
    s_objects.push_back(obj);
    s_classes.push_back(cls);
    const scene_json& parent = element.get("parent");
    s_parents.push_back(parent.is_null() ? U8G2GL_NO_PARENT : static_cast<uint8_t>(parent.as_int()));
    if (element.get("object").as_int() != static_cast<int32_t>(s_objects.size() - 1)) {
        return fail(name + ": objects not in index order");
    }
    return true;
}

// configure_object
// The "properties" init step: the rectangle, then each property through its
// registry thunk. A placeholder takes only the rectangle.
//   index   — the object's index in s_objects
//   element — its scene element
bool configure_object(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const scene_json& rect = element.get("rect");
    if (s_classes[index] == nullptr) {
        // A placeholder takes only its rectangle: its properties belong to a
        // class this Wasm does not have.
        const auto& r = rect.items();
        if (r.size() == 4) {
            s_objects[index]->set_coords(static_cast<int16_t>(r[0].as_int()), static_cast<int16_t>(r[1].as_int()),
                                         static_cast<int16_t>(r[2].as_int()), static_cast<int16_t>(r[3].as_int()));
        }
        return true;
    }
    const u8g2gl_editor_class& cls = *s_classes[index];
    if (rect.is_array()) {
        const auto& r = rect.items();
        if (r.size() != 4 ||
            !u8g2gl_editor_set_rect(cls, s_objects[index], static_cast<int16_t>(r[0].as_int()),
                                    static_cast<int16_t>(r[1].as_int()), static_cast<int16_t>(r[2].as_int()),
                                    static_cast<int16_t>(r[3].as_int()))) {
            return fail(name + ": rectangle refused");
        }
    }
    for (const scene_json& property : element.get("properties").items()) {
        const std::string& prop = property.get("name").as_string();
        const u8g2gl_editor_property* entry = u8g2gl_editor_find_property(cls, prop.c_str());
        u8g2gl_editor_value value;
        if (entry == nullptr) {
            return fail(name + "." + prop + ": no such property in registry");
        }
        if (!value_for(entry->type, property.get("value"), name + "." + prop, &value) ||
            !u8g2gl_editor_set_property(cls, s_objects[index], prop.c_str(), value)) {
            return fail(name + "." + prop + ": property set refused");
        }
    }
    return true;
}

// apply_styles
// The "styles" init step: each named style's properties, then the element's
// own overrides, through the same thunks as properties. Skipped for a placeholder.
//   index   — the object's index in s_objects
//   element — its scene element
bool apply_styles(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    if (s_classes[index] == nullptr) {
        return true;  // a placeholder has no properties to style
    }
    const u8g2gl_editor_class& cls = *s_classes[index];
    auto set_prop = [&](const scene_json& property, const std::string& where) -> bool {
        const std::string& prop = property.get("name").as_string();
        const u8g2gl_editor_property* entry = u8g2gl_editor_find_property(cls, prop.c_str());
        u8g2gl_editor_value value;
        if (entry == nullptr) {
            return fail(where + ": property '" + prop + "' not found on class");
        }
        if (!value_for(entry->type, property.get("value"), where, &value) ||
            !u8g2gl_editor_set_property(cls, s_objects[index], prop.c_str(), value)) {
            return fail(where + ": property set refused");
        }
        return true;
    };
    for (const scene_json& style_name : element.get("styles").items()) {
        const scene_json* style = nullptr;
        for (const scene_json& candidate : s_scene.get("styles").items()) {
            if (candidate.get("name").as_string() == style_name.as_string()) {
                style = &candidate;
                break;
            }
        }
        if (style == nullptr) {
            return fail(name + ": style '" + style_name.as_string() + "' not found in scene");
        }
        for (const scene_json& property : style->get("properties").items()) {
            if (!set_prop(property, name + " style " + style_name.as_string())) {
                return false;
            }
        }
    }
    for (const scene_json& property : element.get("style_overrides").items()) {
        if (!set_prop(property, name + " override")) {
            return false;
        }
    }
    return true;
}

// bind_object
// The "bindings" init step: each binding, then each flag directive, against
// the host subjects. A placeholder keeps only its flag directives.
//   index   — the object's index in s_objects
//   element — its scene element
bool bind_object(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_registry& reg = ui_editor_registry();
    // A placeholder's bindings target its missing class; its flag directives
    // are the base object's, so it keeps them and hides as the widget would.
    const bool placeholder = s_classes[index] == nullptr;
    for (const scene_json& binding : element.get("bindings").items()) {
        if (placeholder) {
            break;
        }
        subject_slot* slot = find_subject(binding.get("subject").as_string());
        u8g2gl_subject_type_t type{};
        if (slot == nullptr || !subject_type_of(binding, &type) || type != slot->type) {
            return fail(name + ": binding names unknown subject '" + binding.get("subject").as_string() + "'");
        }
        const char* fmt = binding.has("fmt") ? binding.get("fmt").as_string().c_str() : nullptr;
        const int16_t origin = binding.has("origin") ? static_cast<int16_t>(binding.get("origin").as_int()) : 0;
        if (!u8g2gl_editor_bind(*s_classes[index], s_objects[index], binding.get("name").as_string().c_str(), slot->base,
                                type, fmt, origin)) {
            return fail(name + ": binding '" + binding.get("name").as_string() + "' refused");
        }
    }
    for (const scene_json& flag : element.get("flags").items()) {
        subject_slot* slot = find_subject(flag.get("subject").as_string());
        u8g2gl_subject_type_t type{};
        if (slot == nullptr || !subject_type_of(flag, &type)) {
            return fail(name + ": flag directive names unknown subject");
        }
        const scene_json& json_ref = flag.get("ref");
        const u8g2gl_editor_value ref =
            json_ref.is_bool() ? u8g2gl_editor_bool(json_ref.as_bool()) : u8g2gl_editor_int(json_ref.as_int());
        if (!u8g2gl_editor_bind_flag(reg, s_objects[index], flag.get("directive").as_string().c_str(), slot->base,
                                     type, ref, flag.get("flag").as_string().c_str())) {
            return fail(name + ": flag directive '" + flag.get("directive").as_string() + "' refused");
        }
    }
    return true;
}

// build_screen
// Builds one screen: sizes the arena for its classes, constructs its objects,
// then runs the scene's init steps in the scene's order.
//   screen_name — a screen in s_scene
bool build_screen(const std::string& screen_name) {
    // --- Step 1: Locate screen in parsed scene ---
    s_active_screen = find_screen_json(screen_name);
    if (s_active_screen == nullptr) {
        return fail("screen '" + screen_name + "' not found in scene");
    }

    std::vector<const scene_json*> objects;
    for (const scene_json& element : s_active_screen->get("elements").items()) {
        if (element.get("realisation").as_string() == "object") {
            objects.push_back(&element);
        }
    }

    // --- Step 2: Size the arena for exactly these classes, then construct ---
    // An unknown class is not an error: that element becomes a placeholder.
    const u8g2gl_editor_registry& reg = ui_editor_registry();
    std::vector<const u8g2gl_editor_class*> classes;
    size_t arena_needed = 0;
    for (const scene_json* element : objects) {
        const u8g2gl_editor_class* cls = u8g2gl_editor_find_class(reg, element->get("class").as_string().c_str());
        classes.push_back(cls);
        arena_needed += cls != nullptr ? arena_bytes(cls->size, cls->align)
                                       : arena_bytes(sizeof(editor_placeholder), alignof(editor_placeholder));
    }
    s_arena.assign((arena_needed + sizeof(std::max_align_t) - 1) / sizeof(std::max_align_t), std::max_align_t{});
    s_arena_used = 0;
    for (size_t i = 0; i < objects.size(); ++i) {
        if (!build_object(*objects[i], classes[i])) {
            return false;
        }
    }

    // --- Step 3: Configure objects per scene's init sequence ---
    for (const scene_json& step : s_scene.get("init").items()) {
        const std::string& step_name = step.as_string();
        for (size_t i = 0; i < objects.size(); ++i) {
            const bool ok = (step_name == "properties") ? configure_object(i, *objects[i])
                          : (step_name == "styles")     ? apply_styles(i, *objects[i])
                          : (step_name == "bindings")   ? bind_object(i, *objects[i])
                                                        : fail("unknown init step '" + step_name + "'");
            if (!ok) {
                return false;
            }
        }
    }
    return true;
}

bool evaluate_visibility(const scene_json& element, bool* shown) {
    *shown = true;
    const u8g2gl_editor_registry& reg = ui_editor_registry();
    for (const scene_json& term : element.get("visibility").items()) {
        if (term.has("ancestor")) {
            const int32_t ancestor = term.get("ancestor").as_int();
            if (ancestor < 0 || static_cast<size_t>(ancestor) >= s_objects.size()) {
                return fail("guard names missing ancestor object");
            }
            *shown = *shown && !s_objects[static_cast<size_t>(ancestor)]->is_hidden();
            continue;
        }
        subject_slot* slot = find_subject(term.get("subject").as_string());
        u8g2gl_subject_type_t type{};
        if (slot == nullptr || !subject_type_of(term, &type)) {
            return fail("guard names unknown subject '" + term.get("subject").as_string() + "'");
        }
        const scene_json& json_ref = term.get("ref");
        const u8g2gl_editor_value ref =
            json_ref.is_bool() ? u8g2gl_editor_bool(json_ref.as_bool()) : u8g2gl_editor_int(json_ref.as_int());
        bool clear = false;
        if (!u8g2gl_editor_flag_clear(reg, term.get("directive").as_string().c_str(), slot->base, type, ref, &clear)) {
            return fail("guard directive refused");
        }
        *shown = *shown && clear;
    }
    return true;
}

bool render_draw_call(U8G2& display, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_registry& reg = ui_editor_registry();
    const u8g2gl_editor_drawing* drawing =
        u8g2gl_editor_find_drawing(reg, element.get("tag").as_string().c_str());
    if (drawing == nullptr) {
        return fail(name + ": drawing '" + element.get("tag").as_string() + "' not in registry");
    }

    bool shown = false;
    if (!evaluate_visibility(element, &shown)) {
        return false;
    }
    if (!shown) {
        return true;
    }

    std::vector<u8g2gl_editor_value> args(drawing->param_count);
    for (const scene_json& argument : element.get("arguments").items()) {
        const std::string& param = argument.get("name").as_string();
        const int index = u8g2gl_editor_find_param(*drawing, param.c_str());
        if (index < 0) {
            return fail(name + "." + param + ": no such argument");
        }
        u8g2gl_editor_value& arg = args[static_cast<size_t>(index)];
        if (argument.has("subject")) {
            subject_slot* slot = find_subject(argument.get("subject").as_string());
            if (slot == nullptr) {
                return fail(name + "." + param + ": unknown subject '" + argument.get("subject").as_string() + "'");
            }
            arg = u8g2gl_editor_read_subject(slot->base, slot->type);
            if (arg.type == U8G2GL_EDITOR_INT) {
                const int16_t origin =
                    argument.has("origin") ? static_cast<int16_t>(argument.get("origin").as_int()) : 0;
                arg.integer = u8g2gl_coord_bound(origin, arg.integer);
            }
        } else if (!value_for(drawing->params[index].type, argument.get("value"), name + "." + param, &arg)) {
            return false;
        }
    }

    if (!element.has("clip")) {
        if (!u8g2gl_editor_draw(*drawing, display, args.data(), drawing->param_count)) {
            return fail(name + ": draw-by-name refused");
        }
        return true;
    }

    const int32_t clip_object = element.get("clip").as_int();
    if (clip_object < 0 || static_cast<size_t>(clip_object) >= s_objects.size()) {
        return fail(name + ": clip names missing object");
    }
    const u8g2gl_clip_scope clip(display, s_objects.data(), s_parents.data(), static_cast<uint8_t>(clip_object));
    if (!clip.drawable()) {
        return true;
    }
    if (!u8g2gl_editor_draw(*drawing, display, args.data(), drawing->param_count)) {
        return fail(name + ": draw-by-name refused");
    }
    return true;
}

// observers_wanted
// How many observer slots each subject needs: one per binding or flag
// directive naming it, on any screen, so selecting any screen fits.
//   name — the subject
uint8_t observers_wanted(const std::string& name) {
    size_t count = 0;
    for (const scene_json& screen : s_scene.get("screens").items()) {
        for (const scene_json& element : screen.get("elements").items()) {
            for (const char* list : {"bindings", "flags"}) {
                for (const scene_json& entry : element.get(list).items()) {
                    count += entry.get("subject").as_string() == name ? 1 : 0;
                }
            }
        }
    }
    return static_cast<uint8_t>(std::min<size_t>(count, std::numeric_limits<uint8_t>::max()));
}

// json_escape
// A string as the body of a JSON string literal.
std::string json_escape(const std::string& text) {
    std::string out;
    for (const char c : text) {
        if (c == '"' || c == '\\') {
            out += '\\';
            out += c;
        } else if (static_cast<unsigned char>(c) < 0x20) {
            out += ' ';
        } else {
            out += c;
        }
    }
    return out;
}

}  // namespace

extern "C" {

/**
 * @brief Teardown active screen objects and clear subjects and arena.
 */
EMSCRIPTEN_KEEPALIVE
void teardown() {
    // Objects first: placeholders point into s_scene, and bound objects
    // unregister from subjects as they are destroyed.
    destroy_objects();
    s_subjects.clear();
    s_scene = scene_json{};
    s_last_error.clear();
    s_display.release();
}

/**
 * @brief Parse scene JSON and construct the active screen through the registry.
 * @param json_str Null-terminated JSON string of ui_scene.json.
 * @return 1 on success, 0 on failure (check getLastError()).
 */
EMSCRIPTEN_KEEPALIVE
int applyScene(const char* json_str) {
    if (json_str == nullptr) {
        s_last_error = "null scene json provided";
        return 0;
    }

    // --- Step 1: Clean teardown of prior state ---
    teardown();

    // --- Step 2: Parse scene JSON ---
    std::string parse_error;
    s_scene = scene_json_parse(json_str, &parse_error);
    if (!parse_error.empty()) {
        s_last_error = "scene json parse error: " + parse_error;
        return 0;
    }
    if (s_scene.get("format").as_string() != "u8g2gl-scene" || s_scene.get("version").as_int() != kSceneVersion) {
        s_last_error = "not a version " + std::to_string(kSceneVersion) + " u8g2gl scene description";
        return 0;
    }

    // --- Step 3: Configure the virtual display at the scene's size ---
    // The display size, like each string subject's max_len below, is read from
    // the scene rather than the project's u8g2gl_generated_config.h: that header
    // carries only the four object and binding ceilings ([D-21]), and the scene
    // is generated from the same document, so the editor is still sized by the
    // project and never by a constant of its own.
    const scene_json& disp = s_scene.get("display");
    const int32_t width = disp.get("width").as_int();
    const int32_t height = disp.get("height").as_int();
    if (width <= 0 || height <= 0) {
        s_last_error = "scene display has no width and height";
        return 0;
    }
    std::string display_error;
    if (!s_display.setup(width, height, &display_error)) {
        fail(display_error);
        return 0;
    }

    // --- Step 4: Create host subjects ---
    for (const scene_json& described : s_scene.get("subjects").items()) {
        auto slot = std::make_unique<subject_slot>();
        slot->name = described.get("name").as_string();
        const std::string& type = described.get("type").as_string();
        const uint8_t observers = observers_wanted(slot->name);
        if (type == "int") {
            slot->type = U8G2GL_SUBJECT_INT;
            slot->int_subject = std::make_unique<host_int_subject>(observers);
            slot->base = static_cast<u8g2gl_subject_int_base*>(slot->int_subject.get());
        } else if (type == "bool") {
            slot->type = U8G2GL_SUBJECT_BOOL;
            slot->bool_subject = std::make_unique<host_bool_subject>(observers);
            slot->base = static_cast<u8g2gl_subject_bool_base*>(slot->bool_subject.get());
        } else if (type == "string") {
            slot->type = U8G2GL_SUBJECT_STRING;
            // From the scene, not the generated config, which carries no
            // string capacity (see Step 3). No max_len declared means the
            // runtime default, as the firmware subject's template argument
            // would be (§8.2).
            const int32_t max_len = described.has("max_len") ? described.get("max_len").as_int() : U8G2GL_MAX_STRING_LEN;
            if (max_len < 0 || max_len >= std::numeric_limits<uint16_t>::max()) {
                s_last_error = "subject '" + slot->name + "' has an invalid max_len";
                return 0;
            }
            slot->string_subject = std::make_unique<host_string_subject>(static_cast<uint16_t>(max_len), observers);
            slot->base = static_cast<u8g2gl_subject_string_base*>(slot->string_subject.get());
        } else if (type == "time") {
            slot->type = U8G2GL_SUBJECT_TIME;
            slot->time_subject = std::make_unique<host_time_subject>(observers);
            slot->base = static_cast<u8g2gl_subject_time_base*>(slot->time_subject.get());
        } else {
            s_last_error = "subject '" + slot->name + "' has unknown type '" + type + "'";
            return 0;
        }
        s_subjects.push_back(std::move(slot));
    }

    // --- Step 5: Choose default screen ---
    const auto& screens = s_scene.get("screens").items();
    if (screens.empty()) {
        s_last_error = "scene contains no screens";
        return 0;
    }
    std::string default_screen = screens[0].get("name").as_string();
    for (const scene_json& scr : screens) {
        if (scr.get("name").as_string() == "home") {
            default_screen = "home";
            break;
        }
    }

    if (!build_screen(default_screen)) {
        return 0;
    }

    return 1;
}

/**
 * @brief Select a named screen from the current scene and construct its objects.
 * @param screen_name The name of the screen to select.
 * @return 1 on success, 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int selectScreen(const char* screen_name) {
    s_last_error.clear();
    if (screen_name == nullptr) {
        s_last_error = "null screen name provided";
        return 0;
    }
    destroy_objects();
    if (!build_screen(screen_name)) {
        return 0;
    }
    return 1;
}

/**
 * @brief Update subject values from a JSON payload object: {"key": value, ...}
 * @param sample_data_json Null-terminated JSON object string.
 * @return 1 on success, 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int applySampleData(const char* sample_data_json) {
    s_last_error.clear();
    if (sample_data_json == nullptr) {
        s_last_error = "null sample data provided";
        return 0;
    }
    std::string parse_error;
    scene_json data = scene_json_parse(sample_data_json, &parse_error);
    if (!parse_error.empty() || !data.is_object()) {
        s_last_error = "sample data must be a valid JSON object";
        return 0;
    }

    for (const auto& pair : data.object) {
        subject_slot* slot = find_subject(pair.first);
        if (slot == nullptr) {
            continue;  // Ignored or lenient for unspecified keys
        }
        const scene_json& val = pair.second;
        switch (slot->type) {
            case U8G2GL_SUBJECT_INT:
                if (val.is_number()) {
                    slot->int_subject->set(val.as_int());
                }
                break;
            case U8G2GL_SUBJECT_BOOL:
                if (val.is_bool()) {
                    slot->bool_subject->set(val.as_bool());
                }
                break;
            case U8G2GL_SUBJECT_STRING:
                if (val.is_string()) {
                    slot->string_subject->set(val.as_string().c_str());
                }
                break;
            case U8G2GL_SUBJECT_TIME:
                if (val.is_number()) {
                    slot->time_subject->set(static_cast<uint32_t>(val.as_int()));
                }
                break;
        }
    }
    return 1;
}

/**
 * @brief Advance animation clocks, render active screen, return buffer pointer.
 * @param current_ms Current execution timestamp in milliseconds.
 * @return Pointer to raw U8G2 framebuffer, or nullptr on error.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* renderFrame(uint32_t current_ms) {
    s_last_error.clear();
    if (s_active_screen == nullptr) {
        s_last_error = "cannot render: no screen active";
        return nullptr;
    }

    // --- Step 1: Tick animation lifecycle on active objects ---
    for (u8g2gl_obj* obj : s_objects) {
        if (obj != nullptr) {
            obj->tick(current_ms);
        }
    }

    // --- Step 2: Clear buffer ---
    U8G2& display = s_display.u8g2();
    display.clearBuffer();

    // --- Step 3: Render elements in scene order ---
    for (const scene_json& element : s_active_screen->get("elements").items()) {
        const std::string& realisation = element.get("realisation").as_string();
        if (realisation == "object") {
            const int32_t obj_idx = element.get("object").as_int();
            if (obj_idx >= 0 && static_cast<size_t>(obj_idx) < s_objects.size()) {
                u8g2gl_render_object(display, s_objects.data(), s_parents.data(),
                                     static_cast<uint8_t>(obj_idx));
            }
        } else if (realisation == "draw_calls") {
            if (!render_draw_call(display, element)) {
                return nullptr;
            }
        }
    }

    return s_display.buffer();
}

/**
 * @brief Get width in pixels of virtual display.
 */
EMSCRIPTEN_KEEPALIVE
int getDisplayWidth() {
    return s_display.width();
}

/**
 * @brief Get height in pixels of virtual display.
 */
EMSCRIPTEN_KEEPALIVE
int getDisplayHeight() {
    return s_display.height();
}

/**
 * @brief Get pointer to raw U8G2 framebuffer memory.
 *
 * Valid until the next applyScene() or teardown(), which reallocate or free
 * the buffer: a caller must not keep it, or a view onto it, across those.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* getBufferPtr() {
    return s_display.buffer();
}

/**
 * @brief Get byte length of raw U8G2 framebuffer memory.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t getBufferSize() {
    return s_display.buffer_size();
}

/**
 * @brief Get the last recorded error message; empty if the last call succeeded.
 *
 * Valid until the next call into the bridge, which clears or replaces it.
 */
EMSCRIPTEN_KEEPALIVE
const char* getLastError() {
    return s_last_error.c_str();
}

/**
 * @brief The active screen's placeholder elements, as a JSON array.
 *
 * One `{ "name", "tag", "class", "rect": [x, y, w, h] }` per element whose
 * class the loaded Wasm does not have, in scene order. `[]` when there are
 * none or no screen is active.
 *
 * @return A string owned by the bridge, valid until the next call.
 */
EMSCRIPTEN_KEEPALIVE
const char* getPlaceholders() {
    s_placeholders_json = "[";
    for (size_t i = 0; i < s_placeholders.size(); ++i) {
        const scene_json& element = *s_placeholders[i].element;
        std::string rect;
        for (const scene_json& value : element.get("rect").items()) {
            rect += (rect.empty() ? "" : ",") + std::to_string(value.as_int());
        }
        s_placeholders_json += (i == 0 ? "" : ",");
        s_placeholders_json += "{\"name\":\"" + json_escape(element.get("name").as_string()) + "\",\"tag\":\"" +
                               json_escape(element.get("tag").as_string()) + "\",\"class\":\"" +
                               json_escape(element.get("class").as_string()) + "\",\"rect\":[" + rect + "]}";
    }
    s_placeholders_json += "]";
    return s_placeholders_json.c_str();
}

}  // extern "C"
