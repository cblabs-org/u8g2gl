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
 *              `applyCollectionData()` fills collection widgets by element
 *              name through their `<data>` fill entries (§9.2): rows checked
 *              against the declared fields and capacity before any call.
 *              `renderFrame()` ticks animating objects, renders into a virtual
 *              U8G2 display buffer, and returns a pointer to the raw buffer.
 *
 *              Sizes are the scene's, not constants: the display buffer is
 *              allocated for the scene's display, the object arena for the
 *              classes the active screen constructs and for each collection's
 *              storage (an object's `storage`, the generator's own row layout,
 *              §9.2, handed to the widget after its static children and freed
 *              with the scene), each string subject for
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
 *              A call that succeeds can leave a warning there instead: a font
 *              the scene names that is not loaded, which is drawn in
 *              `u8g2_font_4x6_tr` rather than refusing the scene.
 *
 *              Fonts and images are resolved by name, the injected table
 *              first: the designer passes each declared font's and image's
 *              bytes in (`injectFont()`, `injectImage()`) before it applies a
 *              scene, exactly the bytes the generated `ui_fonts.cpp` and
 *              `ui_images.cpp` compile, so an editor Wasm needs none compiled
 *              in and a font or image change never rebuilds it. Behind the
 *              table is the registry's own `ui_editor_asset()`, which a
 *              generated editor registry leaves empty. The table lives until
 *              `clearInjected()`, never cleared by `applyScene()`, so one
 *              injection serves every apply until the project's fonts or
 *              images change. Bytes a replaced or cleared entry held are kept
 *              until the next screen is built, because the active screen's
 *              objects may still point into them.
 *
 *              The designer can hide elements from the frame without touching
 *              the scene (`setDesignHidden()`): a view setting of the editor
 *              alone, never the runtime `hidden` flag, which bindings own and
 *              which a shape, having no object, does not have. renderFrame()
 *              skips a hidden element as if it were absent, and anything
 *              inside it. The set is forgotten on teardown(), so a fresh
 *              applyScene() — a test run's, say — always draws the exported
 *              view. Separately, getRuntimeHidden() names what the last frame
 *              left out by the runtime's own rules, which is what the device
 *              would leave out.
 *
 * Exported Functions (extern "C"):
 *     Scene lifecycle:
 *     - applyScene():       Parse scene JSON and build the default screen
 *     - selectScreen():     Switch active screen and rebuild objects
 *     - applySampleData():  Set subject values from a JSON object
 *     - applyCollectionData(): Fill collection widgets' rows from a JSON object
 *     - teardown():         Destroy objects, clear subjects, reset arena
 *     Frame:
 *     - renderFrame():      Tick objects and render to the virtual U8G2 buffer
 *     Buffer:
 *     - getDisplayWidth():  Width of the virtual display in pixels
 *     - getDisplayHeight(): Height of the virtual display in pixels
 *     - getBufferPtr():     Pointer to the raw U8G2 frame buffer
 *     - getBufferSize():    Byte length of the raw U8G2 frame buffer
 *     Input preview (§12):
 *     - setPreview():       Start or stop running the built screen's focus ring
 *     - dispatchEvent():    Dispatch one input event through the runtime
 *     - previewBack():      Go back through the runtime's screen stack
 *     - getInputState():    The previewed screen, focus, stack depth and callbacks
 *     Designer view:
 *     - setDesignHidden():  Elements the designer hides from the frame
 *     - getRuntimeHidden(): Elements the last frame left out by runtime rules
 *     Text:
 *     - measureText():      A string's width in pixels, in a loaded font
 *     Injected assets:
 *     - injectFont():       A font's U8G2 table, by the name scenes use
 *     - injectImage():      An image's XBM bytes and size, by name
 *     - clearInjected():    Forget every injected font and image
 *     Diagnostics:
 *     - getLastError():     The last error message, or a warning
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
#include <cstdlib>
#include <cstring>
#include <initializer_list>
#include <limits>
#include <memory>
#include <new>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include "U8g2lib.h"
#include "memory_display.h"
#include "scene_json.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_editor.h"
#include "u8g2gl/u8g2gl_input.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_rows.h"
#include "u8g2gl/u8g2gl_subject.h"
#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl/u8g2gl_types.h"

// The generated editor registry, and its font and image lookup. A scene's font
// or image is resolved through the injected table first and then this lookup,
// which a generated editor registry leaves empty (the editor compiles in no
// project asset); the bridge names no font but its fallback, so it links into
// any project's editor Wasm.
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
constexpr int32_t kSceneVersion = 6;

// Virtual display, sized for each scene (memory_display.h, shared with the
// test-run harness so both hosts hold their frames the same way)
memory_display s_display;

// A display of its own for measureText(): U8G2 measures only through a
// configured instance, and measuring must neither need a scene nor disturb
// the scene's display. One 8 × 8 tile; nothing is ever drawn on it.
memory_display s_measure_display;
bool s_measure_ready = false;

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
// Whether s_last_error is a warning a successful call left (warn()), which a
// later error in the same call replaces.
bool s_last_is_warning = false;
std::vector<std::unique_ptr<subject_slot>> s_subjects;

const scene_json* s_active_screen = nullptr;
std::vector<u8g2gl_obj*> s_objects;
std::vector<const u8g2gl_editor_class*> s_classes;  // nullptr for a placeholder
std::vector<uint8_t> s_parents;
std::vector<placeholder_record> s_placeholders;
std::string s_placeholders_json;

/**
 * One collection's storage for the active screen (§9.2): the layout the scene
 * describes and the arena bytes it was allocated, which the widget's view
 * points into. Heap-held so the layout's address survives the vector growing;
 * freed with the screen's objects.
 */
struct collection_storage {
    std::vector<u8g2gl_rows_field> fields;
    u8g2gl_rows_layout layout{nullptr, 0, 0};
};
std::vector<std::unique_ptr<collection_storage>> s_storage;

// --- Input (§12) ---
// One runtime screen descriptor per scene screen, so the runtime's dispatch,
// focus ring and screen stack run here exactly as on the device: each points
// at its screen's ring and event tables, built from the scene at apply, and
// the built screen's descriptor at the objects. Only the built screen has
// objects; a descriptor whose screen is not built has none, so nothing on it
// is focusable. Activating one (a load or a back) rebuilds its screen through
// on_screen_activated(), which the runtime calls before it gives focus.
struct screen_input {
    std::vector<u8g2gl_focus_stop> ring;
    std::vector<u8g2gl_obj_event> events;
};
std::vector<u8g2gl_screen> s_descriptors;
std::vector<screen_input> s_screen_inputs;

// The scene's named styles as runtime styles, by name, so an object applies
// them through apply_style() as generated init does (§10). Each object gets
// one style, its named styles merged in order: the base a lost focus
// rebuilds from, as the firmware's is. Freed with the screen's objects.
std::unordered_map<std::string, std::unique_ptr<u8g2gl_style>> s_named_styles;
std::vector<std::unique_ptr<u8g2gl_style>> s_object_styles;

// Whether the canvas is previewing input: only then is a descriptor active in
// the runtime, so editing never shows a focused element.
bool s_preview = false;

/** One callback a dispatch reached: reported to the designer, never run (ruling 7). */
struct callback_record {
    std::string callback;
    std::string element;
    std::string trigger;
};
std::vector<callback_record> s_callbacks;
std::string s_input_state_json;
// Set when a load or back could not rebuild its screen; the dispatch reports it.
bool s_rebuild_failed = false;

size_t screen_index_of(const std::string& name);

