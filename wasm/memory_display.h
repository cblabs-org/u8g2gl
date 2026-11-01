/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/memory_display.h
 * Purpose: The virtual panel both Wasm hosts draw on. The editor bridge
 *          renders the live canvas onto it, and the test-run harness runs the
 *          generated firmware code onto it, so the two frames a parity check
 *          compares come out of one piece of plumbing rather than two that
 *          could disagree. It is not code under test: it only holds pixels, in
 *          the layout a real U8G2 controller of the same size would.
 *
 * Description: A U8G2 instance whose display callback reports a geometry and
 *              accepts every other message, over a frame buffer in ordinary
 *              memory: one byte per 8-pixel column of each tile row, U8G2's
 *              vertical_top_lsb layout. sendBuffer() therefore transfers
 *              nothing, and the buffer after a frame is the frame. It uses the
 *              heap (std::vector) for the buffer; like the hosts that use it,
 *              it is Wasm-side plumbing and never part of firmware.
 *
 * Exported Classes:
 * - memory_display: a U8G2 whose panel is a memory buffer
 *
 *     Lifecycle:
 *     - setup():        Size the buffer for a display and point U8G2 at it
 *     - release():      Free the buffer and forget the size
 *
 *     Access:
 *     - u8g2():         The U8G2 instance to draw with
 *     - buffer():       The frame buffer
 *     - buffer_size():  Its length in bytes
 *     - width/height(): The display's size in pixels
 */
#ifndef U8G2GL_WASM_MEMORY_DISPLAY_H
#define U8G2GL_WASM_MEMORY_DISPLAY_H

#include <cstdint>
#include <string>
#include <vector>

#include "U8g2lib.h"

/**
 * @brief A U8G2 display that is only memory.
 *
 * A Wasm module has exactly one: the display callback finds the geometry
 * being set up through a file-scope pointer (see memory_display.cpp), since
 * U8X8 has no user pointer in this build.
 */
class memory_display {
public:
    /**
     * @brief Size the frame buffer for a display and point U8G2 at it.
     *
     * The buffer is cleared, and any earlier one is replaced: a pointer from
     * an earlier buffer() is invalid afterwards.
     *
     * @param width  Pixels; positive.
     * @param height Pixels; positive.
     * @param error  Set to the reason on failure.
     * @return false for a size U8X8's 8-bit tile counts cannot describe. The
     *         size is still recorded, as width() and height() report it.
     */
    bool setup(int32_t width, int32_t height, std::string* error);

    /** @brief Free the buffer and set the size to 0 × 0. */
    void release();

    /** @brief The U8G2 instance to draw with; valid once setup() succeeded. */
    U8G2& u8g2() { return display_; }

    /** @brief The frame buffer, valid until the next setup() or release(). */
    uint8_t* buffer() { return display_.getBufferPtr(); }

    /** @brief The frame buffer's length in bytes. */
    uint32_t buffer_size() const { return static_cast<uint32_t>(buffer_.size()); }

    int32_t width() const { return width_; }
    int32_t height() const { return height_; }

private:
    std::vector<uint8_t> buffer_;
    u8x8_display_info_t info_ = {};
    int32_t width_ = 0;
    int32_t height_ = 0;
    U8G2 display_;
};

#endif  // U8G2GL_WASM_MEMORY_DISPLAY_H
