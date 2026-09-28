/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/mismatch.cpp
 *
 * Purpose: Stands in for generated code produced for a different schema major.
 *          It MUST NOT compile. §16 requires the runtime to refuse such code,
 *          and this file is the proof that it does. It differs from match.cpp
 *          only in the major it passes.
 *
 * Description: Built only by the CTest
 *              VersionGuard.MismatchedSchemaMajorFailsToCompile, which passes
 *              only if the build output contains the guard's own message.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_SCHEMA_VERSION(U8G2GL_SCHEMA_VERSION_MAJOR + 1, U8G2GL_SCHEMA_VERSION_MINOR);

int main() {
    return 0;
}
