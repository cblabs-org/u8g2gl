// device-measurements WO1 - image B3: M1C, clock-only deadline test. Test firmware.
// Screen: one HH:MM:SS clock (blink on), no ticker, no other animated widget.
// Phase D1 (30 s, blink=true) and D2 (30 s, blink=false via set_blink(false) at runtime):
//   d = ui_handler(); delay(min(d, 1000)); the app writes the time subject once per loop
//   pass (epoch = kBaseEpoch + esp_timer/1e6, the same clock as millis()/1000 in B2).
// Measured per second boundary: latency from the boundary instant (esp_timer multiple of
// 1e6 us) to the END of the ui_handler() call whose buffer first shows the new second
// (the pass that wrote it; shown = buffer changed and clock.get_time()==new epoch).
// Also: skipped seconds, deadline histogram, call durations. Nothing printed in a loop.
// Serial (115200, USB CDC on boot), tag "U8G2GL-M1C ", ends "U8G2GL-M1C end".
#include "ui.hpp"

#include <Arduino.h>
#include <SPI.h>
#include <U8g2lib.h>
#include <esp_timer.h>
#include <string.h>

#include "u8g2gl/u8g2gl_clock.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_version.h"

static constexpr int kPinCs = 10, kPinDc = 9, kPinSck = 48, kPinMiso = 47, kPinMosi = 38;
static U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI display(U8G2_R0, kPinCs, kPinDc, U8X8_PIN_NONE);

static constexpr uint32_t kPhaseMs = 30000;
static constexpr uint32_t kCapMs = 1000;
static constexpr uint32_t kBaseEpoch = 12u * 3600u + 34u * 60u + 56u;
static constexpr size_t kBuf = 2048;
static constexpr uint32_t kMaxN = 40;

static u8g2gl_clock* s_clock = nullptr;
static uint8_t s_prev[kBuf];
static uint32_t tickNow() { return static_cast<uint32_t>(millis()); }

enum { kB = 11 };
static const char* const kBN[kB] = {"0", "1_4", "5_9", "10_14", "15_19", "20_24", "25",
                                    "26_99", "100_499", "500_plus", "idle"};
static int bucketOf(uint32_t d) {
    if (d == U8G2GL_IDLE) return 10;
    if (d == 0) return 0;
    if (d < 5) return 1;
    if (d < 10) return 2;
    if (d < 15) return 3;
    if (d < 20) return 4;
    if (d < 25) return 5;
    if (d == 25) return 6;
    if (d < 100) return 7;
    if (d < 500) return 8;
    return 9;
}

struct Res {
    const char* name = "";
    bool blink = false;
    uint32_t calls = 0, sent = 0, changed = 0, hist[kB] = {0};
    uint32_t cap_hits = 0, idle_returns = 0;
    uint32_t lat_n = 0, not_shown = 0, skipped = 0;
    uint32_t lat_ms[kMaxN];        // latency per boundary, ms (rounded down), sorted at the end
    uint32_t lat_min = 0, lat_med = 0, lat_p95 = 0, lat_max = 0;
    uint32_t call_max_us = 0;
    uint64_t call_sum_us = 0;
    uint32_t colon_toggles = 0;
};
static Res s_r[2];
static const char* s_ver = "";

