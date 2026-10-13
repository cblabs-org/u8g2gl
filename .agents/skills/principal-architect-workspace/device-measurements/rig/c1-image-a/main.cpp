// PR-05R WO7 - on-device criterion 1 rig. Test firmware, not product code.
//
// Renders foundation's `connected` diagnostics frame through U8G2GL as a plain
// user: the U8G2 display gets begin() and nothing else before the first frame
// (no setFont, setFontPosTop, setFontRefHeightAll, setFontMode, setDrawColor).
// The frame sequence is ui_handler()'s own (tick, clearBuffer, render_fn,
// sendBuffer), opened up only so the buffer is hashed before sendBuffer(), as
// the host harness reads it (clearBuffer + render, no sendBuffer).
//
// Serial (115200, USB CDC on boot):
//   U8G2GL-DEVICE boot env=<env> runtime=<M.m.p>           before the first frame
//   U8G2GL-DEVICE runtime=<M.m.p> lit=<n> sha256=<64 hex>   after it, then every 5 s
//   U8G2GL-DEVICE row<k>="<subject string>"                 k = 1..4, with each report
// A crash in the first frame shows as repeated boot lines with no report line.

#include "ui.hpp"  // Generated; first, so its capacities precede u8g2gl_config.h

#include <Arduino.h>
#include <SPI.h>
#include <U8g2lib.h>
#include <mbedtls/sha256.h>

#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_version.h"

#ifndef DEVICE_RIG_ENV
#define DEVICE_RIG_ENV "unknown"
#endif

// --- Hardware: foundation hardware/esp32s3nano/board.h ---
static constexpr int kPinCs = 10;
static constexpr int kPinDc = 9;
static constexpr int kPinSck = 48;
static constexpr int kPinMiso = 47;
static constexpr int kPinMosi = 38;

static U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI display(U8G2_R0, kPinCs, kPinDc, U8X8_PIN_NONE);

// --- The `connected` scenario's rows, byte for byte (see the WO7 report) ---
static const char* const kRowHostname = "esp32-foundation";
static const char* const kRowWifi = "MyNetwork \xC2\xB7 192.168.1.42";
static const char* const kRowUptime = "Up: 2h 14m 36s";
static const char* const kRowHeap = "Heap: 278KB  v0.0.12-dev.83";

static char s_sha_hex[65] = {0};
static uint32_t s_lit = 0;
static uint32_t s_last_report_ms = 0;

static uint32_t tickNow() { return static_cast<uint32_t>(millis()); }

static void printVersion() {
    Serial.printf("%d.%d.%d", U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR, U8G2GL_VERSION_PATCH);
}

// Print one row with non-printable bytes escaped as \xNN, so the separator is visible.
static void printRow(int index, const char* text) {
    Serial.printf("U8G2GL-DEVICE row%d=\"", index);
    for (const unsigned char* p = reinterpret_cast<const unsigned char*>(text); *p; ++p) {
        if (*p >= 0x20 && *p < 0x7F && *p != '\\' && *p != '"') {
            Serial.write(*p);
        } else {
            Serial.printf("\\x%02X", *p);
        }
    }
    Serial.println("\"");
}

static void report() {
    Serial.print("U8G2GL-DEVICE runtime=");
    printVersion();
    Serial.printf(" lit=%lu sha256=%s\n", static_cast<unsigned long>(s_lit), s_sha_hex);
    printRow(1, ui_subject_diag_hostname.get());
    printRow(2, ui_subject_diag_wifi.get());
    printRow(3, ui_subject_diag_uptime.get());
    printRow(4, ui_subject_diag_heap.get());
}

void setup() {
    // --- Step 1: Serial, with a short window for the host to attach ---
    Serial.begin(115200);
    const uint32_t start = millis();
    while (!Serial && millis() - start < 3000) {
        delay(10);
    }
    delay(500);
    Serial.printf("U8G2GL-DEVICE boot env=%s runtime=", DEVICE_RIG_ENV);
    printVersion();
    Serial.println();
    Serial.flush();

    // --- Step 2: The display, as foundation brings it up, and begin() only ---
    SPI.begin(kPinSck, kPinMiso, kPinMosi, -1);  // U8G2Display.cpp:123
    display.begin();

    // --- Step 3: U8G2GL: time source, generated UI, subjects, active screen ---
    u8g2gl_set_tick_cb(tickNow);
    ui_init();
    ui_set_diag_hostname(kRowHostname);
    ui_set_diag_wifi(kRowWifi);
    ui_set_diag_uptime(kRowUptime);
    ui_set_diag_heap(kRowHeap);
    u8g2gl_set_active_screen(&ui_screen_diagnostics);

    // --- Step 4: The first frame: ui_handler()'s sequence, hashed before sendBuffer ---
    ui_screen_diagnostics.tick_fn(tickNow());
    display.clearBuffer();
    ui_screen_diagnostics.render_fn(display);

    const uint8_t* buffer = display.getBufferPtr();
    const size_t size = 8u * display.getBufferTileHeight() * display.getBufferTileWidth();
    uint8_t digest[32];
    mbedtls_sha256(buffer, size, digest, 0);
    for (int i = 0; i < 32; ++i) {
        snprintf(&s_sha_hex[i * 2], 3, "%02x", digest[i]);
    }
    for (size_t i = 0; i < size; ++i) {
        s_lit += __builtin_popcount(buffer[i]);
    }

    display.sendBuffer();
    ui_screen_diagnostics.dirty = false;

    // --- Step 5: First report ---
    Serial.printf("U8G2GL-DEVICE buffer_bytes=%u\n", static_cast<unsigned>(size));
    report();
    s_last_report_ms = millis();
}

void loop() {
    // Repeat the first frame's result every 5 s so a capture window catches it.
    if (millis() - s_last_report_ms >= 5000) {
        s_last_report_ms = millis();
        report();
    }
    delay(20);
}
