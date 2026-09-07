#include "u8g2gl/u8g2gl_style.h"

void u8g2gl_style::set_font(const uint8_t* f) {
    font = f;
    set_mask |= U8G2GL_STYLE_FONT;
}

void u8g2gl_style::set_draw_color(u8g2gl_color_t c) {
    draw_color = c;
    set_mask |= U8G2GL_STYLE_DRAW_COLOR;
}

void u8g2gl_style::set_invert(bool v) {
    invert = v;
    set_mask |= U8G2GL_STYLE_INVERT;
}

void u8g2gl_style::set_padding(int16_t p) {
    padding = p;
    set_mask |= U8G2GL_STYLE_PADDING;
}

void u8g2gl_style::set_border(bool b) {
    border = b;
    set_mask |= U8G2GL_STYLE_BORDER;
}

void u8g2gl_style::set_radius(int16_t r) {
    radius = r;
    set_mask |= U8G2GL_STYLE_RADIUS;
}

void u8g2gl_style::set_align(u8g2gl_align_t a) {
    align = a;
    set_mask |= U8G2GL_STYLE_ALIGN;
}

void u8g2gl_style::set_truncate(bool t) {
    truncate = t;
    set_mask |= U8G2GL_STYLE_TRUNCATE;
}

void u8g2gl_style::set_font_mode(u8g2gl_font_mode_t m) {
    font_mode = m;
    set_mask |= U8G2GL_STYLE_FONT_MODE;
}

void u8g2gl_style::set_bitmap_mode(u8g2gl_bitmap_mode_t m) {
    bitmap_mode = m;
    set_mask |= U8G2GL_STYLE_BITMAP_MODE;
}

bool u8g2gl_style::has(u8g2gl_style_prop_t prop) const {
    return (set_mask & static_cast<uint16_t>(prop)) != 0;
}

void u8g2gl_style::merge_from(const u8g2gl_style& other) {
    if (other.has(U8G2GL_STYLE_FONT)) {
        font = other.font;
        set_mask |= U8G2GL_STYLE_FONT;
    }
    if (other.has(U8G2GL_STYLE_DRAW_COLOR)) {
        draw_color = other.draw_color;
        set_mask |= U8G2GL_STYLE_DRAW_COLOR;
    }
    if (other.has(U8G2GL_STYLE_INVERT)) {
        invert = other.invert;
        set_mask |= U8G2GL_STYLE_INVERT;
    }
    if (other.has(U8G2GL_STYLE_PADDING)) {
        padding = other.padding;
        set_mask |= U8G2GL_STYLE_PADDING;
    }
    if (other.has(U8G2GL_STYLE_BORDER)) {
        border = other.border;
        set_mask |= U8G2GL_STYLE_BORDER;
    }
    if (other.has(U8G2GL_STYLE_RADIUS)) {
        radius = other.radius;
        set_mask |= U8G2GL_STYLE_RADIUS;
    }
    if (other.has(U8G2GL_STYLE_ALIGN)) {
        align = other.align;
        set_mask |= U8G2GL_STYLE_ALIGN;
    }
    if (other.has(U8G2GL_STYLE_TRUNCATE)) {
        truncate = other.truncate;
        set_mask |= U8G2GL_STYLE_TRUNCATE;
    }
    if (other.has(U8G2GL_STYLE_FONT_MODE)) {
        font_mode = other.font_mode;
        set_mask |= U8G2GL_STYLE_FONT_MODE;
    }
    if (other.has(U8G2GL_STYLE_BITMAP_MODE)) {
        bitmap_mode = other.bitmap_mode;
        set_mask |= U8G2GL_STYLE_BITMAP_MODE;
    }
}

void u8g2gl_style::clear() {
    font = nullptr;
    draw_color = U8G2GL_COLOR_1;
    invert = false;
    padding = 0;
    border = false;
    radius = 0;
    align = U8G2GL_ALIGN_LEFT;
    truncate = false;
    font_mode = U8G2GL_FONT_MODE_SOLID;
    bitmap_mode = U8G2GL_BITMAP_MODE_SOLID;
    set_mask = 0;
}
