#ifndef U8G2LIB_H
#define U8G2LIB_H

#include <cstdint>

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

    void clearBuffer() {
        clear_count++;
    }

    void sendBuffer() {
        send_count++;
    }

    void drawHLine(int, int, int) {}
    void drawVLine(int, int, int) {}
    void drawLine(int, int, int, int) {}
    void drawBox(int, int, int, int) {}
    void drawFrame(int, int, int, int) {}
    void drawStr(int, int, const char*) {}
    void drawUTF8(int, int, const char*) {}
    void drawGlyph(int, int, uint16_t) {}
    void drawXBMP(int, int, int, int, const uint8_t*) {}
    void drawPixel(int, int) {}
    void drawCircle(int, int, int, uint8_t = 0x0F) {}
    void drawDisc(int, int, int, uint8_t = 0x0F) {}
    void drawTriangle(int, int, int, int, int, int) {}
    void drawRBox(int, int, int, int, int) {}
    void drawRFrame(int, int, int, int, int) {}
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

    void setFontMode(uint8_t) {}
    void setBitmapMode(uint8_t) {}
    void setClipWindow(int, int, int, int) {}
    void setMaxClipWindow() {}
    void setFontPosTop() {}

    int getStrWidth(const char*) {
        return 0;
    }

    int getUTF8Width(const char*) {
        return 0;
    }

    int getMaxCharWidth() {
        return 0;
    }

    int getMaxCharHeight() {
        return 0;
    }

    int getAscent() {
        return 0;
    }

    int getDescent() {
        return 0;
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
