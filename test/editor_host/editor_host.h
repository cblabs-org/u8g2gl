/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/editor_host/editor_host.h
 * Purpose: A stand-in for the designer's Wasm host (PR-06), just large enough to
 *          prove the editor target ([UD-4], PR-04 WO11): it reads the scene
 *          description the generator wrote, supplies what a host supplies —
 *          subject storage and values, font and image data, object storage — and
 *          builds and renders a screen **only** through the generated registry's
 *          by-name operations. If the registry and the firmware units disagree
 *          anywhere, the screen this builds draws differently from the firmware
 *          screen, and the parity test sees it in the U8G2 stub's call log.
 *
 * Description: `load()` reads `ui_scene.json` and creates one host-owned subject
 *              per described subject (the scene carries no values). `build()`
 *              constructs one screen's objects into a fixed arena, heap-free on
 *              the runtime's side, then configures them in the order the scene's
 *              `init` gives — the firmware init's own order: rectangle and
 *              properties, styles and overrides, bindings and flag directives. `render()` walks the draw order: objects
 *              through u8g2gl_render_object(), draw calls through draw-by-name
 *              after their guard. Every refusal is recorded in `error()` rather
 *              than skipped, so an element the registry cannot build fails the
 *              test instead of silently vanishing from both sides.
 *
 *              Test-only: standard containers hold the host's own bookkeeping.
 *              Objects themselves live in the host's own aligned arena and are
 *              placed by u8g2gl_editor_construct(), as a Wasm host's would be.
 *
 * Exported Classes:
 * - editor_host: The host
 *     Setup:    load(), provide_font(), provide_image()
 *     Subjects: set_int(), set_bool(), set_string(), set_time()
 *     Screen:   build(), render(), teardown(), object_count()
 *     Result:   error()
 */
#ifndef U8G2GL_TEST_EDITOR_HOST_H
#define U8G2GL_TEST_EDITOR_HOST_H

#ifndef U8G2GL_EDITOR
#error "editor_host is the editor target's test host; build it with U8G2GL_EDITOR defined"
#endif

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "scene_json.h"
#include "u8g2gl/u8g2gl_editor.h"
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_subject.h"

class U8G2;

/** @brief Builds and renders scene-described screens through the registry. */
class editor_host {
public:
    explicit editor_host(const u8g2gl_editor_registry& registry);
    ~editor_host();
    editor_host(const editor_host&) = delete;
    editor_host& operator=(const editor_host&) = delete;

    /** @brief Read the scene and create its subjects. False, with error(), on failure. */
    bool load(const std::string& scene_path);

    /** @brief Supply a font's data by the name the scene uses. */
    void provide_font(const std::string& name, const uint8_t* data);
    /** @brief Supply an image's bytes by the name the scene uses. */
    void provide_image(const std::string& name, const uint8_t* data);

    /** @brief Set a host subject's value; false if no such subject of that type. */
    bool set_int(const std::string& name, int32_t value);
    bool set_bool(const std::string& name, bool value);
    bool set_string(const std::string& name, const char* value);
    bool set_time(const std::string& name, uint32_t value);

    /**
     * @brief Build one screen through the registry. Once per host: the runtime
     *        cannot remove a subject observer, so a rebuild would leak them.
     * @return False, with error() naming the element, if anything is refused.
     */
    bool build(const std::string& screen);

    /** @brief Render the built screen in draw order. False, with error(), on a refusal. */
    bool render(U8G2& display);

    /** @brief Destroy every object, releasing its bindings. */
    void teardown();

    /** @brief Objects in the built screen. */
    size_t object_count() const { return objects_.size(); }

    /** @brief The first refusal, or empty. */
    const std::string& error() const { return error_; }

private:
    /** One host-owned subject. The storage is whichever member matches `type`. */
    struct subject_slot {
        std::string name;
        u8g2gl_subject_type_t type = U8G2GL_SUBJECT_INT;
        void* base = nullptr;
        std::unique_ptr<u8g2gl_subject_int_n<8>> int_subject;
        std::unique_ptr<u8g2gl_subject_bool_n<8>> bool_subject;
        std::unique_ptr<u8g2gl_subject_string_n<64, 8>> string_subject;
        std::unique_ptr<u8g2gl_subject_time_n<8>> time_subject;
    };

    bool fail(const std::string& message);
    subject_slot* subject(const std::string& name);
    const scene_json* screen_json(const std::string& name) const;
    bool value_for(u8g2gl_editor_type_t type, const scene_json& json, const std::string& what,
                   u8g2gl_editor_value* out);
    bool subject_type_of(const scene_json& json, u8g2gl_subject_type_t* out) const;
    bool build_object(const scene_json& element);
    bool configure_object(size_t index, const scene_json& element);
    bool apply_styles(size_t index, const scene_json& element);
    bool bind_object(size_t index, const scene_json& element);
    bool draw_call(U8G2& display, const scene_json& element);
    bool visible(const scene_json& element, bool* shown);
    void* allocate(size_t size, size_t align);

    /** Object storage, as a Wasm host's linear memory would provide it. */
    static constexpr size_t kArenaBytes = 16384;
    alignas(std::max_align_t) unsigned char arena_[kArenaBytes] = {};

    const u8g2gl_editor_registry& registry_;
    scene_json scene_;
    std::vector<std::unique_ptr<subject_slot>> subjects_;
    std::vector<std::pair<std::string, const uint8_t*>> fonts_;
    std::vector<std::pair<std::string, const uint8_t*>> images_;
    const scene_json* screen_ = nullptr;
    std::vector<u8g2gl_obj*> objects_;
    std::vector<const u8g2gl_editor_class*> classes_;
    std::vector<uint8_t> parents_;
    size_t arena_used_ = 0;
    std::string error_;
};

#endif  // U8G2GL_TEST_EDITOR_HOST_H
