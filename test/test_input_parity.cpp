/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_input_parity.cpp
 *
 * Purpose: Holds the two generation targets to one input model (§12, ruling
 *          7): the input fixture's generated firmware and its scene, driven
 *          through one scripted event sequence, must draw the same pixels after
 *          every step, land on the same screen, focus the same element and
 *          reach the same callbacks. Focus that moved one way on the device and
 *          another on the designer canvas would make the preview a lie about
 *          the one thing a static frame cannot show.
 *
 * Description: One program, two passes over the runtime, as
 *              test_editor_parity.cpp runs both targets in one process:
 *              - firmware: test/input_menu/generated/, booted with ui_init(),
 *                driven with ui_dispatch() and drawn with ui_handler() onto
 *                the memory display both Wasm hosts draw on, with real U8G2;
 *                its callbacks are defined here and record what reached them;
 *              - editor: the same project's scene, built by the bridge
 *                (compiled natively, as test_wasm_parity.cpp does), previewed
 *                with setPreview() and driven with dispatchEvent().
 *              The script (test/input_menu/script.json) also says what each
 *              step must leave, so the two passes are checked against it as
 *              well as against each other, and every frame must have lit
 *              pixels. The runtime is compiled with default capacities, like
 *              the editor's, because both targets bind in one process.
 */
#include <gtest/gtest.h>

#include <cstdint>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "ui.hpp"

#include "U8g2lib.h"
#include "memory_display.h"
#include "scene_json.h"
#include "u8g2gl/u8g2gl_button.h"
#include "u8g2gl/u8g2gl_label.h"
#include "u8g2gl/u8g2gl_switch.h"

extern "C" {
int injectFont(const char* name, const uint8_t* bytes, uint32_t length);
void clearInjected();
int applyScene(const char* scene_json_str);
int selectScreen(const char* screen_name);
uint8_t* renderFrame(uint32_t current_ms);
int getBufferSize();
void teardown();
int setPreview(int on);
int dispatchEvent(int event);
const char* getInputState();
const char* getLastError();
}

namespace {

// What one step left, on either target.
struct step_result {
    std::vector<uint8_t> frame;
    std::string screen;
    std::string focused;
    std::vector<std::string> callbacks;  // "<callback> <element> <trigger>"
};

// read_file
std::string read_file(const char* path) {
    std::ifstream file(path);
    std::ostringstream text;
    text << file.rdbuf();
    return text.str();
}

// event_value
// A script's event name as its u8g2gl_event_t, as INPUT_EVENTS spells them.
u8g2gl_event_t event_value(const std::string& name) {
    static const struct { const char* name; u8g2gl_event_t value; } kEvents[] = {
        {"encoder_cw", U8G2GL_EVENT_ENCODER_CW},
        {"encoder_ccw", U8G2GL_EVENT_ENCODER_CCW},
        {"encoder_click", U8G2GL_EVENT_ENCODER_CLICK},
        {"button_press", U8G2GL_EVENT_BUTTON_PRESS},
        {"button_long_press", U8G2GL_EVENT_BUTTON_LONG_PRESS},
        {"encoder_long_click", U8G2GL_EVENT_ENCODER_LONG_CLICK},
        {"button_next", U8G2GL_EVENT_BUTTON_NEXT},
        {"button_prev", U8G2GL_EVENT_BUTTON_PREV},
    };
    for (const auto& event : kEvents) {
        if (name == event.name) {
            return event.value;
        }
    }
    return U8G2GL_EVENT_NONE;
}

// lit
size_t lit(const std::vector<uint8_t>& frame) {
    size_t count = 0;
    for (uint8_t byte : frame) {
        for (; byte != 0; byte = static_cast<uint8_t>(byte >> 1)) {
            count += byte & 1u;
        }
    }
    return count;
}

// font_length
// A compiled U8G2 font table's length, from its own structure, as
// test_wasm_parity.cpp measures it for injection.
uint32_t font_length(const uint8_t* font) {
    const auto word = [font](uint32_t at) -> uint32_t { return (uint32_t(font[at]) << 8) | font[at + 1]; };
    uint32_t at = 23;
    while (font[at + 1] != 0) {
        at += font[at + 1];
    }
    uint32_t table = 23 + word(21);
    uint32_t glyph = table;
    for (;;) {
        glyph += word(table);
        const uint32_t encoding = word(table + 2);
        table += 4;
        if (encoding == 0xffff) {
            break;
        }
    }
    while (word(glyph) != 0) {
        glyph += font[glyph + 2];
    }
    return glyph + 2;
}

// --- Firmware: the callbacks ui.hpp declares, recording what reached them ---

std::vector<std::string> s_firmware_calls;

// name_of
// The firmware handle an object is, by address, for the recorded call.
std::string name_of(const u8g2gl_obj& target) {
    if (&target == &ui_settings_sw_wifi) return "sw_wifi";
    if (&target == &ui_settings_btn_reset) return "btn_reset";
    if (&target == &ui_settings_btn_display) return "btn_display";
    return "?";
}

const char* trigger_text(u8g2gl_trigger_t trigger) {
    return trigger == U8G2GL_TRIGGER_LONG_PRESS      ? "long_press"
           : trigger == U8G2GL_TRIGGER_VALUE_CHANGED ? "value_changed"
                                                     : "press";
}

void record(const char* callback, u8g2gl_obj& target, u8g2gl_trigger_t trigger) {
    s_firmware_calls.push_back(std::string(callback) + " " + name_of(target) + " " + trigger_text(trigger));
}

}  // namespace

