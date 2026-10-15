/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_xbm.h
 *
 * Purpose: Static XBM monochrome bitmap display widget. Provides u8g2gl_xbm,
 *          porting the bitmap rendering mechanism from legacy ImageWidget.
 *          Holds a const uint8_t* pointer to XBM data in flash/PROGMEM or RAM,
 *          ensuring zero runtime memory allocation ([D-1], [PD-3]). Renders
 *          via U8G2's native drawXBMP() with style-driven draw color and
 *          bitmap mode (solid vs transparent).
 *
 * Description: Declarations for the u8g2gl_xbm widget class, bitmap source
 *              pointer accessors, static lifecycle guarantees, and rendering.
 *
 * Exported Classes:
 * - u8g2gl_xbm: Monochrome XBM bitmap widget inheriting from u8g2gl_obj.
 *
 *     Content:
 *     - set_src(): Set pointer to XBM bitmap array (zero-copy)
 *     - get_src(): Retrieve current XBM bitmap pointer
 *
 *     Lifecycle (overrides):
 *     - tick():   Advance animation state; always returns U8G2GL_IDLE
 *     - render(): Draw XBM bitmap using U8G2 drawXBMP
 */
#ifndef U8G2GL_XBM_H
#define U8G2GL_XBM_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief Static XBM monochrome bitmap display widget.
 *
 * Displays monochrome bitmap icons and images formatted as standard XBM byte
 * arrays. Holds only a pointer to the bitmap source data (`bits_`) to prevent
 * RAM duplication on microcontroller targets.
 */
class u8g2gl_xbm : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs an XBM widget with a null bitmap pointer and default coordinates.
     */
    u8g2gl_xbm() = default;

    // --- Content ---

    /**
     * @brief Set pointer to the XBM bitmap byte array.
     *
     * Stores the pointer directly without copying data. The buffer (typically
     * stored in flash via PROGMEM) must remain valid for the widget's lifetime.
     * Marks the object dirty to request a redraw.
     *
     * @param bits Pointer to XBM byte array, or nullptr to clear.
     */
    void set_src(const uint8_t* bits);

    /**
     * @brief Retrieve the current XBM bitmap pointer.
     *
     * @return Pointer to XBM byte array, or nullptr if none set.
     */
    const uint8_t* get_src() const;

    // --- Lifecycle ---

    /**
     * @brief Advance animation state and report next deadline.
     *
     * XBM images are static visual assets. Always returns U8G2GL_IDLE to
     * permit low-power sleep hinting ([D-15]).
     *
     * @param now_ms Current timestamp in milliseconds (unused).
     * @return U8G2GL_IDLE indicating no scheduled animation frames.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the XBM bitmap into the U8G2 display buffer.
     *
     * Applies resolved styling (draw color, bitmap mode) and draws the
     * bitmap at (x, y) with dimensions (w, h) using U8G2's drawXBMP.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

private:
    const uint8_t* bits_ = nullptr;  ///< Zero-copy pointer to XBM bitmap data
};

#endif // U8G2GL_XBM_H
