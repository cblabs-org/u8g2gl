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
        clear_count++;
    }

    void sendBuffer() {
        send_count++;
    }

    void drawHLine(int x, int y, int w) {
        draw_hline_count++;
        last_draw_hline_x = x;
        last_draw_hline_y = y;
        last_draw_hline_w = w;
    }
    void drawVLine(int x, int y, int h) {
        draw_vline_count++;
        last_draw_vline_x = x;
        last_draw_vline_y = y;
        last_draw_vline_h = h;
    }
    void drawLine(int x1, int y1, int x2, int y2) {
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
    void drawCircle(int x, int y, int r, uint8_t option = 0x0F) {
        draw_circle_count++;
        last_draw_circle_x = x;
        last_draw_circle_y = y;
        last_draw_circle_r = r;
        last_draw_circle_option = option;
    }
    void drawDisc(int x, int y, int r, uint8_t option = 0x0F) {
        draw_disc_count++;
        last_draw_disc_x = x;
        last_draw_disc_y = y;
        last_draw_disc_r = r;
        last_draw_disc_option = option;
    }
    void drawTriangle(int x0, int y0, int x1, int y1, int x2, int y2) {
        draw_triangle_count++;
        last_draw_triangle_x0 = x0;
        last_draw_triangle_y0 = y0;
        last_draw_triangle_x1 = x1;
        last_draw_triangle_y1 = y1;
        last_draw_triangle_x2 = x2;
        last_draw_triangle_y2 = y2;
    }
    void drawEllipse(int x, int y, int rx, int ry, uint8_t option = 0x0F) {
        draw_ellipse_count++;
        last_draw_ellipse_x = x;
        last_draw_ellipse_y = y;
        last_draw_ellipse_rx = rx;
        last_draw_ellipse_ry = ry;
        last_draw_ellipse_option = option;
    }
    void drawFilledEllipse(int x, int y, int rx, int ry, uint8_t option = 0x0F) {
        draw_filled_ellipse_count++;
        last_draw_filled_ellipse_x = x;
        last_draw_filled_ellipse_y = y;
        last_draw_filled_ellipse_rx = rx;
        last_draw_filled_ellipse_ry = ry;
        last_draw_filled_ellipse_option = option;
    }
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
