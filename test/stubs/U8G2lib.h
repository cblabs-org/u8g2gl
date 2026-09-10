#ifndef U8G2LIB_H
#define U8G2LIB_H

#include <cstdint>
#include <cstdio>

class U8G2 {
public:
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

    int set_clip_window_count = 0;
    int last_clip_x0 = 0;
    int last_clip_y0 = 0;
    int last_clip_x1 = 0;
    int last_clip_y1 = 0;
    int max_clip_window_count = 0;

    void clearBuffer() {
        clear_count++;
    }

    void sendBuffer() {
        send_count++;
    }

    void drawHLine(int, int, int) {}
    void drawVLine(int, int, int) {}
    void drawLine(int, int, int, int) {}
    void drawBox(int x, int y, int w, int h) {
        draw_box_count++;
        last_draw_box_x = x;
        last_draw_box_y = y;
        last_draw_box_w = w;
        last_draw_box_h = h;
    }
    void drawFrame(int x, int y, int w, int h) {
        draw_frame_count++;
        last_draw_frame_x = x;
        last_draw_frame_y = y;
        last_draw_frame_w = w;
        last_draw_frame_h = h;
    }
    void drawStr(int, int, const char*) {}
    void drawUTF8(int x, int y, const char* s) {
        draw_utf8_count++;
        last_draw_utf8_x = x;
        last_draw_utf8_y = y;
        last_draw_utf8_text = s;
        if (s != nullptr) {
            std::snprintf(last_draw_utf8_buf, sizeof(last_draw_utf8_buf), "%s", s);
        } else {
            last_draw_utf8_buf[0] = '\0';
        }
    }
    void drawGlyph(int x, int y, uint16_t glyph) {
        draw_glyph_count++;
        last_draw_glyph_x = x;
        last_draw_glyph_y = y;
        last_draw_glyph_codepoint = glyph;
    }
    void drawXBMP(int x, int y, int w, int h, const uint8_t* bitmap) {
        draw_xbmp_count++;
        last_draw_xbmp_x = x;
        last_draw_xbmp_y = y;
        last_draw_xbmp_w = w;
        last_draw_xbmp_h = h;
        last_draw_xbmp_bitmap = bitmap;
    }
    void drawPixel(int x, int y) {
        draw_pixel_count++;
        last_draw_pixel_x = x;
        last_draw_pixel_y = y;
    }
    void drawCircle(int, int, int, uint8_t = 0x0F) {}
    void drawDisc(int, int, int, uint8_t = 0x0F) {}
    void drawTriangle(int, int, int, int, int, int) {}
    void drawRBox(int x, int y, int w, int h, int r) {
        draw_rbox_count++;
        last_draw_rbox_x = x;
        last_draw_rbox_y = y;
        last_draw_rbox_w = w;
        last_draw_rbox_h = h;
        last_draw_rbox_r = r;
    }
    void drawRFrame(int x, int y, int w, int h, int r) {
        draw_rframe_count++;
        last_draw_rframe_x = x;
        last_draw_rframe_y = y;
        last_draw_rframe_w = w;
        last_draw_rframe_h = h;
        last_draw_rframe_r = r;
    }
    void drawButtonUTF8(int, int, uint8_t, int, int, const char*) {}

    uint8_t getDrawColor() const {
        return last_draw_color;
    }

    void setDrawColor(uint8_t c) {
        last_draw_color = c;
    }

    const uint8_t* getFont() const {
        return last_font;
    }

    void setFont(const uint8_t* font) {
        last_font = font;
    }

    void setFontMode(uint8_t m) {
        last_font_mode = m;
    }
    void setBitmapMode(uint8_t m) {
        last_bitmap_mode = m;
    }
    void setClipWindow(int x0, int y0, int x1, int y1) {
        set_clip_window_count++;
        last_clip_x0 = x0;
        last_clip_y0 = y0;
        last_clip_x1 = x1;
        last_clip_y1 = y1;
    }
    void setMaxClipWindow() {
        max_clip_window_count++;
    }
    void setFontPosTop() {}

    int getStrWidth(const char*) {
        return 0;
    }

    int getUTF8Width(const char* s) {
        if (custom_utf8_width != nullptr) {
            return custom_utf8_width(s);
        }
        return utf8_width_val;
    }

    int getMaxCharWidth() {
        return 0;
    }

    int getMaxCharHeight() {
        return 0;
    }

    int getAscent() {
        return ascent_val;
    }

    int getDescent() {
        return descent_val;
    }

    int getDisplayWidth() const {
        return 128;
    }

    int getDisplayHeight() const {
        return 64;
    }

    void updateDisplayArea(int tx, int ty, int tw, int th) {
        last_tx = tx;
        last_ty = ty;
        last_tw = tw;
        last_th = th;
        update_display_area_count++;
    }
};

#endif // U8G2LIB_H
