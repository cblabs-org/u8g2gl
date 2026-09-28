/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/generated_fixture/support/capacity_probe.h
 *
 * Purpose: Lets a test ask what capacities the **runtime library's own
 *          compilation** saw ([D-21], PR-04 WO4 F5). The binding pool is sized
 *          inside src/u8g2gl_obj.cpp, so a generated header that reached only
 *          the generated units would leave the pool at u8g2gl_config.h's
 *          default and nothing in those units could tell. The probe is compiled
 *          into the same library target as u8g2gl_obj.cpp, with the same flags,
 *          so what it reports is what the pool was sized with.
 *
 * Description: Three accessors, each returning a capacity macro exactly as the
 *              library's translation units expand it.
 *
 * Exported Functions:
 * - u8g2gl_fixture_library_total_bindings():   U8G2GL_MAX_TOTAL_BINDINGS as the library saw it
 * - u8g2gl_fixture_library_bindings_per_obj(): U8G2GL_MAX_BINDINGS_PER_OBJ as the library saw it
 * - u8g2gl_fixture_library_objects_per_screen(): U8G2GL_MAX_OBJECTS_PER_SCREEN as the library saw it
 */
#ifndef U8G2GL_FIXTURE_CAPACITY_PROBE_H
#define U8G2GL_FIXTURE_CAPACITY_PROBE_H

#include <cstdint>

/** @brief U8G2GL_MAX_TOTAL_BINDINGS, as the runtime library's compilation expanded it. */
uint32_t u8g2gl_fixture_library_total_bindings();

/** @brief U8G2GL_MAX_BINDINGS_PER_OBJ, as the runtime library's compilation expanded it. */
uint32_t u8g2gl_fixture_library_bindings_per_obj();

/** @brief U8G2GL_MAX_OBJECTS_PER_SCREEN, as the runtime library's compilation expanded it. */
uint32_t u8g2gl_fixture_library_objects_per_screen();

#endif // U8G2GL_FIXTURE_CAPACITY_PROBE_H
