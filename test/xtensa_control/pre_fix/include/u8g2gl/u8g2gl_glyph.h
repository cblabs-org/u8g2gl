/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_glyph.h
 *
 * Purpose: Single Unicode font glyph display widget. Provides u8g2gl_glyph
 *          for rendering icons, symbols, and single characters directly from
 *          U8G2 font icon sets (e.g. Open Iconic, weather icons). Avoids the
 *          storage overhead of separate bitmap byte arrays by leveraging
 *          glyphs already compiled into font tables. Zero heap allocation
 *          ([D-1], [PD-3]).
 *
 * Description: Declarations for the u8g2gl_glyph widget class, codepoint
 *              accessors, static lifecycle methods, and style-driven rendering.
 *
 * Exported Classes:
 * - u8g2gl_glyph: Single glyph display widget inheriting from u8g2gl_obj.
 *
 *     Content:
 *     - set_glyph(): Set 16-bit glyph codepoint
 *     - get_glyph(): Retrieve current glyph codepoint
 *
 *     Lifecycle (overrides):
 *     - tick():   Advance animation state; always returns U8G2GL_IDLE
 *     - render(): Draw glyph using U8G2 drawGlyph
 */
#ifndef U8G2GL_GLYPH_H
#define U8G2GL_GLYPH_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief Single font glyph display widget.
 *
 * Renders an individual Unicode or font-specific glyph by 16-bit codepoint
 * (e.g., icons from U8G2 Open Iconic fonts). Applies resolved font, draw color,
 * and font mode from style.
 */
class u8g2gl_glyph : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a glyph widget with codepoint 0 (unassigned).
     */
    u8g2gl_glyph() = default;

    // --- Content ---

    /**
     * @brief Set the glyph codepoint to display.
     *
     * Marks the object dirty to request a redraw.
     *
     * @param codepoint 16-bit character or symbol codepoint.
     */
    void set_glyph(uint16_t codepoint);

    /**
     * @brief Retrieve the current glyph codepoint.
     *
     * @return 16-bit glyph codepoint, or 0 if unassigned.
     */
    uint16_t get_glyph() const;

    // --- Lifecycle ---

    /**
     * @brief Advance animation state and report next deadline.
     *
     * Glyphs are static visual elements. Always returns U8G2GL_IDLE to
     * permit low-power sleep hinting ([D-15]).
     *
     * @param now_ms Current timestamp in milliseconds (unused).
     * @return U8G2GL_IDLE indicating no scheduled animation frames.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the glyph into the U8G2 display buffer.
     *
     * Applies resolved styling (font, draw color, font mode) and draws the
     * glyph at (x, y) using U8G2's drawGlyph.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

private:
    uint16_t glyph_ = 0;  ///< 16-bit glyph codepoint (0 = unassigned)
};

#endif // U8G2GL_GLYPH_H
