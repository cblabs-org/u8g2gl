#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl/u8g2gl_obj.h"

u8g2gl_rect u8g2gl_rect_intersect(const u8g2gl_rect& a, const u8g2gl_rect& b) {
    if (a.w <= 0 || a.h <= 0) {
        return {a.x, a.y, 0, 0};
    }
    if (b.w <= 0 || b.h <= 0) {
        return {b.x, b.y, 0, 0};
    }
    int32_t a_right = static_cast<int32_t>(a.x) + a.w;
    int32_t a_bottom = static_cast<int32_t>(a.y) + a.h;
    int32_t b_right = static_cast<int32_t>(b.x) + b.w;
    int32_t b_bottom = static_cast<int32_t>(b.y) + b.h;

    int32_t x1 = a.x > b.x ? a.x : b.x;
    int32_t y1 = a.y > b.y ? a.y : b.y;
    int32_t x2 = a_right < b_right ? a_right : b_right;
    int32_t y2 = a_bottom < b_bottom ? a_bottom : b_bottom;

    if (x2 <= x1 || y2 <= y1) {
        return {static_cast<int16_t>(x1), static_cast<int16_t>(y1), 0, 0};
    }

    return {
        static_cast<int16_t>(x1),
        static_cast<int16_t>(y1),
        static_cast<int16_t>(x2 - x1),
        static_cast<int16_t>(y2 - y1)
    };
}

bool u8g2gl_is_effectively_visible(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
) {
    if (objs == nullptr) {
        return false;
    }
    uint8_t curr = index;
    while (curr != U8G2GL_NO_PARENT) {
        const u8g2gl_obj* obj = objs[curr];
        if (obj == nullptr) {
            return false;
        }
        if (obj->has_flag(U8G2GL_FLAG_HIDDEN)) {
            return false;
        }
        uint8_t next = (parents != nullptr) ? parents[curr] : obj->get_parent_index();
        if (next == curr) {
            break;
        }
        curr = next;
    }
    return true;
}

u8g2gl_rect u8g2gl_effective_clip(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
) {
    if (objs == nullptr || objs[index] == nullptr) {
        return {0, 0, 0, 0};
    }
    const u8g2gl_obj* self = objs[index];
    u8g2gl_rect clip{self->get_x(), self->get_y(), self->get_w(), self->get_h()};

    uint8_t curr = (parents != nullptr) ? parents[index] : self->get_parent_index();
    while (curr != U8G2GL_NO_PARENT) {
        if (clip.w <= 0 || clip.h <= 0) {
            return clip;
        }
        const u8g2gl_obj* ancestor = objs[curr];
        if (ancestor == nullptr) {
            return {0, 0, 0, 0};
        }
        u8g2gl_rect ancestor_rect{
            ancestor->get_x(), ancestor->get_y(), ancestor->get_w(), ancestor->get_h()
        };
        clip = u8g2gl_rect_intersect(clip, ancestor_rect);

        uint8_t next = (parents != nullptr) ? parents[curr] : ancestor->get_parent_index();
        if (next == curr) {
            break;
        }
        curr = next;
    }
    return clip;
}
