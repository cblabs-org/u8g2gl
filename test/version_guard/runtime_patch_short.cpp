/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_patch_short.cpp
 *
 * Purpose: Stands in for generated code that needs API added in the next
 *          runtime patch, built against this one. Runtime PATCH goes up once
 *          per merged pull request and can carry new API
 *          (.agents/rules/03-versioning.md), so this MUST NOT compile, and the
 *          refusal must name both versions (§16). It is the case a floor on
 *          MAJOR.MINOR alone would wrongly accept.
 *
 * Description: Built only by the CTest VersionGuard.RuntimeOnePatchShortFailsToCompile,
 *              which passes only if the build output contains the guard's own
 *              message. The floor is one patch above this runtime's, written as
 *              an expression so it needs no editing at a version bump.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_RUNTIME_AT_LEAST(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR, U8G2GL_VERSION_PATCH + 1);

int main() {
    return 0;
}
