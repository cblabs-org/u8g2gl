// device-measurements WO1 - image B1: M2, SPI transfer time (Q-14 on SPI). Test firmware.
//
// What is measured: the time U8G2 spends in the SPI transfer to the SSD1322 for
//   T_full   sendBuffer()                          - the whole 256x64 frame
//   T_tiles  u8g2gl_partial_refresh(uptime bounds) - the tile rectangle of ONE label
//   T_render clearBuffer() + screen render, no send - for context (share of a frame)
//   T_change set uptime subject to a different string, tick, clear, render, partial
//            refresh of the label's tiles           - the realistic one-label-changes frame
// Method: esp_timer_get_time() (us), WARMUP=5 untimed + N=200 timed reps each, nothing
// printed inside a timed loop. Blocking SPI, so the elapsed time is the transfer time.
//
// The frame is foundation's `connected` diagnostics screen, rows byte for byte as image A,
// drawn by a plain user (U8G2 begin() only). Its buffer lit/sha256 are printed BEFORE any
// timing and must equal image A's lit=1405 sha256=b9042618...f62d, proving the same frame.
//
// The "one changed label" is row 3, the uptime label (screen object index 2). Its bounds
// are read from the generated object (get_x/y/w/h). An in-place text change has the same
// previous bounds, so the union of previous and new bounds is the label's own bounds.
// u8g2gl_partial_refresh() (u8g2gl_helpers.h) does the pixel-to-tile conversion inside and
// does not expose the tile numbers, so tx,ty,tw,th below are the same formula restated
// (helpers.h Step 2) for reporting; the timed call is the helper itself.
//
// Serial (115200, USB CDC on boot), lines tagged "U8G2GL-M2 ", key=value pairs, summary
// printed once after the measurement and then reprinted every 5 s, ending "U8G2GL-M2 end".

#include "ui.hpp"  // Generated; first, so its capacities precede u8g2gl_config.h

#include <Arduino.h>
#include <SPI.h>
#include <U8g2lib.h>
#include <esp_timer.h>
#include <mbedtls/sha256.h>

#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_helpers.h"
#include "u8g2gl/u8g2gl_version.h"

static constexpr int kPinCs = 10;
static constexpr int kPinDc = 9;
static constexpr int kPinSck = 48;
static constexpr int kPinMiso = 47;
static constexpr int kPinMosi = 38;

static U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI display(U8G2_R0, kPinCs, kPinDc, U8X8_PIN_NONE);

static const char* const kRowHostname = "esp32-foundation";
static const char* const kRowWifi = "MyNetwork \xC2\xB7 192.168.1.42";
static const char* const kRowUptime = "Up: 2h 14m 36s";
static const char* const kRowUptimeAlt = "Up: 2h 14m 37s";  // same width class, different digits
static const char* const kRowHeap = "Heap: 278KB  v0.0.12-dev.83";

static constexpr int kWarmup = 5;
static constexpr int kReps = 200;
static constexpr int kUptimeIndex = 2;  // object index of ui_obj_uptime in the screen

static uint32_t tickNow() { return static_cast<uint32_t>(millis()); }

struct Stats {
    uint32_t n = 0, min = 0, median = 0, p95 = 0, max = 0;
};
struct Series {
    const char* name;
    Stats st;
};
static Series s_series[4] = {{"full", {}}, {"tiles", {}}, {"render", {}}, {"change", {}}};
static uint32_t s_samples[kReps];

static char s_sha_hex[65] = {0};
static uint32_t s_lit = 0;
static uint32_t s_buffer_bytes = 0;
static uint32_t s_bus_hz = 0;
static int s_px_x, s_px_y, s_px_w, s_px_h;
static int s_tx, s_ty, s_tw, s_th;
static uint32_t s_bytes_full = 0, s_bytes_part = 0, s_bytes_tile1 = 0;
static uint32_t s_last_report_ms = 0;

static void printVersion() {
    Serial.printf("%d.%d.%d", U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR, U8G2GL_VERSION_PATCH);
}

