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
 *          via Emscripten ([UD-4], PR-06 WO5). Adapts the editor host's
 *          by-name operations to flat C functions that can be called from JS.
 *
 * Description: Implements the two-mode architecture's prebuilt Wasm host:
 *              `applyScene()` receives flat `ui_scene.json` text, sets up the
 *              virtual display and subjects, and constructs the active screen.
 *              `applySampleData()` applies key-value pairs to active subjects.
 *              `renderFrame()` ticks animating objects, renders into a virtual
 *              U8G2 display buffer, and returns a pointer to the raw buffer.
 *
 * Exported Functions (extern "C"):
 * - applyScene():       Parse scene JSON and build default/named screen
 * - applySampleData():  Set subject values from JSON object
 * - renderFrame():      Tick objects and render to virtual U8G2 buffer
 * - getDisplayWidth():  Width of virtual display in pixels
 * - getDisplayHeight(): Height of virtual display in pixels
 * - getBufferPtr():     Pointer to raw U8G2 display framebuffer
 * - getBufferSize():    Byte length of raw U8G2 display framebuffer
 * - teardown():         Destroy objects, clear subjects, reset arena
 * - selectScreen():     Switch active screen and rebuild objects
 * - getLastError():     Return last error message string
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "U8g2lib.h"
#include "editor_config.h"
#include "scene_json.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_editor.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_types.h"

// External declarations for U8G2 built-in and fixture fonts
extern "C" const uint8_t u8g2_font_6x10_mr[];
extern "C" const uint8_t u8g2_font_5x7_mr[];
extern "C" const uint8_t u8g2_font_helvR08_tr[];
extern const uint8_t* const ui_font_font_4x6;
extern const uint8_t* const ui_font_font_arrow_mini;

// External declarations for fixture compiled images
extern const uint8_t ui_image_icon_wifi[];
extern const uint8_t ui_image_logo_mark[];

// External declaration for generated editor registry
extern const u8g2gl_editor_registry& ui_editor_registry();

namespace {

// Virtual display setup parameters
constexpr size_t kMaxBufferBytes = 2048;  // Fits up to 256x64 1-bit buffer
alignas(std::max_align_t) uint8_t s_display_buffer[kMaxBufferBytes] = {};
int32_t s_display_width = 128;
int32_t s_display_height = 64;
U8G2 s_display;

// Arena allocation for screen objects
constexpr size_t kArenaBytes = 65536;
alignas(std::max_align_t) unsigned char s_arena[kArenaBytes] = {};
size_t s_arena_used = 0;

// Host-owned subject slot
struct subject_slot {
    std::string name;
    u8g2gl_subject_type_t type = U8G2GL_SUBJECT_INT;
    void* base = nullptr;
    std::unique_ptr<u8g2gl_subject_int_n<16>> int_subject;
    std::unique_ptr<u8g2gl_subject_bool_n<16>> bool_subject;
    std::unique_ptr<u8g2gl_subject_string_n<128, 16>> string_subject;
    std::unique_ptr<u8g2gl_subject_time_n<16>> time_subject;
};

// Scene state
scene_json s_scene;
std::string s_last_error;
std::vector<std::unique_ptr<subject_slot>> s_subjects;
std::vector<std::pair<std::string, const uint8_t*>> s_fonts;
std::vector<std::pair<std::string, const uint8_t*>> s_images;

const scene_json* s_active_screen = nullptr;
std::vector<u8g2gl_obj*> s_objects;
std::vector<const u8g2gl_editor_class*> s_classes;
std::vector<uint8_t> s_parents;

bool fail(const std::string& message) {
    if (s_last_error.empty()) {
        s_last_error = message;
    }
    return false;
}

void* arena_allocate(size_t size, size_t align) {
    if (align == 0) {
        return nullptr;
    }
    const size_t start = (s_arena_used + align - 1) / align * align;
    if (start + size > kArenaBytes) {
        return nullptr;
    }
    s_arena_used = start + size;
    return s_arena + start;
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
            const auto& table = (type == U8G2GL_EDITOR_FONT) ? s_fonts : s_images;
            for (const auto& entry : table) {
                if (entry.first == json.as_string()) {
                    *out = u8g2gl_editor_pointer(type, entry.second);
                    return true;
                }
            }
            return fail(what + ": no host data for '" + json.as_string() + "'");
        }
        default:
            break;
    }
    return fail(what + ": scene value does not fit registry type");
}

