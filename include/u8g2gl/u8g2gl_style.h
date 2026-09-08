#ifndef U8G2GL_STYLE_H
#define U8G2GL_STYLE_H

#include "u8g2gl_types.h"
#include <cstdint>

// Bitmask for which properties are set in a style
enum u8g2gl_style_prop_t : uint16_t {
    U8G2GL_STYLE_FONT         = (1 << 0),
    U8G2GL_STYLE_DRAW_COLOR   = (1 << 1),
    U8G2GL_STYLE_INVERT       = (1 << 2),
    U8G2GL_STYLE_PADDING      = (1 << 3),
    U8G2GL_STYLE_BORDER       = (1 << 4),
    U8G2GL_STYLE_RADIUS       = (1 << 5),
    U8G2GL_STYLE_ALIGN        = (1 << 6),
    U8G2GL_STYLE_TRUNCATE     = (1 << 7),
    U8G2GL_STYLE_FONT_MODE    = (1 << 8),
    U8G2GL_STYLE_BITMAP_MODE  = (1 << 9),
};

struct u8g2gl_style {
    // Properties — ordered largest-alignment-first (WO6 Finding C) to avoid
    // padding: pointer, then 16-bit fields, then 8-bit enums/bools. Behaviour
    // is unchanged; only layout is.
    const uint8_t* font = nullptr;        // U8G2 font pointer
    int16_t padding = 0;
    int16_t radius = 0;

    // Which properties are explicitly set
    uint16_t set_mask = 0;

    u8g2gl_color_t draw_color = U8G2GL_COLOR_1;
    u8g2gl_align_t align = U8G2GL_ALIGN_LEFT;
    u8g2gl_font_mode_t font_mode = U8G2GL_FONT_MODE_SOLID;
    u8g2gl_bitmap_mode_t bitmap_mode = U8G2GL_BITMAP_MODE_SOLID;
    bool invert = false;
    bool border = false;
    bool truncate = false;

    // --- Setters that also mark the property as set ---
    void set_font(const uint8_t* f);
    void set_draw_color(u8g2gl_color_t c);
    void set_invert(bool v);
    void set_padding(int16_t p);
    void set_border(bool b);
    void set_radius(int16_t r);
    void set_align(u8g2gl_align_t a);
    void set_truncate(bool t);
    void set_font_mode(u8g2gl_font_mode_t m);
    void set_bitmap_mode(u8g2gl_bitmap_mode_t m);

    // --- Query ---
    bool has(u8g2gl_style_prop_t prop) const;

    // --- Merge: apply all SET properties from `other` onto this style ---
    // Properties in `other` that are not set do not overwrite.
    // This is how cascade works: base style + inline overrides.
    void merge_from(const u8g2gl_style& other);

    // --- Reset ---
    void clear();
};

#endif // U8G2GL_STYLE_H
