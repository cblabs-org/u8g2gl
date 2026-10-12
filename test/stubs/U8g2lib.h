/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/stubs/U8g2lib.h
 * Purpose: The single authoritative host test double for U8G2. It records the
 *          calls the runtime makes so tests can assert on them without
 *          hardware.
 *
 *          It must never offer an API real U8G2 lacks, or take arguments of a
 *          type real U8G2 does not: either lets the runtime pass its tests and
 *          then fail on hardware. Both happened — getFont() existed only here,
 *          and coordinates were int, so a wrapped negative origin was
 *          invisible. Signatures therefore follow U8G2 2.36.18's U8g2lib.h
 *          (extern/u8g2/cppsrc), and the test/real_u8g2 target compiles the
 *          runtime against the real header to keep the two honest (WO4c).
 *
 *          Coordinates are u8g2_uint_t (uint16_t, as with U8G2_16BIT), so each
 *          recorded value is what hardware would receive: -5 passed implicitly
 *          records as 65531. The recording fields stay int so a test can compare
 *          them directly.
 *
 * Description: u8g2_uint_t and a minimal u8g2_t — the ambient state fields
 *              u8g2gl_state_saver reads, under real U8G2's names, kept in step
 *              by the stub's setters — then the U8G2 class: draw calls with
 *              per-call counters and last-argument fields, draw colour / font /
 *              mode / position / direction / height-mode state, clip-window
 *              recording, and configurable text metrics.
 *
 *              Every call that draws or changes draw state is also appended, in
 *              order, to a fixed-capacity call log (PR-04 WO11). Counters and
 *              last-argument fields say *what* was drawn; the log says in *what
 *              order and with what arguments*, which is what comparing two render
 *              paths needs — the editor target's parity test asserts two logs are
 *              identical. Recording only: no signature changed.
 *
 * Exported Classes:
 * - u8g2_uint_t: U8G2's pixel coordinate type (uint16_t, U8G2_16BIT)
 * - u8g2_font_calc_vref_fnptr: U8G2's font-position function pointer type
 * - u8g2_font_decode_t: U8G2's glyph-decode state, reduced to mode and direction
 * - u8g2_t:      U8G2's state struct, reduced to the members the runtime reads
 * - u8g2_stub_call: One entry of the ordered call log
 * - U8G2:        Recording test double for U8G2's C++ class
 *
 *     Drawing:    drawBox/Frame/RBox/RFrame, drawH/VLine, drawLine, drawPixel,
 *                 drawCircle/Disc, drawEllipse/FilledEllipse, drawTriangle,
 *                 drawXBMP, drawGlyph, drawStr, drawUTF8, drawButtonUTF8
 *     State:      set/getDrawColor, setFont, getU8g2, setFontMode, setBitmapMode,
 *                 setFontPosTop/Baseline/Bottom/Center, setFontDirection,
 *                 setFontRefHeightText/ExtendedText/All
 *     Clipping:   setClipWindow, setMaxClipWindow
 *     Metrics:    getUTF8Width, getStrWidth, getAscent, getDescent,
 *                 getMaxCharWidth/Height, getDisplayWidth/Height
 *     Frame:      clearBuffer, sendBuffer, updateDisplayArea
 *     Call log:   call_log[], call_log_count, call_log_overflowed()
 */
#ifndef U8G2LIB_H
#define U8G2LIB_H

#include <cstdint>
#include <cstdio>
#include <initializer_list>

/**
 * @brief The stub for `U8G2_FONT_SECTION` (u8g2.h), which real U8G2 forwards
 *        to `U8X8_FONT_SECTION` (u8x8.h) and places on every font array:
 *        `.progmem.<name>` on AVR,
 *        `.text.<name>` on AVR32, empty everywhere else — including this
 *        host build, so it expands to nothing here, exactly as it does on
 *        real U8G2's own default branch.
 */
#ifndef U8G2_FONT_SECTION
#define U8G2_FONT_SECTION(name)
#endif

/**
 * @brief Font rotation is compiled in, as u8g2.h defines it by default, so
 *        u8g2_font_decode_t carries `dir` and code guarded by this macro
 *        compiles here exactly as it does against real U8G2.
 */
#ifndef U8G2_WITH_FONT_ROTATION
#define U8G2_WITH_FONT_ROTATION
#endif