void on_wifi_changed(u8g2gl_obj& target, u8g2gl_trigger_t trigger) { record("on_wifi_changed", target, trigger); }
void on_reset(u8g2gl_obj& target, u8g2gl_trigger_t trigger) { record("on_reset", target, trigger); }
void on_factory_reset(u8g2gl_obj& target, u8g2gl_trigger_t trigger) { record("on_factory_reset", target, trigger); }

namespace {

// focused_name
// The firmware element holding focus, by handle.
std::string focused_name() {
    const u8g2gl_obj* focused = u8g2gl_get_focused();
    if (focused == &ui_settings_btn_display) return "btn_display";
    if (focused == &ui_settings_sw_wifi) return "sw_wifi";
    if (focused == &ui_settings_btn_reset) return "btn_reset";
    if (focused == &ui_settings_lbl_about) return "lbl_about";
    if (focused == &ui_display_btn_back) return "btn_back";
    return focused == nullptr ? "" : "?";
}

std::string screen_name() {
    const u8g2gl_screen* active = u8g2gl_get_active_screen();
    return active == &ui_screen_settings ? "settings" : active == &ui_screen_display ? "display" : "";
}

// run_firmware
// The firmware target, as an application runs it: boot, a screen, then
// ui_dispatch() and ui_handler() once per event, keeping each frame.
std::vector<step_result> run_firmware(const scene_json& script) {
    memory_display display;
    std::string error;
    EXPECT_TRUE(display.setup(128, 64, &error)) << error;
    std::vector<step_result> steps;
    const auto keep = [&]() {
        ui_handler(display.u8g2());
        step_result step;
        step.frame.assign(display.buffer(), display.buffer() + display.buffer_size());
        step.screen = screen_name();
        step.focused = focused_name();
        step.callbacks = s_firmware_calls;
        steps.push_back(step);
    };

    ui_init();
    u8g2gl_screen_stack_clear();
    u8g2gl_set_active_screen(&ui_screen_settings);
    keep();
    for (const scene_json& step : script.get("steps").items()) {
        s_firmware_calls.clear();
        ui_dispatch(event_value(step.get("event").as_string()));
        keep();
    }
    // Leave the runtime as the editor pass expects to find it.
    u8g2gl_set_active_screen(nullptr);
    u8g2gl_screen_stack_clear();
    return steps;
}

// state_field
// One string field of getInputState()'s JSON; empty for null.
std::string state_field(const scene_json& state, const char* key) {
    return state.get(key).is_null() ? "" : state.get(key).as_string();
}

// run_editor
// The editor target, as the designer previews it: the scene through the
// bridge, preview on, then dispatchEvent() and renderFrame() once per event.
std::vector<step_result> run_editor(const scene_json& script) {
    std::vector<step_result> steps;
    EXPECT_TRUE(injectFont("u8g2_font_6x10_mr", ui_font_u8g2_font_6x10_mr, font_length(ui_font_u8g2_font_6x10_mr)));
    const std::string scene = read_file(U8G2GL_INPUT_SCENE_PATH);
    if (!applyScene(scene.c_str()) || !selectScreen(script.get("screen").as_string().c_str()) || !setPreview(1)) {
        ADD_FAILURE() << "the editor could not preview the scene: " << getLastError();
        return steps;
    }
    const auto keep = [&]() {
        const uint8_t* frame = renderFrame(0);
        EXPECT_NE(frame, nullptr) << getLastError();
        step_result step;
        if (frame != nullptr) {
            step.frame.assign(frame, frame + getBufferSize());
        }
        std::string parse_error;
        const scene_json state = scene_json_parse(getInputState(), &parse_error);
        step.screen = state_field(state, "screen");
        step.focused = state_field(state, "focused");
        for (const scene_json& call : state.get("callbacks").items()) {
            step.callbacks.push_back(call.get("callback").as_string() + " " + call.get("element").as_string() + " " +
                                     call.get("trigger").as_string());
        }
        steps.push_back(step);
    };
    keep();
    for (const scene_json& step : script.get("steps").items()) {
        EXPECT_GE(dispatchEvent(event_value(step.get("event").as_string())), 0) << getLastError();
        keep();
    }
    setPreview(0);
    teardown();
    clearInjected();
    return steps;
}

}  // namespace