// Sort the samples (insertion sort; n=200) and reduce to min/median/p95/max.
// median = sorted[n/2]; p95 = sorted[ceil(0.95*n)-1] (nearest rank).
static Stats reduce(uint32_t* a, uint32_t n) {
    for (uint32_t i = 1; i < n; ++i) {
        uint32_t v = a[i];
        uint32_t j = i;
        while (j > 0 && a[j - 1] > v) {
            a[j] = a[j - 1];
            --j;
        }
        a[j] = v;
    }
    Stats s;
    s.n = n;
    s.min = a[0];
    s.median = a[n / 2];
    s.p95 = a[(n * 95 + 99) / 100 - 1];
    s.max = a[n - 1];
    return s;
}

static void hashBuffer() {
    const uint8_t* buffer = display.getBufferPtr();
    const size_t size = 8u * display.getBufferTileHeight() * display.getBufferTileWidth();
    s_buffer_bytes = static_cast<uint32_t>(size);
    uint8_t digest[32];
    mbedtls_sha256(buffer, size, digest, 0);
    for (int i = 0; i < 32; ++i) {
        snprintf(&s_sha_hex[i * 2], 3, "%02x", digest[i]);
    }
    s_lit = 0;
    for (size_t i = 0; i < size; ++i) {
        s_lit += __builtin_popcount(buffer[i]);
    }
}

static void renderFrame() {
    ui_screen_diagnostics.tick_fn(tickNow());
    display.clearBuffer();
    ui_screen_diagnostics.render_fn(display);
}

// One timed series. `which` selects the operation; warm-up reps run untimed first.
static void runSeries(int which) {
    bool alt = false;
    for (int i = 0; i < kWarmup + kReps; ++i) {
        int64_t t0 = 0, t1 = 0;
        switch (which) {
            case 0:
                t0 = esp_timer_get_time();
                display.sendBuffer();
                t1 = esp_timer_get_time();
                break;
            case 1:
                t0 = esp_timer_get_time();
                u8g2gl_partial_refresh(display, s_px_x, s_px_y, s_px_w, s_px_h);
                t1 = esp_timer_get_time();
                break;
            case 2:
                t0 = esp_timer_get_time();
                display.clearBuffer();
                ui_screen_diagnostics.render_fn(display);
                t1 = esp_timer_get_time();
                break;
            case 3:
                alt = !alt;
                t0 = esp_timer_get_time();
                ui_set_diag_uptime(alt ? kRowUptimeAlt : kRowUptime);
                ui_screen_diagnostics.tick_fn(tickNow());
                display.clearBuffer();
                ui_screen_diagnostics.render_fn(display);
                u8g2gl_partial_refresh(display, s_px_x, s_px_y, s_px_w, s_px_h);
                t1 = esp_timer_get_time();
                break;
        }
        if (i >= kWarmup) {
            s_samples[i - kWarmup] = static_cast<uint32_t>(t1 - t0);
        }
    }
    s_series[which].st = reduce(s_samples, kReps);
}

static void report() {
    Serial.print("U8G2GL-M2 runtime=");
    printVersion();
    Serial.printf(" buffer_bytes=%lu lit=%lu sha256=%s\n", (unsigned long)s_buffer_bytes,
                  (unsigned long)s_lit, s_sha_hex);
    Serial.printf("U8G2GL-M2 method clock=esp_timer_get_time unit=us warmup=%d reps=%d "
                  "p95=nearest_rank blocking_spi=1\n", kWarmup, kReps);
    Serial.printf("U8G2GL-M2 bus sck_clock_hz=%lu\n", (unsigned long)s_bus_hz);
    Serial.printf("U8G2GL-M2 label=uptime obj_index=%d px_x=%d px_y=%d px_w=%d px_h=%d\n",
                  kUptimeIndex, s_px_x, s_px_y, s_px_w, s_px_h);
    Serial.printf("U8G2GL-M2 tiles tx=%d ty=%d tw=%d th=%d tile_count=%d full_tile_count=%d\n",
                  s_tx, s_ty, s_tw, s_th, s_tw * s_th, 32 * 8);
    Serial.printf("U8G2GL-M2 wire_bytes full=%lu partial=%lu one_tile=%lu "
                  "(per tile 4 cmd/arg + 32 data; per tile row 3 cmd/arg)\n",
                  (unsigned long)s_bytes_full, (unsigned long)s_bytes_part,
                  (unsigned long)s_bytes_tile1);
    for (int k = 0; k < 4; ++k) {
        const Stats& s = s_series[k].st;
        Serial.printf("U8G2GL-M2 T_%s n=%lu unit=us min=%lu median=%lu p95=%lu max=%lu\n",
                      s_series[k].name, (unsigned long)s.n, (unsigned long)s.min,
                      (unsigned long)s.median, (unsigned long)s.p95, (unsigned long)s.max);
    }
    Serial.println("U8G2GL-M2 end");
}