// The designer's own hiding: element names to leave out of the frame. Kept
// across selectScreen() (names are per file, and an unknown one is ignored),
// forgotten by teardown().
std::unordered_set<std::string> s_design_hidden;
// The elements the last frame left out by the runtime's rules, in draw order.
// Pointers into s_scene, so cleared whenever the screen or the scene goes.
std::vector<const scene_json*> s_runtime_hidden;
std::string s_runtime_hidden_json;

// --- Injected fonts and images ---
/** One injected asset: its exact bytes, and an image's size in pixels. */
struct injected_asset {
    std::vector<uint8_t> bytes;
    int32_t width = 0;
    int32_t height = 0;
};
// By name, one table per kind, so a font name never resolves to an image.
std::unordered_map<std::string, injected_asset> s_injected_fonts;
std::unordered_map<std::string, injected_asset> s_injected_images;
// Bytes of entries replaced or cleared since the active screen was built: its
// objects may still hold pointers into them, so they are freed only when the
// objects are (destroy_objects()). Moving a vector keeps its buffer.
std::vector<std::vector<uint8_t>> s_retired_assets;
// Fonts the active screen names that are not loaded, each drawn in the
// fallback; renderFrame() warns of the first, so every frame says so.
std::vector<std::string> s_missing_fonts;

// fail
// Records an error and returns false. Only the first is kept, because the
// first refusal is the cause and later ones are its consequences; each entry
// point clears the error first, so it is always this call's.
bool fail(const std::string& message) {
    if (s_last_error.empty() || s_last_is_warning) {
        s_last_error = message;
        s_last_is_warning = false;
    }
    return false;
}

// warn
// Records a warning for a call that goes on to succeed, unless something is
// already recorded: an error always wins, and the first warning is kept.
void warn(const std::string& message) {
    if (s_last_error.empty()) {
        s_last_error = message;
        s_last_is_warning = true;
    }
}

// clear_last_error
// Empties the last error and its warning flag, as every entry point does first.
void clear_last_error() {
    s_last_error.clear();
    s_last_is_warning = false;
}

// set_error
// Records an entry point's own refusal, replacing whatever is recorded: the
// entry point returns at once, so it is this call's cause.
void set_error(const std::string& message) {
    s_last_error = message;
    s_last_is_warning = false;
}

// font_extent
// The length a U8G2 font table's own structure gives it, or 0 when that
// structure runs past `length` bytes, so an injected font U8G2 would read
// beyond is refused rather than drawn from whatever follows it. Walks the
// table as u8g2_font.c's glyph lookup does (u8g2_font_get_glyph_data): the
// 23-byte header, the 8-bit glyphs chained by each one's jump byte up to a
// zero jump, then the Unicode jump table ending at encoding 0xffff, and the
// Unicode glyphs it leads to, ending at encoding 0. Every U8G2 2.36 built-in
// and every bdfconv output ends exactly there, so a whole table's extent is
// its length.
//   font   — the table
//   length — its byte count
size_t font_extent(const uint8_t* font, size_t length) {
    constexpr size_t kHeader = 23;  // U8G2_FONT_DATA_STRUCT_SIZE
    const auto word = [font](size_t at) -> size_t { return (static_cast<size_t>(font[at]) << 8) | font[at + 1]; };
    if (font == nullptr || length < kHeader) {
        return 0;
    }

    // --- Step 1: The 8-bit glyphs, each jumping to the next ---
    size_t at = kHeader;
    for (;;) {
        if (at + 2 > length) {
            return 0;
        }
        if (font[at + 1] == 0) {
            break;
        }
        at += font[at + 1];
    }

    // --- Step 2: The Unicode jump table, to its 0xffff entry ---
    size_t table = kHeader + word(21);
    size_t glyph = table;
    for (;;) {
        if (table + 4 > length) {
            return 0;
        }
        glyph += word(table);
        const size_t encoding = word(table + 2);
        table += 4;
        if (encoding == 0xffff) {
            break;
        }
    }

    // --- Step 3: The Unicode glyphs, to the zero encoding that ends them ---
    for (;;) {
        if (glyph + 2 > length) {
            return 0;
        }
        if (word(glyph) == 0) {
            return glyph + 2;
        }
        if (glyph + 3 > length || font[glyph + 2] == 0) {
            return 0;
        }
        glyph += font[glyph + 2];
    }
}

// asset_for
// A scene font's or image's data: the injected table's entry, else the
// registry's compiled one, else nullptr.
//   type — U8G2GL_EDITOR_FONT or U8G2GL_EDITOR_IMAGE
//   name — the scene's name for it
const void* asset_for(u8g2gl_editor_type_t type, const std::string& name) {
    const auto& table = type == U8G2GL_EDITOR_FONT ? s_injected_fonts : s_injected_images;
    const auto found = table.find(name);
    if (found != table.end()) {
        return found->second.bytes.data();
    }
    return ui_editor_asset(type, name.c_str());
}

