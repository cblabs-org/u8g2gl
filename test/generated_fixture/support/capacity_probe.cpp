/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/generated_fixture/support/capacity_probe.cpp
 *
 * Purpose: The proof, from inside the library build, that the generated
 *          capacities reached the runtime's own compilation ([D-21], PR-04 WO4
 *          F5). Compiled into u8g2gl_fixture_runtime beside src/u8g2gl_obj.cpp,
 *          with the same U8G2GL_GENERATED_CONFIG definition (§16), so a macro here
 *          expands exactly as it does where s_binding_pool is sized.
 *
 * Description: A static_assert that the pool equals the total the fixture's
 *              bindings add up to, counted by hand below — a second, human count
 *              held against the generator's — and three accessors a test reads
 *              at run time (capacity_probe.h).
 *
 *              If the definition were dropped from the library target, this
 *              file would see u8g2gl_config.h's default (32 x 8 = 256) and stop
 *              compiling here, rather than the fixture quietly running on a pool
 *              the document never asked for.
 */
#include "capacity_probe.h"

#include "u8g2gl/u8g2gl_config.h"

// The fixture's bindings, counted by hand from test/generated_fixture/:
//   home:   bar_location bind_text, bar_wifi_icon bind_flag_if_eq,
//           bar_clock bind_time, msg bind_text                        -> 4
//   gauges: panel bind_flag_if_eq                                      -> 1
//           (level_bar, dial and blip are draw calls: they read their
//            subjects at draw time and take no pool slot, §13.5)
//   bounds: track_readout bind_x, temp bind_text                       -> 2
//           (track_knob and dot are draw calls, as above)
// Total 7. Regenerate and recount together if the fixture changes.
static_assert(U8G2GL_MAX_TOTAL_BINDINGS == 7,
              "The runtime library was not compiled with the generated capacities: "
              "U8G2GL_MAX_TOTAL_BINDINGS is not the fixture's counted total of 7. "
              "Check the U8G2GL_GENERATED_CONFIG definition on "
              "u8g2gl_fixture_runtime in test/CMakeLists.txt.");

// No object in the fixture binds more than once.
static_assert(U8G2GL_MAX_BINDINGS_PER_OBJ == 1,
              "The runtime library was not compiled with the generated per-object binding capacity.");

uint32_t u8g2gl_fixture_library_total_bindings() {
    return U8G2GL_MAX_TOTAL_BINDINGS;
}

uint32_t u8g2gl_fixture_library_bindings_per_obj() {
    return U8G2GL_MAX_BINDINGS_PER_OBJ;
}

uint32_t u8g2gl_fixture_library_objects_per_screen() {
    return U8G2GL_MAX_OBJECTS_PER_SCREEN;
}
