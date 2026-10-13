// M4 sweep entry: references the generated entry points so the link is real.
// M4_SCREEN is the project's screen name (home | diagnostics).
#include "ui.hpp"  // generated; first, so its capacities precede u8g2gl_config.h

#include <Arduino.h>
#include <U8g2lib.h>

#define M4_CAT_(a, b) a##b
#define M4_CAT(a, b) M4_CAT_(a, b)
#define M4_FN(suffix) M4_CAT(M4_CAT(ui_screen_, M4_SCREEN), suffix)

static U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI display(U8G2_R0, 10, 9, U8X8_PIN_NONE);

void setup() {
    display.begin();
    ui_init();
    M4_FN(_activate)();
}

void loop() {
    M4_FN(_tick)(millis());
    display.clearBuffer();
    M4_FN(_render)(display);
    display.sendBuffer();
}
