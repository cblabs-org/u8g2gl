/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/editor_host/scene_json.h
 * Purpose: Reads the generator's scene description (`ui_scene.json`, PR-04
 *          WO11) in the C++ test suite. The editor target's parity test builds a
 *          screen from that file exactly as the designer's Wasm host will, so
 *          the test has to read the JSON the generator actually wrote rather
 *          than a hand-copied C++ version of it — a copy would test the copy.
 *
 * Description: A small recursive-descent JSON parser into a tree of
 *              `scene_json` values. Test-only code, so it uses the standard
 *              library freely (cpp.md §2: std::string is acceptable in host-side
 *              tests); the runtime never includes it. It accepts the JSON the
 *              generator emits — objects, arrays, strings with the standard
 *              escapes, integers, booleans, null — and reports anything else as a
 *              parse error rather than guessing.
 *
 * Exported Classes:
 * - scene_json: One JSON value
 *     Kind:     is_null(), is_bool(), is_number(), is_string(), is_array(), is_object()
 *     Access:   as_bool(), as_int(), as_string(), items(), get(), has()
 *
 * Exported Functions:
 * - scene_json_parse(): Parse JSON text, or report where it failed
 * - scene_json_read_file(): Read and parse a file
 */
#ifndef U8G2GL_TEST_SCENE_JSON_H
#define U8G2GL_TEST_SCENE_JSON_H

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

/** @brief One JSON value. Objects keep their keys in document order. */
class scene_json {
public:
    enum kind_t : uint8_t { NUL, BOOL, NUMBER, STRING, ARRAY, OBJECT };

    kind_t kind = NUL;
    bool boolean = false;
    int64_t number = 0;
    std::string text;
    std::vector<scene_json> array;
    std::vector<std::pair<std::string, scene_json>> object;

    bool is_null() const { return kind == NUL; }
    bool is_bool() const { return kind == BOOL; }
    bool is_number() const { return kind == NUMBER; }
    bool is_string() const { return kind == STRING; }
    bool is_array() const { return kind == ARRAY; }
    bool is_object() const { return kind == OBJECT; }

    bool as_bool() const { return boolean; }
    int32_t as_int() const { return static_cast<int32_t>(number); }
    const std::string& as_string() const { return text; }
    /** @brief An array's items; empty for anything else. */
    const std::vector<scene_json>& items() const { return array; }

    /** @brief Whether an object has `key`. */
    bool has(const std::string& key) const;
    /**
     * @brief An object's member, or a shared null value when absent — so a chain
     *        of lookups on a malformed scene reads null rather than crashing.
     */
    const scene_json& get(const std::string& key) const;
};

/**
 * @brief Parse JSON text.
 * @param error Receives a message naming the byte offset on failure.
 * @return The value; null on failure.
 */
scene_json scene_json_parse(const std::string& text, std::string* error);

/** @brief Read a file and parse it; `error` names the file on failure. */
scene_json scene_json_read_file(const std::string& path, std::string* error);

#endif  // U8G2GL_TEST_SCENE_JSON_H
