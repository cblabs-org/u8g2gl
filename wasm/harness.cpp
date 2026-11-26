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
 *              call as that time's frame. After `ui_init()` it applies the
 *              selected sample set, if any, as an application applies its
 *              data: the hook (`u8g2gl_harness_apply_sample_set()`) and the
 *              set-selection exports (`getSampleSetCount()`,
 *              `getSampleSetName()`, `selectSampleSet()`) are defined by the
 *              design server's generated unit (sample-set-unit.ts), linked
 *              beside the screen table. A frame `ui_handler()` declined to
 *              redraw (nothing dirty) therefore shows the frame before it, as
 *              the panel would.
 *
 *              `ui_init()` constructs every screen once, and firmware has no
 *              teardown, so one module instance runs one screen from boot:
 *              the caller instantiates the module afresh for each screen. A
 *              second runScreen() is refused rather than run on used state.
 *
 *              runEvents() drives input the same way (§12): after the boot
 *              frame it dispatches each scripted event, as an application
 *              calls ui_dispatch(), then ui_handler(), and keeps that frame
 *              with the screen then active and the callbacks the event
 *              reached. The callbacks are the screen table unit's, which
 *              record themselves here in place of the application's. The
 *              clock stays at 0: the comparison is of what input did, not of
 *              any animation.
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
 *     - runEvents():        Boot, activate a screen, and keep a frame after each input event
 *     - getStepScreen():    The screen active after one event of runEvents()
 *     - getStepCallbacks(): The callbacks one event of runEvents() reached, as JSON
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
#include "u8g2gl/u8g2gl_input.h"

// The sample set the test run checks, applied as an application applies data:
// defined by the design server's sample-set unit beside the screen table, and
// a no-op when the run selects no set.
extern "C" void u8g2gl_harness_apply_sample_set();

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

// What runEvents() kept beside each frame: the screen active after the step,
// as its index in the screen table (-1 for none), and the callbacks it
// reached, as JSON.
std::vector<int> s_step_screens;
std::vector<std::string> s_step_callbacks;
std::string s_callbacks_json;

// active_screen_index
// The active screen's row in the screen table, or -1.
int active_screen_index() {
    const u8g2gl_screen* active = u8g2gl_get_active_screen();
    for (int i = 0; i < u8g2gl_harness_screen_count; ++i) {
        if (u8g2gl_harness_screens[i].screen == active) {
            return i;
        }
    }
    return -1;
}

// boot
// The part of a run both entry points share: refuse a second boot, set the
// panel up, then boot as an application does — clock, ui_init(), the sample
// set, a screen — at t = 0, the first frame's time, so a timer or animation
// that reads the clock while it is constructed starts where the live
// canvas's does.
//   index — the screen to activate
bool boot(int index) {
    if (s_booted) {
        s_last_error = "this harness instance has already booted: instantiate it again to run another screen";
        return false;
    }
    if (index < 0 || index >= u8g2gl_harness_screen_count) {
        s_last_error = "no screen " + std::to_string(index);
        return false;
    }
    if (!s_display.setup(u8g2gl_harness_display_width, u8g2gl_harness_display_height, &s_last_error)) {
        return false;
    }
    s_booted = true;
    s_now_ms = 0;
    u8g2gl_set_tick_cb(harness_tick);
    ui_init();
    u8g2gl_harness_apply_sample_set();
    u8g2gl_set_active_screen(u8g2gl_harness_screens[index].screen);
    return true;
}

// keep_frame
// Draws a frame as the application's loop would and keeps the buffer.
void keep_frame() {
    ui_handler(s_display.u8g2());
    const uint8_t* buffer = s_display.buffer();
    s_frames.emplace_back(buffer, buffer + s_display.buffer_size());
}

}  // namespace


