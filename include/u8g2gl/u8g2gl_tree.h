#ifndef U8G2GL_TREE_H
#define U8G2GL_TREE_H

#include <cstdint>
#include "u8g2gl_types.h"

class u8g2gl_obj;

// Rectangle struct for clipping and bounds
struct u8g2gl_rect {
    int16_t x;
    int16_t y;
    int16_t w;
    int16_t h;
};

// Check if an object is effectively visible (own flag AND all ancestors)
bool u8g2gl_is_effectively_visible(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

// Compute effective clip rect (intersection of all ancestor bounds)
u8g2gl_rect u8g2gl_effective_clip(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

// Intersect two rectangles (utility)
u8g2gl_rect u8g2gl_rect_intersect(const u8g2gl_rect& a, const u8g2gl_rect& b);

#endif // U8G2GL_TREE_H
