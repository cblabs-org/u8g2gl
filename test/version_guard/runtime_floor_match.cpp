/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_floor_match.cpp
 *
 * Purpose: Control for the runtime floor. Written the way a generated header
 *          uses the guard, with the floor equal to this runtime's own
 *          major.minor, and it must compile. Without it, the refusal cases
 *          could "pass" just because this harness cannot build anything.
 *
 * Description: Built only by the CTest VersionGuard.RuntimeFloorMatchCompiles
 *              (EXCLUDE_FROM_ALL); never linked into the test suite.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_RUNTIME_VERSION(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR);

int main() {
    return 0;
}
