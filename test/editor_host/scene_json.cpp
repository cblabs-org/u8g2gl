/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/editor_host/scene_json.cpp
 * Purpose: The parser behind scene_json.h — enough JSON to read the generator's
 *          scene description in the C++ parity test, and nothing that would let
 *          a malformed file read as a plausible scene.
 *
 * Description: Recursive descent over the text with one cursor. Numbers are
 *              integers only (the scene holds no fractions); `\uXXXX` escapes are
 *              decoded to UTF-8. Any deviation stops the parse with the offset.
 */
#include "scene_json.h"

#include <fstream>
#include <sstream>

namespace {

// The value get() returns for an absent key.
const scene_json k_null{};

// parser
// One pass over `text`. Every method either consumes a complete value and
// returns true, or records the first error and returns false.
class parser {
public:
    explicit parser(const std::string& text) : text_(text) {}

    bool parse(scene_json* out) {
        skip_space();
        if (!value(out)) {
            return false;
        }
        skip_space();
        return pos_ == text_.size() || fail("trailing text");
    }

    const std::string& error() const { return error_; }

private:
    bool fail(const char* what) {
        if (error_.empty()) {
            error_ = std::string(what) + " at byte " + std::to_string(pos_);
        }
        return false;
    }

    void skip_space() {
        while (pos_ < text_.size() &&
               (text_[pos_] == ' ' || text_[pos_] == '\n' || text_[pos_] == '\r' || text_[pos_] == '\t')) {
            ++pos_;
        }
    }

    bool literal(const char* word) {
        const std::string w(word);
        if (text_.compare(pos_, w.size(), w) != 0) {
            return fail("unexpected token");
        }
        pos_ += w.size();
        return true;
    }

    // value
    // One JSON value of any kind, dispatched on its first character.
    bool value(scene_json* out) {
        if (pos_ >= text_.size()) {
            return fail("unexpected end");
        }
        const char c = text_[pos_];
        if (c == '{') {
            return object(out);
        }
        if (c == '[') {
            return array(out);
        }
        if (c == '"') {
            out->kind = scene_json::STRING;
            return string(&out->text);
        }
        if (c == 't') {
            out->kind = scene_json::BOOL;
            out->boolean = true;
            return literal("true");
        }
        if (c == 'f') {
            out->kind = scene_json::BOOL;
            out->boolean = false;
            return literal("false");
        }
        if (c == 'n') {
            out->kind = scene_json::NUL;
            return literal("null");
        }
        if (c == '-' || (c >= '0' && c <= '9')) {
            return number(out);
        }
        return fail("unexpected character");
    }

    bool number(scene_json* out) {
        const size_t start = pos_;
        if (text_[pos_] == '-') {
            ++pos_;
        }
        const size_t digits = pos_;
        while (pos_ < text_.size() && text_[pos_] >= '0' && text_[pos_] <= '9') {
            ++pos_;
        }
        if (pos_ == digits) {
            return fail("malformed number");
        }
        if (pos_ < text_.size() && (text_[pos_] == '.' || text_[pos_] == 'e' || text_[pos_] == 'E')) {
            return fail("non-integer number");
        }
        out->kind = scene_json::NUMBER;
        out->number = std::stoll(text_.substr(start, pos_ - start));
        return true;
    }

