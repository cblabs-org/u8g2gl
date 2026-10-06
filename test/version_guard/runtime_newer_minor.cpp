/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_newer_minor.cpp
 *
 * Purpose: Stands in for code generated against an older runtime, built
 *          against this newer one. It MUST compile: the runtime requirement is
 *          a floor, so a newer minor satisfies it (§16). This is the case that
 *          distinguishes a floor from the schema's equality.
 *
 * Description: Built only by the CTest VersionGuard.NewerRuntimeMinorCompiles.
 *              The floor is one minor below this runtime's, so it is only
 *              meaningful while the minor is above 0; the static_assert below
 *              fails the build, rather than silently testing nothing, if it is not.
 */
#include "u8g2gl/u8g2gl_version.h"

static_assert(U8G2GL_VERSION_MINOR >= 1, "this case needs a runtime minor to step below");

U8G2GL_REQUIRE_RUNTIME_VERSION(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR - 1);

int main() {
    return 0;
}
