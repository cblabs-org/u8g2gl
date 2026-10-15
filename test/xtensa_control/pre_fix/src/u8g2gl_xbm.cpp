/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_xbm.cpp
 *
 * Purpose: Implements the static XBM monochrome bitmap display widget.
 *          Maintains a zero-copy pointer to XBM data in flash or RAM,
 *          eliminating buffer duplication on constrained microcontrollers.
 *          Dispatches rendering directly to U8G2 drawXBMP() honoring
 *          resolved styling (draw color and bitmap mode).
 *
 * Description: Implementation of set_src, get_src, tick, and render methods
 *              for the u8g2gl_xbm widget.
 */
#include "u8g2gl/u8g2gl_xbm.h"
#include "u8g2gl/u8g2gl_coord.h"

// U8G2's header is `U8g2lib.h` in every distribution — the Arduino library, the
// pinned submodule (extern/u8g2/cppsrc/, checked by the root CMakeLists.txt) and
// the host test stub (test/stubs/) all spell it that way. The quoted fallback
// covers a build that puts U8G2 only on the quoted search path.
#if __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

// u8g2gl_xbm::set_src
// Stores pointer to the XBM byte array and flags the object as dirty.
// Zero-copy: does not copy bytes or allocate memory.
//   bits — pointer to XBM bitmap array, or nullptr to clear
void u8g2gl_xbm::set_src(const uint8_t* bits) {
    bits_ = bits;
    mark_dirty();
}

// u8g2gl_xbm::get_src
// Accessor for the active XBM bitmap pointer.
// Returns nullptr if no bitmap has been set.
const uint8_t* u8g2gl_xbm::get_src() const {
    return bits_;
}

// u8g2gl_xbm::tick
// Static widget lifecycle: returns U8G2GL_IDLE as bitmaps do not animate.
// Returning U8G2GL_IDLE enables low-power MCU sleep hinting ([D-15]).
//   now_ms — current system millisecond timestamp (unused)
uint32_t u8g2gl_xbm::tick(uint32_t now_ms) {
    (void)now_ms;
    return U8G2GL_IDLE;
}

// u8g2gl_xbm::render
// Draws the XBM bitmap onto the display according to resolved styling and coordinates.
//   display — U8G2 display driver instance
void u8g2gl_xbm::render(U8G2& display) {
    // --- Step 1: Early exit if bitmap source is null ---
    if (bits_ == nullptr) {
        return;
    }

    // --- Step 2: Apply resolved styles ---
    // U8G2 state is scoped and restored by the framework state saver (§11.3).
    display.setDrawColor(static_cast<uint8_t>(style_.draw_color));
    display.setBitmapMode(static_cast<uint8_t>(style_.bitmap_mode));

    // --- Step 3: Draw XBM bitmap ---
    // Rules from u8g2gl_coord.h: the origin wraps explicitly, and U8G2's XBM
    // drawing clips a bitmap partly off the left or top edge to its visible
    // part; a size <= 0 has nothing to draw.
    u8g2_uint_t uw = 0;
    u8g2_uint_t uh = 0;
    if (!u8g2gl_coord_size(w_, uw) || !u8g2gl_coord_size(h_, uh)) {
        return;
    }
    display.drawXBMP(u8g2gl_coord_pos(x_), u8g2gl_coord_pos(y_), uw, uh, bits_);
}
