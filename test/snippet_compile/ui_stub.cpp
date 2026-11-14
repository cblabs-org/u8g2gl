/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/snippet_compile/ui_stub.cpp
 * Purpose: Defines the two generated functions the stub ui.hpp declares, so
 *          the snippets link. Their behaviour is not under test here — the
 *          generated ui_display_matches() is tested by the generated fixture —
 *          only that a snippet's calls resolve against the real U8G2 class.
 *
 * Description: ui_display_matches() compares against the SSD1322 the first
 *              snippet constructs; ui_init() does nothing.
 */
#include <U8g2lib.h>

#include "ui.hpp"

// ui_display_matches
// The generated check's shape, against a 256x64 panel.
//   display — the board's constructed display
bool ui_display_matches(U8G2& display) {
    return display.getDisplayWidth() == 256 && display.getDisplayHeight() == 64;
}

void ui_init() {}
