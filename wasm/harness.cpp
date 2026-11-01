/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/harness.cpp
 * Purpose: The test run's host: it runs a project's generated **firmware**
 *          target, unmodified, the way an application does, on the memory
 *          display the editor bridge also draws on, so its frames can be
 *          compared pixel for pixel with the live canvas's ([D-9]). The live
 *          canvas goes through the editor target (the scene, the registry,
 *          the bridge); this goes through `ui_init()` and `ui_handler()`. A
 *          difference between the two is a framework bug.
 *
 * Description: An application registers a clock, calls `ui_init()`, activates
 *              a screen and calls `ui_handler()` each loop. runScreen() does
 *              exactly that, with a clock it sets to each requested time
 *              before each call, and keeps the display buffer after each
 *              call as that time's frame. A frame `ui_handler()` declined to
 *              redraw (nothing dirty) therefore shows the frame before it, as
 *              the panel would.
 *
 *              `ui_init()` constructs every screen once, and firmware has no
 *              teardown, so one module instance runs one screen from boot:
 *              the caller instantiates the module afresh for each screen. A
 *              second runScreen() is refused rather than run on used state.
 *
 *              Like the bridge, this is Wasm-side plumbing and uses the heap
 *              for its own bookkeeping (the stored frames); the runtime and
 *              the generated code it drives are heap-free as on a device.
 *
 * Exported Functions (extern "C"):
 *     Project:
 *     - getScreenCount():   How many screens the screen table lists
 *     - getScreenName():    One screen's name
 *     - getDisplayWidth():  The panel width in pixels
 *     - getDisplayHeight(): The panel height in pixels
 *     Run:
 *     - runScreen():        Boot, activate a screen, and run the frame loop at given times
 *     - getFrameCount():    Frames the run kept
 *     - getFramePtr():      One kept frame's bytes
 *     - getBufferSize():    A frame's length in bytes
 *     Diagnostics:
 *     - getLastError():     Why the last call failed
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <cstdint>
#include <string>
#include <vector>

#include "U8g2lib.h"
#include "harness.h"
#include "memory_display.h"
#include "u8g2gl/u8g2gl_core.h"

namespace {

memory_display s_display;
std::vector<std::vector<uint8_t>> s_frames;
std::string s_last_error;
bool s_booted = false;

// The clock the firmware code reads through u8g2gl_tick_now(). The harness
// sets it before each ui_handler() call; nothing else moves it, so a run is
// deterministic and independent of how long the host takes.
uint32_t s_now_ms = 0;

// harness_tick
// The registered tick callback: the time runScreen() is rendering.
uint32_t harness_tick() {
    return s_now_ms;
}

}  // namespace

extern "C" {

/** @brief How many screens the project has. */
EMSCRIPTEN_KEEPALIVE
int getScreenCount() {
    return u8g2gl_harness_screen_count;
}

/**
 * @brief One screen's name, in document order.
 * @return The name, or "" for an index out of range. Static storage.
 */
EMSCRIPTEN_KEEPALIVE
const char* getScreenName(int index) {
    if (index < 0 || index >= u8g2gl_harness_screen_count) {
        return "";
    }
    return u8g2gl_harness_screens[index].name;
}

/** @brief The project's panel width in pixels. */
EMSCRIPTEN_KEEPALIVE
int getDisplayWidth() {
    return u8g2gl_harness_display_width;
}

/** @brief The project's panel height in pixels. */
EMSCRIPTEN_KEEPALIVE
int getDisplayHeight() {
    return u8g2gl_harness_display_height;
}

/**
 * @brief Boot the firmware code, activate one screen, and keep a frame at each time.
 *
 * Registers the clock, calls `ui_init()` at t = 0, activates the screen, then
 * for each time sets the clock and calls `ui_handler()`, keeping the buffer.
 *
 * @param index    The screen, as getScreenName() numbers them.
 * @param times_ms Times in milliseconds, non-decreasing; the caller's memory.
 * @param count    How many.
 * @return 1 on success, 0 on failure (getLastError() says why). Only one run
 *         per module instance succeeds: firmware boots once.
 */
EMSCRIPTEN_KEEPALIVE
int runScreen(int index, const uint32_t* times_ms, int count) {
    s_last_error.clear();

    // --- Step 1: Refuse what an application could not do ---
    if (s_booted) {
        s_last_error = "this harness instance has already booted: instantiate it again to run another screen";
        return 0;
    }
    if (index < 0 || index >= u8g2gl_harness_screen_count) {
        s_last_error = "no screen " + std::to_string(index);
        return 0;
    }
    if (count < 0 || (count > 0 && times_ms == nullptr)) {
        s_last_error = "no frame times given";
        return 0;
    }
    for (int i = 1; i < count; ++i) {
        if (times_ms[i] < times_ms[i - 1]) {
            s_last_error = "frame times must not decrease: the firmware's clock only moves forward";
            return 0;
        }
    }

    // --- Step 2: The panel, at the project's size ---
    if (!s_display.setup(u8g2gl_harness_display_width, u8g2gl_harness_display_height, &s_last_error)) {
        return 0;
    }
    U8G2& display = s_display.u8g2();

    // --- Step 3: Boot as an application does: clock, ui_init(), a screen ---
    // At t = 0, the first frame's time, so a timer or animation that reads
    // the clock while it is constructed starts where the live canvas's does.
    s_booted = true;
    s_now_ms = 0;
    u8g2gl_set_tick_cb(harness_tick);
    ui_init();
    u8g2gl_set_active_screen(u8g2gl_harness_screens[index].screen);

    // --- Step 4: The frame loop, keeping the buffer after each call ---
    s_frames.clear();
    s_frames.reserve(static_cast<size_t>(count));
    for (int i = 0; i < count; ++i) {
        s_now_ms = times_ms[i];
        ui_handler(display);
        const uint8_t* buffer = s_display.buffer();
        s_frames.emplace_back(buffer, buffer + s_display.buffer_size());
    }
    return 1;
}

/** @brief How many frames the last run kept. */
EMSCRIPTEN_KEEPALIVE
int getFrameCount() {
    return static_cast<int>(s_frames.size());
}

/**
 * @brief One kept frame, getBufferSize() bytes in U8G2's buffer layout.
 * @return The bytes, owned by the harness, or nullptr for an index out of range.
 */
EMSCRIPTEN_KEEPALIVE
const uint8_t* getFramePtr(int index) {
    if (index < 0 || static_cast<size_t>(index) >= s_frames.size()) {
        return nullptr;
    }
    return s_frames[static_cast<size_t>(index)].data();
}

/** @brief A frame's length in bytes; 0 before a run. */
EMSCRIPTEN_KEEPALIVE
uint32_t getBufferSize() {
    return s_display.buffer_size();
}

/** @brief Why the last call failed; empty when it succeeded. */
EMSCRIPTEN_KEEPALIVE
const char* getLastError() {
    return s_last_error.c_str();
}

}  // extern "C"
