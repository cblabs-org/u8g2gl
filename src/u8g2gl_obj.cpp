#include "u8g2gl/u8g2gl_obj.h"

void u8g2gl_obj::set_coords(int16_t x, int16_t y, int16_t w, int16_t h) {
    x_ = x;
    y_ = y;
    w_ = w;
    h_ = h;
}

int16_t u8g2gl_obj::get_x() const {
    return x_;
}

int16_t u8g2gl_obj::get_y() const {
    return y_;
}

int16_t u8g2gl_obj::get_w() const {
    return w_;
}

int16_t u8g2gl_obj::get_h() const {
    return h_;
}

void u8g2gl_obj::set_flag(uint8_t flag) {
    flags_ |= flag;
}

void u8g2gl_obj::clear_flag(uint8_t flag) {
    flags_ &= static_cast<uint8_t>(~flag);
}

bool u8g2gl_obj::has_flag(uint8_t flag) const {
    return (flags_ & flag) != 0;
}

void u8g2gl_obj::set_hidden(bool h) {
    if (h) {
        set_flag(U8G2GL_FLAG_HIDDEN);
    } else {
        clear_flag(U8G2GL_FLAG_HIDDEN);
    }
}

bool u8g2gl_obj::is_hidden() const {
    return has_flag(U8G2GL_FLAG_HIDDEN);
}

void u8g2gl_obj::set_disabled(bool d) {
    if (d) {
        set_flag(U8G2GL_FLAG_DISABLED);
    } else {
        clear_flag(U8G2GL_FLAG_DISABLED);
    }
}

bool u8g2gl_obj::is_disabled() const {
    return has_flag(U8G2GL_FLAG_DISABLED);
}

void u8g2gl_obj::set_parent_index(uint8_t idx) {
    parent_index_ = idx;
}

uint8_t u8g2gl_obj::get_parent_index() const {
    return parent_index_;
}

void u8g2gl_obj::mark_dirty() {
    set_flag(U8G2GL_FLAG_DIRTY);
}

bool u8g2gl_obj::is_dirty() const {
    return has_flag(U8G2GL_FLAG_DIRTY);
}

void u8g2gl_obj::clear_dirty() {
    clear_flag(U8G2GL_FLAG_DIRTY);
}

uint32_t u8g2gl_obj::tick(uint32_t /*now_ms*/) {
    return U8G2GL_IDLE;
}

void u8g2gl_obj::render(U8G2& /*display*/) {
    // Default: no-op
}

void u8g2gl_obj::render_animation_update(U8G2& /*display*/, uint32_t /*now_ms*/) {
    // Default: no-op
}