static void runPhase(Res& r, const char* name, bool blink) {
    r.name = name;
    r.blink = blink;
    s_clock->set_blink(blink);
    Serial.printf("U8G2GL-M1C phase=%s start blink=%d duration_ms=%lu (clock only; delay(min(deadline,%lu)))\n",
                  name, blink ? 1 : 0, (unsigned long)kPhaseMs, (unsigned long)kCapMs);
    Serial.flush();
    const int64_t t_begin = esp_timer_get_time();
    uint32_t last_shown = 0;
    bool have_last = false;
    while (esp_timer_get_time() - t_begin < static_cast<int64_t>(kPhaseMs) * 1000) {
        // --- write the time subject once per pass ---
        const int64_t now_us = esp_timer_get_time();
        const uint32_t e = kBaseEpoch + static_cast<uint32_t>(now_us / 1000000);
        const bool new_second = (e != ui_subject_clock_time.get());
        const int64_t boundary_us = (now_us / 1000000) * 1000000;
        if (new_second) ui_subject_clock_time.set(e);

        const bool colon_before = s_clock->is_colon_visible();
        const uint32_t d = ui_handler(display);
        const int64_t t_ret = esp_timer_get_time();
        const uint32_t us = static_cast<uint32_t>(t_ret - now_us);

        const uint8_t* buf = display.getBufferPtr();
        const bool changed = memcmp(buf, s_prev, kBuf) != 0;
        if (changed) memcpy(s_prev, buf, kBuf);
        r.calls++;
        if (us > 2000) r.sent++;
        if (changed) r.changed++;
        r.call_sum_us += us;
        if (us > r.call_max_us) r.call_max_us = us;
        r.hist[bucketOf(d)]++;
        if (s_clock->is_colon_visible() != colon_before) r.colon_toggles++;

        if (new_second) {
            const bool shown = changed && s_clock->get_time() == e;
            if (!shown) {
                r.not_shown++;
            } else {
                if (have_last && e - last_shown > 1) r.skipped += e - last_shown - 1;
                last_shown = e;
                have_last = true;
                if (r.lat_n < kMaxN) r.lat_ms[r.lat_n++] = static_cast<uint32_t>((t_ret - boundary_us) / 1000);
            }
        }
        if (d == U8G2GL_IDLE) r.idle_returns++;
        const uint32_t wait = (d == U8G2GL_IDLE || d > kCapMs) ? kCapMs : d;
        if (wait != d) r.cap_hits++;
        delay(wait);
    }
    // --- reduce ---
    uint32_t* a = r.lat_ms;
    const uint32_t n = r.lat_n;
    for (uint32_t i = 1; i < n; ++i) {
        uint32_t v = a[i], j = i;
        while (j > 0 && a[j - 1] > v) { a[j] = a[j - 1]; --j; }
        a[j] = v;
    }
    if (n) {
        r.lat_min = a[0]; r.lat_med = a[n / 2]; r.lat_max = a[n - 1];
        r.lat_p95 = a[(n * 95 + 99) / 100 - 1];
    }
}

static void printRes(const Res& r) {
    Serial.printf("U8G2GL-M1C phase=%s blink=%d calls=%lu sent=%lu changed=%lu call_us_mean=%lu "
                  "call_us_max=%lu colon_toggles=%lu\n",
                  r.name, r.blink ? 1 : 0, (unsigned long)r.calls, (unsigned long)r.sent,
                  (unsigned long)r.changed, (unsigned long)(r.calls ? r.call_sum_us / r.calls : 0),
                  (unsigned long)r.call_max_us, (unsigned long)r.colon_toggles);
    Serial.printf("U8G2GL-M1C phase=%s deadline_hist_ms", r.name);
    for (int i = 0; i < kB; ++i) Serial.printf(" %s=%lu", kBN[i], (unsigned long)r.hist[i]);
    Serial.printf(" cap_ms=%lu cap_hits=%lu idle_returns=%lu\n", (unsigned long)kCapMs,
                  (unsigned long)r.cap_hits, (unsigned long)r.idle_returns);
    Serial.printf("U8G2GL-M1C phase=%s second_latency n=%lu unit=ms min=%lu median=%lu p95=%lu "
                  "max=%lu (boundary to end of the ui_handler() call that first drew the new "
                  "second) not_shown=%lu skipped_seconds=%lu\n",
                  r.name, (unsigned long)r.lat_n, (unsigned long)r.lat_min, (unsigned long)r.lat_med,
                  (unsigned long)r.lat_p95, (unsigned long)r.lat_max, (unsigned long)r.not_shown,
                  (unsigned long)r.skipped);
}
static void printAll() {
    Serial.printf("U8G2GL-M1C runtime=%s schema=0.4 generator=0.12.0 clock=esp_timer_get_time\n", s_ver);
    printRes(s_r[0]);
    printRes(s_r[1]);
    Serial.println("U8G2GL-M1C end");
}

static uint32_t s_last = 0;
void setup() {
    Serial.begin(115200);
    const uint32_t t = millis();
    while (!Serial && millis() - t < 3000) delay(10);
    delay(500);
    static char ver[16];
    snprintf(ver, sizeof(ver), "%d.%d.%d", U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR, U8G2GL_VERSION_PATCH);
    s_ver = ver;
    Serial.printf("U8G2GL-M1C boot env=m1c runtime=%s\n", ver);
    Serial.flush();
    SPI.begin(kPinSck, kPinMiso, kPinMosi, -1);
    display.begin();
    u8g2gl_set_tick_cb(tickNow);
    ui_init();
    s_clock = static_cast<u8g2gl_clock*>(ui_screen_measure.objs[0]);
    ui_subject_clock_time.set(kBaseEpoch);
    u8g2gl_set_active_screen(&ui_screen_measure);
    ui_handler(display);
    memcpy(s_prev, display.getBufferPtr(), kBuf);
    runPhase(s_r[0], "D1", true);
    runPhase(s_r[1], "D2", false);
    printAll();
    s_last = millis();
}
void loop() {
    if (millis() - s_last >= 5000) { s_last = millis(); printAll(); }
    delay(20);
}
