/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_at_least_match.cpp
 *
 * Purpose: Control for the PATCH-aware runtime floor. Written the way a
 *          generated header uses it, with the floor equal to this runtime's
 *          own major.minor.patch, and it must compile. Without it, the patch
 *          refusal could "pass" just because this harness cannot build
 *          anything.
 *
 * Description: Built only by the CTest VersionGuard.RuntimeAtLeastMatchCompiles
 *              (EXCLUDE_FROM_ALL); never linked into the test suite.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_RUNTIME_AT_LEAST(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR, U8G2GL_VERSION_PATCH);

int main() {
    return 0;
}