void setup() {
    // --- Step 1: Serial, with a short window for the host to attach ---
    Serial.begin(115200);
    const uint32_t start = millis();
    while (!Serial && millis() - start < 3000) {
        delay(10);
    }
    delay(500);
    Serial.print("U8G2GL-M2 boot env=m2 runtime=");
    printVersion();
    Serial.println();
    Serial.flush();

    // --- Step 2: Display, as image A: begin() only ---
    SPI.begin(kPinSck, kPinMiso, kPinMosi, -1);
    display.begin();
    s_bus_hz = display.getU8x8()->display_info->sck_clock_hz;

    // --- Step 3: UI, rows as image A ---
    u8g2gl_set_tick_cb(tickNow);
    ui_init();
    ui_set_diag_hostname(kRowHostname);
    ui_set_diag_wifi(kRowWifi);
    ui_set_diag_uptime(kRowUptime);
    ui_set_diag_heap(kRowHeap);
    u8g2gl_set_active_screen(&ui_screen_diagnostics);

    // --- Step 4: The frame, hashed before any send or timing ---
    renderFrame();
    hashBuffer();
    display.sendBuffer();
    ui_screen_diagnostics.dirty = false;

    // --- Step 5: The label's bounds, from the generated object, and its tiles ---
    const u8g2gl_obj* obj = ui_screen_diagnostics.objs[kUptimeIndex];
    s_px_x = obj->get_x();
    s_px_y = obj->get_y();
    s_px_w = obj->get_w();
    s_px_h = obj->get_h();
    // u8g2gl_partial_refresh()'s own conversion (helpers.h Step 2), restated for reporting.
    s_tx = s_px_x / 8;
    s_ty = s_px_y / 8;
    s_tw = ((s_px_x % 8) + s_px_w + 7) / 8;
    s_th = ((s_px_y % 8) + s_px_h + 7) / 8;

    // --- Step 6: Wire bytes, from the driver's DRAW_TILE (u8x8_d_ssd1322.c) ---
    // Per tile row: 0x75,y,y+7 = 3 bytes. Per 8x8 tile: 0x15,x,x+1,0x5c = 4 bytes plus
    // 32 data bytes (8 buffer bytes expanded to 4 bpp: 8 px x 8 rows / 2).
    const uint32_t per_tile = 4 + 32;
    s_bytes_full = 8u * (3 + 32u * per_tile);
    s_bytes_part = static_cast<uint32_t>(s_th) * (3 + static_cast<uint32_t>(s_tw) * per_tile);
    s_bytes_tile1 = 3 + per_tile;

    // --- Step 7: The four series; each leaves the frame as it found it ---
    runSeries(0);
    runSeries(1);
    runSeries(2);
    runSeries(3);

    ui_set_diag_uptime(kRowUptime);
    renderFrame();
    display.sendBuffer();

    report();
    s_last_report_ms = millis();
}

void loop() {
    if (millis() - s_last_report_ms >= 5000) {
        s_last_report_ms = millis();
        report();
    }
    delay(20);
}
