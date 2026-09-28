/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_smoke.cpp
 * Purpose: The build's canary. It asserts the handful of facts every other
 *          suite silently depends on — that the sentinel constants and enum
 *          values still have the numeric values generated code and the flag
 *          bitmask were written against, and that the host U8G2 test double
 *          compiles and records a call. If this suite fails, nothing else in
 *          test/ is worth reading yet.
 *
 * Description: Four tests: the U8G2GL_* sentinels and flag bits; the align and
 *              colour enumerators, whose numeric order the generated
 *              `U8G2GL_ALIGN_*` emission relies on; u8g2gl_min()'s saturating
 *              behaviour at U8G2GL_IDLE; and a construct-and-draw round trip
 *              through the stub.
 */
#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_config.h"
#include "U8g2lib.h"

TEST(Smoke, TypeConstants) {
    EXPECT_EQ(U8G2GL_IDLE, UINT32_MAX);
    EXPECT_EQ(U8G2GL_NO_PARENT, UINT8_MAX);
    EXPECT_EQ(U8G2GL_FLAG_HIDDEN, 0x01);
    EXPECT_EQ(U8G2GL_FLAG_DIRTY, 0x02);
    EXPECT_EQ(U8G2GL_FLAG_DISABLED, 0x04);
}

TEST(Smoke, Enums) {
    EXPECT_EQ(U8G2GL_ALIGN_LEFT, 0);
    EXPECT_EQ(U8G2GL_ALIGN_CENTER, 1);
    EXPECT_EQ(U8G2GL_ALIGN_RIGHT, 2);
    EXPECT_EQ(U8G2GL_COLOR_0, 0);
    EXPECT_EQ(U8G2GL_COLOR_1, 1);
    EXPECT_EQ(U8G2GL_COLOR_XOR, 2);
}

TEST(Smoke, MinHelper) {
    EXPECT_EQ(u8g2gl_min(100, 200), 100u);
    EXPECT_EQ(u8g2gl_min(U8G2GL_IDLE, 500), 500u);
    EXPECT_EQ(u8g2gl_min(U8G2GL_IDLE, U8G2GL_IDLE), U8G2GL_IDLE);
}

TEST(Smoke, U8G2StubCompiles) {
    U8G2 display;
    display.clearBuffer();
    display.sendBuffer();
    EXPECT_EQ(display.clear_count, 1);
    EXPECT_EQ(display.send_count, 1);
}
