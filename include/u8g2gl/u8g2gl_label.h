/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_label.h
 *
 * Purpose: Foundational static text widget. Provides u8g2gl_label, the primary
 *          mechanism for displaying string literals and bound text subjects in
 *          U8G2GL. Designed without internal string buffers to eliminate RAM
 *          duplication on constrained microcontrollers; text is referenced by
 *          pointer from code flash or subject storage.
 *
 * Description: Declarations for the u8g2gl_label widget class, including text
 *              accessors, static lifecycle methods, and style-driven rendering.
 *
 * Exported Classes:
 * - u8g2gl_label: Foundational text display widget inheriting from u8g2gl_obj.
 *
 *     Content:
 *     - set_text(): Set pointer to text string (zero-copy)
 *     - get_text(): Retrieve current text pointer
 *
 *     Lifecycle (overrides):
 *     - tick():   Advance animation state; always returns U8G2GL_IDLE
 *     - render(): Draw formatted text to U8G2 display buffer
 */
#ifndef U8G2GL_LABEL_H
#define U8G2GL_LABEL_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief Foundational text display widget.
 *
 * Renders static or bound text on monochrome U8G2 displays. Holds only a
 * pointer to the string (`text_`) to guarantee zero-copy operation and minimal
 * memory footprint. Styling (font, draw color, font mode, alignment, truncation)
 * is inherited from the base `u8g2gl_obj` style definition.
 */
class u8g2gl_label : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a label with null text and default object coordinates and flags.
     * Required by the §13.7 declarative instantiation contract.
     */
    u8g2gl_label() = default;

    // --- Content ---

    /**
     * @brief Set the text string to be displayed.
     *
     * Stores the pointer directly without copying or allocating memory. The
     * caller (or owning subject) must ensure the buffer remains valid while
     * in use. Marks the object dirty to schedule redraw.
     *
     * @param text Pointer to null-terminated UTF-8 string, or nullptr to clear.
     */
    void set_text(const char* text);

    /**
     * @brief Retrieve the current text pointer.
     *
     * @return Pointer to null-terminated UTF-8 string, or nullptr if none set.
     */
    const char* get_text() const;

    // --- Lifecycle ---

    /**
     * @brief Advance animation state and report next deadline.
     *
     * Labels represent static text without animation. Always returns U8G2GL_IDLE
     * so the framework can put the microcontroller to sleep until external events.
     *
     * @param now_ms Current timestamp in milliseconds (unused).
     * @return U8G2GL_IDLE indicating no scheduled animation frames.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the label into the U8G2 display buffer.
     *
     * Applies resolved styling (font, draw color, font mode), computes vertical
     * centering within widget bounds, aligns horizontally (left, center, right),
     * and draws UTF-8 text. Clipping and state saving are handled by the framework.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

private:
    const char* text_ = nullptr;  ///< Points to literal or bound string — no copy
};

#endif // U8G2GL_LABEL_H
