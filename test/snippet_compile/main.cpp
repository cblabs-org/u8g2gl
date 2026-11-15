/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/snippet_compile/main.cpp
 * Purpose: Proves the constructor snippets u8g2gl prints are real code: three
 *          of them (HW SPI, SW SPI, HW I2C) compile and link against the
 *          pinned U8G2's own headers and C sources, so a wrong argument count,
 *          a misspelled class or a missing call fails the build here rather
 *          than on a board. The snippets are the committed goldens under
 *          cli/test/catalogue/snippets/, which the CLI suite compares
 *          constructorSnippet() against, so the text tested is the text shown.
 *
 * Description: References each snippet's setup() so the link must resolve
 *              everything they call. Built, never run: running would only
 *              exercise the byte stubs.
 */

namespace snippet_4w_hw_spi { void setup(); }
namespace snippet_4w_sw_spi { void setup(); }
namespace snippet_hw_i2c { void setup(); }

int main() {
    snippet_4w_hw_spi::setup();
    snippet_4w_sw_spi::setup();
    snippet_hw_i2c::setup();
    return 0;
}
