/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/memory_display.cpp
 * Purpose: The virtual panel shared by the editor bridge and the test-run
 *          harness (memory_display.h), so both hosts' frames are held the
 *          same way and a parity check compares only what drew them.
 *
 * Description: setup() fills a u8x8_display_info_t for the size, sizes the
 *              buffer, and runs U8G2's own setup sequence against a display
 *              callback that answers only the memory-setup message. The
 *              buffer layout therefore depends only on the geometry and the
 *              buffer function, so any panel size renders as the same pixels
 *              a real controller of that size would hold.
 */
#include "memory_display.h"

#include <cstddef>
#include <limits>

namespace {

// The geometry setup() is installing. U8X8's display callback receives only
// the u8x8_t, and the user pointer that could carry `this` is compiled out of
// this U8G2 build, so setup() points this at its own info for the one call
// that reads it (U8X8_MSG_DISPLAY_SETUP_MEMORY, sent from u8g2_SetupDisplay)
// and clears it straight after. The helper copies the pointer it is given
// into the u8x8_t, which is why the info itself lives in the object.
const u8x8_display_info_t* s_setup_info = nullptr;

// memory_display_cb
// A U8X8 display that is only memory: it reports the geometry being set up
// and accepts every other message, because nothing is ever sent to hardware.
uint8_t memory_display_cb(u8x8_t* u8x8, uint8_t msg, uint8_t /*arg_int*/, void* /*arg_ptr*/) {
    if (msg == U8X8_MSG_DISPLAY_SETUP_MEMORY && s_setup_info != nullptr) {
        u8x8_d_helper_display_setup_memory(u8x8, s_setup_info);
    }
    return 1;
}

}  // namespace

// memory_display::setup
// Allocates a full frame buffer for the display and points U8G2 at it.
//   width, height — the panel in pixels
//   error         — the reason, when the size cannot be addressed
bool memory_display::setup(int32_t width, int32_t height, std::string* error) {
    // --- Step 1: Record the size, and refuse one U8X8 cannot describe ---
    width_ = width;
    height_ = height;
    const int32_t tile_w = (width + 7) / 8;
    const int32_t tile_h = (height + 7) / 8;
    if (tile_w > std::numeric_limits<uint8_t>::max() || tile_h > std::numeric_limits<uint8_t>::max()) {
        if (error != nullptr) {
            *error = "display " + std::to_string(width) + "x" + std::to_string(height) +
                     " is larger than U8G2 can address";
        }
        return false;
    }

    // --- Step 2: The geometry and a zeroed buffer for it ---
    info_ = u8x8_display_info_t{};
    info_.tile_width = static_cast<uint8_t>(tile_w);
    info_.tile_height = static_cast<uint8_t>(tile_h);
    info_.pixel_width = static_cast<uint16_t>(width);
    info_.pixel_height = static_cast<uint16_t>(height);
    buffer_.assign(static_cast<size_t>(tile_w) * 8u * static_cast<size_t>(tile_h), 0);

    // --- Step 3: U8G2's own setup sequence, against the memory callback ---
    u8g2_t* u8g2 = display_.getU8g2();
    s_setup_info = &info_;
    u8g2_SetupDisplay(u8g2, memory_display_cb, u8x8_cad_001, u8x8_byte_empty, u8x8_dummy_cb);
    s_setup_info = nullptr;
    u8g2_SetupBuffer(u8g2, buffer_.data(), static_cast<uint8_t>(tile_h), u8g2_ll_hvline_vertical_top_lsb, U8G2_R0);
    u8g2_InitDisplay(u8g2);
    display_.clearBuffer();
    return true;
}

// memory_display::release
// Frees the buffer. U8G2 keeps its pointer, so buffer() must not be read
// until the next setup(), as the header says.
void memory_display::release() {
    buffer_.clear();
    width_ = 0;
    height_ = 0;
}
