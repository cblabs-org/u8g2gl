/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/schema_0_4.cpp
 *
 * Purpose: Control for stale_minor.cpp, written with literals exactly as
 *          generated code for schema 0.4 writes them. It must compile. Without
 *          it, the stale-minor refusal could "pass" because the minor rule
 *          refuses everything at major 0.
 *
 *          Deliberately literal, so a schema bump makes this test fail and
 *          forces whoever bumps the schema to revisit the guard cases. match.cpp
 *          is the durable control that follows the runtime's own macros.
 *
 * Description: Built only by the CTest VersionGuard.SchemaZeroFourCompiles
 *              (EXCLUDE_FROM_ALL); never linked into the test suite.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);

int main() {
    return 0;
}