// InputParity.FirmwareAndEditorAgreeAfterEveryStep
// The script, on both targets: identical frames, screens, focus and callbacks
// after every step, each as the script says, and never a blank frame.
TEST(InputParity, FirmwareAndEditorAgreeAfterEveryStep) {
    // --- Step 1: The script ---
    std::string parse_error;
    const scene_json script = scene_json_parse(read_file(U8G2GL_INPUT_SCRIPT_PATH).c_str(), &parse_error);
    ASSERT_TRUE(parse_error.empty()) << parse_error;
    const auto& expected = script.get("steps").items();
    ASSERT_FALSE(expected.empty());

    // --- Step 2: Both targets, one after the other on one runtime ---
    const std::vector<step_result> firmware = run_firmware(script);
    const std::vector<step_result> editor = run_editor(script);
    ASSERT_EQ(firmware.size(), expected.size() + 1);
    ASSERT_EQ(editor.size(), firmware.size());

    // --- Step 3: Every step: the pixels, the screen, focus and callbacks ---
    EXPECT_EQ(firmware[0].focused, "btn_display");  // the ring's first member on activation
    for (size_t i = 0; i < firmware.size(); ++i) {
        SCOPED_TRACE("step " + std::to_string(i) + (i == 0 ? " (boot)" : " (" + expected[i - 1].get("event").as_string() + ")"));
        EXPECT_GT(lit(firmware[i].frame), 0u);
        EXPECT_EQ(editor[i].frame, firmware[i].frame) << "the canvas drew a different frame from the device";
        EXPECT_EQ(editor[i].screen, firmware[i].screen);
        EXPECT_EQ(editor[i].focused, firmware[i].focused);
        EXPECT_EQ(editor[i].callbacks, firmware[i].callbacks);
        if (i == 0) {
            continue;
        }
        const scene_json& want = expected[i - 1];
        EXPECT_EQ(firmware[i].screen, want.get("screen").as_string());
        EXPECT_EQ(firmware[i].focused, want.get("focused").as_string());
        std::vector<std::string> calls;
        for (const scene_json& call : want.get("callbacks").items()) {
            calls.push_back(call.as_string());
        }
        EXPECT_EQ(firmware[i].callbacks, calls);
    }

    // --- Step 4: What the steps changed, in pixels ---
    // Moving focus changes the frame; a press on a stop with no events does
    // not; the toggle changes it; and back restores the settings screen with
    // the toggled switch.
    EXPECT_NE(firmware[1].frame, firmware[0].frame);  // focus moved to the switch
    EXPECT_NE(firmware[2].frame, firmware[1].frame);  // the switch toggled
    EXPECT_NE(firmware[6].frame, firmware[5].frame);  // the about label's focus style drew
    EXPECT_EQ(firmware[7].frame, firmware[6].frame);  // a press on the about label does nothing
    EXPECT_NE(firmware[9].frame, firmware[8].frame);  // the display screen loaded
    EXPECT_EQ(firmware[11].frame, firmware[8].frame); // back: settings, focus on btn_display again
}
