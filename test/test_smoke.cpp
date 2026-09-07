#include <gtest/gtest.h>
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_config.h"
#include "U8G2lib.h"

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
