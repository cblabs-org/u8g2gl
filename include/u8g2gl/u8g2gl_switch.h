/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_switch.h
 *
 * Purpose: Binary toggle indicator widget for monochrome displays. Provides
 *          u8g2gl_switch, visually indicating a two-state boolean value via an
 *          outer rounded rectangle track and an inner rounded thumb handle
 *          (positioned left when off, right when on). Operates with zero heap
 *          allocations ([D-1], [PD-3]) and static lifecycle returning
 *          U8G2GL_IDLE to maximize low-power microcontroller sleep ([D-15]).
 *
 * Description: Declarations for the u8g2gl_switch widget class, boolean state
 *              accessors, static lifecycle guarantees, and style-driven rendering.
 *
 * Exported Classes:
 * - u8g2gl_switch: Toggle switch indicator widget inheriting from u8g2gl_obj.
 *
 *     State:
 *     - set_value(): Set binary switch state (true = on, false = off)
 *     - get_value(): Retrieve current switch state
 *
 *     Lifecycle (overrides):
 *     - tick():   Advance animation state; always returns U8G2GL_IDLE
 *     - render(): Draw switch track and handle to U8G2 display buffer
 */
#ifndef U8G2GL_SWITCH_H
#define U8G2GL_SWITCH_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief Binary toggle visual indicator widget.
 *
 * Renders an on/off toggle switch on monochrome U8G2 displays. The switch consists
 * of an outer rounded rectangle track and an inner filled rounded rectangle handle
 * (thumb) positioned on the left when OFF and on the right when ON.
 */
class u8g2gl_switch : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a switch with state OFF (false) and default coordinates/flags.
     * Conforms to the §13.7 declarative instantiation contract.
     */
    u8g2gl_switch() = default;

    // --- State ---

    /**
     * @brief Set the binary toggle state of the switch.
     *
     * Updates the internal boolean state and marks the widget dirty to request
     * a redraw on the next frame pass if the value changed.
     *
     * @param on True for ON (thumb right), false for OFF (thumb left).
     */
    void set_value(bool on);

    /**
     * @brief Retrieve the current switch toggle state.
     *
     * @return True if ON, false if OFF.
     */
    bool get_value() const;

    // --- Lifecycle ---

    /**
     * @brief Advance animation state and report next deadline.
     *
     * The switch widget represents a static two-state visual indicator without
     * active animation. Always returns U8G2GL_IDLE to allow the MCU to enter
     * low-power sleep ([D-15]).
     *
     * @param now_ms Current timestamp in milliseconds (unused).
     * @return U8G2GL_IDLE indicating no scheduled animation frames.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the switch widget into the U8G2 display buffer.
     *
     * Draws the outer rounded rectangle track covering the widget's bounds,
     * then draws the inner filled rounded rectangle handle positioned left (OFF)
     * or right (ON). Honors resolved styling (draw color and corner radius).
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

private:
    bool value_ = false;  ///< Switch state: false = OFF, true = ON
};

#endif // U8G2GL_SWITCH_H