// retire
// Moves an entry's bytes aside rather than freeing them (see s_retired_assets).
void retire(injected_asset& asset) {
    s_retired_assets.push_back(std::move(asset.bytes));
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
        case U8G2GL_EDITOR_FONT: {
            if (!json.is_string()) break;
            const std::string& name = json.as_string();
            const void* data = asset_for(type, name);
            if (data == nullptr) {
                // Drawn, not refused: the text and its layout stay visible
                // while the designer fetches the font, and the warning names it.
                if (std::find(s_missing_fonts.begin(), s_missing_fonts.end(), name) == s_missing_fonts.end()) {
                    s_missing_fonts.push_back(name);
                }
                warn(what + ": font '" + name + "' is not loaded, so it is drawn in u8g2_font_4x6_tr");
                data = u8g2_font_4x6_tr;
            }
            *out = u8g2gl_editor_pointer(type, data);
            return true;
        }
        case U8G2GL_EDITOR_IMAGE: {
            if (!json.is_string()) break;
            const void* data = asset_for(type, json.as_string());
            if (data == nullptr) {
                return fail(what + ": no image '" + json.as_string() + "' is loaded");
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
    // After the objects: their views point into these layouts and the arena.
    s_storage.clear();
    s_placeholders.clear();
    s_runtime_hidden.clear();
    s_arena.clear();
    s_arena_used = 0;
    s_active_screen = nullptr;
    s_object_styles.clear();
    // The descriptors outlive the objects, so none may keep pointing at them.
    for (u8g2gl_screen& descriptor : s_descriptors) {
        descriptor.objs = nullptr;
        descriptor.parents = nullptr;
        descriptor.obj_count = 0;
    }
    // No object points into a retired asset any more, and the next screen
    // records its own missing fonts.
    s_retired_assets.clear();
    s_missing_fonts.clear();
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

// add_static_children
// An object's static children (`<column>`, §6.5), in document order, each
// through its class's add-by-name entry: the access call the firmware's init
// makes after the setters. Every argument must be present, as the method has
// no defaults.
//   cls     — the object's registry class
//   obj     — the object
//   element — its scene element; `static_children` is absent when it has none
bool add_static_children(const u8g2gl_editor_class& cls, u8g2gl_obj* obj, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    for (const scene_json& child : element.get("static_children").items()) {
        const std::string& tag = child.get("element").as_string();
        const u8g2gl_editor_element* entry = u8g2gl_editor_find_element(cls, tag.c_str());
        if (entry == nullptr) {
            return fail(name + ": <" + tag + "> is not a static child its class takes");
        }
        std::vector<u8g2gl_editor_value> args(entry->arg_count);
        for (const scene_json& arg : child.get("args").items()) {
            const std::string& arg_name = arg.get("name").as_string();
            const int at = u8g2gl_editor_find_element_arg(*entry, arg_name.c_str());
            if (at < 0) {
                return fail(name + " <" + tag + ">: no argument '" + arg_name + "'");
            }
            const size_t i = static_cast<size_t>(at);
            if (!value_for(entry->args[i].type, arg.get("value"), name + " <" + tag + "> " + arg_name, &args[i])) {
                return false;
            }
        }
        if (!u8g2gl_editor_add_element(cls, obj, tag.c_str(), args.data(), entry->arg_count)) {
            return fail(name + " <" + tag + ">: " + entry->name + " refused its arguments");
        }
    }
    return true;
}

// storage_bytes
// The arena bytes an object element's collections take, padding included, so
// the arena is sized before anything is built in it.
//   element — the scene element; `storage` is absent when it has no <data>
size_t storage_bytes(const scene_json& element) {
    size_t bytes = 0;
    for (const scene_json& block : element.get("storage").items()) {
        const int32_t size = block.get("bytes").as_int();
        bytes += size > 0 ? arena_bytes(static_cast<size_t>(size), alignof(int32_t)) : 0;
    }
    return bytes;
}

// attach_storage
// Allocates each of an object's collections in the arena, with the layout the
// scene describes, and hands the widget its view, keyed by the block's
// position: its <data> declaration index, as generated init keys it (§9.2).
// A block of no bytes is attached nothing, as firmware attaches nothing.
//   index   — the object's index in s_objects
//   element — its scene element
bool attach_storage(size_t index, const scene_json& element) {
    const std::string& name = element.get("name").as_string();
    const auto& blocks = element.get("storage").items();
    for (size_t b = 0; b < blocks.size(); ++b) {
        const scene_json& block = blocks[b];
        const std::string where = name + " " + block.get("data").as_string();
        auto storage = std::make_unique<collection_storage>();
        for (const scene_json& field : block.get("fields").items()) {
            u8g2gl_rows_field entry{};
            if (!u8g2gl_editor_field_type(field.get("type").as_string().c_str(), &entry.type)) {
                return fail(where + ": storage field '" + field.get("name").as_string() + "' has no row type");
            }
            entry.offset = static_cast<uint32_t>(field.get("offset").as_int());
            entry.size = static_cast<uint32_t>(field.get("size").as_int());
            entry.repeat = static_cast<uint32_t>(field.get("repeat").as_int());
            storage->fields.push_back(entry);
        }
        const int32_t capacity = block.get("capacity").as_int();
        const int32_t row_bytes = block.get("row_bytes").as_int();
        const int32_t bytes = block.get("bytes").as_int();
        storage->layout = {storage->fields.empty() ? nullptr : storage->fields.data(),
                           static_cast<uint32_t>(row_bytes), static_cast<uint8_t>(storage->fields.size())};
        if (capacity < 0 || row_bytes < 0 || static_cast<int64_t>(capacity) * row_bytes != bytes ||
            storage->fields.size() > std::numeric_limits<uint8_t>::max() || !u8g2gl_editor_rows_fit(storage->layout)) {
            return fail(where + ": storage does not fit its layout");
        }
        if (bytes == 0) {
            continue;
        }
        void* buffer = arena_allocate(static_cast<size_t>(bytes), alignof(int32_t));
        if (buffer == nullptr) {
            return fail(where + ": arena allocation failed for " + std::to_string(bytes) + " bytes of storage");
        }
        s_objects[index]->attach_rows(static_cast<uint8_t>(b),
                                      u8g2gl_rows(static_cast<uint8_t*>(buffer), static_cast<size_t>(capacity),
                                                  &storage->layout));
        s_storage.push_back(std::move(storage));
    }
    return true;
}

// configure_object
// The "properties" init step: the rectangle, then each property through its
// registry thunk, then each static child, then each collection's storage. A
// placeholder takes only the rectangle.
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
    return add_static_children(cls, s_objects[index], element) && attach_storage(index, element);
}

// style_text
// A style property's value as text: the scene writes each as the author did,
// and an int may arrive as a number.
std::string style_text(const scene_json& value) {
    return value.is_number() ? std::to_string(value.as_int()) : value.is_bool() ? (value.as_bool() ? "true" : "false")
                                                                                : value.as_string();
}

// style_from
// One scene style as the runtime style generated ui_styles_init() builds: each
// of §10's nine properties through its u8g2gl_style setter, so set_mask holds
// exactly what the author set. The font resolves as an element's does.
//   style — the scene style, `{ name, properties: [{ name, value }] }`
//   out   — receives the properties
bool style_from(const scene_json& style, u8g2gl_style* out) {
    const std::string where = "style '" + style.get("name").as_string() + "'";
    for (const scene_json& property : style.get("properties").items()) {
        const std::string& name = property.get("name").as_string();
        const std::string text = style_text(property.get("value"));
        const bool truth = text == "true";
        if (name == "font") {
            u8g2gl_editor_value value;
            if (!value_for(U8G2GL_EDITOR_FONT, property.get("value"), where + ".font", &value)) {
                return false;
            }
            out->set_font(static_cast<const uint8_t*>(value.pointer));
        } else if (name == "draw_color") {
            out->set_draw_color(text == "xor" ? U8G2GL_COLOR_XOR : text == "0" ? U8G2GL_COLOR_0 : U8G2GL_COLOR_1);
        } else if (name == "invert") {
            out->set_invert(truth);
        } else if (name == "border") {
            out->set_border(truth);
        } else if (name == "padding") {
            out->set_padding(static_cast<int16_t>(std::atoi(text.c_str())));
        } else if (name == "radius") {
            out->set_radius(static_cast<int16_t>(std::atoi(text.c_str())));
        } else if (name == "align") {
            out->set_align(text == "center" ? U8G2GL_ALIGN_CENTER : text == "right" ? U8G2GL_ALIGN_RIGHT : U8G2GL_ALIGN_LEFT);
        } else if (name == "font_mode") {
            out->set_font_mode(text == "transparent" ? U8G2GL_FONT_MODE_TRANSPARENT : U8G2GL_FONT_MODE_SOLID);
        } else if (name == "bitmap_mode") {
            out->set_bitmap_mode(text == "transparent" ? U8G2GL_BITMAP_MODE_TRANSPARENT : U8G2GL_BITMAP_MODE_SOLID);
        } else {
            return fail(where + ": '" + name + "' is not a style property (§10)");
        }
    }
    return true;
}

// named_style
// A scene style built as a runtime style, built once per scene and kept by
// name, so a focus style and an object's base are the same object each time.
//   name — the style's name
const u8g2gl_style* named_style(const std::string& name) {
    const auto found = s_named_styles.find(name);
    if (found != s_named_styles.end()) {
        return found->second.get();
    }
    for (const scene_json& candidate : s_scene.get("styles").items()) {
        if (candidate.get("name").as_string() == name) {
            auto style = std::make_unique<u8g2gl_style>();
            if (!style_from(candidate, style.get())) {
                return nullptr;
            }
            const u8g2gl_style* built = style.get();
            s_named_styles.emplace(name, std::move(style));
            return built;
        }
    }
    return nullptr;
}

// apply_styles
// The "styles" init step: the element's named styles, merged in order into one
// runtime style it applies with apply_style() — the base a lost focus rebuilds
// from, as firmware's is (§10) — then its own overrides, through the same
// thunks as properties, which record them as its own. Skipped for a placeholder.
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
    const auto& styles = element.get("styles").items();
    if (!styles.empty()) {
        auto base = std::make_unique<u8g2gl_style>();
        for (const scene_json& style_name : styles) {
            const u8g2gl_style* style = named_style(style_name.as_string());
            if (style == nullptr) {
                return fail(name + ": style '" + style_name.as_string() + "' not found in scene");
            }
            base->merge_from(*style);
        }
        s_objects[index]->apply_style(*base);
        s_object_styles.push_back(std::move(base));
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
        arena_needed += cls != nullptr ? arena_bytes(cls->size, cls->align) + storage_bytes(*element)
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

    // --- Step 4: Point the screen's runtime descriptor at its objects ---
    const size_t screen_index = screen_index_of(screen_name);
    if (screen_index < s_descriptors.size()) {
        u8g2gl_screen& descriptor = s_descriptors[screen_index];
        descriptor.objs = s_objects.data();
        descriptor.parents = s_parents.data();
        descriptor.obj_count = static_cast<uint8_t>(s_objects.size());
    }
    return true;
}

// screen_index_of
// A scene screen's position, which is its descriptor's; the screen count when
// there is none.
//   name — the screen's name
size_t screen_index_of(const std::string& name) {
    const auto& screens = s_scene.get("screens").items();
    for (size_t i = 0; i < screens.size(); ++i) {
        if (screens[i].get("name").as_string() == name) {
            return i;
        }
    }
    return screens.size();
}

// trigger_name
// A trigger as the scene spells it.
const char* trigger_name(u8g2gl_trigger_t trigger) {
    switch (trigger) {
        case U8G2GL_TRIGGER_PRESS: return "press";
        case U8G2GL_TRIGGER_LONG_PRESS: return "long_press";
        case U8G2GL_TRIGGER_VALUE_CHANGED: return "value_changed";
    }
    return "press";
}

// record_callback
// The callback every editor event table names: the designer shows a callback,
// it does not run it (ruling 7). The runtime runs an object's entries in table
// order, so the n-th call for one object and trigger in a dispatch is that
// object's n-th callback event for the trigger in the scene.
//   target  — the element whose event fired
//   trigger — what fired it
void record_callback(u8g2gl_obj& target, u8g2gl_trigger_t trigger) {
    if (s_active_screen == nullptr) {
        return;
    }
    const auto found = std::find(s_objects.begin(), s_objects.end(), &target);
    if (found == s_objects.end()) {
        return;
    }
    const int32_t index = static_cast<int32_t>(found - s_objects.begin());
    const std::string fired = trigger_name(trigger);
    for (const scene_json& element : s_active_screen->get("elements").items()) {
        if (element.get("realisation").as_string() != "object" || element.get("object").as_int() != index) {
            continue;
        }
        size_t earlier = 0;
        for (const callback_record& record : s_callbacks) {
            earlier += (record.element == element.get("name").as_string() && record.trigger == fired) ? 1 : 0;
        }
        for (const scene_json& event : element.get("events").items()) {
            if (event.get("action").as_string() != "callback" || event.get("trigger").as_string() != fired) {
                continue;
            }
            if (earlier == 0) {
                s_callbacks.push_back({event.get("callback").as_string(), element.get("name").as_string(), fired});
                return;
            }
            --earlier;
        }
    }
}

// on_screen_activated
// Every descriptor's activate_fn. The runtime has already made the descriptor
// active and taken focus from the screen it left; this builds the screen's
// objects, so the runtime gives focus on objects that exist, then returns.
void on_screen_activated() {
    u8g2gl_screen* active = u8g2gl_get_active_screen();
    if (active == nullptr || s_descriptors.empty() || active < s_descriptors.data() ||
        active >= s_descriptors.data() + s_descriptors.size()) {
        return;
    }
    const size_t index = static_cast<size_t>(active - s_descriptors.data());
    const std::string& name = s_scene.get("screens").items()[index].get("name").as_string();
    if (s_active_screen != nullptr && s_active_screen->get("name").as_string() == name) {
        return;  // already built: the preview started on it
    }
    destroy_objects();
    if (!build_screen(name)) {
        s_rebuild_failed = true;
    }
}

// build_descriptors
// One runtime descriptor per scene screen, with its ring and event table from
// the scene (§12). The ring's object indices and the event targets are fixed
// by the scene, so they are built once per scene; only the objects change.
bool build_descriptors() {
    const auto& screens = s_scene.get("screens").items();
    s_descriptors.assign(screens.size(), u8g2gl_screen{});
    s_screen_inputs.assign(screens.size(), screen_input{});
    for (size_t i = 0; i < screens.size(); ++i) {
        const scene_json& screen = screens[i];
        screen_input& input = s_screen_inputs[i];
        // --- Step 1: The ring, in the author's order ---
        if (screen.has("ring")) {
            for (const scene_json& stop : screen.get("ring").get("stops").items()) {
                const u8g2gl_style* focus_style = nullptr;
                if (!stop.get("focus_style").is_null()) {
                    focus_style = named_style(stop.get("focus_style").as_string());
                    if (focus_style == nullptr) {
                        return fail("focus style '" + stop.get("focus_style").as_string() + "' not found in scene");
                    }
                }
                input.ring.push_back({focus_style, static_cast<uint8_t>(stop.get("object").as_int())});
            }
        }
        // --- Step 2: Every object's events, in object order ---
        for (const scene_json& element : screen.get("elements").items()) {
            if (element.get("realisation").as_string() != "object") {
                continue;
            }
            const uint8_t index = static_cast<uint8_t>(element.get("object").as_int());
            for (const scene_json& event : element.get("events").items()) {
                const std::string& trigger = event.get("trigger").as_string();
                const std::string& action = event.get("action").as_string();
                u8g2gl_obj_event entry{nullptr, nullptr, index, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_CALLBACK};
                entry.trigger = trigger == "long_press" ? U8G2GL_TRIGGER_LONG_PRESS
                              : trigger == "value_changed" ? U8G2GL_TRIGGER_VALUE_CHANGED
                                                           : U8G2GL_TRIGGER_PRESS;
                if (action == "screen_load") {
                    const size_t target = screen_index_of(event.get("screen").as_string());
                    if (target >= screens.size()) {
                        return fail("event loads unknown screen '" + event.get("screen").as_string() + "'");
                    }
                    entry.action = U8G2GL_ACTION_SCREEN_LOAD;
                    entry.screen = &s_descriptors[target];
                } else if (action == "screen_back") {
                    entry.action = U8G2GL_ACTION_SCREEN_BACK;
                } else {
                    entry.callback = record_callback;
                }
                input.events.push_back(entry);
            }
        }
        // --- Step 3: The descriptor, as the generator emits one ---
        u8g2gl_screen& descriptor = s_descriptors[i];
        descriptor.activate_fn = on_screen_activated;
        descriptor.ring = input.ring.empty() ? nullptr : input.ring.data();
        descriptor.ring_count = static_cast<uint8_t>(input.ring.size());
        descriptor.ring_wrap = screen.has("ring") && screen.get("ring").get("wrap").as_bool();
        descriptor.events = input.events.empty() ? nullptr : input.events.data();
        descriptor.event_count = static_cast<uint8_t>(input.events.size());
    }
    return true;
}

// end_preview
// Leaves input preview: focus leaves the active screen, its focus style is
// undone, and the stack is forgotten. Before anything destroys objects or
// descriptors the runtime still points at.
void end_preview() {
    if (u8g2gl_get_active_screen() != nullptr) {
        u8g2gl_set_active_screen(nullptr);
    }
    u8g2gl_screen_stack_clear();
    s_preview = false;
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

// render_draw_call
// Draws one draw-call element, unless its visibility guards hide it.
//   display — the virtual display
//   element — the scene element, realisation "draw_calls"
//   guarded — set true when the guards hid it, so nothing was drawn
bool render_draw_call(U8G2& display, const scene_json& element, bool* guarded) {
    *guarded = false;
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
        *guarded = true;
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

// design_hidden_draw_call
// Whether the designer hid a draw-call element: by name, or by hiding the
// object it is clipped to or guarded by, which it is drawn inside.
//   element — the scene element, realisation "draw_calls"
//   objects — per object index, whether the designer hid that object
bool design_hidden_draw_call(const scene_json& element, const std::vector<bool>& objects) {
    if (s_design_hidden.count(element.get("name").as_string()) != 0) {
        return true;
    }
    const auto hidden_object = [&objects](int32_t index) {
        return index >= 0 && static_cast<size_t>(index) < objects.size() && objects[static_cast<size_t>(index)];
    };
    if (element.has("clip") && hidden_object(element.get("clip").as_int())) {
        return true;
    }
    for (const scene_json& term : element.get("visibility").items()) {
        if (term.has("ancestor") && hidden_object(term.get("ancestor").as_int())) {
            return true;
        }
    }
    return false;
}

// count_for
// A `capacity`, `repeat` or `max_len` for one instance: the prop it names as
// the element writes it, else the manifest's literal or the prop's default;
// -1 when there is none.
//   count   — the registry's declaration
//   element — the scene element; its `properties` carry what it writes
int32_t count_for(const u8g2gl_editor_count& count, const scene_json& element) {
    if (count.prop != nullptr) {
        for (const scene_json& property : element.get("properties").items()) {
            if (property.get("name").as_string() == count.prop && property.get("value").is_number()) {
                return property.get("value").as_int();
            }
        }
    }
    return count.value;
}

/** One `<data>` block's rows, parsed and checked, ready for the fill call. */
struct collection_fill {
    size_t object = 0;
    const u8g2gl_editor_data* data = nullptr;
    std::string element;
    std::vector<std::string> texts;                 // every string a cell points at; reserved, never moved
    std::vector<std::vector<const char*>> arrays;   // a repeated field's texts, per cell
    std::vector<std::vector<u8g2gl_editor_cell>> cells;
    std::vector<const u8g2gl_editor_cell*> rows;
};

// count_strings
// How many strings a block's rows carry, so `texts` can be reserved once and
// the pointers into it stay valid.
size_t count_strings(const scene_json& rows) {
    size_t total = 0;
    for (const scene_json& row : rows.items()) {
        for (const auto& member : row.object) {
            total += member.second.is_string() ? 1 : 0;
            if (member.second.is_array()) total += member.second.items().size();
        }
    }
    return total;
}

// parse_cell
// One field of one row into its cell, refusing a value that is not the
// field's: wrong JSON type, an int out of bounds, an enum not among its
// values, or a repeated field longer than its repeat.
//   fill    — the block being parsed; owns the strings
//   field   — the declaration
//   json    — the row's value for it, or null when the row leaves it out
//   repeat  — the instance's repeat for a repeated field
//   where   — "services rows[2].cells", for the message
//   cell    — receives the value
bool parse_cell(collection_fill& fill, const u8g2gl_editor_field& field, const scene_json& json, int32_t repeat,
                const std::string& where, u8g2gl_editor_cell* cell) {
    // --- Step 1: A repeated field: an array of texts, no longer than its repeat ---
    if (field.repeated) {
        // Left out, a repeated field is an empty array: every cell blank.
        if (json.is_null()) {
            return true;
        }
        if (!json.is_array()) {
            return fail(where + ": must be an array of strings");
        }
        if (repeat >= 0 && json.items().size() > static_cast<size_t>(repeat)) {
            return fail(where + ": " + std::to_string(json.items().size()) + " values, more than its " +
                        std::to_string(repeat));
        }
        std::vector<const char*> texts;
        for (const scene_json& text : json.items()) {
            if (!text.is_string()) {
                return fail(where + ": must be an array of strings");
            }
            fill.texts.push_back(text.as_string());
            texts.push_back(fill.texts.back().c_str());
        }
        fill.arrays.push_back(std::move(texts));
        cell->texts = fill.arrays.back().data();
        cell->count = static_cast<uint16_t>(fill.arrays.back().size());
        return true;
    }
    // --- Step 2: A single field: present, and a value of its type ---
    if (json.is_null()) {
        return fail(where + ": missing");
    }
    switch (field.type) {
        case U8G2GL_EDITOR_INT:
            if (!json.is_number()) return fail(where + ": must be an integer");
            if (json.number < field.min || json.number > field.max) {
                return fail(where + ": " + std::to_string(json.number) + " is outside " + std::to_string(field.min) +
                            ".." + std::to_string(field.max));
            }
            cell->value = u8g2gl_editor_int(json.as_int());
            return true;
        case U8G2GL_EDITOR_BOOL:
            if (!json.is_bool()) return fail(where + ": must be true or false");
            cell->value = u8g2gl_editor_bool(json.as_bool());
            return true;
        case U8G2GL_EDITOR_STRING:
        case U8G2GL_EDITOR_ENUM: {
            if (!json.is_string()) return fail(where + ": must be a string");
            fill.texts.push_back(json.as_string());
            cell->value = u8g2gl_editor_text(field.type, fill.texts.back().c_str());
            if (field.type == U8G2GL_EDITOR_ENUM) {
                for (uint8_t i = 0; i < field.value_count; ++i) {
                    if (u8g2gl_editor_is(cell->value, field.values[i])) return true;
                }
                std::string allowed;
                for (uint8_t i = 0; i < field.value_count; ++i) allowed += (i == 0 ? "" : ", ") + std::string(field.values[i]);
                return fail(where + ": '" + json.as_string() + "' is not one of " + allowed);
            }
            return true;
        }
        default:
            return fail(where + ": the field's type cannot be filled");
    }
}

// parse_block
// One element's `<data>` block: the rows, against the instance's capacity and
// each row against the fields. Nothing is called on the widget here.
//   object  — the element's object index
//   element — its scene element
//   data    — the registry's fill entry
//   rows    — the JSON array
//   fill    — receives the parsed rows
bool parse_block(size_t object, const scene_json& element, const u8g2gl_editor_data& data, const scene_json& rows,
                 collection_fill* fill) {
    const std::string& name = element.get("name").as_string();
    const std::string where = name + " " + data.name;
    if (!rows.is_array()) {
        return fail(where + ": rows must be an array");
    }
    // --- Step 1: The capacity this instance declares, as add_row returns false past it ---
    const int32_t capacity = count_for(data.capacity, element);
    if (capacity >= 0 && rows.items().size() > static_cast<size_t>(capacity)) {
        return fail(where + ": " + std::to_string(rows.items().size()) + " rows, over the capacity of " +
                    std::to_string(capacity));
    }
    // --- Step 2: Each row against the fields ---
    fill->object = object;
    fill->data = &data;
    fill->element = name;
    fill->texts.reserve(count_strings(rows));
    fill->arrays.reserve(rows.items().size() * data.field_count);
    for (size_t r = 0; r < rows.items().size(); ++r) {
        const scene_json& row = rows.items()[r];
        const std::string at = where + "[" + std::to_string(r) + "]";
        if (!row.is_object()) {
            return fail(at + ": a row must be an object keyed by field name");
        }
        for (const auto& member : row.object) {
            if (u8g2gl_editor_find_field(data, member.first.c_str()) < 0) {
                return fail(at + "." + member.first + ": no such field");
            }
        }
        std::vector<u8g2gl_editor_cell> cells(data.field_count);
        for (uint8_t f = 0; f < data.field_count; ++f) {
            const u8g2gl_editor_field& field = data.fields[f];
            const int32_t repeat = field.repeated ? count_for(field.repeat, element) : 0;
            if (!parse_cell(*fill, field, row.get(field.name), repeat, at + "." + field.name, &cells[f])) {
                return false;
            }
        }
        fill->cells.push_back(std::move(cells));
    }
    for (const auto& cells : fill->cells) {
        fill->rows.push_back(cells.data());
    }
    return true;
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
    // Out of preview first, while the objects and descriptors it points at exist.
    end_preview();
    // Objects next: placeholders point into s_scene, and bound objects
    // unregister from subjects as they are destroyed.
    destroy_objects();
    s_descriptors.clear();
    s_screen_inputs.clear();
    s_named_styles.clear();
    s_callbacks.clear();
    s_subjects.clear();
    s_scene = scene_json{};
    clear_last_error();
    s_display.release();
    // The designer's hiding belongs to the scene it was set on: a fresh scene,
    // as a test run applies, draws the exported view.
    s_design_hidden.clear();
}

/**
 * @brief Parse scene JSON and construct the active screen through the registry.
 * @param json_str Null-terminated JSON string of ui_scene.json.
 * @return 1 on success, 0 on failure (check getLastError()).
 */
EMSCRIPTEN_KEEPALIVE
int applyScene(const char* json_str) {
    if (json_str == nullptr) {
        set_error("null scene json provided");
        return 0;
    }

    // --- Step 1: Clean teardown of prior state ---
    teardown();

    // --- Step 2: Parse scene JSON ---
    std::string parse_error;
    s_scene = scene_json_parse(json_str, &parse_error);
    if (!parse_error.empty()) {
        set_error("scene json parse error: " + parse_error);
        return 0;
    }
    if (s_scene.get("format").as_string() != "u8g2gl-scene" || s_scene.get("version").as_int() != kSceneVersion) {
        set_error("not a version " + std::to_string(kSceneVersion) + " u8g2gl scene description");
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
        set_error("scene display has no width and height");
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
                set_error("subject '" + slot->name + "' has an invalid max_len");
                return 0;
            }
            slot->string_subject = std::make_unique<host_string_subject>(static_cast<uint16_t>(max_len), observers);
            slot->base = static_cast<u8g2gl_subject_string_base*>(slot->string_subject.get());
        } else if (type == "time") {
            slot->type = U8G2GL_SUBJECT_TIME;
            slot->time_subject = std::make_unique<host_time_subject>(observers);
            slot->base = static_cast<u8g2gl_subject_time_base*>(slot->time_subject.get());
        } else {
            set_error("subject '" + slot->name + "' has unknown type '" + type + "'");
            return 0;
        }
        s_subjects.push_back(std::move(slot));
    }

    // --- Step 5: Choose default screen ---
    const auto& screens = s_scene.get("screens").items();
    if (screens.empty()) {
        set_error("scene contains no screens");
        return 0;
    }
    std::string default_screen = screens[0].get("name").as_string();
    for (const scene_json& scr : screens) {
        if (scr.get("name").as_string() == "home") {
            default_screen = "home";
            break;
        }
    }

    if (!build_descriptors() || !build_screen(default_screen)) {
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
    clear_last_error();
    if (screen_name == nullptr) {
        set_error("null screen name provided");
        return 0;
    }
    end_preview();
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
    clear_last_error();
    if (sample_data_json == nullptr) {
        set_error("null sample data provided");
        return 0;
    }
    std::string parse_error;
    scene_json data = scene_json_parse(sample_data_json, &parse_error);
    if (!parse_error.empty() || !data.is_object()) {
        set_error("sample data must be a valid JSON object");
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
 * @brief Fill collection widgets on the active screen from a JSON object
 *        (schema 0.7 `<data>`, design_spec §9.2).
 *
 * The shape is always `{ "<element name>": { "<data name>": [ rows ] } }`,
 * even for a widget with one `<data>`, so a widget that gains a second keeps
 * its data valid. A row is an object keyed by field name: an `int` field a
 * number, a `bool` a boolean, a `string` or `enum` a string, and a repeated
 * field an array of strings, which may be shorter than its repeat or left out.
 *
 *     { "services": { "rows": [ { "cells": ["10:02", "Reading", "4", "On time"] } ] },
 *       "formation": { "carriages": [ { "number": 1, "class_type": "first",
 *                                       "wheelchair": true, "bike": false, "loading_pct": 40 } ] } }
 *
 * Every element, block and row is checked before any widget is called, so a
 * refusal changes nothing: an element the active screen has no object for, a
 * placeholder, a data name its class does not declare, more rows than the
 * instance's capacity (naming the element and the capacity, as `add_row`
 * returns false on the device), or a bad row (naming the element, the row
 * index and the field). Each block then goes through its widget's own
 * `begin()`, access method per row and `commit()`. A widget that refuses a row
 * itself — its storage is smaller than its declared capacity — keeps the rows
 * it took, as on the device, and the call fails saying so.
 *
 * Objects are rebuilt by applyScene() and selectScreen(), so their rows go
 * with them: a host re-applies its collection data after each, as it does its
 * sample values.
 *
 * @param collection_json Null-terminated JSON object string.
 * @return 1 on success, 0 on failure (check getLastError()).
 */
EMSCRIPTEN_KEEPALIVE
int applyCollectionData(const char* collection_json) {
    clear_last_error();
    if (collection_json == nullptr) {
        set_error("null collection data provided");
        return 0;
    }
    if (s_active_screen == nullptr) {
        set_error("collection data needs an active screen");
        return 0;
    }
    std::string parse_error;
    const scene_json data = scene_json_parse(collection_json, &parse_error);
    if (!parse_error.empty() || !data.is_object()) {
        set_error("collection data must be a JSON object of element names");
        return 0;
    }

    // --- Step 1: Parse and check every block, calling nothing ---
    std::vector<std::unique_ptr<collection_fill>> fills;
    for (const auto& by_element : data.object) {
        const scene_json* element = nullptr;
        for (const scene_json& candidate : s_active_screen->get("elements").items()) {
            if (candidate.get("name").as_string() == by_element.first && candidate.get("realisation").as_string() == "object") {
                element = &candidate;
                break;
            }
        }
        if (element == nullptr) {
            fail(by_element.first + ": the active screen has no object of that name");
            return 0;
        }
        const size_t object = static_cast<size_t>(element->get("object").as_int());
        const u8g2gl_editor_class* cls = object < s_classes.size() ? s_classes[object] : nullptr;
        if (cls == nullptr) {
            fail(by_element.first + ": its class is not in this editor build, so it cannot be filled");
            return 0;
        }
        if (!by_element.second.is_object()) {
            fail(by_element.first + ": must be an object of data names");
            return 0;
        }
        for (const auto& by_data : by_element.second.object) {
            const u8g2gl_editor_data* entry = u8g2gl_editor_find_data(*cls, by_data.first.c_str());
            if (entry == nullptr) {
                fail(by_element.first + ": <" + cls->tag + "> declares no <data name=\"" + by_data.first + "\">");
                return 0;
            }
            auto fill = std::make_unique<collection_fill>();
            if (!parse_block(object, *element, *entry, by_data.second, fill.get())) {
                return 0;
            }
            fills.push_back(std::move(fill));
        }
    }

    // --- Step 2: Fill each, through the widget's own ingestion API ---
    for (const auto& fill : fills) {
        size_t accepted = 0;
        if (!u8g2gl_editor_fill(*s_classes[fill->object], s_objects[fill->object], fill->data->name, fill->rows.data(),
                                fill->rows.size(), &accepted)) {
            fail(fill->element + " " + fill->data->name + ": " + fill->data->access + "() refused row " +
                 std::to_string(accepted) + ", so the widget holds " + std::to_string(accepted) +
                 " rows: its storage is smaller than the declared capacity");
            return 0;
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
    clear_last_error();
    if (s_active_screen == nullptr) {
        set_error("cannot render: no screen active");
        return nullptr;
    }
    // The screen was built with a fallback font: every frame says so, until a
    // screen is built with the font injected.
    if (!s_missing_fonts.empty()) {
        warn("font '" + s_missing_fonts.front() + "' is not loaded, so it is drawn in u8g2_font_4x6_tr");
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
    s_runtime_hidden.clear();

    // --- Step 3: Which objects the designer hid: by name, or inside one that is ---
    // A parent always precedes its children in the flat array, so one pass in
    // object order sees each parent's answer before its children ask for it.
    std::vector<bool> design_hidden(s_objects.size(), false);
    if (!s_design_hidden.empty()) {
        for (const scene_json& element : s_active_screen->get("elements").items()) {
            if (element.get("realisation").as_string() != "object") {
                continue;
            }
            const int32_t obj_idx = element.get("object").as_int();
            if (obj_idx < 0 || static_cast<size_t>(obj_idx) >= s_objects.size()) {
                continue;
            }
            const uint8_t parent = s_parents[static_cast<size_t>(obj_idx)];
            const bool in_hidden = parent != U8G2GL_NO_PARENT && parent < design_hidden.size() && design_hidden[parent];
            design_hidden[static_cast<size_t>(obj_idx)] = in_hidden || s_design_hidden.count(element.get("name").as_string()) != 0;
        }
    }

    // --- Step 4: Render elements in scene order, skipping what the designer hid ---
    // What the runtime's own rules leave out is recorded for getRuntimeHidden():
    // an object hidden by its flag or an ancestor's, a shape by its guards.
    for (const scene_json& element : s_active_screen->get("elements").items()) {
        const std::string& realisation = element.get("realisation").as_string();
        if (realisation == "object") {
            const int32_t obj_idx = element.get("object").as_int();
            if (obj_idx >= 0 && static_cast<size_t>(obj_idx) < s_objects.size()) {
                const uint8_t index = static_cast<uint8_t>(obj_idx);
                if (design_hidden[index]) {
                    continue;
                }
                if (!u8g2gl_is_effectively_visible(s_objects.data(), s_parents.data(), index)) {
                    s_runtime_hidden.push_back(&element);
                    continue;
                }
                u8g2gl_render_object(display, s_objects.data(), s_parents.data(), index);
            }
        } else if (realisation == "draw_calls") {
            if (design_hidden_draw_call(element, design_hidden)) {
                continue;
            }
            bool guarded = false;
            if (!render_draw_call(display, element, &guarded)) {
                return nullptr;
            }
            if (guarded) {
                s_runtime_hidden.push_back(&element);
            }
        }
    }

    return s_display.buffer();
}

/**
 * @brief Start or stop previewing input on the built screen (§12).
 *
 * Starting activates the built screen's runtime descriptor, so focus goes to
 * its ring's first visible, enabled member exactly as on the device; stopping
 * takes focus away, undoing any focus style, and forgets the screen stack. A
 * toggled switch keeps its subject's new value: the designer re-applies its
 * scene to restore the editing state.
 *
 * @param on 1 to start, 0 to stop.
 * @return 1 on success; 0 with no screen built (check getLastError()).
 */
EMSCRIPTEN_KEEPALIVE
int setPreview(int on) {
    clear_last_error();
    if (on == 0) {
        end_preview();
        return 1;
    }
    if (s_active_screen == nullptr) {
        set_error("cannot preview input: no screen active");
        return 0;
    }
    const size_t index = screen_index_of(s_active_screen->get("name").as_string());
    if (index >= s_descriptors.size()) {
        set_error("cannot preview input: the screen has no descriptor");
        return 0;
    }
    end_preview();
    s_preview = true;
    s_callbacks.clear();
    u8g2gl_set_active_screen(&s_descriptors[index]);
    return 1;
}

/**
 * @brief Dispatch one input event through the runtime, as ui_dispatch() does
 *        on the device (§12.1).
 *
 * A load or a back rebuilds the screen it activates, so the next frame shows
 * it; getInputState() then names it. A callback is recorded, not run.
 *
 * @param event A u8g2gl_event_t value.
 * @return 1 if the event did something, 0 if it did nothing; -1 with preview
 *         off, or when a screen it activated could not be built (check
 *         getLastError()).
 */
EMSCRIPTEN_KEEPALIVE
int dispatchEvent(int event) {
    clear_last_error();
    if (!s_preview) {
        set_error("cannot dispatch: input preview is off");
        return -1;
    }
    s_callbacks.clear();
    s_rebuild_failed = false;
    const bool acted = u8g2gl_dispatch(static_cast<u8g2gl_event_t>(event));
    if (s_rebuild_failed) {
        return -1;
    }
    return acted ? 1 : 0;
}

/**
 * @brief Go back through the runtime's screen stack, as a `<screen_back_event>`
 *        does (§12.3): the designer's Back, which no input event is.
 *
 * @return 1 if it went back, 0 with an empty stack, -1 with preview off or a
 *         screen that could not be built (check getLastError()).
 */
EMSCRIPTEN_KEEPALIVE
int previewBack() {
    clear_last_error();
    if (!s_preview) {
        set_error("cannot go back: input preview is off");
        return -1;
    }
    s_callbacks.clear();
    s_rebuild_failed = false;
    const bool went = u8g2gl_screen_back();
    return s_rebuild_failed ? -1 : went ? 1 : 0;
}

/**
 * @brief The input preview's state, as JSON: `{ "preview", "screen", "focused",
 *        "depth", "callbacks": [{ "callback", "element", "trigger" }] }`.
 *
 * `screen` is the built screen; `focused` the focused element's name or null;
 * `depth` the screen stack's; `callbacks` what the last dispatch reached. Valid
 * until the next call.
 */
EMSCRIPTEN_KEEPALIVE
const char* getInputState() {
    std::string json = "{\"preview\":";
    json += s_preview ? "true" : "false";
    json += ",\"screen\":";
    json += s_active_screen == nullptr ? "null" : "\"" + json_escape(s_active_screen->get("name").as_string()) + "\"";
    json += ",\"focused\":";
    const u8g2gl_obj* focused = s_preview ? u8g2gl_get_focused() : nullptr;
    std::string focused_name;
    if (focused != nullptr && s_active_screen != nullptr) {
        for (const scene_json& element : s_active_screen->get("elements").items()) {
            const int32_t index = element.get("realisation").as_string() == "object" ? element.get("object").as_int() : -1;
            if (index >= 0 && static_cast<size_t>(index) < s_objects.size() && s_objects[static_cast<size_t>(index)] == focused) {
                focused_name = element.get("name").as_string();
            }
        }
    }
    json += focused_name.empty() ? "null" : "\"" + json_escape(focused_name) + "\"";
    json += ",\"depth\":" + std::to_string(u8g2gl_screen_stack_depth());
    json += ",\"callbacks\":[";
    for (size_t i = 0; i < s_callbacks.size(); ++i) {
        const callback_record& record = s_callbacks[i];
        json += (i == 0 ? "" : ",");
        json += "{\"callback\":\"" + json_escape(record.callback) + "\",\"element\":\"" +
                json_escape(record.element) + "\",\"trigger\":\"" + record.trigger + "\"}";
    }
    json += "]}";
    s_input_state_json = std::move(json);
    return s_input_state_json.c_str();
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
 * @brief Hide elements from the frame in the designer only.
 *
 * Each later renderFrame() leaves out every named element, and everything
 * drawn inside one (an object's descendants, a shape clipped to or guarded by
 * a hidden object), as if absent: the pixels the rest of the screen draws
 * stay. A name the active screen does not have is ignored. The runtime
 * `hidden` flag is never touched, so bindings and this set never mix.
 *
 * The set replaces the previous one, survives selectScreen(), and is cleared
 * by teardown() and so by every applyScene().
 *
 * @param names_json A JSON array of element names; `[]` shows everything.
 * @return 1 on success; 0 with getLastError() when the text is not a JSON
 *         array of strings, leaving the previous set in place.
 */
EMSCRIPTEN_KEEPALIVE
int setDesignHidden(const char* names_json) {
    clear_last_error();
    if (names_json == nullptr) {
        set_error("null hidden-names json provided");
        return 0;
    }
    std::string parse_error;
    const scene_json names = scene_json_parse(names_json, &parse_error);
    if (!parse_error.empty() || !names.is_array()) {
        set_error("hidden names must be a JSON array of strings");
        return 0;
    }
    std::unordered_set<std::string> next;
    for (const scene_json& name : names.items()) {
        if (!name.is_string()) {
            set_error("hidden names must be a JSON array of strings");
            return 0;
        }
        next.insert(name.as_string());
    }
    s_design_hidden = std::move(next);
    return 1;
}

/**
 * @brief The elements the last frame left out by the runtime's own rules.
 *
 * An object hidden by its `hidden` flag or an ancestor's, and a shape hidden by
 * its visibility guards: what the device would not draw with the current
 * sample data. Never an element the designer hid (setDesignHidden()), which is
 * skipped before these rules are asked.
 *
 * @return A JSON array of names in draw order, `[]` before the first frame of
 *         the active screen; a string owned by the bridge, valid until the
 *         next call.
 */
EMSCRIPTEN_KEEPALIVE
const char* getRuntimeHidden() {
    s_runtime_hidden_json = "[";
    for (size_t i = 0; i < s_runtime_hidden.size(); ++i) {
        s_runtime_hidden_json += (i == 0 ? "\"" : ",\"");
        s_runtime_hidden_json += json_escape(s_runtime_hidden[i]->get("name").as_string()) + "\"";
    }
    s_runtime_hidden_json += "]";
    return s_runtime_hidden_json.c_str();
}

/**
 * @brief A string's width in pixels, as the real renderer measures it.
 *
 * The designer uses it to make the widest text a field can hold (the
 * *full, longest* sample set): the printable ASCII glyph with the largest
 * advance in the font that draws it, repeated to its `max_len`. Measured by
 * U8G2's own `getUTF8Width()` in the font as loaded — injected first, else
 * compiled in, as a scene's fonts are found — so the answer is the device's.
 * Editor target only: firmware has no use for it.
 *
 * @param font_name The font's name, as a scene names it.
 * @param text      UTF-8 text.
 * @return The width in pixels, or -1 with getLastError() saying why: no font
 *         of that name is loaded, or no text was given.
 */
EMSCRIPTEN_KEEPALIVE
int32_t measureText(const char* font_name, const char* text) {
    clear_last_error();
    if (font_name == nullptr || text == nullptr) {
        set_error("measureText: a font name and a text are needed");
        return -1;
    }
    const void* font = asset_for(U8G2GL_EDITOR_FONT, font_name);
    if (font == nullptr) {
        set_error(std::string("measureText: font '") + font_name + "' is not loaded");
        return -1;
    }
    if (!s_measure_ready) {
        std::string error;
        if (!s_measure_display.setup(8, 8, &error)) {
            set_error("measureText: " + error);
            return -1;
        }
        s_measure_ready = true;
    }
    U8G2& display = s_measure_display.u8g2();
    display.setFont(static_cast<const uint8_t*>(font));
    return static_cast<int32_t>(display.getUTF8Width(text));
}

/**
 * @brief Injects a font: its U8G2 table, under the name scenes give it.
 *
 * The bytes are copied, so the caller may free them at once. A later
 * applyScene() or selectScreen() draws with it; the screen already built keeps
 * the bytes it was given. Injecting a name again replaces it.
 *
 * @param name   The font's name, as a scene names it (`u8g2_font_6x10_mr`,
 *               or a `<bdf>`'s own name).
 * @param bytes  The table, exactly as `ui_fonts.cpp` would compile it: a
 *               built-in's array from `u8g2_fonts.c`, or bdfconv's output.
 * @param length Its byte count.
 * @return 1, or 0 with getLastError() saying why: no name, no bytes, or a
 *         table whose own structure runs past `length` (one U8G2 would read
 *         beyond).
 */
EMSCRIPTEN_KEEPALIVE
int injectFont(const char* name, const uint8_t* bytes, uint32_t length) {
    clear_last_error();

    // --- Step 1: Refuse what U8G2 could not draw from safely ---
    if (name == nullptr || name[0] == '\0') {
        set_error("injectFont: a font needs a name");
        return 0;
    }
    if (bytes == nullptr || font_extent(bytes, length) == 0) {
        set_error(std::string("injectFont: '") + name + "' is not a whole U8G2 font table of " +
                  std::to_string(length) + " bytes");
        return 0;
    }

    // --- Step 2: Copy it in, keeping any bytes it replaces alive ---
    injected_asset& entry = s_injected_fonts[name];
    retire(entry);
    entry.bytes.assign(bytes, bytes + length);
    return 1;
}

/**
 * @brief Injects an image: its XBM bytes and size, under the name scenes give it.
 *
 * Copied, and replaced on a second injection, as injectFont() is.
 *
 * @param name   The image's name, as a scene names it.
 * @param width  Its width in pixels.
 * @param height Its height in pixels.
 * @param bytes  Its XBM bytes, as `ui_images.cpp` would compile them: rows of
 *               ceil(width / 8) bytes, least significant bit leftmost.
 * @param length Their byte count, which must be ceil(width / 8) × height.
 * @return 1, or 0 with getLastError() saying why.
 */
EMSCRIPTEN_KEEPALIVE
int injectImage(const char* name, int32_t width, int32_t height, const uint8_t* bytes, uint32_t length) {
    clear_last_error();

    // --- Step 1: Refuse bytes that are not this size's bitmap ---
    if (name == nullptr || name[0] == '\0') {
        set_error("injectImage: an image needs a name");
        return 0;
    }
    const int64_t expected = width > 0 && height > 0 ? static_cast<int64_t>((width + 7) / 8) * height : -1;
    if (bytes == nullptr || expected != static_cast<int64_t>(length)) {
        set_error(std::string("injectImage: '") + name + "' is " + std::to_string(length) + " bytes, not the " +
                  std::to_string(width) + "x" + std::to_string(height) + " bitmap's " + std::to_string(expected));
        return 0;
    }

    // --- Step 2: Copy it in, keeping any bytes it replaces alive ---
    injected_asset& entry = s_injected_images[name];
    retire(entry);
    entry.bytes.assign(bytes, bytes + length);
    entry.width = width;
    entry.height = height;
    return 1;
}

/**
 * @brief Forgets every injected font and image.
 *
 * Its own call, never a side effect of applyScene(), so one injection serves
 * every apply until the project's assets change. The active screen keeps
 * drawing with the bytes it was built with until the next screen is built.
 */
EMSCRIPTEN_KEEPALIVE
void clearInjected() {
    for (auto* table : {&s_injected_fonts, &s_injected_images}) {
        for (auto& entry : *table) {
            retire(entry.second);
        }
        table->clear();
    }
}

/**
 * @brief Get the last recorded error message, or a warning a successful call
 *        left: a font the active screen names that is not loaded, drawn in
 *        `u8g2_font_4x6_tr`. Empty when the last call succeeded cleanly.
 *
 * Valid until the next call into the bridge, which clears or replaces it.
 * renderFrame() repeats the active screen's missing-font warning, so it is
 * still there after the frame a caller draws.
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
