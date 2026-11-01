/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/harness.h
 * Purpose: The contract between the test-run harness (harness.cpp) and the
 *          one unit the design server generates for each project beside the
 *          firmware code: the screen table. The harness runs a project's
 *          generated firmware target as an application would, so it must be
 *          told which screens exist and how large the panel is; the generator
 *          does not emit that table, because an application never needs it,
 *          and the firmware code under test stays exactly what `generate`
 *          writes.
 *
 * Description: The table unit (written by the CLI's test-run build, never by
 *              hand) includes the project's `ui.hpp` and this header, and
 *              defines the four symbols declared here. The harness itself
 *              includes no project header, so one harness source serves every
 *              project.
 *
 * Exported Types:
 * - u8g2gl_harness_screen: a screen's name and its generated descriptor
 *
 * Defined by the screen table unit:
 * - u8g2gl_harness_screens[]:       Every screen, in document order
 * - u8g2gl_harness_screen_count:    How many
 * - u8g2gl_harness_display_width:   The project's panel width in pixels
 * - u8g2gl_harness_display_height:  The project's panel height in pixels
 *
 * Defined by the generated firmware code (§13.7):
 * - ui_init():                      The one call an application makes at boot
 */
#ifndef U8G2GL_WASM_HARNESS_H
#define U8G2GL_WASM_HARNESS_H

#include <cstdint>

#include "u8g2gl/u8g2gl_core.h"

/** One row of the screen table: what the harness can activate. */
struct u8g2gl_harness_screen {
    const char* name;        ///< The screen's name in the project
    u8g2gl_screen* screen;   ///< Its generated descriptor, `ui_screen_<name>`
};

extern const u8g2gl_harness_screen u8g2gl_harness_screens[];
extern const uint8_t u8g2gl_harness_screen_count;
extern const int32_t u8g2gl_harness_display_width;
extern const int32_t u8g2gl_harness_display_height;

// The generated firmware target's boot entry point (§13.7). Declared here,
// not through the project's ui.hpp, so the harness compiles once for every
// project with the same configuration.
void ui_init();

#endif  // U8G2GL_WASM_HARNESS_H
