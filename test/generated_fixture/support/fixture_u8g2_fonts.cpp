/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/generated_fixture/support/fixture_u8g2_fonts.cpp
 *
 * Purpose: Defines the stand-in font tables declared in fixture_u8g2_fonts.h,
 *          so the generated fixture links on the host.
 *
 * Description: One byte each. The stub never reads a font's contents; the only
 *              thing a test compares is which table an object was given, and
 *              two distinct arrays have two distinct addresses.
 */
#include "fixture_u8g2_fonts.h"

const uint8_t u8g2_font_6x10_mr[] = {0x06};
const uint8_t u8g2_font_5x7_mr[] = {0x05};
const uint8_t u8g2_font_helvR08_tr[] = {0x08};
