/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/snippet_compile/snippet_4w_hw_spi.cpp
 * Purpose: Compiles the HW SPI (the demo's SSD1322) constructor snippet exactly as u8g2gl prints it,
 *          against U8G2's real headers, with its pin placeholder given a stub
 *          value. See main.cpp for why.
 *
 * Description: U8g2lib.h and the stub ui.hpp are included first, so the
 *              snippet's own includes of them are no-ops; the snippet is then
 *              included inside a namespace, so its global display and setup()
 *              do not collide with the other snippets' in one link.
 *
 * Exported:
 * - snippet_4w_hw_spi::setup(): The snippet's boot sequence
 */
#include <U8g2lib.h>

#include "ui.hpp"

// The value a board would write in place of each FILL_IN_PIN.
#define FILL_IN_PIN 5

namespace snippet_4w_hw_spi {
#include "4w-hw-spi.txt"
} // namespace snippet_4w_hw_spi
