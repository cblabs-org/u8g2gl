/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/match.cpp
 *
 * Purpose: Control case for the schema major-version guard. Written the way a
 *          generated header uses the guard, with the runtime's own schema
 *          version, and it must compile. Without this control, the mismatch
 *          case could "pass" just because this harness cannot build anything.
 *
 * Description: Built only by the CTest VersionGuard.MatchingSchemaMajorCompiles
 *              (EXCLUDE_FROM_ALL); never linked into the test suite.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_SCHEMA_VERSION(U8G2GL_SCHEMA_VERSION_MAJOR, U8G2GL_SCHEMA_VERSION_MINOR);

int main() {
    return 0;
}