/**
 * @brief U8G2's reference-height modes (u8g2.h), the values
 *        setFontRefHeightText/ExtendedText/All() store in font_height_mode.
 */
#define U8G2_FONT_HEIGHT_MODE_TEXT 0
#define U8G2_FONT_HEIGHT_MODE_XTEXT 1
#define U8G2_FONT_HEIGHT_MODE_ALL 2

/** @brief U8G2's pixel coordinate type; uint16_t because U8G2_16BIT is on. */
typedef uint16_t u8g2_uint_t;

struct u8g2_t;

/**
 * @brief U8G2's font-position function type (u8g2.h). setFontPos*() stores one
 *        of four such functions, declared below.
 */
typedef u8g2_uint_t (*u8g2_font_calc_vref_fnptr)(u8g2_t* u8g2);

/** @brief U8G2's glyph-decode state, reduced to the two fields read back. */
struct u8g2_font_decode_t {
    uint8_t is_transparent = 0;  ///< Font mode, as set by setFontMode()
#ifdef U8G2_WITH_FONT_ROTATION
    uint8_t dir = 0;             ///< Font direction, as set by setFontDirection()
#endif
};

/**
 * @brief U8G2's state struct, reduced to what the runtime reads.
 *
 * Real U8G2 has no getFont(), font-mode, bitmap-mode or font-position getter;
 * that state is readable only here, through getU8g2(). Keeping the stub to the
 * same field names stops the runtime compiling against an accessor or a field
 * that does not exist. Defaults are u8g2_SetupBuffer()'s (u8g2_setup.c): no
 * font, draw colour 1, solid modes, baseline position, text reference height.
 * The stub has no font metrics, so it records the height mode but not the
 * reference ascent and descent real U8G2 derives from it.
 */
struct u8g2_t {
    const uint8_t* font = nullptr;               ///< Current font, as set by setFont()
    u8g2_font_calc_vref_fnptr font_calc_vref;    ///< Font position, as set by setFontPos*()
    u8g2_font_decode_t font_decode;              ///< Font mode and direction
    uint8_t bitmap_transparency = 0;             ///< Bitmap mode, as set by setBitmapMode()
    uint8_t draw_color = 1;                      ///< Draw colour, as set by setDrawColor()
    uint8_t font_height_mode = U8G2_FONT_HEIGHT_MODE_TEXT;  ///< As set by setFontRefHeight*()

    u8g2_t();
};

/**
 * @brief The four font-position functions, under U8G2's own names and C
 *        linkage (u8g2_font.c), so code that compares font_calc_vref against
 *        one of them compiles identically here. Each returns 0; only their
 *        identity matters to a test.
 */
extern "C" {
inline u8g2_uint_t u8g2_font_calc_vref_font(u8g2_t*) { return 0; }    ///< Baseline
inline u8g2_uint_t u8g2_font_calc_vref_top(u8g2_t*) { return 0; }     ///< Top
inline u8g2_uint_t u8g2_font_calc_vref_bottom(u8g2_t*) { return 0; }  ///< Bottom
inline u8g2_uint_t u8g2_font_calc_vref_center(u8g2_t*) { return 0; }  ///< Center
}

inline u8g2_t::u8g2_t() : font_calc_vref(u8g2_font_calc_vref_font) {}

/**
 * @brief One call in the stub's ordered call log.
 *
 * Text is copied, not pointed at, so two render paths drawing the same string
 * from different buffers record equal entries.
 */
struct u8g2_stub_call {
    const char* op = nullptr;        ///< The U8G2 method, e.g. "drawBox"; a string literal
    const void* pointer = nullptr;   ///< A font or bitmap argument, else nullptr
    int32_t args[6] = {};            ///< Integer arguments in parameter order, zero-filled
    char text[32] = {};              ///< A text argument, truncated; empty if none
};

class U8G2 {
public:
    // --- Ordered call log (PR-04 WO11) ---
    // Fixed capacity rather than a growing container: the stub is included by
    // runtime-adjacent test code that is held to the runtime's no-heap habits,
    // and a frame of the fixtures here is a few dozen calls. A render that
    // overflows it is reported by call_log_overflowed(), never silently cut.
    static constexpr int kCallLogCapacity = 128;
    u8g2_stub_call call_log[kCallLogCapacity] = {};
    int call_log_count = 0;

