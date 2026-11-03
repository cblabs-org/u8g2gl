/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_at_least_newer.cpp
 *
 * Purpose: Stands in for code generated against an older runtime, built
 *          against this newer one. It MUST compile: the requirement is a floor
 *          (§16), so a newer patch satisfies it, and so does a newer minor
 *          whatever the floor's patch, because the minor is compared first.
 *
 * Description: Built only by the CTest VersionGuard.NewerRuntimeAtLeastCompiles.
 *              Both floors are expressions, so the file needs no editing at a
 *              version bump. The second steps one minor below this runtime's,
 *              so it is only meaningful while the minor is above 0; the
 *              static_assert fails the build, rather than silently testing
 *              nothing, if it is not.
 */
#include "u8g2gl/u8g2gl_version.h"

static_assert(U8G2GL_VERSION_MINOR >= 1, "this case needs a runtime minor to step below");

// A floor one patch below this runtime's (at patch 0, the floor's -1 is still below).
U8G2GL_REQUIRE_RUNTIME_AT_LEAST(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR, U8G2GL_VERSION_PATCH - 1);

// An older minor with a higher patch: the minor decides.
U8G2GL_REQUIRE_RUNTIME_AT_LEAST(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR - 1, U8G2GL_VERSION_PATCH + 9);

int main() {
    return 0;
}