// u8g2gl_harness_record_callback
// Appends one reached callback to the step being run, as JSON: the callback's
// name, the target's index in the active screen's object array, and the
// trigger.
//   callback — the callback's name
//   target   — the element whose event fired
//   trigger  — what fired it
void u8g2gl_harness_record_callback(const char* callback, u8g2gl_obj& target, u8g2gl_trigger_t trigger) {
    const u8g2gl_screen* active = u8g2gl_get_active_screen();
    int object = -1;
    for (uint8_t i = 0; active != nullptr && i < active->obj_count; ++i) {
        if (active->objs[i] == &target) {
            object = i;
        }
    }
    static const char* const kTriggers[] = {"press", "long_press", "value_changed"};
    const char* fired = trigger <= U8G2GL_TRIGGER_VALUE_CHANGED ? kTriggers[trigger] : "press";
    s_callbacks_json += s_callbacks_json.empty() ? "" : ",";
    s_callbacks_json += std::string("{\"callback\":\"") + callback + "\",\"object\":" + std::to_string(object) +
                        ",\"trigger\":\"" + fired + "\"}";
}

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

    // --- Step 2: Boot, at the project's panel size ---
    if (!boot(index)) {
        return 0;
    }

    // --- Step 3: The frame loop, keeping the buffer after each call ---
    s_frames.clear();
    s_frames.reserve(static_cast<size_t>(count));
    for (int i = 0; i < count; ++i) {
        s_now_ms = times_ms[i];
        keep_frame();
    }
    return 1;
}

/**
 * @brief Boot the firmware code, activate one screen, and keep a frame after
 *        each input event (§12).
 *
 * Frame 0 is the boot frame; frame i + 1 follows event i, dispatched as
 * ui_dispatch() does, through the runtime's u8g2gl_dispatch(). Each frame
 * keeps the screen then active (getStepScreen()) and the callbacks its event
 * reached (getStepCallbacks()); frame 0's are the boot screen and none.
 *
 * @param index  The screen, as getScreenName() numbers them.
 * @param events u8g2gl_event_t values; the caller's memory.
 * @param count  How many.
 * @return 1 on success, 0 on failure (getLastError() says why). Only one run
 *         per module instance succeeds: firmware boots once.
 */
EMSCRIPTEN_KEEPALIVE
int runEvents(int index, const uint32_t* events, int count) {
    s_last_error.clear();

    // --- Step 1: Refuse what an application could not do ---
    if (count < 0 || (count > 0 && events == nullptr)) {
        s_last_error = "no events given";
        return 0;
    }
    if (!boot(index)) {
        return 0;
    }

    // --- Step 2: The boot frame, then one frame per event ---
    s_frames.clear();
    s_step_screens.clear();
    s_step_callbacks.clear();
    keep_frame();
    s_step_screens.push_back(active_screen_index());
    s_step_callbacks.emplace_back("[]");
    for (int i = 0; i < count; ++i) {
        s_callbacks_json.clear();
        u8g2gl_dispatch(static_cast<u8g2gl_event_t>(events[i]));
        keep_frame();
        s_step_screens.push_back(active_screen_index());
        s_step_callbacks.push_back("[" + s_callbacks_json + "]");
    }
    return 1;
}

/** @brief The screen table row active after runEvents() frame @p index, or -1. */
EMSCRIPTEN_KEEPALIVE
int getStepScreen(int index) {
    if (index < 0 || static_cast<size_t>(index) >= s_step_screens.size()) {
        return -1;
    }
    return s_step_screens[static_cast<size_t>(index)];
}

/**
 * @brief The callbacks runEvents() frame @p index's event reached, as a JSON
 *        array of `{ callback, object, trigger }`; "[]" out of range.
 */
EMSCRIPTEN_KEEPALIVE
const char* getStepCallbacks(int index) {
    if (index < 0 || static_cast<size_t>(index) >= s_step_callbacks.size()) {
        return "[]";
    }
    return s_step_callbacks[static_cast<size_t>(index)].c_str();
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