    /** @brief Whether more calls were made than the log holds. */
    bool call_log_overflowed() const {
        return call_log_count > kCallLogCapacity;
    }

    int clear_count = 0;
    int send_count = 0;
    int update_display_area_count = 0;
    int last_tx = 0;
    int last_ty = 0;
    int last_tw = 0;
    int last_th = 0;
    uint8_t last_draw_color = 1;
    const uint8_t* last_font = nullptr;
    uint8_t last_font_mode = 0;
    int draw_utf8_count = 0;
    int last_draw_utf8_x = 0;
    int last_draw_utf8_y = 0;
    const char* last_draw_utf8_text = nullptr;
    char last_draw_utf8_buf[32] = {};
    int (*custom_utf8_width)(const char*) = nullptr;
    int utf8_width_val = 0;
    int ascent_val = 0;
    int descent_val = 0;

    int draw_xbmp_count = 0;
    int last_draw_xbmp_x = 0;
    int last_draw_xbmp_y = 0;
    int last_draw_xbmp_w = 0;
    int last_draw_xbmp_h = 0;
    const uint8_t* last_draw_xbmp_bitmap = nullptr;
    uint8_t last_bitmap_mode = 0;

    int draw_glyph_count = 0;
    int last_draw_glyph_x = 0;
    int last_draw_glyph_y = 0;
    uint16_t last_draw_glyph_codepoint = 0;

    int draw_box_count = 0;
    int last_draw_box_x = 0;
    int last_draw_box_y = 0;
    int last_draw_box_w = 0;
    int last_draw_box_h = 0;

    int draw_frame_count = 0;
    int last_draw_frame_x = 0;
    int last_draw_frame_y = 0;
    int last_draw_frame_w = 0;
    int last_draw_frame_h = 0;

    int draw_rbox_count = 0;
    int last_draw_rbox_x = 0;
    int last_draw_rbox_y = 0;
    int last_draw_rbox_w = 0;
    int last_draw_rbox_h = 0;
    int last_draw_rbox_r = 0;

    int draw_rframe_count = 0;
    int last_draw_rframe_x = 0;
    int last_draw_rframe_y = 0;
    int last_draw_rframe_w = 0;
    int last_draw_rframe_h = 0;
    int last_draw_rframe_r = 0;

    int draw_pixel_count = 0;
    int last_draw_pixel_x = 0;
    int last_draw_pixel_y = 0;

    int draw_hline_count = 0;
    int last_draw_hline_x = 0;
    int last_draw_hline_y = 0;
    int last_draw_hline_w = 0;

    int draw_vline_count = 0;
    int last_draw_vline_x = 0;
    int last_draw_vline_y = 0;
    int last_draw_vline_h = 0;

    // drawLine is the only instrumented call issued more than once by a
    // single u8g2gl_draw_* function (the triangle outline composes three of
    // them — see u8g2gl_draw_triangle), so it keeps a small fixed-size call
    // history alongside the last_* fields every other member uses, rather
    // than only the most recent call.
    static constexpr int kDrawLineHistory = 4;
    int draw_line_count = 0;
    int draw_line_x1[kDrawLineHistory] = {};
    int draw_line_y1[kDrawLineHistory] = {};
    int draw_line_x2[kDrawLineHistory] = {};
    int draw_line_y2[kDrawLineHistory] = {};
    int last_draw_line_x1 = 0;
    int last_draw_line_y1 = 0;
    int last_draw_line_x2 = 0;
    int last_draw_line_y2 = 0;

    int draw_circle_count = 0;
    int last_draw_circle_x = 0;
    int last_draw_circle_y = 0;
    int last_draw_circle_r = 0;
    uint8_t last_draw_circle_option = 0;

    int draw_disc_count = 0;
    int last_draw_disc_x = 0;
    int last_draw_disc_y = 0;
    int last_draw_disc_r = 0;
    uint8_t last_draw_disc_option = 0;

    int draw_triangle_count = 0;
    int last_draw_triangle_x0 = 0;
    int last_draw_triangle_y0 = 0;
    int last_draw_triangle_x1 = 0;
    int last_draw_triangle_y1 = 0;
    int last_draw_triangle_x2 = 0;
    int last_draw_triangle_y2 = 0;