    // append_utf8
    // One code point as UTF-8, for a \u escape.
    static void append_utf8(std::string* out, uint32_t cp) {
        if (cp < 0x80) {
            out->push_back(static_cast<char>(cp));
        } else if (cp < 0x800) {
            out->push_back(static_cast<char>(0xC0 | (cp >> 6)));
            out->push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else {
            out->push_back(static_cast<char>(0xE0 | (cp >> 12)));
            out->push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out->push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        }
    }

    bool string(std::string* out) {
        ++pos_;  // opening quote
        while (pos_ < text_.size() && text_[pos_] != '"') {
            char c = text_[pos_++];
            if (c != '\\') {
                out->push_back(c);
                continue;
            }
            if (pos_ >= text_.size()) {
                return fail("unterminated escape");
            }
            c = text_[pos_++];
            switch (c) {
                case '"': out->push_back('"'); break;
                case '\\': out->push_back('\\'); break;
                case '/': out->push_back('/'); break;
                case 'b': out->push_back('\b'); break;
                case 'f': out->push_back('\f'); break;
                case 'n': out->push_back('\n'); break;
                case 'r': out->push_back('\r'); break;
                case 't': out->push_back('\t'); break;
                case 'u': {
                    if (pos_ + 4 > text_.size()) {
                        return fail("short \\u escape");
                    }
                    append_utf8(out, static_cast<uint32_t>(std::stoul(text_.substr(pos_, 4), nullptr, 16)));
                    pos_ += 4;
                    break;
                }
                default:
                    return fail("unknown escape");
            }
        }
        if (pos_ >= text_.size()) {
            return fail("unterminated string");
        }
        ++pos_;  // closing quote
        return true;
    }

    bool array(scene_json* out) {
        out->kind = scene_json::ARRAY;
        ++pos_;
        skip_space();
        if (pos_ < text_.size() && text_[pos_] == ']') {
            ++pos_;
            return true;
        }
        while (true) {
            skip_space();
            scene_json item;
            if (!value(&item)) {
                return false;
            }
            out->array.push_back(std::move(item));
            skip_space();
            if (pos_ < text_.size() && text_[pos_] == ',') {
                ++pos_;
                continue;
            }
            if (pos_ < text_.size() && text_[pos_] == ']') {
                ++pos_;
                return true;
            }
            return fail("expected , or ]");
        }
    }

    bool object(scene_json* out) {
        out->kind = scene_json::OBJECT;
        ++pos_;
        skip_space();
        if (pos_ < text_.size() && text_[pos_] == '}') {
            ++pos_;
            return true;
        }
        while (true) {
            skip_space();
            if (pos_ >= text_.size() || text_[pos_] != '"') {
                return fail("expected a key");
            }
            std::string key;
            if (!string(&key)) {
                return false;
            }
            skip_space();
            if (pos_ >= text_.size() || text_[pos_] != ':') {
                return fail("expected :");
            }
            ++pos_;
            skip_space();
            scene_json member;
            if (!value(&member)) {
                return false;
            }
            out->object.emplace_back(std::move(key), std::move(member));
            skip_space();
            if (pos_ < text_.size() && text_[pos_] == ',') {
                ++pos_;
                continue;
            }
            if (pos_ < text_.size() && text_[pos_] == '}') {
                ++pos_;
                return true;
            }
            return fail("expected , or }");
        }
    }

    const std::string& text_;
    size_t pos_ = 0;
    std::string error_;
};

}  // namespace

bool scene_json::has(const std::string& key) const {
    for (const auto& member : object) {
        if (member.first == key) {
            return true;
        }
    }
    return false;
}

const scene_json& scene_json::get(const std::string& key) const {
    for (const auto& member : object) {
        if (member.first == key) {
            return member.second;
        }
    }
    return k_null;
}

scene_json scene_json_parse(const std::string& text, std::string* error) {
    scene_json out;
    parser p(text);
    if (!p.parse(&out)) {
        if (error != nullptr) {
            *error = p.error();
        }
        return scene_json{};
    }
    return out;
}

scene_json scene_json_read_file(const std::string& path, std::string* error) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        if (error != nullptr) {
            *error = "cannot open " + path;
        }
        return scene_json{};
    }
    std::ostringstream buffer;
    buffer << in.rdbuf();
    std::string parse_error;
    scene_json out = scene_json_parse(buffer.str(), &parse_error);
    if (!parse_error.empty() && error != nullptr) {
        *error = path + ": " + parse_error;
    }
    return out;
}
