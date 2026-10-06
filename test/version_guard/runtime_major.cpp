/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_major.cpp
 *
 * Purpose: Stands in for generated code that needs a different runtime major.
 *          It MUST NOT compile: a floor is compared on the minor only when the
 *          major is equal (§16), so a higher floor major is never satisfied.
 *
 * Description: Built only by the CTest VersionGuard.MismatchedRuntimeMajorFailsToCompile,
 *              which passes only if the build output contains the guard's own
 *              message. The minor is this runtime's own, so the major alone
 *              causes the refusal.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_RUNTIME_VERSION(U8G2GL_VERSION_MAJOR + 1, U8G2GL_VERSION_MINOR);

int main() {
    return 0;
}
