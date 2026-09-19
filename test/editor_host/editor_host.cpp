/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/editor_host/editor_host.cpp
 * Purpose: The test host's implementation: every step of building and drawing a
 *          screen goes through a registry by-name operation, so nothing here
 *          knows any element, setter or draw function by name. The host's only
 *          knowledge is the scene format and what a host supplies.
 *
 * Description: Subjects, fonts and images are resolved by name from host-owned
 *              tables. `build()` mirrors §13.7's init order across the whole
 *              screen; `render()` mirrors the firmware render function's draw
 *              order, evaluating a draw call's guard with the registry's own
 *              comparison and reading bound arguments from subjects at draw
 *              time, as firmware's `ui_subject_x.get()` does (§13.5).
 */
#include "editor_host.h"

#include "U8G2lib.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_types.h"

editor_host::editor_host(const u8g2gl_editor_registry& registry) : registry_(registry) {}

editor_host::~editor_host() {
    teardown();
}

bool editor_host::fail(const std::string& message) {
    if (error_.empty()) {
        error_ = message;
    }
    return false;
}

// load
// Reads the scene and creates one host subject per described subject. The scene
// names each subject's type and, for a string, its capacity — never a value
// (ui_spec §4.1): the host's own values start at the type's zero.
bool editor_host::load(const std::string& scene_path) {
    std::string parse_error;
    scene_ = scene_json_read_file(scene_path, &parse_error);
    if (!parse_error.empty()) {
        return fail(parse_error);
    }
    if (scene_.get("format").as_string() != "u8g2gl-scene" || scene_.get("version").as_int() != 1) {
        return fail("not a version 1 u8g2gl scene description");
    }
    for (const scene_json& described : scene_.get("subjects").items()) {
        if (described.has("value")) {
            return fail("subject '" + described.get("name").as_string() + "' carries a value; the host supplies values");
        }
        auto slot = std::make_unique<subject_slot>();
        slot->name = described.get("name").as_string();
        const std::string& type = described.get("type").as_string();
        if (type == "int") {
            slot->type = U8G2GL_SUBJECT_INT;
            slot->int_subject = std::make_unique<u8g2gl_subject_int_n<8>>();
            slot->base = slot->int_subject.get();
        } else if (type == "bool") {
            slot->type = U8G2GL_SUBJECT_BOOL;
            slot->bool_subject = std::make_unique<u8g2gl_subject_bool_n<8>>();
            slot->base = slot->bool_subject.get();
        } else if (type == "string") {
            slot->type = U8G2GL_SUBJECT_STRING;
            const int32_t max_len = described.has("max_len") ? described.get("max_len").as_int() : 32;
            if (max_len < 0 || max_len > 64) {
                return fail("subject '" + slot->name + "' needs more than this host's 64 characters");
            }
            slot->string_subject = std::make_unique<u8g2gl_subject_string_n<64, 8>>(static_cast<uint16_t>(max_len));
            slot->base = slot->string_subject.get();
        } else if (type == "time") {
            slot->type = U8G2GL_SUBJECT_TIME;
            slot->time_subject = std::make_unique<u8g2gl_subject_time_n<8>>();
            slot->base = slot->time_subject.get();
        } else {
            return fail("subject '" + slot->name + "' has unknown type '" + type + "'");
        }
        subjects_.push_back(std::move(slot));
    }
    return true;
}

void editor_host::provide_font(const std::string& name, const uint8_t* data) {
    fonts_.emplace_back(name, data);
}

void editor_host::provide_image(const std::string& name, const uint8_t* data) {
    images_.emplace_back(name, data);
}

editor_host::subject_slot* editor_host::subject(const std::string& name) {
    for (auto& slot : subjects_) {
        if (slot->name == name) {
            return slot.get();
        }
    }
    return nullptr;
}

bool editor_host::set_int(const std::string& name, int32_t value) {
    subject_slot* slot = subject(name);
    if (slot == nullptr || slot->int_subject == nullptr) {
        return false;
    }
    slot->int_subject->set(value);
    return true;
}

bool editor_host::set_bool(const std::string& name, bool value) {
    subject_slot* slot = subject(name);
    if (slot == nullptr || slot->bool_subject == nullptr) {
        return false;
    }
    slot->bool_subject->set(value);
    return true;
}

