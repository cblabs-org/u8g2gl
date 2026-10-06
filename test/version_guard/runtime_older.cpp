/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/runtime_older.cpp
 *
 * Purpose: Stands in for generated code that needs a newer runtime than the
 *          one in use: the user who upgraded the CLI and forgot the library. It
 *          MUST NOT compile, and the refusal must name both versions (§16).
 *
 * Description: Built only by the CTest VersionGuard.OlderRuntimeFailsToCompile,
 *              which passes only if the build output contains the guard's own
 *              message. The floor is one minor above this runtime's, written as
 *              an expression so it needs no editing at a version bump.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_RUNTIME_VERSION(U8G2GL_VERSION_MAJOR, U8G2GL_VERSION_MINOR + 1);

int main() {
    return 0;
}