void destroy_objects() {
    for (size_t i = s_objects.size(); i > 0; --i) {
        u8g2gl_editor_destroy(s_objects[i - 1]);
    }
    s_objects.clear();
    s_classes.clear();
    s_parents.clear();
    s_arena_used = 0;
    s_active_screen = nullptr;
}

bool build_object(const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_registry& reg = ui_editor_registry();
    const u8g2gl_editor_class* cls = u8g2gl_editor_find_class(reg, element.get("class").as_string().c_str());
    if (cls == nullptr) {
        return fail(name + ": no class '" + element.get("class").as_string() + "' in registry");
    }
    void* storage = arena_allocate(cls->size, cls->align);
    if (storage == nullptr) {
        return fail(name + ": arena allocation failed for " + std::to_string(cls->size) + " bytes");
    }
    u8g2gl_obj* obj = u8g2gl_editor_construct(*cls, storage, cls->size);
    if (obj == nullptr) {
        return fail(name + ": construction refused");
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

bool configure_object(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_class& cls = *s_classes[index];
    const scene_json& rect = element.get("rect");
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

bool apply_styles(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
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

bool bind_object(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const u8g2gl_editor_registry& reg = ui_editor_registry();
    for (const scene_json& binding : element.get("bindings").items()) {
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

    // --- Step 2: Construct objects into linear arena ---
    for (const scene_json* element : objects) {
        if (!build_object(*element)) {
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

void register_default_assets() {
    s_fonts.clear();
    s_fonts.emplace_back("u8g2_font_6x10_mr", u8g2_font_6x10_mr);
    s_fonts.emplace_back("u8g2_font_5x7_mr", u8g2_font_5x7_mr);
    s_fonts.emplace_back("u8g2_font_helvR08_tr", u8g2_font_helvR08_tr);
    s_fonts.emplace_back("font_4x6", ui_font_font_4x6);
    s_fonts.emplace_back("font_arrow_mini", ui_font_font_arrow_mini);

    s_images.clear();
    s_images.emplace_back("icon_wifi", ui_image_icon_wifi);
    s_images.emplace_back("logo_mark", ui_image_logo_mark);
}

void setup_virtual_display() {
    u8g2_t* u8g2 = s_display.getU8g2();
    std::memset(s_display_buffer, 0, sizeof(s_display_buffer));

    if (s_display_width == 256 && s_display_height == 64) {
        u8g2_SetupDisplay(u8g2, u8x8_d_ssd1322_nhd_256x64, u8x8_cad_011,
                          u8x8_byte_empty, u8x8_dummy_cb);
        u8g2_SetupBuffer(u8g2, s_display_buffer, 8, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);
    } else {
        u8g2_SetupDisplay(u8g2, u8x8_d_ssd1306_128x64_noname, u8x8_cad_001,
                          u8x8_byte_empty, u8x8_dummy_cb);
        const uint8_t tile_buf_height = static_cast<uint8_t>(s_display_height / 8);
        u8g2_SetupBuffer(u8g2, s_display_buffer, tile_buf_height, u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);
    }
    u8g2_InitDisplay(u8g2);
    s_display.clearBuffer();
}

}  // namespace

extern "C" {

/**
 * @brief Teardown active screen objects and clear subjects and arena.
 */
EMSCRIPTEN_KEEPALIVE
void teardown() {
    destroy_objects();
    s_subjects.clear();
    s_fonts.clear();
    s_images.clear();
    s_scene = scene_json{};
    s_last_error.clear();
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
    if (s_scene.get("format").as_string() != "u8g2gl-scene" || s_scene.get("version").as_int() != 3) {
        s_last_error = "not a version 3 u8g2gl scene description";
        return 0;
    }

    // --- Step 3: Configure virtual display dimensions ---
    const scene_json& disp = s_scene.get("display");
    if (disp.has("width") && disp.get("width").as_int() > 0) {
        s_display_width = disp.get("width").as_int();
    } else {
        s_display_width = 128;
    }
    if (disp.has("height") && disp.get("height").as_int() > 0) {
        s_display_height = disp.get("height").as_int();
    } else {
        s_display_height = 64;
    }

    setup_virtual_display();
    register_default_assets();

    // --- Step 4: Create host subjects ---
    for (const scene_json& described : s_scene.get("subjects").items()) {
        auto slot = std::make_unique<subject_slot>();
        slot->name = described.get("name").as_string();
        const std::string& type = described.get("type").as_string();
        if (type == "int") {
            slot->type = U8G2GL_SUBJECT_INT;
            slot->int_subject = std::make_unique<u8g2gl_subject_int_n<16>>();
            slot->base = slot->int_subject.get();
        } else if (type == "bool") {
            slot->type = U8G2GL_SUBJECT_BOOL;
            slot->bool_subject = std::make_unique<u8g2gl_subject_bool_n<16>>();
            slot->base = slot->bool_subject.get();
        } else if (type == "string") {
            slot->type = U8G2GL_SUBJECT_STRING;
            const int32_t max_len = described.has("max_len") ? described.get("max_len").as_int() : 32;
            if (max_len < 0 || max_len > 128) {
                s_last_error = "subject '" + slot->name + "' max_len exceeds 128";
                return 0;
            }
            slot->string_subject =
                std::make_unique<u8g2gl_subject_string_n<128, 16>>(static_cast<uint16_t>(max_len));
            slot->base = slot->string_subject.get();
        } else if (type == "time") {
            slot->type = U8G2GL_SUBJECT_TIME;
            slot->time_subject = std::make_unique<u8g2gl_subject_time_n<16>>();
            slot->base = slot->time_subject.get();
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
    s_display.clearBuffer();

    // --- Step 3: Render elements in scene order ---
    for (const scene_json& element : s_active_screen->get("elements").items()) {
        const std::string& realisation = element.get("realisation").as_string();
        if (realisation == "object") {
            const int32_t obj_idx = element.get("object").as_int();
            if (obj_idx >= 0 && static_cast<size_t>(obj_idx) < s_objects.size()) {
                u8g2gl_render_object(s_display, s_objects.data(), s_parents.data(),
                                     static_cast<uint8_t>(obj_idx));
            }
        } else if (realisation == "draw") {
            if (!render_draw_call(s_display, element)) {
                return nullptr;
            }
        }
    }

    return s_display.getBufferPtr();
}

/**
 * @brief Get width in pixels of virtual display.
 */
EMSCRIPTEN_KEEPALIVE
int getDisplayWidth() {
    return s_display_width;
}

/**
 * @brief Get height in pixels of virtual display.
 */
EMSCRIPTEN_KEEPALIVE
int getDisplayHeight() {
    return s_display_height;
}

/**
 * @brief Get pointer to raw U8G2 framebuffer memory.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* getBufferPtr() {
    return s_display.getBufferPtr();
}

/**
 * @brief Get byte length of raw U8G2 framebuffer memory.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t getBufferSize() {
    return static_cast<uint32_t>((s_display_width * s_display_height) / 8);
}

/**
 * @brief Get the last recorded error message.
 */
EMSCRIPTEN_KEEPALIVE
const char* getLastError() {
    return s_last_error.c_str();
}

}  // extern "C"