bool editor_host::set_string(const std::string& name, const char* value) {
    subject_slot* slot = subject(name);
    if (slot == nullptr || slot->string_subject == nullptr) {
        return false;
    }
    slot->string_subject->set(value);
    return true;
}

bool editor_host::set_time(const std::string& name, uint32_t value) {
    subject_slot* slot = subject(name);
    if (slot == nullptr || slot->time_subject == nullptr) {
        return false;
    }
    slot->time_subject->set(value);
    return true;
}

const scene_json* editor_host::screen_json(const std::string& name) const {
    for (const scene_json& screen : scene_.get("screens").items()) {
        if (screen.get("name").as_string() == name) {
            return &screen;
        }
    }
    return nullptr;
}

// value_for
// A scene value as the registry entry's type wants it. Text points into the
// parsed scene, which the host keeps for as long as any object exists, so it
// outlives every object set from it — the setters keep the pointer.
//   type — the entry's declared type
//   json — the value as the scene holds it
//   what — names the value in an error
bool editor_host::value_for(u8g2gl_editor_type_t type, const scene_json& json, const std::string& what,
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
            const auto& table = type == U8G2GL_EDITOR_FONT ? fonts_ : images_;
            for (const auto& entry : table) {
                if (entry.first == json.as_string()) {
                    *out = u8g2gl_editor_pointer(type, entry.second);
                    return true;
                }
            }
            return fail(what + ": the host has no data for '" + json.as_string() + "'");
        }
        default:
            break;
    }
    return fail(what + ": the scene's value does not fit the registry's type");
}

bool editor_host::subject_type_of(const scene_json& json, u8g2gl_subject_type_t* out) const {
    const std::string& type = json.get("subject_type").as_string();
    if (type == "int") *out = U8G2GL_SUBJECT_INT;
    else if (type == "bool") *out = U8G2GL_SUBJECT_BOOL;
    else if (type == "string") *out = U8G2GL_SUBJECT_STRING;
    else if (type == "time") *out = U8G2GL_SUBJECT_TIME;
    else return false;
    return true;
}

// allocate
// Bump allocation from the host's arena, aligned for the class. Released all at
// once by teardown(); a Wasm host would manage its linear memory its own way.
void* editor_host::allocate(size_t size, size_t align) {
    const size_t start = (arena_used_ + align - 1) / align * align;
    if (align == 0 || start + size > kArenaBytes) {
        return nullptr;
    }
    arena_used_ = start + size;
    return arena_ + start;
}

// build_object
// Construct-by-name into host storage (§13.7 step 1).
bool editor_host::build_object(const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_class* cls = u8g2gl_editor_find_class(registry_, element.get("class").as_string().c_str());
    if (cls == nullptr) {
        return fail(name + ": no class '" + element.get("class").as_string() + "' in the registry");
    }
    void* storage = allocate(cls->size, cls->align);
    u8g2gl_obj* obj = u8g2gl_editor_construct(*cls, storage, cls->size);
    if (obj == nullptr) {
        return fail(name + ": construction refused");
    }
    objects_.push_back(obj);
    classes_.push_back(cls);
    const scene_json& parent = element.get("parent");
    parents_.push_back(parent.is_null() ? U8G2GL_NO_PARENT : static_cast<uint8_t>(parent.as_int()));
    if (element.get("object").as_int() != static_cast<int32_t>(objects_.size() - 1)) {
        return fail(name + ": objects are not in index order");
    }
    return true;
}

