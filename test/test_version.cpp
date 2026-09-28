/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_version.cpp
 *
 * Purpose: Checks that the runtime's two version statements agree: the header
 *          macros generated code is checked against, and CMake's project version
 *          used for packaging. Root CMakeLists.txt already refuses to configure
 *          on a mismatch. This test catches the same drift in a build tree that
 *          was configured before the change.
 *
 *          The refusal of a mismatched schema major cannot be tested from
 *          inside a program that compiled. That proof is the pair of
 *          VersionGuard.* CTests in test/CMakeLists.txt.
 *
 * Description: GoogleTest cases for u8g2gl_version.h, plus the guard invoked
 *              with matching arguments at file scope, as a generated header
 *              would use it.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_version.h"

// Exactly how a generated header invokes the guard. If this line stopped
// compiling, every generated project would too.
U8G2GL_REQUIRE_SCHEMA_VERSION(U8G2GL_SCHEMA_VERSION_MAJOR, U8G2GL_SCHEMA_VERSION_MINOR);

TEST(Version, HeaderMatchesCMakeProjectVersion) {
    EXPECT_EQ(U8G2GL_VERSION_MAJOR, U8G2GL_CMAKE_VERSION_MAJOR);
    EXPECT_EQ(U8G2GL_VERSION_MINOR, U8G2GL_CMAKE_VERSION_MINOR);
    EXPECT_EQ(U8G2GL_VERSION_PATCH, U8G2GL_CMAKE_VERSION_PATCH);
}
