/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/compiled_assets_registry.cpp
 * Purpose: The reference the asset-injection test compares against: the
 *          framework fixture's editor registry with its fonts and images
 *          **compiled in**, as every editor Wasm had them before the designer
 *          injected them. asset-injection.test.mjs renders the same scenes
 *          with this Wasm and with the framework one, which compiles none and
 *          is handed each asset's bytes, and requires the frames to match
 *          pixel for pixel. Test-only: it is linked into its own test Wasm,
 *          never into one the designer ships.
 * Description: The generated registry is compiled as it is, with its own
 *              empty `ui_editor_asset()` renamed out of the way by the
 *              preprocessor, so this unit can define the lookup the editor
 *              target used to generate: each fixture font and image name
 *              mapped to the `ui_font_*` or `ui_image_*` symbol the fixture's
 *              generated `ui_fonts.cpp` and `ui_images.cpp` define. The names
 *              are the fixture's globals.xml declarations.
 *
 * Exported Functions:
 * - ui_editor_asset(): The fixture's fonts and images, compiled in, by name
 */

#include <cstdint>
#include <cstring>

#define ui_editor_asset ui_editor_asset_generated
#include "ui_editor_registry.cpp"
#undef ui_editor_asset

// The fixture's font aliases and image arrays, as its ui.hpp declares them.
extern const uint8_t* const ui_font_u8g2_font_6x10_mr;
extern const uint8_t* const ui_font_u8g2_font_5x7_mr;
extern const uint8_t* const ui_font_u8g2_font_helvR08_tr;
extern const uint8_t* const ui_font_font_4x6;
extern const uint8_t* const ui_font_font_arrow_mini;
extern const uint8_t ui_image_icon_wifi[];
extern const uint8_t ui_image_logo_mark[];

// ui_editor_asset
// The compiled-in lookup: one strcmp per name, fonts and images apart so a
// font name never resolves to an image.
//   type — U8G2GL_EDITOR_FONT or U8G2GL_EDITOR_IMAGE
//   name — the scene's name for it
const void* ui_editor_asset(u8g2gl_editor_type_t type, const char* name) {
    if (name == nullptr) {
        return nullptr;
    }
    if (type == U8G2GL_EDITOR_FONT) {
        if (std::strcmp(name, "u8g2_font_6x10_mr") == 0) { return ui_font_u8g2_font_6x10_mr; }
        if (std::strcmp(name, "u8g2_font_5x7_mr") == 0) { return ui_font_u8g2_font_5x7_mr; }
        if (std::strcmp(name, "u8g2_font_helvR08_tr") == 0) { return ui_font_u8g2_font_helvR08_tr; }
        if (std::strcmp(name, "font_4x6") == 0) { return ui_font_font_4x6; }
        if (std::strcmp(name, "font_arrow_mini") == 0) { return ui_font_font_arrow_mini; }
    }
    if (type == U8G2GL_EDITOR_IMAGE) {
        if (std::strcmp(name, "icon_wifi") == 0) { return ui_image_icon_wifi; }
        if (std::strcmp(name, "logo_mark") == 0) { return ui_image_logo_mark; }
    }
    return nullptr;
}
