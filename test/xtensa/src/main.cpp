#include <Arduino.h>
#include <U8g2lib.h>
#include "ui.hpp"

// Display driver matching hardware targets (SSD1322 256x64 SPI)
static U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI display(U8G2_R0, 10, 9, U8X8_PIN_NONE);

void setup() {
    display.begin();
    ui_init();
    ui_screen_home_activate();
}

void loop() {
    ui_screen_home_tick(millis());
    display.clearBuffer();
    ui_screen_home_render(display);
    display.sendBuffer();
}