    int draw_ellipse_count = 0;
    int last_draw_ellipse_x = 0;
    int last_draw_ellipse_y = 0;
    int last_draw_ellipse_rx = 0;
    int last_draw_ellipse_ry = 0;
    uint8_t last_draw_ellipse_option = 0;

    int draw_filled_ellipse_count = 0;
    int last_draw_filled_ellipse_x = 0;
    int last_draw_filled_ellipse_y = 0;
    int last_draw_filled_ellipse_rx = 0;
    int last_draw_filled_ellipse_ry = 0;
    uint8_t last_draw_filled_ellipse_option = 0;

    int set_clip_window_count = 0;
    int last_clip_x0 = 0;
    int last_clip_y0 = 0;
    int last_clip_x1 = 0;
    int last_clip_y1 = 0;
    int max_clip_window_count = 0;

    void clearBuffer() {
        log_call("clearBuffer", {});
        clear_count++;
    }

    void sendBuffer() {
        log_call("sendBuffer", {});
        send_count++;
    }

    void drawHLine(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t w) {
        log_call("drawHLine", {x, y, w});
        draw_hline_count++;
        last_draw_hline_x = x;
        last_draw_hline_y = y;
        last_draw_hline_w = w;
    }
    void drawVLine(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t h) {
        log_call("drawVLine", {x, y, h});
        draw_vline_count++;
        last_draw_vline_x = x;
        last_draw_vline_y = y;
        last_draw_vline_h = h;
    }
    void drawLine(u8g2_uint_t x1, u8g2_uint_t y1, u8g2_uint_t x2, u8g2_uint_t y2) {
        log_call("drawLine", {x1, y1, x2, y2});
        if (draw_line_count < kDrawLineHistory) {
            draw_line_x1[draw_line_count] = x1;
            draw_line_y1[draw_line_count] = y1;
            draw_line_x2[draw_line_count] = x2;
            draw_line_y2[draw_line_count] = y2;
        }
        draw_line_count++;
        last_draw_line_x1 = x1;
        last_draw_line_y1 = y1;
        last_draw_line_x2 = x2;
        last_draw_line_y2 = y2;
    }
    void drawBox(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t w, u8g2_uint_t h) {
        log_call("drawBox", {x, y, w, h});
        draw_box_count++;
        last_draw_box_x = x;
        last_draw_box_y = y;
        last_draw_box_w = w;
        last_draw_box_h = h;
    }
    void drawFrame(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t w, u8g2_uint_t h) {
        log_call("drawFrame", {x, y, w, h});
        draw_frame_count++;
        last_draw_frame_x = x;
        last_draw_frame_y = y;
        last_draw_frame_w = w;
        last_draw_frame_h = h;
    }
    u8g2_uint_t drawStr(u8g2_uint_t x, u8g2_uint_t y, const char* s) {
        log_call("drawStr", {x, y}, nullptr, s);
        return 0;
    }
    u8g2_uint_t drawUTF8(u8g2_uint_t x, u8g2_uint_t y, const char* s) {
        log_call("drawUTF8", {x, y}, nullptr, s);
        draw_utf8_count++;
        last_draw_utf8_x = x;
        last_draw_utf8_y = y;
        last_draw_utf8_text = s;
        if (s != nullptr) {
            std::snprintf(last_draw_utf8_buf, sizeof(last_draw_utf8_buf), "%s", s);
        } else {
            last_draw_utf8_buf[0] = '\0';
        }
        return 0;
    }
    u8g2_uint_t drawGlyph(u8g2_uint_t x, u8g2_uint_t y, uint16_t glyph) {
        log_call("drawGlyph", {x, y, glyph});
        draw_glyph_count++;
        last_draw_glyph_x = x;
        last_draw_glyph_y = y;
        last_draw_glyph_codepoint = glyph;
        return 0;
    }
    void drawXBMP(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t w, u8g2_uint_t h,
                  const uint8_t* bitmap) {
        log_call("drawXBMP", {x, y, w, h}, bitmap);
        draw_xbmp_count++;
        last_draw_xbmp_x = x;
        last_draw_xbmp_y = y;
        last_draw_xbmp_w = w;
        last_draw_xbmp_h = h;
        last_draw_xbmp_bitmap = bitmap;
    }
    void drawPixel(u8g2_uint_t x, u8g2_uint_t y) {
        log_call("drawPixel", {x, y});
        draw_pixel_count++;
        last_draw_pixel_x = x;
        last_draw_pixel_y = y;
    }
    void drawCircle(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t r, uint8_t option = 0x0F) {
        log_call("drawCircle", {x, y, r, option});
        draw_circle_count++;
        last_draw_circle_x = x;
        last_draw_circle_y = y;
        last_draw_circle_r = r;
        last_draw_circle_option = option;
    }
    void drawDisc(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t r, uint8_t option = 0x0F) {
        log_call("drawDisc", {x, y, r, option});
        draw_disc_count++;
        last_draw_disc_x = x;
        last_draw_disc_y = y;
        last_draw_disc_r = r;
        last_draw_disc_option = option;
    }
    // Signed, unlike every other draw call: U8G2 2.36.18 declares drawTriangle
    // with int16_t vertices, and its polygon code handles negative ones.
    void drawTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1, int16_t x2, int16_t y2) {
        log_call("drawTriangle", {x0, y0, x1, y1, x2, y2});
        draw_triangle_count++;
        last_draw_triangle_x0 = x0;
        last_draw_triangle_y0 = y0;
        last_draw_triangle_x1 = x1;
        last_draw_triangle_y1 = y1;
        last_draw_triangle_x2 = x2;
        last_draw_triangle_y2 = y2;
    }
    void drawEllipse(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t rx, u8g2_uint_t ry,
                     uint8_t option = 0x0F) {
        log_call("drawEllipse", {x, y, rx, ry, option});
        draw_ellipse_count++;
        last_draw_ellipse_x = x;
        last_draw_ellipse_y = y;
        last_draw_ellipse_rx = rx;
        last_draw_ellipse_ry = ry;
        last_draw_ellipse_option = option;
    }
    void drawFilledEllipse(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t rx, u8g2_uint_t ry,
                           uint8_t option = 0x0F) {
        log_call("drawFilledEllipse", {x, y, rx, ry, option});
        draw_filled_ellipse_count++;
        last_draw_filled_ellipse_x = x;
        last_draw_filled_ellipse_y = y;
        last_draw_filled_ellipse_rx = rx;
        last_draw_filled_ellipse_ry = ry;
        last_draw_filled_ellipse_option = option;
    }
    void drawRBox(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t w, u8g2_uint_t h, u8g2_uint_t r) {
        log_call("drawRBox", {x, y, w, h, r});
        draw_rbox_count++;
        last_draw_rbox_x = x;
        last_draw_rbox_y = y;
        last_draw_rbox_w = w;
        last_draw_rbox_h = h;
        last_draw_rbox_r = r;
    }
    void drawRFrame(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t w, u8g2_uint_t h, u8g2_uint_t r) {
        log_call("drawRFrame", {x, y, w, h, r});
        draw_rframe_count++;
        last_draw_rframe_x = x;
        last_draw_rframe_y = y;
        last_draw_rframe_w = w;
        last_draw_rframe_h = h;
        last_draw_rframe_r = r;
    }
    void drawButtonUTF8(u8g2_uint_t x, u8g2_uint_t y, u8g2_uint_t flags, u8g2_uint_t width,
                        u8g2_uint_t padding_h, u8g2_uint_t padding_v, const char* text) {
        log_call("drawButtonUTF8", {x, y, flags, width, padding_h, padding_v}, nullptr, text);
    }

    uint8_t getDrawColor() const {
        return u8g2.draw_color;
    }

    void setDrawColor(uint8_t c) {
        log_call("setDrawColor", {c});
        last_draw_color = c;
        u8g2.draw_color = c;
    }

    /** @brief U8G2's own state; the only way real U8G2 exposes the current font. */
    u8g2_t* getU8g2() {
        return &u8g2;
    }

    void setFont(const uint8_t* font) {
        log_call("setFont", {}, font);
        last_font = font;
        u8g2.font = font;
    }

    void setFontMode(uint8_t m) {
        log_call("setFontMode", {m});
        last_font_mode = m;
        u8g2.font_decode.is_transparent = m;
    }
    void setBitmapMode(uint8_t m) {
        log_call("setBitmapMode", {m});
        last_bitmap_mode = m;
        u8g2.bitmap_transparency = m;
    }
    void setClipWindow(u8g2_uint_t x0, u8g2_uint_t y0, u8g2_uint_t x1, u8g2_uint_t y1) {
        log_call("setClipWindow", {x0, y0, x1, y1});
        set_clip_window_count++;
        last_clip_x0 = x0;
        last_clip_y0 = y0;
        last_clip_x1 = x1;
        last_clip_y1 = y1;
    }
    void setMaxClipWindow() {
        log_call("setMaxClipWindow", {});
        max_clip_window_count++;
    }
    void setFontPosTop() {
        log_call("setFontPosTop", {});
        u8g2.font_calc_vref = u8g2_font_calc_vref_top;
    }
    void setFontPosBaseline() {
        log_call("setFontPosBaseline", {});
        u8g2.font_calc_vref = u8g2_font_calc_vref_font;
    }
    void setFontPosBottom() {
        log_call("setFontPosBottom", {});
        u8g2.font_calc_vref = u8g2_font_calc_vref_bottom;
    }
    void setFontPosCenter() {
        log_call("setFontPosCenter", {});
        u8g2.font_calc_vref = u8g2_font_calc_vref_center;
    }
    void setFontRefHeightText() {
        log_call("setFontRefHeightText", {});
        u8g2.font_height_mode = U8G2_FONT_HEIGHT_MODE_TEXT;
    }
    void setFontRefHeightExtendedText() {
        log_call("setFontRefHeightExtendedText", {});
        u8g2.font_height_mode = U8G2_FONT_HEIGHT_MODE_XTEXT;
    }
    void setFontRefHeightAll() {
        log_call("setFontRefHeightAll", {});
        u8g2.font_height_mode = U8G2_FONT_HEIGHT_MODE_ALL;
    }
    void setFontDirection(uint8_t dir) {
        log_call("setFontDirection", {dir});
#ifdef U8G2_WITH_FONT_ROTATION
        u8g2.font_decode.dir = dir;
#endif
    }

    // Measurement getters return U8G2's own types (U8g2lib.h 2.36.18), so the
    // runtime must convert them explicitly exactly as it must on hardware. The
    // configuration fields stay int for convenience in tests.
    u8g2_uint_t getStrWidth(const char*) {
        return 0;
    }

    u8g2_uint_t getUTF8Width(const char* s) {
        if (custom_utf8_width != nullptr) {
            return static_cast<u8g2_uint_t>(custom_utf8_width(s));
        }
        return static_cast<u8g2_uint_t>(utf8_width_val);
    }

    int8_t getMaxCharWidth() {
        return 0;
    }

    int8_t getMaxCharHeight() {
        return 0;
    }

    int8_t getAscent() {
        return static_cast<int8_t>(ascent_val);
    }

    int8_t getDescent() {
        return static_cast<int8_t>(descent_val);
    }

    u8g2_uint_t getDisplayWidth() const {
        return 128;
    }

    u8g2_uint_t getDisplayHeight() const {
        return 64;
    }

    // Tile coordinates are uint8_t in real U8G2, not u8g2_uint_t.
    void updateDisplayArea(uint8_t tx, uint8_t ty, uint8_t tw, uint8_t th) {
        log_call("updateDisplayArea", {tx, ty, tw, th});
        last_tx = tx;
        last_ty = ty;
        last_tw = tw;
        last_th = th;
        update_display_area_count++;
    }

private:
    // log_call
    // Appends one call to the ordered log; past capacity it only counts, so
    // call_log_overflowed() can report that the log is incomplete.
    //   op      — the method name, a string literal
    //   args    — integer arguments in parameter order (at most six)
    //   pointer — a font or bitmap argument
    //   text    — a text argument, copied
    void log_call(const char* op, std::initializer_list<int32_t> args, const void* pointer = nullptr,
                  const char* text = nullptr) {
        if (call_log_count < kCallLogCapacity) {
            u8g2_stub_call& call = call_log[call_log_count];
            call.op = op;
            call.pointer = pointer;
            int i = 0;
            for (int32_t arg : args) {
                if (i < 6) {
                    call.args[i++] = arg;
                }
            }
            if (text != nullptr) {
                std::snprintf(call.text, sizeof(call.text), "%s", text);
            }
        }
        call_log_count++;
    }

    u8g2_t u8g2;
};

#endif // U8G2LIB_H