// configure_object
// §13.7 step 2: the rectangle, then every written property, by name.
bool editor_host::configure_object(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_class& cls = *classes_[index];
    const scene_json& rect = element.get("rect");
    if (rect.is_array()) {
        const auto& r = rect.items();
        if (r.size() != 4 ||
            !u8g2gl_editor_set_rect(cls, objects_[index], static_cast<int16_t>(r[0].as_int()),
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
            return fail(name + "." + prop + ": no such property in the registry");
        }
        if (!value_for(entry->type, property.get("value"), name + "." + prop, &value) ||
            !u8g2gl_editor_set_property(cls, objects_[index], prop.c_str(), value)) {
            return fail(name + "." + prop + ": set-by-name refused");
        }
    }
    return true;
}

// apply_styles
// §13.7 step 3: each named style's properties in order, then the element's own
// overrides — both through the element's property thunks, which is how firmware
// applies an override (§10). A style's merge and a setter leave the object's
// resolved style identical for every property both set.
bool editor_host::apply_styles(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_class& cls = *classes_[index];
    auto set = [&](const scene_json& property, const std::string& where) -> bool {
        const std::string& prop = property.get("name").as_string();
        const u8g2gl_editor_property* entry = u8g2gl_editor_find_property(cls, prop.c_str());
        u8g2gl_editor_value value;
        if (entry == nullptr) {
            return fail(where + ": <" + element.get("tag").as_string() + "> has no property '" + prop + "' to apply");
        }
        if (!value_for(entry->type, property.get("value"), where, &value) ||
            !u8g2gl_editor_set_property(cls, objects_[index], prop.c_str(), value)) {
            return fail(where + ": set-by-name refused");
        }
        return true;
    };
    for (const scene_json& style_name : element.get("styles").items()) {
        const scene_json* style = nullptr;
        for (const scene_json& candidate : scene_.get("styles").items()) {
            if (candidate.get("name").as_string() == style_name.as_string()) {
                style = &candidate;
            }
        }
        if (style == nullptr) {
            return fail(name + ": no style '" + style_name.as_string() + "'");
        }
        for (const scene_json& property : style->get("properties").items()) {
            if (!set(property, name + " style " + style_name.as_string())) {
                return false;
            }
        }
    }
    for (const scene_json& property : element.get("style_overrides").items()) {
        if (!set(property, name + " override")) {
            return false;
        }
    }
    return true;
}

// bind_object
// §13.7 step 4, last: attribute bindings dispatched on the subject's type, then
// flag directives.
bool editor_host::bind_object(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    for (const scene_json& binding : element.get("bindings").items()) {
        subject_slot* slot = subject(binding.get("subject").as_string());
        u8g2gl_subject_type_t type{};
        if (slot == nullptr || !subject_type_of(binding, &type) || type != slot->type) {
            return fail(name + ": binding names an unknown subject");
        }
        const char* fmt = binding.has("fmt") ? binding.get("fmt").as_string().c_str() : nullptr;
        if (!u8g2gl_editor_bind(*classes_[index], objects_[index], binding.get("name").as_string().c_str(), slot->base,
                                type, fmt)) {
            return fail(name + ": " + binding.get("name").as_string() + " refused");
        }
    }
    for (const scene_json& flag : element.get("flags").items()) {
        subject_slot* slot = subject(flag.get("subject").as_string());
        u8g2gl_subject_type_t type{};
        u8g2gl_editor_value ref;
        const scene_json& json_ref = flag.get("ref");
        if (slot == nullptr || !subject_type_of(flag, &type)) {
            return fail(name + ": flag directive names an unknown subject");
        }
        ref = json_ref.is_bool() ? u8g2gl_editor_bool(json_ref.as_bool()) : u8g2gl_editor_int(json_ref.as_int());
        if (!u8g2gl_editor_bind_flag(registry_, objects_[index], flag.get("directive").as_string().c_str(), slot->base,
                                     type, ref, flag.get("flag").as_string().c_str())) {
            return fail(name + ": " + flag.get("directive").as_string() + " refused");
        }
    }
    return true;
}

// build
// The whole screen, step by step across every object, as a firmware init runs
// its steps: all objects constructed, then each configuring step the scene's
// `init` names, in that order, across every object.
//
// Once per host. The runtime has no way to remove a subject observer, so
// rebuilding against the same subjects would leave the first build's observers
// registered and consume the subjects' capacity; a host that rebuilds per edit
// (PR-06) needs that runtime surface first. A fresh host has fresh subjects.
bool editor_host::build(const std::string& screen) {
    if (screen_ != nullptr || !objects_.empty()) {
        return fail("build() is once per host: subjects cannot drop observers (see build())");
    }
    screen_ = screen_json(screen);
    if (screen_ == nullptr) {
        return fail("no screen '" + screen + "' in the scene");
    }
    std::vector<const scene_json*> objects;
    for (const scene_json& element : screen_->get("elements").items()) {
        if (element.get("realisation").as_string() == "object") {
            objects.push_back(&element);
        }
    }

    // --- Step 1: Construct, into host storage ---
    for (const scene_json* element : objects) {
        if (!build_object(*element)) {
            return false;
        }
    }
    if (static_cast<int32_t>(objects_.size()) != screen_->get("objects").as_int()) {
        return fail("object count disagrees with the scene");
    }
    // --- Steps 2-4: Configure, in the order the scene gives ---
    // The firmware init's order travels in the scene (screen-model.ts's
    // INIT_STEPS), so the host never states its own.
    for (const scene_json& step : scene_.get("init").items()) {
        for (size_t i = 0; i < objects.size(); ++i) {
            const std::string& name = step.as_string();
            const bool ok = name == "properties" ? configure_object(i, *objects[i])
                            : name == "styles"   ? apply_styles(i, *objects[i])
                            : name == "bindings" ? bind_object(i, *objects[i])
                                                 : fail("unknown init step '" + name + "'");
            if (!ok) {
                return false;
            }
        }
    }
    if (scene_.get("init").items().size() != 3) {
        return fail("the scene's init order does not name the three configuring steps");
    }
    return true;
}

// visible
// A draw call's build-time guard (§13.5), evaluated now: every ancestor object
// not hidden, and every own flag directive clear by the registry's comparison.
bool editor_host::visible(const scene_json& element, bool* shown) {
    *shown = true;
    for (const scene_json& term : element.get("visibility").items()) {
        if (term.has("ancestor")) {
            const int32_t ancestor = term.get("ancestor").as_int();
            if (ancestor < 0 || static_cast<size_t>(ancestor) >= objects_.size()) {
                return fail("guard names a missing ancestor");
            }
            *shown = *shown && !objects_[static_cast<size_t>(ancestor)]->is_hidden();
            continue;
        }
        subject_slot* slot = subject(term.get("subject").as_string());
        u8g2gl_subject_type_t type{};
        if (slot == nullptr || !subject_type_of(term, &type)) {
            return fail("guard names an unknown subject");
        }
        const scene_json& json_ref = term.get("ref");
        const u8g2gl_editor_value ref =
            json_ref.is_bool() ? u8g2gl_editor_bool(json_ref.as_bool()) : u8g2gl_editor_int(json_ref.as_int());
        bool clear = false;
        if (!u8g2gl_editor_flag_clear(registry_, term.get("directive").as_string().c_str(), slot->base, type, ref,
                                      &clear)) {
            return fail("guard directive refused");
        }
        *shown = *shown && clear;
    }
    return true;
}

// draw_call
// Draw-by-name: each argument placed by its param's name; a bound one read from
// its subject now, as firmware reads `ui_subject_x.get()` at draw time; an absent
// one left NONE for the thunk's default.
bool editor_host::draw_call(U8G2& display, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_drawing* drawing =
        u8g2gl_editor_find_drawing(registry_, element.get("tag").as_string().c_str());
    if (drawing == nullptr) {
        return fail(name + ": no drawing '" + element.get("tag").as_string() + "' in the registry");
    }
    bool shown = false;
    if (!visible(element, &shown)) {
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
            subject_slot* slot = subject(argument.get("subject").as_string());
            if (slot == nullptr) {
                return fail(name + "." + param + ": unknown subject");
            }
            arg = u8g2gl_editor_read_subject(slot->base, slot->type);
        } else if (!value_for(drawing->params[index].type, argument.get("value"), name + "." + param, &arg)) {
            return false;
        }
    }
    if (!u8g2gl_editor_draw(*drawing, display, args.data(), drawing->param_count)) {
        return fail(name + ": draw-by-name refused");
    }
    return true;
}

// render
// The firmware render function's walk: draw order, objects through the render
// wrapper (visibility, clip, saved state — §11.3), draw calls after their guard.
bool editor_host::render(U8G2& display) {
    if (screen_ == nullptr) {
        return fail("nothing built");
    }
    for (const scene_json& element : screen_->get("elements").items()) {
        if (element.get("realisation").as_string() == "object") {
            u8g2gl_render_object(display, objects_.data(), parents_.data(),
                                 static_cast<uint8_t>(element.get("object").as_int()));
        } else if (!draw_call(display, element)) {
            return false;
        }
    }
    return true;
}

// teardown
// Destroys every object in reverse construction order, releasing its binding
// slots, and returns the arena to empty.
void editor_host::teardown() {
    for (size_t i = objects_.size(); i > 0; --i) {
        u8g2gl_editor_destroy(objects_[i - 1]);
    }
    objects_.clear();
    classes_.clear();
    parents_.clear();
    arena_used_ = 0;
    screen_ = nullptr;
}
