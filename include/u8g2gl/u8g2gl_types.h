#ifndef U8G2GL_TYPES_H
#define U8G2GL_TYPES_H

#include <cstdint>
#include <cstddef>
#include <climits>

static constexpr uint32_t U8G2GL_IDLE = UINT32_MAX;
static constexpr uint8_t U8G2GL_NO_PARENT = UINT8_MAX;

// Flag constants (as uint8_t)
static constexpr uint8_t U8G2GL_FLAG_HIDDEN   = 0x01;
static constexpr uint8_t U8G2GL_FLAG_DIRTY    = 0x02;
static constexpr uint8_t U8G2GL_FLAG_DISABLED = 0x04;

// Alignment enum
enum u8g2gl_align_t {
    U8G2GL_ALIGN_LEFT = 0,
    U8G2GL_ALIGN_CENTER,
    U8G2GL_ALIGN_RIGHT
};

// Color enum
enum u8g2gl_color_t {
    U8G2GL_COLOR_0 = 0,
    U8G2GL_COLOR_1 = 1,
    U8G2GL_COLOR_XOR = 2
};

// Font mode enum
enum u8g2gl_font_mode_t {
    U8G2GL_FONT_MODE_SOLID = 0,
    U8G2GL_FONT_MODE_TRANSPARENT = 1
};

// Bitmap mode enum
enum u8g2gl_bitmap_mode_t {
    U8G2GL_BITMAP_MODE_SOLID = 0,
    U8G2GL_BITMAP_MODE_TRANSPARENT = 1
};

// Inline helper
inline uint32_t u8g2gl_min(uint32_t a, uint32_t b) {
    return a < b ? a : b;
}

// Event enum stub (for §12, don't implement dispatch)
enum u8g2gl_event_t {
    U8G2GL_EVENT_NONE = 0,
    U8G2GL_EVENT_ENCODER_CW,
    U8G2GL_EVENT_ENCODER_CCW,
    U8G2GL_EVENT_ENCODER_CLICK,
    U8G2GL_EVENT_BUTTON_PRESS,
    U8G2GL_EVENT_BUTTON_LONG_PRESS,
};

#endif // U8G2GL_TYPES_H
