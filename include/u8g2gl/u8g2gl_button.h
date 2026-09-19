/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_button.h
 *
 * Purpose: Interactive push button widget with text and focus awareness. Provides
 *          u8g2gl_button, rendering selectable buttons on monochrome U8G2 displays.
 *          Maintains zero runtime memory allocation ([D-1], [PD-3]) by holding
 *          a zero-copy pointer to label text. Supports configurable border frame
 *          width, nested frames, focus inversion for keyboard/encoder navigation
 *          (§12.2), and centered UTF-8 text layout.
 *
 * Description: Declarations for the u8g2gl_button widget class, text and border
 *              accessors, static lifecycle guarantees, and style-driven rendering.
 *
 * Exported Classes:
 * - u8g2gl_button: Interactive button widget inheriting from u8g2gl_obj.
 *
 *     Content:
 *     - set_text(): Set pointer to button label string (zero-copy)
 *     - get_text(): Retrieve current label text pointer
 *
 *     Appearance:
 *     - set_border_width(): Configure border stroke width in pixels
 *     - get_border_width(): Retrieve active border stroke width
 *
 *     Lifecycle (overrides):
 *     - tick():   Advance animation state; always returns U8G2GL_IDLE
 *     - render(): Draw button frame, inverted background, and centered text
 */
#ifndef U8G2GL_BUTTON_H
#define U8G2GL_BUTTON_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief Interactive push button widget with text and focus awareness.
 *
 * Renders an interactive button with a customizable border, optional rounded
 * corners, focus inversion (§12.2), and centered label text. Holds a const char*
 * pointer directly to ensure zero heap allocations and minimal RAM footprint.
 */
class u8g2gl_button : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a button with null text, 1-pixel border width, and default
     * object coordinates and flags. Conforms to the §13.7 declarative contract.
     */
    u8g2gl_button() = default;

    // --- Content ---

    /**
     * @brief Set pointer to the button label text string.
     *
     * Stores the pointer directly without copying or allocating heap memory. The
     * caller must guarantee buffer validity while referenced. Marks the widget
     * dirty to request a redraw.
     *
     * @param text Pointer to null-terminated UTF-8 string, or nullptr to clear.
     */
    void set_text(const char* text);

    /**
     * @brief Retrieve the literal button label text pointer.
     *
     * The literal only: while bind_text() is active the button draws the bound
     * subject instead.
     *
     * @return Pointer to null-terminated UTF-8 string, or nullptr if none set.
     */
    const char* get_text() const;

    // --- Appearance ---

    /**
     * @brief Configure border stroke width in pixels.
     *
     * If 0, no border frame is drawn. If 1, a single frame is drawn. If greater
     * than 1, concentric nested frames are drawn to produce a thick border.
     * Marks the widget dirty to request a redraw.
     *
     * @param w Border width in pixels (default is 1).
     */
    void set_border_width(uint8_t w);

    /**
     * @brief Retrieve current border stroke width.
     *
     * @return Border width in pixels.
     */
    uint8_t get_border_width() const;

    // --- Lifecycle ---

    /**
     * @brief Advance animation state and report next deadline.
     *
     * Buttons are static interactive elements without background animation.
     * Always returns U8G2GL_IDLE to maximize low-power microcontroller sleep ([D-15]).
     *
     * @param now_ms Current timestamp in milliseconds (unused).
     * @return U8G2GL_IDLE indicating no scheduled animation frames.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the button into the U8G2 display buffer.
     *
     * Applies resolved styling (font, color). If focused (DISABLED flag clear and
     * style.invert true), fills background with drawBox/drawRBox and renders text
     * with draw color 0. Renders border frame(s) and centers UTF-8 text within
     * the button bounds.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

private:
    const char* text_ = nullptr;  ///< Zero-copy pointer to button label string
    uint8_t border_width_ = 1;    ///< Border stroke thickness in pixels
};

#endif // U8G2GL_BUTTON_H
